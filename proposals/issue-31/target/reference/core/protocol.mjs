import { digest, makeIdempotenceKey, validateSchema } from "./schema.mjs";

export const ROLE_RESULT_MARKER = "agenti-role-result:v1";

const ROLE_CAPABILITIES = Object.freeze({
  A: "A_READ_ANALYZE",
  D: "D_WORKSPACE_WRITE",
  R: "R_READ_REVIEW",
  P: "P_PUBLISH"
});

const RESULT_TYPE_BY_ROLE = Object.freeze({
  A: "ANALYST",
  D: "DEVELOPER",
  R: "REVIEWER",
  P: "PUBLISHER"
});

const ANALYST_SECTIONS = new Set([
  "GOAL", "CONTEXT", "SCOPE", "OUT_OF_SCOPE", "REQUIREMENTS",
  "ACCEPTANCE_CRITERIA", "CONSTRAINTS", "DEPENDENCIES",
  "CANONICAL_REFERENCES", "REQUIRED_CONTROL_GATES", "VALIDATION",
  "DOCUMENTATION_IMPACT", "CONCURRENCY_CLASS", "SHARED_SURFACES",
  "DECISION_GATES", "RELEASE_POLICY"
]);

export function fingerprint({ role, purpose, state, relevant_inputs }) {
  return digest({
    work_item: state.work_item,
    state_version: state.state_version,
    lifecycle: state.lifecycle,
    role,
    purpose,
    contract_digest: state.contract.digest,
    candidate_digest: state.candidate?.digest ?? null,
    relevant_inputs
  });
}

export function runEligibility({
  last_completed_fingerprint = null,
  current_fingerprint = null,
  last_completed_semantic_work_digest = null,
  current_semantic_work_digest = null,
  objective_retry_reason = null
}) {
  const semanticMode =
    current_semantic_work_digest !== null ||
    last_completed_semantic_work_digest !== null;

  if (semanticMode) {
    if (!last_completed_semantic_work_digest) {
      return { eligible: true, reason: "FIRST_SEMANTIC_RUN" };
    }
    if (last_completed_semantic_work_digest !== current_semantic_work_digest) {
      return { eligible: true, reason: "SEMANTIC_WORK_CHANGED" };
    }
    if (objective_retry_reason) {
      return { eligible: true, reason: "OBJECTIVE_RETRY_PROGRESS" };
    }
    return { eligible: false, reason: "NO_SEMANTIC_PROGRESS" };
  }

  if (!last_completed_fingerprint) return { eligible: true, reason: "FIRST_RUN" };
  if (last_completed_fingerprint !== current_fingerprint) return { eligible: true, reason: "CHANGED_STATE" };
  if (objective_retry_reason) return { eligible: true, reason: "OBJECTIVE_RETRY_PROGRESS" };
  return { eligible: false, reason: "NO_SEMANTIC_PROGRESS" };
}

export function casKey({ state, transition_id, inputs }) {
  return makeIdempotenceKey(
    state.work_item.control_repository,
    state.work_item.issue_number,
    state.state_version,
    transition_id,
    inputs
  );
}

export function candidateDigest(candidate) {
  if (!candidate || candidate.kind === "none") return null;
  const members = [...(candidate.members ?? [])].sort((a, b) =>
    (a.repository + "#" + (a.pr_number ?? 0)).localeCompare(b.repository + "#" + (b.pr_number ?? 0))
  );
  return digest({ kind: candidate.kind, members });
}

export function earliestAffectedPoint({
  contract_changed = false,
  parent_input_changed = false,
  candidate_changed = false,
  gate_changed = false,
  publication_changed = false
}) {
  if (contract_changed || parent_input_changed) return "ANALYSIS";
  if (candidate_changed || gate_changed) return "IN_REVIEW";
  if (publication_changed) return "APPROVED";
  return null;
}

