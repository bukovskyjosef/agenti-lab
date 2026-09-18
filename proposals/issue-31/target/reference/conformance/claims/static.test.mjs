import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const wf = (name) =>
  readFile(resolve(root, "profiles/single-repo-actions/target/.github/workflows", name), "utf8");
const runtime = (name) =>
  readFile(resolve(root, "profiles/single-repo-actions/runtime", name), "utf8");

test("all Actions authoritative mutation jobs share per-work-item state group", async () => {
  const group = "agenti-state-${{ github.repository_id }}-${{ inputs.issue_number }}";
  for (const [file, minimum] of [
    ["agenti-role-a.yml", 2],
    ["agenti-role-d.yml", 2],
    ["agenti-role-r.yml", 2],
    ["agenti-role-a-claude.yml", 3],
    ["agenti-role-d-claude.yml", 3],
    ["agenti-role-r-claude.yml", 3],
    ["agenti-publish.yml", 1]
  ]) {
    const body = await wf(file);
    assert.ok(
      body.split(group).length - 1 >= minimum,
      file + " is missing one or more state-mutation fences"
    );
  }
  const orchestrate = await wf("agenti-orchestrate.yml");
  assert.match(orchestrate, /agenti-state-\$\{\{ github\.repository_id \}\}/);
});

test("global reconcile dispatches issue-specific O runs instead of mutating all states", async () => {
  const body = await runtime("orchestrate.mjs");
  const start = body.indexOf("export async function processAllManaged");
  const section = body.slice(start, body.indexOf("\n}\n\nasync function main", start) + 2);
  assert.match(section, /dispatchWorkflow/);
  assert.doesNotMatch(section, /processIssue\(issue\.number\)/);
});

test("material writers verify current active claim", async () => {
  assert.match(await runtime("candidate-writer.mjs"), /verifyActiveClaim/);
  assert.match(await runtime("publish.mjs"), /verifyActiveClaim/);
  assert.match(await runtime("routing-evidence.mjs"), /verifyActiveClaim/);
});

test("App uses one work-item mutation key and GitHub projection claim authority", async () => {
  const body = await readFile(
    resolve(root, "app/multi-repo-o/src/orchestrator.mjs"),
    "utf8"
  );
  assert.match(body, /return workItemKey\(workItem\)/);
  assert.doesNotMatch(body, /receiver-claim:/);
  assert.match(body, /claim_control/);
  assert.match(body, /acquireClaimCAS/);
});

test("Actions reference wires authoritative platform-run recovery and bounded jobs", async () => {
  const orchestrate = await runtime("orchestrate.mjs");
  const github = await runtime("github.mjs");
  assert.match(orchestrate, /recoverPlatformRunState/);
  assert.match(orchestrate, /getWorkflowRun/);
  assert.match(orchestrate, /claim-recover/);
  assert.match(github, /getWorkflowRun\(runId\)/);

  for (const file of [
    "agenti-orchestrate.yml",
    "agenti-publish.yml",
    "agenti-reconcile.yml",
    "agenti-role-a.yml",
    "agenti-role-d.yml",
    "agenti-role-r.yml",
    "agenti-role-a-claude.yml",
    "agenti-role-d-claude.yml",
    "agenti-role-r-claude.yml"
  ]) {
    const body = await wf(file);
    const jobs = body.match(/^    runs-on:/gm) ?? [];
    const timeouts = body.match(/^    timeout-minutes:/gm) ?? [];
    assert.equal(
      timeouts.length,
      jobs.length,
      file + " must bound every job runtime for recoverable platform lifecycle"
    );
  }
});

test("App projection CAS resolves ambiguous writes by durable reread", async () => {
  const body = await readFile(
    resolve(root, "app/multi-repo-o/src/orchestrator.mjs"),
    "utf8"
  );
  assert.match(body, /STATE_VERSION_CAS_AMBIGUOUS_CONFLICT/);
  assert.match(body, /afterComments/);
  assert.match(body, /finalComments/);
});

test("single-repo runner fresh-reconstructs before claim and before provider", async () => {
  const body = await runtime("runner.mjs");
  assert.ok(
    body.split("preClaimCurrentness({").length - 1 >= 2,
    "runner must currentness-check both before and after claim grant"
  );
  assert.match(body, /terminalReason:\s*"REVOKED_DRIFT"/);
  assert.match(body, /pre-provider-currentness:/);
  assert.match(body, /CANDIDATE_HEAD_DRIFT_BEFORE_CLAIM/);
  assert.match(body, /RELEASE_AUTHORIZATION_NOT_CURRENT/);
});
