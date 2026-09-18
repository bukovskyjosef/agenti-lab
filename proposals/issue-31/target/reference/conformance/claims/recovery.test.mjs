import test from "node:test";
import assert from "node:assert/strict";

import * as core from "../../core/index.mjs";
import {
  manualHumanRecoveryDecision,
  platformRunRecoveryDecision,
  recoverManualHumanState,
  recoverPlatformRunState
} from "../../profiles/single-repo-actions/runtime/recovery.mjs";

const fp = "sha256:" + "a".repeat(64);
const sw = "sha256:" + "b".repeat(64);

function state(mode = "PLATFORM_RUN") {
  const base = {
    work_item: {
      control_repository: "example/product",
      issue_number: 42,
      kind: "executable"
    },
    state_version: 5,
    lifecycle: "ANALYSIS",
    assignment: {
      assignment_id: "asg-a-00000005",
      role: "A",
      purpose: "SHAPE_INTENT",
      fingerprint: fp,
      semantic_work_digest: sw,
      must_differ_from_execution_instances: []
    },
    candidate: { kind: "none", digest: null, members: [] },
    claim_control: core.emptyClaimControl(),
    material_operation: null,
    updated_by: {
      o_run_id: "o-old",
      transition_id: "T01",
      idempotence_key: "old"
    }
  };
  const request = {
    schema_version: 1,
    work_item: base.work_item,
    assignment_id: base.assignment.assignment_id,
    role: "A",
    purpose: "SHAPE_INTENT",
    expected: {
      workflow_state_version: 5,
      claim_version: 0,
      assignment_freshness_fingerprint: fp,
      semantic_work_digest: sw,
      candidate_digest: null,
      active_claim: "ABSENT"
    },
    claimant: {
      execution_attestation: {
        adapter_id: "codex-action",
        adapter_version: "1",
        execution_instance_id: "exec-1",
        platform_run: {
          provider: "github-actions",
          run_id: "555",
          run_attempt: 1,
          job_or_worker_id: "model"
        },
        provider_session: { mode: "fresh", provider_session_id: null },
        issued_for_assignment: base.assignment.assignment_id,
        attested_by: "deterministic-wrapper"
      }
    },
    lease: { mode },
    requested_at: "2026-09-18T20:00:00Z",
    request_id: "request-1"
  };
  return core.acquireClaimCAS({
    state: base,
    request,
    acquiredAt: request.requested_at
  }).state;
}

test("platform run recovery requires exact terminal non-success bound run", () => {
  const claimed = state("PLATFORM_RUN");
  assert.equal(platformRunRecoveryDecision({
    state: claimed,
    run: { id: 555, status: "in_progress", conclusion: null }
  }).eligible, false);
  assert.equal(platformRunRecoveryDecision({
    state: claimed,
    run: { id: 555, status: "completed", conclusion: "success" }
  }).eligible, false);
  assert.equal(platformRunRecoveryDecision({
    state: claimed,
    run: { id: 556, status: "completed", conclusion: "cancelled" }
  }).eligible, false);

  const eligible = platformRunRecoveryDecision({
    state: claimed,
    run: { id: 555, status: "completed", conclusion: "cancelled" }
  });
  assert.equal(eligible.eligible, true);
});

test("platform terminal non-success recovers claim but accepted result suppresses recovery", () => {
  const claimed = state("PLATFORM_RUN");
  const run = { id: 555, status: "completed", conclusion: "timed_out" };
  assert.equal(recoverPlatformRunState({
    state: claimed,
    roleResultPresent: true,
    run,
    core
  }).recovered, false);

  const recovered = recoverPlatformRunState({
    state: claimed,
    roleResultPresent: false,
    run,
    core
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.claim_control.active_claim, null);
  assert.equal(
    recovered.state.claim_control.last_terminal.durable_evidence_ref,
    "actions-run:555"
  );
  assert.equal(recovered.state.state_version, claimed.state_version);
  assert.equal(
    recovered.state.claim_control.claim_version,
    claimed.claim_control.claim_version + 1
  );
});

test("manual H recovery is exact claim, actor and reason bound", () => {
  const claimed = state("NONE");
  const claimId = claimed.claim_control.active_claim.claim_id;
  const humans = new Set([1001]);

  assert.equal(manualHumanRecoveryDecision({
    state: claimed,
    command: { kind: "claim-recover", claim_id: claimId, reason: "stuck" },
    humanActorId: 9999,
    configuredHumanActorIds: humans
  }).eligible, false);

  assert.equal(manualHumanRecoveryDecision({
    state: claimed,
    command: { kind: "claim-recover", claim_id: "clm-wrong", reason: "stuck" },
    humanActorId: 1001,
    configuredHumanActorIds: humans
  }).eligible, false);

  const recovered = recoverManualHumanState({
    state: claimed,
    command: { kind: "claim-recover", claim_id: claimId, reason: "runner lost" },
    humanActorId: 1001,
    configuredHumanActorIds: humans,
    evidenceRef: "issue-comment:900",
    core
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.claim_control.active_claim, null);
  assert.equal(
    recovered.state.claim_control.last_terminal.durable_evidence_ref,
    "issue-comment:900"
  );
});
