import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");
const controlSource = resolve(referenceRoot, "..");
const runnerPath = join(referenceRoot, "profiles", "single-repo-actions", "runtime", "runner.mjs");
const core = await import(pathToFileURL(join(referenceRoot, "core", "index.mjs")).href);

async function makeControl({ actorId = 1001 } = {}) {
  const root = await mkdtemp(join(tmpdir(), "agenti-external-control-"));
  await mkdir(join(root, "projects", "e2e"), { recursive: true });
  await mkdir(join(root, "profiles", "automated", "single-repo-actions"), { recursive: true });
  await mkdir(join(root, "reference", "schemas"), { recursive: true });
  await mkdir(join(root, "reference", "core"), { recursive: true });

  await cp(
    join(controlSource, "profiles", "automated", "single-repo-actions", "project-profile.json"),
    join(root, "profiles", "automated", "single-repo-actions", "project-profile.json")
  );
  await cp(
    join(controlSource, "profiles", "automated", "single-repo-actions", "runtime.json"),
    join(root, "profiles", "automated", "single-repo-actions", "runtime.json")
  );
  for (const name of ["workflow-state.schema.json", "assignment.schema.json", "role-result.schema.json"]) {
    await cp(join(referenceRoot, "schemas", name), join(root, "reference", "schemas", name));
  }
  await cp(
    join(referenceRoot, "core", "transitions.json"),
    join(root, "reference", "core", "transitions.json")
  );

  await writeFile(join(root, "projects", "registry.yml"), JSON.stringify({
    schema_version: 1,
    projects: {
      "example/product": {
        project_id: "e2e",
        project_control: "projects/e2e/project.yml",
        selected_profile: "automated"
      }
    }
  }, null, 2) + "\n");

  const observed = new Date(Date.now() - 60_000).toISOString();
  const validUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await writeFile(join(root, "projects", "e2e", "project.yml"), JSON.stringify({
    schema_version: 1,
    project_id: "e2e",
    repository: "example/product",
    selected_profile: "automated",
    human_principals: [{ actor_id: 1001, login: "human" }],
    runner_evidence: {
      billing_safety: [{
        runner_candidate_id: "claude-subscription",
        status: "VERIFIED_NO_PAID_SPILLOVER",
        observed_at: observed,
        valid_until: validUntil,
        source: {
          kind: "ADMIN_POLICY_ATTESTATION",
          trust: "EXTERNAL_CURRENT_EVIDENCE"
        },
        attested_by: {
          actor_id: actorId,
          evidence_ref: "human-enrollment:e2e"
        }
      }]
    }
  }, null, 2) + "\n");
  return root;
}

async function withEnv(root, fn) {
  const keys = {
    AGENTI_CONTROL_ROOT: root,
    AGENTI_TARGET_REPOSITORY: "example/product",
    AGENTI_PRODUCT_BOOTSTRAP_SHA: "a".repeat(40),
    AGENTI_CONTROL_PLANE_REPOSITORY: "example/control",
    AGENTI_CONTROL_PLANE_SHA: "b".repeat(40),
    AGENTI_PROJECT_ID: "e2e",
    AGENTI_SELECTED_PROFILE: "automated",
    AGENTI_DEFAULT_BRANCH: "main"
  };
  const prior = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  Object.assign(process.env, keys);
  try { return await fn(); }
  finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("external project-control Human attestation becomes current billing-safety evidence", async () => {
  const root = await makeControl();
  try {
    const runner = await import(pathToFileURL(runnerPath).href + "?valid=" + Date.now());
    const runtime = await withEnv(root, () => runner.loadRuntime());
    assert.equal(runtime.projectBillingSafetyObservations.length, 1);
    const observation = runtime.projectBillingSafetyObservations[0];
    assert.equal(observation.runner_candidate_id, "claude-subscription");
    assert.equal(observation.status, "VERIFIED_NO_PAID_SPILLOVER");
    assert.equal(
      core.validateBillingSafetyObservation({
        observation,
        runnerCandidate: "claude-subscription",
        observedAt: new Date().toISOString()
      }).valid,
      true
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external billing-safety attestation from a non-H actor fails closed", async () => {
  const root = await makeControl({ actorId: 9999 });
  try {
    const runner = await import(pathToFileURL(runnerPath).href + "?invalid=" + Date.now());
    await assert.rejects(
      withEnv(root, () => runner.loadRuntime()),
      /PROJECT_BILLING_SAFETY_HUMAN_ATTESTATION_INVALID/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bootstrap emits a governed automated enrollment candidate with explicit H billing attestation", async () => {
  const target = await mkdtemp(join(tmpdir(), "agenti-bootstrap-plan-"));
  try {
    const validUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = spawnSync(process.execPath, [
      join(referenceRoot, "cli", "agenti.mjs"),
      "bootstrap",
      "--dry-run",
      "--target", target,
      "--repository", "example/new-product",
      "--human-login", "human",
      "--human-actor-id", "1001",
      "--claude-no-paid-spillover-until", validUntil,
      "--billing-attestation-ref", "human-enrollment:test"
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.registry_status, "WAITING_CONTROL_PLANE_ENROLLMENT");
    assert.deepEqual(output.registration_candidate.missing_human_inputs, []);
    const candidate = output.registration_candidate.project_control_candidate;
    assert.equal(candidate.human_principals[0].actor_id, 1001);
    assert.equal(
      candidate.runner_evidence.billing_safety[0].status,
      "VERIFIED_NO_PAID_SPILLOVER"
    );
    assert.equal(
      candidate.runner_evidence.billing_safety[0].attested_by.evidence_ref,
      "human-enrollment:test"
    );
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
