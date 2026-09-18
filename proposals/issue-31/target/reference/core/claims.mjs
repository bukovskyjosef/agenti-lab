import { digest } from "./schema.mjs";

const ROLE_SET = new Set(["A", "D", "R", "P"]);
const TERMINAL_REASONS = new Set([
  "COMPLETED", "BLOCKED", "FAILED", "ABORTED", "REVOKED_DRIFT",
  "REVOKED_STOP", "REASSIGNED", "REROUTED", "EXPIRED"
]);

export function emptyClaimControl() {
  return { claim_version: 0, active_claim: null, last_terminal: null };
}

export function claimControlOf(state) {
  return state?.claim_control ?? emptyClaimControl();
}

export function stateMutationKey(workItem) {
  if (!workItem?.control_repository || !Number.isInteger(workItem?.issue_number)) {
    throw new Error("work item control_repository + issue_number required");
  }
  return "agenti-state-" +
    workItem.control_repository.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-") +
    "-" + workItem.issue_number;
}

function expectedDigest(value) {
  return value === undefined ? null : value;
}

function activeBindingMatches(state, assignment, active) {
  return Boolean(
    active &&
    assignment &&
    active.assignment_id === assignment.assignment_id &&
    active.role === assignment.role &&
    active.purpose === assignment.purpose &&
    active.binding.workflow_state_version === state.state_version &&
    active.binding.freshness_fingerprint === assignment.fingerprint &&
    expectedDigest(active.binding.semantic_work_digest) ===
      expectedDigest(assignment.semantic_work_digest) &&
    expectedDigest(active.binding.candidate_digest) ===
      expectedDigest(state.candidate?.digest)
  );
}

export function preRunEligibility({ state, request }) {
  if (!state || !state.work_item) return { eligible: false, reason: "WORK_ITEM_MISSING" };
  if (state.lifecycle === "STOPPED") return { eligible: false, reason: "WORK_ITEM_STOPPED" };
  const assignment = state.assignment;
  if (!assignment) return { eligible: false, reason: "ASSIGNMENT_MISSING" };
  const control = claimControlOf(state);

  if (!ROLE_SET.has(request?.role)) return { eligible: false, reason: "ROLE_INVALID" };
  if (request.assignment_id !== assignment.assignment_id) {
    return { eligible: false, reason: "ASSIGNMENT_NOT_CURRENT" };
  }
  if (request.role !== assignment.role || request.purpose !== assignment.purpose) {
    return { eligible: false, reason: "ROLE_PURPOSE_NOT_CURRENT" };
  }
  if (request.expected?.workflow_state_version !== state.state_version) {
    return { eligible: false, reason: "STATE_VERSION_MISMATCH" };
  }
  if (request.expected?.claim_version !== control.claim_version) {
    return { eligible: false, reason: "CLAIM_VERSION_MISMATCH" };
  }
  if (request.expected?.assignment_freshness_fingerprint !== assignment.fingerprint) {
    return { eligible: false, reason: "FRESHNESS_MISMATCH" };
  }
  if (expectedDigest(request.expected?.semantic_work_digest) !==
      expectedDigest(assignment.semantic_work_digest)) {
    return { eligible: false, reason: "SEMANTIC_WORK_MISMATCH" };
  }
  if (request.expected?.candidate_digest !== undefined &&
      expectedDigest(request.expected.candidate_digest) !==
      expectedDigest(state.candidate?.digest)) {
    return { eligible: false, reason: "CANDIDATE_BINDING_MISMATCH" };
  }
  if (request.claimant?.execution_attestation?.issued_for_assignment !== assignment.assignment_id) {
    return { eligible: false, reason: "ATTESTATION_ASSIGNMENT_MISMATCH" };
  }
  const executionId =
    request.claimant?.execution_attestation?.execution_instance_id;
  if (!executionId) return { eligible: false, reason: "EXECUTION_INSTANCE_MISSING" };

  if (
    assignment.role === "R" &&
    (assignment.must_differ_from_execution_instances ?? []).includes(executionId)
  ) {
    return { eligible: false, reason: "R_INDEPENDENCE_VIOLATION" };
  }
  if (control.active_claim) return { eligible: false, reason: "CLAIM_ALREADY_ACTIVE" };
  return { eligible: true, reason: "ELIGIBLE" };
}

