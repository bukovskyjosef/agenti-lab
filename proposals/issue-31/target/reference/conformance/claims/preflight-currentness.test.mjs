import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as core from "../../core/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");

async function withRunner(fn) {
  const temp = await mkdtemp(join(tmpdir(), "agenti-preclaim-test-"));
  try {
    await cp(join(referenceRoot, "core"), join(temp, "core"), {
      recursive: true
    });
    await cp(
      join(referenceRoot, "profiles", "single-repo-actions", "runtime"),
      join(temp, "runtime"),
      { recursive: true }
    );
    const runner = await import(
      pathToFileURL(join(temp, "runtime", "runner.mjs")).href
    );
    return await fn(runner);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function state(body = "Stable contract") {
  return {
    work_item: {
      control_repository: "example/product",
      issue_number: 42,
      kind: "executable"
    },
    state_version: 3,
    lifecycle: "ANALYSIS",
    contract: {
      source_ref: "issue:42",
      accepted_revision: "2026-09-18T20:00:00Z",
      digest: core.digest(body),
      parent: null
    },
    assignment: {
      assignment_id: "asg-a-current",
      role: "A",
      purpose: "SHAPE_INTENT",
      issued_from_state_version: 2,
      bound_state_version: 3,
      fingerprint: "sha256:" + "b".repeat(64),
      capability_profile: "A_READ_ANALYZE",
      dispatch_status: "pending",
      workflow_run_id: null,
      must_differ_from_execution_instances: []
    },
    candidate: { kind: "none", generation: 0, digest: null, members: [] },
    human_requests: { active: [], recent_refs: [] },
    release_authorization: {
      status: "NOT_REQUIRED",
      candidate_digest: null,
      target_digest: null,
      response_ref: null
    },
    material_operation: null
  };
}

function assignment(s) {
  return {
    role: s.assignment.role,
    purpose: s.assignment.purpose,
    capability_profile: s.assignment.capability_profile,
    candidate: s.candidate
  };
}

const runtime = {
  projectProfile: {
    required_checks: [],
    publication: { boundary_operations: ["MERGE"] },
    release_authorization: { required: false }
  },
  runtimeConfig: { default_branch: "main" }
};

test("contract drift before claim is fail-closed", async () =>
  withRunner(async ({ preClaimCurrentness }) => {
    const s = state();
    const result = await preClaimCurrentness({
      github: {
        repository: "example/product",
        getIssue: async () => ({ body: "Changed contract" })
      },
      runtime,
      state: s,
      assignment: assignment(s),
      comments: []
    });
    assert.equal(result.current, false);
    assert.equal(result.reason, "CONTRACT_DRIFT_BEFORE_CLAIM");
  }));

test("candidate head drift before claim is fail-closed", async () =>
  withRunner(async ({ preClaimCurrentness }) => {
    const s = state();
    s.candidate = {
      kind: "single",
      generation: 1,
      digest: core.digest({ candidate: 1 }),
      members: [{
        repository: "example/product",
        pr_number: 7,
        head_sha: "a".repeat(40),
        base_ref_or_sha: "main"
      }]
    };
    const result = await preClaimCurrentness({
      github: {
        repository: "example/product",
        getIssue: async () => ({ body: "Stable contract" }),
        getPull: async () => ({
          head: { sha: "c".repeat(40) },
          base: { ref: "main", sha: "d".repeat(40) }
        })
      },
      runtime,
      state: s,
      assignment: assignment(s),
      comments: []
    });
    assert.equal(result.current, false);
    assert.equal(result.reason, "CANDIDATE_HEAD_DRIFT_BEFORE_CLAIM");
  }));

test("current contract/candidate passes and post-grant drift is detectable before provider", async () =>
  withRunner(async ({ preClaimCurrentness }) => {
    const s = state();
    const stableGitHub = {
      repository: "example/product",
      getIssue: async () => ({ body: "Stable contract" })
    };
    const before = await preClaimCurrentness({
      github: stableGitHub,
      runtime,
      state: s,
      assignment: assignment(s),
      comments: []
    });
    assert.equal(before.current, true);

    const claimed = structuredClone(s);
    claimed.claim_control = {
      claim_version: 1,
      active_claim: {
        claim_id: "clm-current",
        claim_generation: 1
      },
      last_terminal: null
    };
    const after = await preClaimCurrentness({
      github: {
        repository: "example/product",
        getIssue: async () => ({ body: "Changed after grant" })
      },
      runtime,
      state: claimed,
      assignment: assignment(claimed),
      comments: []
    });
    assert.equal(after.current, false);
    assert.equal(after.reason, "CONTRACT_DRIFT_BEFORE_CLAIM");
  }));
