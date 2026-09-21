import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadApprovedCore } from "./core-loader.mjs";
import { loadRuntimeConfig, validateMultiRepoRuntimeConfig } from "./config.mjs";
import { GitHubAppClient } from "./app-auth.mjs";
import { GitHubApi } from "./github-api.mjs";
import { OperationalStore } from "./store.mjs";
import { MultiRepoOrchestrator } from "./orchestrator.mjs";
import { enqueueReconcile } from "./reconcile.mjs";
import { processNextDelivery } from "./worker.mjs";
import { eventRepository } from "./mapping.mjs";
import { readRawBody, verifyWebhookSignature, webhookHeaders } from "./webhook.mjs";

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function safeSecretEqual(actual, expected) {
  const a = Buffer.from(actual ?? "");
  const b = Buffer.from(expected ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

const { core, transitionTable } = await loadApprovedCore();
const config = loadRuntimeConfig();
const configErrors = validateMultiRepoRuntimeConfig(config, core);
const transitionErrors = core.validateTransitionTable(transitionTable);
if (configErrors.length || transitionErrors.length) {
  throw new Error(
    "Invalid multi-repo O configuration: " +
    [...configErrors, ...transitionErrors].join("; ")
  );
}

const appClient = new GitHubAppClient({
  appId: config.appId,
  privateKey: config.privateKey,
  installations: config.installations,
  configuredRepositories: config.configuredRepositories,
  oPermissions: config.projectProfile.identities.O.permissions
});
const gh = new GitHubApi(appClient);
const store = new OperationalStore(config.dbPath);
const orchestrator = new MultiRepoOrchestrator({
  gh,
  profile: config.projectProfile,
  core,
  transitionTable,
  store,
  trustedResultActorIds: config.trustedResultActorIds,
  trustedStateAppId: config.appId
});

let workerActive = false;
async function pumpWorker() {
  if (workerActive) return;
  workerActive = true;
  try {
    for (let index = 0; index < 25; index += 1) {
      const result = await processNextDelivery({
        store,
        orchestrator,
        profile: config.projectProfile,
        workerId: config.workerId,
        leaseMs: config.leaseMs
      });
      if (!result) break;
    }
  } finally {
    workerActive = false;
  }
}

async function reconcile() {
  await enqueueReconcile({
    gh,
    profile: config.projectProfile,
    store,
    core,
    trustedStateAppId: config.appId
  });
  await pumpWorker();
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      return json(response, 200, {
        ok: true,
        control_repository: config.projectProfile.control_repository,
        repositories: [...config.configuredRepositories],
        queue: store.counts()
      });
    }

    if (request.method === "GET" && url.pathname === "/setup/complete") {
      return json(response, 200, {
        ok: true,
        message: "GitHub App created. Configure App ID/private key/installation mappings, then restart the service."
      });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const rawBody = await readRawBody(request);
      const headers = webhookHeaders(request.headers);
      if (
        !headers.deliveryId ||
        !headers.eventName ||
        !verifyWebhookSignature(config.webhookSecret, rawBody, headers.signature)
      ) {
        return json(response, 401, { ok: false, reason: "INVALID_WEBHOOK_SIGNATURE" });
      }

      const payload = JSON.parse(rawBody.toString("utf8"));
      const repository = eventRepository(payload);
      if (!repository || !config.configuredRepositories.has(repository)) {
        return json(response, 202, { ok: true, ignored: true });
      }

      const queued = store.enqueue({
        deliveryId: headers.deliveryId,
        eventName: headers.eventName,
        repository,
        payload
      });

      response.statusCode = 202;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        duplicate: !queued.inserted
      }));
      setImmediate(() => pumpWorker().catch(() => {}));
      return;
    }

    if (request.method === "POST" && url.pathname === "/assignment/verify") {
      const auth = request.headers.authorization ?? "";
      const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!safeSecretEqual(presented, config.receiverVerifySecret)) {
        return json(response, 401, { valid: false, reason: "UNAUTHORIZED_RECEIVER" });
      }
      const rawBody = await readRawBody(request, 512 * 1024);
      const assignment = JSON.parse(rawBody.toString("utf8"));
      const runnerRepository = request.headers["x-agenti-runner-repository"] ?? "";
      const workflowRunId = request.headers["x-agenti-workflow-run-id"] ?? "";
      const workflowRunAttempt = request.headers["x-agenti-workflow-run-attempt"] ?? "";
      const result = await orchestrator.verifyAssignment(
        assignment,
        runnerRepository,
        workflowRunId,
        workflowRunAttempt
      );
      return json(response, result.valid ? 200 : 409, result);
    }

    if (request.method === "POST" && url.pathname === "/material/prepare") {
      const auth = request.headers.authorization ?? "";
      const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!safeSecretEqual(presented, config.receiverVerifySecret)) {
        return json(response, 401, { valid: false, reason: "UNAUTHORIZED_RECEIVER" });
      }
      const rawBody = await readRawBody(request, 512 * 1024);
      const payload = JSON.parse(rawBody.toString("utf8"));
      const runnerRepository =
        request.headers["x-agenti-runner-repository"] ?? "";
      const workflowRunId =
        request.headers["x-agenti-workflow-run-id"] ?? "";
      const workflowRunAttempt =
        request.headers["x-agenti-workflow-run-attempt"] ?? "";

      const result = await orchestrator.prepareMaterialWrite({
        assignment: payload.assignment,
        runnerRepository,
        workflowRunId,
        workflowRunAttempt,
        claimId: payload.claim_id,
        claimGeneration: Number(payload.claim_generation),
        operationKind: payload.operation_kind,
        targetBinding: payload.target_binding
      });
      return json(response, result.valid ? 200 : 409, result);
    }

    if (request.method === "POST" && url.pathname === "/material/resolve") {
      const auth = request.headers.authorization ?? "";
      const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!safeSecretEqual(presented, config.receiverVerifySecret)) {
        return json(response, 401, { valid: false, reason: "UNAUTHORIZED_RECEIVER" });
      }
      const rawBody = await readRawBody(request, 512 * 1024);
      const payload = JSON.parse(rawBody.toString("utf8"));
      const runnerRepository =
        request.headers["x-agenti-runner-repository"] ?? "";
      const workflowRunId =
        request.headers["x-agenti-workflow-run-id"] ?? "";
      const workflowRunAttempt =
        request.headers["x-agenti-workflow-run-attempt"] ?? "";

      const result = await orchestrator.resolveMaterialWrite({
        assignment: payload.assignment,
        runnerRepository,
        workflowRunId,
        workflowRunAttempt,
        claimId: payload.claim_id,
        claimGeneration: Number(payload.claim_generation),
        materialOperationId: payload.material_operation_id,
        outcome: payload.outcome,
        evidenceRef: payload.evidence_ref ?? null
      });
      return json(response, result.valid ? 200 : 409, result);
    }

    if (request.method === "POST" && url.pathname === "/execution/failure") {
      const auth = request.headers.authorization ?? "";
      const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!safeSecretEqual(presented, config.receiverVerifySecret)) {
        return json(response, 401, { accepted: false, reason: "UNAUTHORIZED_RECEIVER" });
      }
      const rawBody = await readRawBody(request, 512 * 1024);
      const payload = JSON.parse(rawBody.toString("utf8"));
      const runnerRepository =
        request.headers["x-agenti-runner-repository"] ?? "";
      const workflowRunId =
        request.headers["x-agenti-workflow-run-id"] ?? "";
      const workflowRunAttempt =
        request.headers["x-agenti-workflow-run-attempt"] ?? "";

      const result = await orchestrator.recordExecutionFailure({
        assignment: payload.assignment,
        runnerRepository,
        workflowRunId,
        workflowRunAttempt,
        status: payload.status,
        retryAt: payload.retry_at ?? null
      });
      return json(response, result.accepted ? 200 : 409, result);
    }

    return json(response, 404, { ok: false, reason: "NOT_FOUND" });
  } catch (error) {
    return json(response, 500, {
      ok: false,
      reason: error?.name ?? "ServerError"
    });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  process.stdout.write(`agenti multi-repo O listening on :${config.port}\n`);
});

setInterval(() => pumpWorker().catch(() => {}), 1000).unref();
setInterval(() => reconcile().catch(() => {}), config.reconcileIntervalMs).unref();
setImmediate(() => reconcile().catch(() => {}));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