function claimId({ state, request, generation }) {
  return "clm-" + digest({
    work_item: state.work_item,
    generation,
    assignment_id: request.assignment_id,
    request_id: request.request_id,
    execution_instance_id:
      request.claimant.execution_attestation.execution_instance_id
  }).slice(7, 31);
}

export function acquireClaimCAS({ state, request, acquiredAt }) {
  const eligibility = preRunEligibility({ state, request });
  if (!eligibility.eligible) {
    return { acquired: false, reason: eligibility.reason, state };
  }
  const next = structuredClone(state);
  const control = claimControlOf(next);
  const generation = (control.last_terminal?.claim_generation ?? 0) + 1;
  const id = claimId({ state, request, generation });
  const attestation = request.claimant.execution_attestation;
  const mode = request.lease?.mode ?? "NONE";
  const active = {
    claim_id: id,
    claim_generation: generation,
    assignment_id: request.assignment_id,
    role: request.role,
    purpose: request.purpose,
    acquired_at: acquiredAt,
    binding: {
      workflow_state_version: state.state_version,
      freshness_fingerprint: state.assignment.fingerprint,
      semantic_work_digest: state.assignment.semantic_work_digest ?? null,
      candidate_digest: state.candidate?.digest ?? null,
      target_digest: request.expected?.target_digest ?? null
    },
    owner: {
      execution_instance_id: attestation.execution_instance_id,
      adapter_id: attestation.adapter_id,
      adapter_version: attestation.adapter_version,
      platform_run_id: attestation.platform_run?.run_id ?? null,
      platform_run_attempt: attestation.platform_run?.run_attempt ?? null
    },
    lease: {
      mode,
      expires_at: request.lease?.expires_at ?? null,
      heartbeat_sequence: request.lease?.heartbeat_sequence ?? null,
      lease_token_digest: request.lease?.lease_token_digest ?? null
    }
  };
  next.claim_control = {
    claim_version: control.claim_version + 1,
    active_claim: active,
    last_terminal: control.last_terminal ?? null
  };
  return {
    acquired: true,
    reason: "CLAIM_GRANTED",
    state: next,
    grant: {
      schema_version: 1,
      claim_id: id,
      claim_generation: generation,
      assignment_id: request.assignment_id,
      claim_version: next.claim_control.claim_version,
      binding: structuredClone(active.binding),
      owner_execution_instance_id: active.owner.execution_instance_id,
      granted_at: acquiredAt
    }
  };
}

export function verifyActiveClaim({
  state,
  assignmentId,
  claimId,
  claimGeneration,
  executionInstanceId
}) {
  const active = claimControlOf(state).active_claim;
  if (!active) return { valid: false, reason: "NO_ACTIVE_CLAIM" };
  if (active.claim_id !== claimId || active.claim_generation !== claimGeneration) {
    return { valid: false, reason: "CLAIM_NOT_CURRENT" };
  }
  if (active.assignment_id !== assignmentId) {
    return { valid: false, reason: "CLAIM_ASSIGNMENT_MISMATCH" };
  }
  if (active.owner.execution_instance_id !== executionInstanceId) {
    return { valid: false, reason: "CLAIM_OWNER_MISMATCH" };
  }
  if (!activeBindingMatches(state, state.assignment, active)) {
    return { valid: false, reason: "CLAIM_BINDING_STALE" };
  }
  return { valid: true, reason: "CURRENT", active_claim: active };
}

