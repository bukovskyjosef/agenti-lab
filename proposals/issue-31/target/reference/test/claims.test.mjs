import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireClaimCAS,
  emptyClaimControl,
  materialOperationId,
  prepareMaterialOperation,
  recoverClaim,
  renewClaimCAS,
  stateMutationKey,
  terminalizeClaim,
  verifyActiveClaim,
  verifyRoleResultClaim
} from "../core/index.mjs";

const fp = "sha256:" + "b".repeat(64);
const sw = "sha256:" + "c".repeat(64);

function state(role = "A") {
  return {
    work_item: {
      control_repository: "example/product",
      issue_number: 42,
      kind: "executable"
    },
    state_version: 7,
    lifecycle: "ANALYSIS",
    assignment: {
      assignment_id: "asg-current-0001",
      role,
      purpose: role === "R" ? "REVIEW_CANDIDATE" : "SHAPE_INTENT",
      fingerprint: fp,
      semantic_work_digest: sw,
      must_differ_from_execution_instances:
        role === "R" ? ["exec-author"] : []
    },
    candidate: { kind: "none", digest: null, members: [] },
    claim_control: emptyClaimControl(),
    material_operation: null
  };
}

function request(s, execution = "exec-1", overrides = {}) {
  return {
    schema_version: 1,
    work_item: s.work_item,
    assignment_id: s.assignment.assignment_id,
    role: s.assignment.role,
    purpose: s.assignment.purpose,
    expected: {
      workflow_state_version: s.state_version,
      claim_version: s.claim_control.claim_version,
      assignment_freshness_fingerprint: s.assignment.fingerprint,
      semantic_work_digest: s.assignment.semantic_work_digest,
      candidate_digest: s.candidate.digest,
      active_claim: "ABSENT"
    },
    claimant: {
      execution_attestation: {
        adapter_id: "test-adapter",
        adapter_version: "1",
        execution_instance_id: execution,
        platform_run: {
          provider: "github-actions",
          run_id: "100",
          run_attempt: 1,
          job_or_worker_id: "test"
        },
        provider_session: { mode: "fresh", provider_session_id: null },
        issued_for_assignment: s.assignment.assignment_id,
        attested_by: "deterministic-wrapper"
      }
    },
    lease: { mode: "PLATFORM_RUN" },
    requested_at: "2026-09-18T20:00:00Z",
    request_id: "req-" + execution,
    ...overrides
  };
}