export function generateAssignment({
  state,
  role,
  purpose,
  issued_at,
  context_entrypoints,
  execution_repository = null,
  relevant_inputs = {},
  semantic_work_digest = null,
  execution_route = null,
  independence = { required: false, must_differ_from_execution_instances: [], enforcement_mechanism: "none" }
}) {
  if (!(role in ROLE_CAPABILITIES)) throw new Error("Unsupported role " + role);
  if (!issued_at) throw new Error("issued_at is required input; core does not read wall clock");

  const routeDigest = execution_route ? digest(execution_route) : null;
  const freshnessInputs = semantic_work_digest || execution_route
    ? {
        ...relevant_inputs,
        semantic_work_digest,
        execution_route_digest: routeDigest
      }
    : relevant_inputs;
  const currentFingerprint = fingerprint({
    role,
    purpose,
    state,
    relevant_inputs: freshnessInputs
  });
  const assignmentIdentity = {
    work_item: state.work_item,
    state_version: state.state_version,
    role,
    purpose,
    fingerprint: currentFingerprint
  };
  if (semantic_work_digest) {
    assignmentIdentity.semantic_work_digest = semantic_work_digest;
    assignmentIdentity.execution_route_digest = routeDigest;
    assignmentIdentity.routing_attempt_generation =
      execution_route?.routing_attempt_generation ?? 0;
  }
  const assignmentId = "asg-" + digest(assignmentIdentity).slice(7, 31);

  return {
    schema_version: 1,
    assignment_id: assignmentId,
    issued_at,
    role,
    purpose,
    work_item: {
      control_repository: state.work_item.control_repository,
      issue_number: state.work_item.issue_number
    },
    execution_repository,
    state: {
      version: state.state_version,
      fingerprint: currentFingerprint,
      contract_digest: state.contract.digest
    },
    candidate: {
      kind: state.candidate?.kind ?? "none",
      digest: state.candidate?.digest ?? null,
      members: state.candidate?.members ?? []
    },
    ...(semantic_work_digest
      ? {
          semantic_work_digest,
          execution_route
        }
      : {}),
    context_entrypoints,
    capability_profile: ROLE_CAPABILITIES[role],
    independence,
    claim: { required: true },
    completion: {
      result_schema_version: 1,
      result_marker: ROLE_RESULT_MARKER,
      callback_event: "agenti.role-result"
    }
  };
}

export function verifyExecutionIndependence({ assignment, normalizedResult, projectProfile }) {
  if (assignment.role !== "R" || !assignment.independence.required) {
    return { valid: true, reason: "NOT_REQUIRED" };
  }

  const attestation = normalizedResult?.trusted?.execution_attestation;
  if (!attestation || attestation.attested_by !== "deterministic-wrapper") {
    return { valid: false, reason: "MISSING_TRUSTED_ATTESTATION" };
  }
  if (attestation.issued_for_assignment !== assignment.assignment_id) {
    return { valid: false, reason: "ATTESTATION_ASSIGNMENT_MISMATCH" };
  }
  if (assignment.independence.must_differ_from_execution_instances.includes(attestation.execution_instance_id)) {
    return { valid: false, reason: "AUTHOR_REVIEWER_EXECUTION_INSTANCE_COLLISION" };
  }

  const mechanism = projectProfile?.independent_r_enforcement?.mechanisms?.[
    assignment.independence.enforcement_mechanism
  ];
  if (!mechanism || mechanism.attestation_source !== "deterministic-wrapper") {
    return { valid: false, reason: "UNKNOWN_OR_UNTRUSTED_INDEPENDENCE_MECHANISM" };
  }
  if (mechanism.fresh_execution_required && attestation.provider_session.mode !== "fresh") {
    return { valid: false, reason: "FRESH_REVIEW_EXECUTION_REQUIRED" };
  }

  return { valid: true, reason: "TRUSTED_DISTINCT_EXECUTION" };
}

function assertProposalAllowlist(proposal) {
  const allowed = new Set([
    "role", "status", "result_type", "payload",
    "evidence_refs", "human_request", "retry_or_failure"
  ]);
  for (const key of Object.keys(proposal)) {
    if (!allowed.has(key)) throw new Error("Provider proposal contains non-allowlisted field: " + key);
  }
}

function validateRoleSemantics(result) {
  if (RESULT_TYPE_BY_ROLE[result.role] !== result.result_type) {
    throw new Error("role/result_type discriminator mismatch");
  }

  if (result.role === "A") {
    for (const operation of result.payload.contract_operations ?? []) {
      if (operation.op !== "SET_SECTION" || !ANALYST_SECTIONS.has(operation.section)) {
        throw new Error("A result contains non-allowlisted contract operation");
      }
    }
  }

  if (result.role === "R") {
    const { outcome, findings, correction_owner } = result.payload;
    const blocking = findings.some((finding) => finding.disposition !== "RECOMMENDATION");
    if (outcome === "APPROVED" && (correction_owner !== "NONE" || blocking)) {
      throw new Error("R APPROVED requires correction_owner NONE and no blocking finding");
    }
    if (outcome === "CHANGES_REQUIRED" && !["A", "D"].includes(correction_owner)) {
      throw new Error("R CHANGES_REQUIRED must route to A or D");
    }
    if (outcome === "DECISION_REQUIRED" && (correction_owner !== "H" || !result.human_request)) {
      throw new Error("R DECISION_REQUIRED requires H routing and a human_request");
    }
  }

  if (result.role === "P" && ("done" in result.payload || "lifecycle" in result.payload)) {
    throw new Error("P result may not emit Done/lifecycle");
  }
}