export function renewClaimCAS({
  state,
  claimId,
  claimGeneration,
  executionInstanceId,
  expectedClaimVersion,
  leaseTokenDigest = null,
  expiresAt,
  heartbeatSequence
}) {
  const control = claimControlOf(state);
  if (expectedClaimVersion !== control.claim_version) {
    return { renewed: false, reason: "CLAIM_VERSION_MISMATCH", state };
  }
  const verified = verifyActiveClaim({
    state,
    assignmentId: state.assignment?.assignment_id,
    claimId,
    claimGeneration,
    executionInstanceId
  });
  if (!verified.valid) return { renewed: false, reason: verified.reason, state };
  const active = verified.active_claim;
  if (active.lease.mode !== "EXPIRING_HEARTBEAT") {
    return { renewed: false, reason: "LEASE_MODE_NOT_HEARTBEAT", state };
  }
  if (active.lease.lease_token_digest !== leaseTokenDigest) {
    return { renewed: false, reason: "LEASE_TOKEN_MISMATCH", state };
  }
  if (!Number.isInteger(heartbeatSequence) ||
      heartbeatSequence <= (active.lease.heartbeat_sequence ?? 0)) {
    return { renewed: false, reason: "HEARTBEAT_SEQUENCE_STALE", state };
  }
  const next = structuredClone(state);
  next.claim_control.claim_version += 1;
  next.claim_control.active_claim.lease.expires_at = expiresAt;
  next.claim_control.active_claim.lease.heartbeat_sequence = heartbeatSequence;
  return { renewed: true, reason: "RENEWED", state: next };
}

export function terminalizeClaim({ state, terminalReason, durableEvidenceRef = null }) {
  if (!TERMINAL_REASONS.has(terminalReason)) {
    throw new Error("invalid claim terminal reason " + terminalReason);
  }
  const control = claimControlOf(state);
  if (!control.active_claim) return { changed: false, state };
  const next = structuredClone(state);
  const active = next.claim_control.active_claim;
  next.claim_control = {
    claim_version: control.claim_version + 1,
    active_claim: null,
    last_terminal: {
      claim_id: active.claim_id,
      claim_generation: active.claim_generation,
      assignment_id: active.assignment_id,
      terminal_reason: terminalReason,
      execution_instance_id: active.owner.execution_instance_id,
      durable_evidence_ref: durableEvidenceRef
    }
  };
  return { changed: true, state: next };
}

export function recoverClaim({
  state,
  reason,
  platformRunTerminalNonSuccess = false,
  heartbeatExpired = false,
  humanAuthorizedClaimId = null,
  durableEvidenceRef = null
}) {
  const active = claimControlOf(state).active_claim;
  if (!active) return { recovered: false, reason: "NO_ACTIVE_CLAIM", state };
  if (active.lease.mode === "NONE") {
    if (humanAuthorizedClaimId !== active.claim_id) {
      return { recovered: false, reason: "H_RECOVERY_REQUIRED", state };
    }
  } else if (active.lease.mode === "PLATFORM_RUN") {
    if (!platformRunTerminalNonSuccess) {
      return { recovered: false, reason: "PLATFORM_RUN_NOT_TERMINAL_FAILURE", state };
    }
  } else if (active.lease.mode === "EXPIRING_HEARTBEAT") {
    if (!heartbeatExpired) {
      return { recovered: false, reason: "HEARTBEAT_NOT_EXPIRED", state };
    }
  }
  const terminalReason =
    active.lease.mode === "EXPIRING_HEARTBEAT" ? "EXPIRED" : (reason ?? "ABORTED");
  const terminalized = terminalizeClaim({
    state,
    terminalReason,
    durableEvidenceRef
  });
  return { recovered: true, reason: terminalReason, state: terminalized.state };
}

export function materialOperationId({
  state,
  claimId,
  claimGeneration,
  assignmentId,
  operationKind,
  targetBinding
}) {
  return "mop-" + digest({
    work_item: state.work_item,
    claim_id: claimId,
    claim_generation: claimGeneration,
    assignment_id: assignmentId,
    operation_kind: operationKind,
    target_binding: targetBinding
  }).slice(7, 31);
}

