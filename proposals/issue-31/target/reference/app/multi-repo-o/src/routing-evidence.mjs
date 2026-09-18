export const CAPACITY_MARKER = "agenti-capacity:v1";
export const BILLING_SAFETY_MARKER = "agenti-billing-safety:v1";
export const EXECUTION_FAILURE_MARKER = "agenti-execution-failure:v1";
const JSON_START = "<!-- agenti-routing-json:start -->";
const JSON_END = "<!-- agenti-routing-json:end -->";

export function renderRoutingEvidenceComment(marker, summary, payload) {
  return [
    marker,
    "",
    summary,
    "",
    JSON_START,
    JSON.stringify(payload, null, 2),
    JSON_END
  ].join("\n");
}

export function parseRoutingEvidenceComment(body, marker) {
  if (!body?.includes(marker)) return null;
  const start = body.indexOf(JSON_START);
  const end = body.indexOf(JSON_END);
  if (start < 0 || end <= start) return null;
  return JSON.parse(
    body.slice(start + JSON_START.length, end).trim()
  );
}

function trustedAppComment(comment, trustedStateAppId) {
  if (trustedStateAppId === null || trustedStateAppId === undefined) return false;
  return (
    String(comment.performed_via_github_app?.id ?? "") ===
    String(trustedStateAppId)
  );
}

export function reconstructRoutingEvidence({
  comments,
  state,
  core,
  trustedStateAppId,
  observedAt
}) {
  const capacityObservations = [];
  const billingSafetyObservations = [];
  let failure = null;

  for (const comment of comments) {
    if (!trustedAppComment(comment, trustedStateAppId)) continue;

    const capacity = parseRoutingEvidenceComment(
      comment.body,
      CAPACITY_MARKER
    );
    if (
      capacity &&
      core.validateCapacityObservation({
        observation: capacity,
        runnerCandidate: capacity.runner_candidate_id,
        observedAt
      }).valid
    ) {
      capacityObservations.push(capacity);
      continue;
    }

    const billing = parseRoutingEvidenceComment(
      comment.body,
      BILLING_SAFETY_MARKER
    );
    if (
      billing &&
      core.validateBillingSafetyObservation({
        observation: billing,
        runnerCandidate: billing.runner_candidate_id,
        observedAt
      }).valid
    ) {
      billingSafetyObservations.push(billing);
      continue;
    }

    const envelope = parseRoutingEvidenceComment(
      comment.body,
      EXECUTION_FAILURE_MARKER
    );
    if (
      envelope?.failure &&
      state?.assignment &&
      envelope.failure.failed_assignment_id ===
        state.assignment.assignment_id &&
      envelope.failure.semantic_work_digest ===
        state.assignment.semantic_work_digest
    ) {
      if (envelope.capacity_observation) {
        const observation = envelope.capacity_observation;
        if (
          core.validateCapacityObservation({
            observation,
            runnerCandidate: observation.runner_candidate_id,
            observedAt
          }).valid
        ) {
          capacityObservations.push(observation);
        }
      }
      failure = {
        ...envelope.failure,
        objective_retry_reason:
          envelope.failure.objective_retry_reason ??
          "ROUTING_EXECUTION_FAILURE",
        ref: "issue-comment:" + comment.id
      };
    }
  }

  return {
    capacity_observations: capacityObservations,
    billing_safety_observations: billingSafetyObservations,
    failure
  };
}

export function capacityObservation({
  core,
  candidateId,
  status,
  observedAt,
  retryAt = null
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
    retry_at: retryAt,
    retry_after_seconds: null,
    remaining: null,
    source
  };
  return {
    ...body,
    evidence_digest: core.digest(body)
  };
}

export function executionFailure({
  core,
  assignment,
  executionInstanceId,
  claimId,
  claimGeneration,
  status,
  observedAt,
  retryAt = null
}) {
  const body = {
    failed_assignment_id: assignment.assignment_id,
    claim_id: claimId,
    claim_generation: claimGeneration,
    execution_instance_id: executionInstanceId,
    runner_candidate_id:
      assignment.execution_route.runner_candidate_id,
    semantic_work_digest: assignment.semantic_work_digest,
    capacity_status: status,
    transient: true,
    objective_retry_reason: "ROUTING_EXECUTION_FAILURE",
    retry_at: retryAt,
    observed_at: observedAt,
    ref: null,
    actual_billing_mode: null
  };
  return {
    ...body,
    evidence_digest: core.digest(body)
  };
}