export function normalizeRoleResult({
  proposal,
  trustedFacts,
  assignment,
  roleResultSchema = null
}) {
  assertProposalAllowlist(proposal);
  if (proposal.role !== assignment.role) throw new Error("Out-of-role result");
  if (proposal.result_type !== RESULT_TYPE_BY_ROLE[assignment.role]) {
    throw new Error("Wrong role-result discriminator");
  }
  if (trustedFacts.assignment_id !== assignment.assignment_id) {
    throw new Error("Trusted assignment ID mismatch");
  }
  if (trustedFacts.execution_attestation?.issued_for_assignment !== assignment.assignment_id) {
    throw new Error("Execution attestation not issued for assignment");
  }

  let normalizedPayload = proposal.payload;
  if (proposal.role === "D") {
    if (!trustedFacts.change_artifact) {
      throw new Error("D normalization requires wrapper-owned trusted change_artifact");
    }
    normalizedPayload = {
      ...proposal.payload,
      change_artifact: trustedFacts.change_artifact,
      author_validation: {
        ...proposal.payload.author_validation,
        refs: trustedFacts.author_validation_refs ?? proposal.payload.author_validation?.refs ?? []
      }
    };
  }

  const withoutDigest = {
    schema_version: 1,
    role: proposal.role,
    status: proposal.status,
    result_type: proposal.result_type,
    trusted: {
      assignment_id: trustedFacts.assignment_id,
      claim_id: trustedFacts.claim_id,
      claim_generation: trustedFacts.claim_generation,
      observed_state_version: trustedFacts.observed_state_version,
      observed_fingerprint: trustedFacts.observed_fingerprint,
      execution_attestation: trustedFacts.execution_attestation,
      candidate: trustedFacts.candidate ?? null,
      semantic_work_digest: assignment.semantic_work_digest ?? null,
      execution_route_digest: assignment.execution_route
        ? digest(assignment.execution_route)
        : null,
      actual_billing_mode: trustedFacts.actual_billing_mode ?? null
    },
    evidence_refs: proposal.evidence_refs ?? [],
    human_request: proposal.human_request ?? null,
    retry_or_failure: proposal.retry_or_failure ?? null,
    payload: normalizedPayload
  };

  const normalized = { ...withoutDigest, result_digest: digest(withoutDigest) };
  validateRoleSemantics(normalized);

  if (roleResultSchema) {
    const errors = validateSchema(normalized, roleResultSchema);
    if (errors.length) throw new Error("Normalized role result failed schema: " + errors.join("; "));
  }
  return normalized;
}

export function applyRoleResult({ state, assignment, normalizedResult, projectProfile }) {
  if (!state.assignment || state.assignment.assignment_id !== assignment.assignment_id) {
    return { accepted: false, reason: "ASSIGNMENT_NOT_CURRENT" };
  }
  if (
    state.assignment.bound_state_version !== state.state_version ||
    assignment.state.version !== state.state_version ||
    state.assignment.fingerprint !== assignment.state.fingerprint ||
    normalizedResult.trusted.observed_state_version !== state.state_version ||
    normalizedResult.trusted.observed_fingerprint !== assignment.state.fingerprint
  ) {
    return { accepted: false, reason: "STALE_STATE_OR_FINGERPRINT" };
  }

  if (assignment.execution_route) {
    const route = assignment.execution_route;
    const attestation = normalizedResult.trusted.execution_attestation;
    if (
      attestation.adapter_id !== route.adapter_id ||
      attestation.adapter_version !== route.adapter_version
    ) {
      return { accepted: false, reason: "EXECUTION_ROUTE_ATTESTATION_MISMATCH" };
    }
    const routeDigest = digest(route);
    if (
      state.assignment.semantic_work_digest !== assignment.semantic_work_digest ||
      normalizedResult.trusted.semantic_work_digest !== assignment.semantic_work_digest ||
      state.assignment.execution_route === undefined ||
      digest(state.assignment.execution_route) !== routeDigest ||
      normalizedResult.trusted.execution_route_digest !== routeDigest
    ) {
      return { accepted: false, reason: "EXECUTION_ROUTE_BINDING_MISMATCH" };
    }
    if (
      normalizedResult.trusted.actual_billing_mode !== null &&
      normalizedResult.trusted.actual_billing_mode !== route.billing_mode
    ) {
      return { accepted: false, reason: "EXECUTION_BILLING_MODE_MISMATCH" };
    }
  }

  const independence = verifyExecutionIndependence({ assignment, normalizedResult, projectProfile });
  if (!independence.valid) return { accepted: false, reason: independence.reason };

  return {
    accepted: true,
    reason: "CURRENT_SCHEMA_VALID_RESULT",
    routing_proposal: {
      role: normalizedResult.role,
      status: normalizedResult.status,
      result_type: normalizedResult.result_type,
      payload: normalizedResult.payload,
      trusted_candidate: normalizedResult.trusted.candidate,
      result_digest: normalizedResult.result_digest
    }
  };
}

export function claimKey(assignmentId) {
  return "agenti-run-claim:" + assignmentId;
}

export function resultAcceptanceKey(normalizedResult) {
  return makeIdempotenceKey(
    normalizedResult.trusted.assignment_id,
    normalizedResult.result_digest,
    normalizedResult.trusted.execution_attestation.execution_instance_id
  );
}
