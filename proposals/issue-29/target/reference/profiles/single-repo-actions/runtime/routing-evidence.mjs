import { readFile } from "node:fs/promises";
import {
  digest,
  validateBillingSafetyObservation,
  validateCapacityObservation,
  validateSchema
} from "../core/index.mjs";
import { githubClientFromEnv } from "./github.mjs";
import {
  isTrustedActionsActor,
  parseMachinePayload,
  renderMachineComment
} from "./state.mjs";
import { callback, loadRuntime } from "./runner.mjs";

export const CAPACITY_MARKER = "agenti-capacity:v1";
export const BILLING_SAFETY_MARKER = "agenti-billing-safety:v1";
export const EXECUTION_FAILURE_MARKER = "agenti-execution-failure:v1";

function trustedPayloads(comments, marker) {
  return comments
    .filter((comment) => isTrustedActionsActor(comment) && comment.body?.includes(marker))
    .map((comment) => ({
      comment,
      payload: parseMachinePayload(comment.body, marker)
    }))
    .filter((entry) => entry.payload);
}

export function routingEvidenceSnapshot({
  comments,
  state,
  observedAt
}) {
  const capacity = [];
  for (const { payload } of trustedPayloads(comments, CAPACITY_MARKER)) {
    if (
      validateCapacityObservation({
        observation: payload,
        runnerCandidate: payload.runner_candidate_id,
        observedAt
      }).valid
    ) {
      capacity.push(payload);
    }
  }

  const billing = [];
  for (const { payload } of trustedPayloads(comments, BILLING_SAFETY_MARKER)) {
    if (
      validateBillingSafetyObservation({
        observation: payload,
        runnerCandidate: payload.runner_candidate_id,
        observedAt
      }).valid
    ) {
      billing.push(payload);
    }
  }

  let failure = null;
  if (state?.assignment) {
    const current = trustedPayloads(comments, EXECUTION_FAILURE_MARKER)
      .filter(({ payload }) =>
        payload.failure?.failed_assignment_id === state.assignment.assignment_id &&
        payload.failure?.semantic_work_digest ===
          state.assignment.semantic_work_digest
      )
      .at(-1);

    if (current?.payload?.capacity_observation) {
      const observation = current.payload.capacity_observation;
      if (
        validateCapacityObservation({
          observation,
          runnerCandidate: observation.runner_candidate_id,
          observedAt
        }).valid
      ) {
        capacity.push(observation);
      }
    }

    if (current?.payload?.failure) {
      failure = {
        ...current.payload.failure,
        objective_retry_reason:
          current.payload.failure.objective_retry_reason ??
          "ROUTING_EXECUTION_FAILURE",
        ref: "issue-comment:" + current.comment.id
      };
    }
  }

  return {
    capacity_observations: capacity,
    billing_safety_observations: billing,
    failure
  };
}

function capacityObservation({
  candidateId,
  status,
  observedAt,
  retryAt
}) {
  const source = {
    kind: "EXECUTION_OUTCOME",
    trust: "ADAPTER_OBSERVED"
  };
  const body = {
    runner_candidate_id: candidateId,
    status,
    observed_at: observedAt,
    valid_until: null,
    retry_at: retryAt ?? null,
    retry_after_seconds: null,
    remaining: null,
    source
  };
  return {
    ...body,
    evidence_digest: digest(body)
  };
}

export async function recordExecutionFailure({
  issueNumber,
  assignmentId,
  status,
  retryAt = null,
  contextPath = ".agenti-run/run-context.json"
}) {
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const comments = await github.listIssueComments(issueNumber);
  const stateComment = comments.find((comment) =>
    isTrustedActionsActor(comment) &&
    comment.body?.includes("agenti-state:v1")
  );
  if (!stateComment) throw new Error("Current workflow state not found");
  const { reconstructState } = await import("../core/index.mjs");
  const state = reconstructState(
    stateComment.body,
    runtime.workflowStateSchema
  );
  if (
    !state.assignment ||
    state.assignment.assignment_id !== assignmentId ||
    !state.assignment.semantic_work_digest ||
    !state.assignment.execution_route
  ) {
    throw new Error("Execution failure is not bound to current routed assignment");
  }
  if (!["TEMPORARILY_EXHAUSTED", "RATE_LIMITED", "UNAVAILABLE"].includes(status)) {
    throw new Error("Unsupported execution failure status");
  }

  const context = JSON.parse(await readFile(contextPath, "utf8"));
  const observedAt = new Date().toISOString();
  const observation = capacityObservation({
    candidateId: state.assignment.execution_route.runner_candidate_id,
    status,
    observedAt,
    retryAt
  });
  const failureCore = {
    failed_assignment_id: assignmentId,
    execution_instance_id:
      context.attestation.execution_instance_id,
    runner_candidate_id:
      state.assignment.execution_route.runner_candidate_id,
    semantic_work_digest: state.assignment.semantic_work_digest,
    capacity_status: status,
    transient: status !== "UNAVAILABLE",
    objective_retry_reason: "ROUTING_EXECUTION_FAILURE",
    retry_at: retryAt,
    observed_at: observedAt,
    ref: null,
    actual_billing_mode: null
  };
  const failure = {
    ...failureCore,
    evidence_digest: digest(failureCore)
  };

  const failureSchema = JSON.parse(await readFile(
    ".agenti-runtime/schemas/execution-failure.schema.json",
    "utf8"
  ));
  const errors = validateSchema(failure, failureSchema);
  if (errors.length) {
    throw new Error("Execution failure schema invalid: " + errors.join("; "));
  }

  const comment = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      EXECUTION_FAILURE_MARKER,
      "Trusted execution failure for current routed assignment.",
      {
        failure,
        capacity_observation: observation
      }
    )
  );

  await callback(
    github,
    runtime.runtimeConfig,
    issueNumber,
    assignmentId,
    comment.id
  );
  return { failure, capacity_observation: observation, comment };
}

async function main() {
  const [command, issueRaw, assignmentId, status, retryAt] =
    process.argv.slice(2);
  if (command !== "failure") {
    throw new Error(
      "Usage: routing-evidence.mjs failure ISSUE ASSIGNMENT_ID STATUS [RETRY_AT]"
    );
  }
  const issueNumber = Number(issueRaw);
  if (!Number.isInteger(issueNumber)) throw new Error("issue number required");
  await recordExecutionFailure({
    issueNumber,
    assignmentId,
    status,
    retryAt: retryAt || null
  });
}

if (import.meta.url === "file://" + process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
