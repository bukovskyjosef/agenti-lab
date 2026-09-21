import test from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as core from "../../core/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");
const schema = JSON.parse(await readFile(
  new URL("../../schemas/workflow-state.schema.json", import.meta.url),
  "utf8"
));
const base = JSON.parse(await readFile(
  new URL("../fixtures/base-state.json", import.meta.url),
  "utf8"
));

async function withInstalledRuntime(fn) {
  const temp = await mkdtemp(join(tmpdir(), "agenti-material-recovery-"));
  try {
    await cp(join(referenceRoot, "core"), join(temp, "core"), {
      recursive: true
    });
    await cp(
      join(
        referenceRoot,
        "profiles",
        "single-repo-actions",
        "runtime"
      ),
      join(temp, "runtime"),
      { recursive: true }
    );
    const material = await import(
      pathToFileURL(join(temp, "runtime", "material-operation.mjs")).href
    );
    const recovery = await import(
      pathToFileURL(join(temp, "runtime", "recovery.mjs")).href
    );
    return await fn({ material, recovery });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function claimedState(operationKind, targetBinding) {
  const state = structuredClone(base);
  const request = {
    schema_version: 1,
    work_item: state.work_item,
    assignment_id: state.assignment.assignment_id,
    role: state.assignment.role,
    purpose: state.assignment.purpose,
    expected: {
      workflow_state_version: state.state_version,
      claim_version: state.claim_control.claim_version,
      assignment_freshness_fingerprint: state.assignment.fingerprint,
      semantic_work_digest: null,
      candidate_digest: null,
      target_digest: "sha256:" + "c".repeat(64),
      active_claim: "ABSENT"
    },
    claimant: {
      execution_attestation: {
        adapter_id: "test",
        adapter_version: "1",
        execution_instance_id: "exec-material-crash",
        platform_run: {
          provider: "github-actions",
          run_id: "101",
          run_attempt: 1,
          job_or_worker_id: "writer"
        },
        provider_session: {
          mode: "fresh",
          provider_session_id: null
        },
        issued_for_assignment: state.assignment.assignment_id,
        attested_by: "deterministic-wrapper"
      }
    },
    lease: { mode: "PLATFORM_RUN" },
    requested_at: "2026-09-18T20:00:00Z",
    request_id: "material-crash"
  };
  const acquired = core.acquireClaimCAS({
    state,
    request,
    acquiredAt: request.requested_at
  });
  assert.equal(acquired.acquired, true);
  const claimed = acquired.state;
  claimed.material_operation = {
    material_operation_id: "mop-crash-window",
    status: "PREPARED",
    claim_id: acquired.grant.claim_id,
    claim_generation: acquired.grant.claim_generation,
    assignment_id: state.assignment.assignment_id,
    operation_kind: operationKind,
    target_binding: targetBinding,
    prepared_at: "2026-09-18T20:01:00Z",
    evidence_ref: null
  };
  return claimed;
}

function fakeGitHub(initialState, overrides = {}) {
  let durable = {
    id: 77,
    body: core.renderStateComment(initialState),
    user: { login: "github-actions[bot]", type: "Bot" },
    created_at: "2026-09-18T20:00:00Z",
    updated_at: "2026-09-18T20:00:00Z"
  };
  let nextCommentId = 90;
  const comments = [durable];

  return {
    listIssueComments: async () => comments,
    getIssueComment: async () => durable,
    updateIssueComment: async (_id, body) => {
      durable = {
        ...durable,
        body,
        updated_at: "2026-09-18T20:02:00Z"
      };
      comments[0] = durable;
      return durable;
    },
    createIssueComment: async (_issue, body) => {
      const comment = {
        id: nextCommentId++,
        body,
        user: { login: "github-actions[bot]", type: "Bot" },
        created_at: "2026-09-18T20:02:00Z",
        updated_at: "2026-09-18T20:02:00Z"
      };
      comments.push(comment);
      return comment;
    },
    getWorkflowRun: async () => ({
      id: 101,
      status: "completed",
      conclusion: "failure"
    }),
    ...overrides,
    state: () => core.parseStateComment(durable.body)
  };
}

async function assertAppliedCrashRequiresHuman({
  operationKind,
  targetBinding,
  githubOverrides
}) {
  return withInstalledRuntime(async ({ material, recovery }) => {
    const state = claimedState(operationKind, targetBinding);
    const github = fakeGitHub(state, githubOverrides);
    const loaded = {
      state,
      comment: {
        id: 77,
        body: core.renderStateComment(state),
        user: { login: "github-actions[bot]", type: "Bot" }
      },
      comments: []
    };

    const result = await material.reconcileMaterialOperationForFailedRun({
      github,
      runtime: { workflowStateSchema: schema },
      loaded,
      issueNumber: 42
    });

    assert.equal(result.blocked, true);
    assert.equal(result.status, "MATERIAL_OPERATION_REQUIRES_HUMAN");
    const after = github.state();
    assert.equal(after.material_operation.status, "HUMAN_ACTION_REQUIRED");
    assert.match(after.material_operation.evidence_ref, /issue-comment:/);

    const decision = recovery.platformRunRecoveryDecision({
      state: after,
      roleResultPresent: false,
      run: {
        id: 101,
        status: "completed",
        conclusion: "failure"
      }
    });
    assert.equal(decision.eligible, false);
    assert.equal(
      decision.reason,
      "MATERIAL_OPERATION_RECONCILIATION_REQUIRED"
    );
  });
}

test("F3 D push applied but result missing blocks redispatch for Human reconciliation", async () => {
  const expected = "d".repeat(40);
  await assertAppliedCrashRequiresHuman({
    operationKind: "D_CANDIDATE_REF_WRITE",
    targetBinding: {
      repository: "example/product",
      branch: "agenti/issue-42",
      base_ref: "a".repeat(40),
      expected_head_sha: expected,
      claim_target_digest: "sha256:" + "c".repeat(64),
      patch_sha256: "sha256:" + "e".repeat(64)
    },
    githubOverrides: {
      getBranch: async () => ({
        name: "agenti/issue-42",
        commit: { sha: expected }
      })
    }
  });
});

test("F3 P merge applied but result missing blocks redispatch for Human reconciliation", async () => {
  const expected = "d".repeat(40);
  await assertAppliedCrashRequiresHuman({
    operationKind: "P_MERGE",
    targetBinding: {
      repository: "example/product",
      pr_number: 7,
      expected_head: expected,
      target_branch: "main",
      claim_target_digest: "sha256:" + "c".repeat(64)
    },
    githubOverrides: {
      getPull: async () => ({
        number: 7,
        merged: true,
        merged_at: "2026-09-18T20:01:00Z",
        merge_commit_sha: "f".repeat(40),
        head: { sha: expected }
      })
    }
  });
});

test("F3 provably not-applied P merge becomes retry-eligible", async () =>
  withInstalledRuntime(async ({ material, recovery }) => {
    const expected = "d".repeat(40);
    const state = claimedState("P_MERGE", {
      repository: "example/product",
      pr_number: 7,
      expected_head: expected,
      target_branch: "main",
      claim_target_digest: "sha256:" + "c".repeat(64)
    });
    const github = fakeGitHub(state, {
      getPull: async () => ({
        number: 7,
        merged: false,
        merged_at: null,
        merge_commit_sha: null,
        head: { sha: expected }
      })
    });
    const result = await material.reconcileMaterialOperationForFailedRun({
      github,
      runtime: { workflowStateSchema: schema },
      loaded: {
        state,
        comment: { id: 77, body: core.renderStateComment(state) },
        comments: []
      },
      issueNumber: 42
    });
    assert.equal(result.blocked, false);
    assert.equal(result.changed, true);
    assert.equal(github.state().material_operation.status, "NOT_APPLIED");

    const decision = recovery.platformRunRecoveryDecision({
      state: github.state(),
      roleResultPresent: false,
      run: {
        id: 101,
        status: "completed",
        conclusion: "failure"
      }
    });
    assert.equal(decision.eligible, true);
  }));