test("double start from same durable version yields one active claim", () => {
  const initial = state();
  const a = acquireClaimCAS({
    state: initial,
    request: request(initial, "exec-a"),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  assert.equal(a.acquired, true);
  assert.equal(a.state.state_version, initial.state_version);
  assert.equal(a.state.claim_control.claim_version, 1);

  const b = acquireClaimCAS({
    state: a.state,
    request: request(initial, "exec-b"),
    acquiredAt: "2026-09-18T20:00:01Z"
  });
  assert.equal(b.acquired, false);
  assert.match(b.reason, /CLAIM_(VERSION_MISMATCH|ALREADY_ACTIVE)/);
  assert.equal(a.state.claim_control.active_claim.owner.execution_instance_id, "exec-a");
});

test("claim version is fencing state, not semantic workflow version", () => {
  const initial = state();
  const acquired = acquireClaimCAS({
    state: initial,
    request: request(initial),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  const done = terminalizeClaim({
    state: acquired.state,
    terminalReason: "COMPLETED",
    durableEvidenceRef: "issue-comment:1"
  });
  assert.equal(done.state.state_version, 7);
  assert.equal(done.state.claim_control.claim_version, 2);
  assert.equal(done.state.claim_control.active_claim, null);
  assert.equal(done.state.claim_control.last_terminal.claim_generation, 1);
});

test("stale result from older claim generation is rejected", () => {
  const initial = state();
  const first = acquireClaimCAS({
    state: initial,
    request: request(initial, "exec-a"),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  const released = terminalizeClaim({
    state: first.state,
    terminalReason: "ABORTED"
  }).state;
  const secondRequest = request({
    ...released,
    assignment: initial.assignment
  }, "exec-b");
  const second = acquireClaimCAS({
    state: released,
    request: secondRequest,
    acquiredAt: "2026-09-18T20:01:00Z"
  });
  assert.equal(second.acquired, true);
  const old = verifyActiveClaim({
    state: second.state,
    assignmentId: initial.assignment.assignment_id,
    claimId: first.grant.claim_id,
    claimGeneration: first.grant.claim_generation,
    executionInstanceId: "exec-a"
  });
  assert.equal(old.valid, false);
  assert.equal(old.reason, "CLAIM_NOT_CURRENT");

  const result = {
    trusted: {
      assignment_id: initial.assignment.assignment_id,
      claim_id: first.grant.claim_id,
      claim_generation: first.grant.claim_generation,
      execution_attestation: { execution_instance_id: "exec-a" }
    }
  };
  assert.equal(verifyRoleResultClaim({ state: second.state, normalizedResult: result }).valid, false);
});

test("R independence is enforced before claim grant", () => {
  const rState = state("R");
  const denied = acquireClaimCAS({
    state: rState,
    request: request(rState, "exec-author"),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  assert.equal(denied.acquired, false);
  assert.equal(denied.reason, "R_INDEPENDENCE_VIOLATION");
});

test("PLATFORM_RUN recovery only terminalizes current failed platform run claim", () => {
  const initial = state();
  const acquired = acquireClaimCAS({
    state: initial,
    request: request(initial),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  assert.equal(recoverClaim({
    state: acquired.state,
    reason: "ABORTED",
    platformRunTerminalNonSuccess: false
  }).recovered, false);
  const recovered = recoverClaim({
    state: acquired.state,
    reason: "ABORTED",
    platformRunTerminalNonSuccess: true
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.claim_control.active_claim, null);
});

test("material writer fence produces deterministic operation identity", () => {
  const initial = state();
  const acquired = acquireClaimCAS({
    state: initial,
    request: request(initial),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  const args = {
    state: acquired.state,
    claimId: acquired.grant.claim_id,
    claimGeneration: acquired.grant.claim_generation,
    assignmentId: initial.assignment.assignment_id,
    executionInstanceId: "exec-1",
    operationKind: "D_CANDIDATE_REF_WRITE",
    targetBinding: { repository: "example/product", branch: "agenti/issue-42" },
    preparedAt: "2026-09-18T20:00:10Z"
  };
  const prepared = prepareMaterialOperation(args);
  assert.equal(prepared.prepared, true);
  assert.equal(
    prepared.material_operation.material_operation_id,
    materialOperationId(args)
  );
  const wrongOwner = prepareMaterialOperation({ ...args, executionInstanceId: "exec-other" });
  assert.equal(wrongOwner.prepared, false);
  assert.equal(wrongOwner.reason, "CLAIM_OWNER_MISMATCH");
});

test("state mutation key is stable per work item and distinct across children", () => {
  assert.equal(
    stateMutationKey({ control_repository: "Org/Repo", issue_number: 20 }),
    stateMutationKey({ control_repository: "org/repo", issue_number: 20 })
  );
  assert.notEqual(
    stateMutationKey({ control_repository: "org/repo", issue_number: 20 }),
    stateMutationKey({ control_repository: "org/repo", issue_number: 21 })
  );
});

test("NONE recovery requires exact Human-authorized claim and preserves evidence", () => {
  const initial = state();
  const req = request(initial);
  req.lease = { mode: "NONE" };
  const acquired = acquireClaimCAS({
    state: initial,
    request: req,
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  assert.equal(acquired.acquired, true);
  assert.equal(recoverClaim({
    state: acquired.state,
    reason: "ABORTED",
    humanAuthorizedClaimId: "clm-wrong"
  }).recovered, false);

  const recovered = recoverClaim({
    state: acquired.state,
    reason: "ABORTED",
    humanAuthorizedClaimId: acquired.grant.claim_id,
    durableEvidenceRef: "issue-comment:77"
  });
  assert.equal(recovered.recovered, true);
  assert.equal(
    recovered.state.claim_control.last_terminal.durable_evidence_ref,
    "issue-comment:77"
  );
});

test("heartbeat renewal is exact-token/version fenced and expiry is not success", () => {
  const initial = state();
  const req = request(initial);
  req.lease = {
    mode: "EXPIRING_HEARTBEAT",
    expires_at: "2026-09-18T20:05:00Z",
    heartbeat_sequence: 1,
    lease_token_digest: fp
  };
  const acquired = acquireClaimCAS({
    state: initial,
    request: req,
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  assert.equal(acquired.acquired, true);

  const wrongToken = renewClaimCAS({
    state: acquired.state,
    claimId: acquired.grant.claim_id,
    claimGeneration: acquired.grant.claim_generation,
    executionInstanceId: "exec-1",
    expectedClaimVersion: acquired.state.claim_control.claim_version,
    leaseTokenDigest: sw,
    expiresAt: "2026-09-18T20:10:00Z",
    heartbeatSequence: 2
  });
  assert.equal(wrongToken.renewed, false);
  assert.equal(wrongToken.reason, "LEASE_TOKEN_MISMATCH");

  const renewed = renewClaimCAS({
    state: acquired.state,
    claimId: acquired.grant.claim_id,
    claimGeneration: acquired.grant.claim_generation,
    executionInstanceId: "exec-1",
    expectedClaimVersion: acquired.state.claim_control.claim_version,
    leaseTokenDigest: fp,
    expiresAt: "2026-09-18T20:10:00Z",
    heartbeatSequence: 2
  });
  assert.equal(renewed.renewed, true);
  assert.equal(renewed.state.state_version, initial.state_version);
  assert.equal(
    renewed.state.claim_control.claim_version,
    acquired.state.claim_control.claim_version + 1
  );

  const expired = recoverClaim({
    state: renewed.state,
    heartbeatExpired: true,
    durableEvidenceRef: "heartbeat-expiry:verified"
  });
  assert.equal(expired.recovered, true);
  assert.equal(expired.reason, "EXPIRED");
  assert.equal(
    expired.state.claim_control.last_terminal.terminal_reason,
    "EXPIRED"
  );
});

test("separate child work items can hold independent claims", () => {
  const childA = state();
  childA.work_item.issue_number = 101;
  const childB = state();
  childB.work_item.issue_number = 102;

  const a = acquireClaimCAS({
    state: childA,
    request: request(childA, "exec-child-a"),
    acquiredAt: "2026-09-18T20:00:00Z"
  });
  const b = acquireClaimCAS({
    state: childB,
    request: request(childB, "exec-child-b"),
    acquiredAt: "2026-09-18T20:00:00Z"
  });

  assert.equal(a.acquired, true);
  assert.equal(b.acquired, true);
  assert.notEqual(
    stateMutationKey(childA.work_item),
    stateMutationKey(childB.work_item)
  );
});

test("claim eligibility fails closed at Human, stale assignment and P release boundaries", () => {
  const human = state();
  human.human_requests = {
    active: [{ request_id: "hir-1", status: "PENDING" }],
    recent_refs: []
  };
  assert.equal(
    acquireClaimCAS({
      state: human,
      request: request(human),
      acquiredAt: "2026-09-18T20:00:00Z"
    }).reason,
    "HUMAN_INPUT_PENDING"
  );

  const stale = state();
  stale.assignment.bound_state_version = stale.state_version - 1;
  assert.equal(
    acquireClaimCAS({
      state: stale,
      request: request(stale),
      acquiredAt: "2026-09-18T20:00:00Z"
    }).reason,
    "ASSIGNMENT_STATE_BINDING_STALE"
  );

  const publisher = state("P");
  publisher.assignment.purpose = "PUBLISH_CURRENT_CANDIDATE";
  publisher.release_authorization = { status: "PENDING" };
  const pRequest = request(publisher, "exec-p");
  pRequest.role = "P";
  pRequest.purpose = "PUBLISH_CURRENT_CANDIDATE";
  assert.equal(
    acquireClaimCAS({
      state: publisher,
      request: pRequest,
      acquiredAt: "2026-09-18T20:00:00Z"
    }).reason,
    "RELEASE_AUTHORIZATION_NOT_CURRENT"
  );
});