export function prepareMaterialOperation({
  state,
  claimId,
  claimGeneration,
  assignmentId,
  executionInstanceId,
  operationKind,
  targetBinding,
  preparedAt
}) {
  const verified = verifyActiveClaim({
    state, assignmentId, claimId, claimGeneration, executionInstanceId
  });
  if (!verified.valid) return { prepared: false, reason: verified.reason, state };
  if (state.material_operation?.status === "PREPARED") {
    return { prepared: false, reason: "MATERIAL_OPERATION_ALREADY_PREPARED", state };
  }
  const next = structuredClone(state);
  next.material_operation = {
    material_operation_id: materialOperationId({
      state, claimId, claimGeneration, assignmentId, operationKind, targetBinding
    }),
    status: "PREPARED",
    claim_id: claimId,
    claim_generation: claimGeneration,
    assignment_id: assignmentId,
    operation_kind: operationKind,
    target_binding: structuredClone(targetBinding),
    prepared_at: preparedAt,
    evidence_ref: null
  };
  return {
    prepared: true,
    reason: "PREPARED",
    state: next,
    material_operation: next.material_operation
  };
}

export function resolveMaterialOperation({
  state,
  materialOperationId: id,
  outcome,
  evidenceRef = null
}) {
  if (!["APPLIED", "NOT_APPLIED", "HUMAN_ACTION_REQUIRED"].includes(outcome)) {
    throw new Error("invalid material operation outcome " + outcome);
  }
  if (!state.material_operation || state.material_operation.material_operation_id !== id) {
    return { resolved: false, reason: "MATERIAL_OPERATION_NOT_CURRENT", state };
  }
  const next = structuredClone(state);
  next.material_operation = {
    ...next.material_operation,
    status: outcome,
    evidence_ref: evidenceRef
  };
  return { resolved: true, reason: outcome, state: next };
}

export function verifyRoleResultClaim({ state, normalizedResult }) {
  const trusted = normalizedResult?.trusted;
  if (!trusted) return { valid: false, reason: "TRUSTED_RESULT_MISSING" };
  const executionId = trusted.execution_attestation?.execution_instance_id;
  return verifyActiveClaim({
    state,
    assignmentId: trusted.assignment_id,
    claimId: trusted.claim_id,
    claimGeneration: trusted.claim_generation,
    executionInstanceId: executionId
  });
}

export function validateClaimsConfiguration(profile) {
  const errors = [];
  const claims = profile?.work_item_claims;
  const caps = profile?.claim_mechanism_capabilities;
  if (!claims) return ["work_item_claims is required for automated A/D/R/P execution"];
  if (!claims.mutation_domain) errors.push("work_item_claims.mutation_domain is required");
  if (claims.material_write_fencing !== "REQUIRED") {
    errors.push("work_item_claims.material_write_fencing must be REQUIRED");
  }
  if (!caps?.linearizable_per_work_item_mutation_domain) {
    errors.push("claim mechanism must provide a linearizable per-work-item mutation domain");
  }
  if (!caps?.all_projection_writers_share_domain) {
    errors.push("all authoritative projection writers must share the claim mutation domain");
  }
  if (caps?.authoritative_claim_location !== "O_PROJECTION") {
    errors.push("authoritative claim location must be O_PROJECTION");
  }
  if (!["SHARED_DOMAIN", "NATIVE_EQUIVALENT"].includes(caps?.material_write_fencing)) {
    errors.push("material writers require SHARED_DOMAIN or NATIVE_EQUIVALENT fencing");
  }
  if (claims.recovery?.mode === "PLATFORM_RUN" && !caps?.supports_platform_run_recovery) {
    errors.push("PLATFORM_RUN recovery requires supports_platform_run_recovery");
  }
  if (claims.recovery?.mode === "EXPIRING_HEARTBEAT" && !caps?.supports_heartbeat_lease) {
    errors.push("EXPIRING_HEARTBEAT recovery requires supports_heartbeat_lease");
  }
  if (
    profile?.repository_topology === "multi-repo" &&
    claims.mutation_domain === "local-process"
  ) {
    errors.push("multi-repo claim mutation domain cannot be local-process only");
  }
  return errors;
}
