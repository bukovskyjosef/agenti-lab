function emptyReleaseAuthorization() {
  return {
    status: "NOT_REQUIRED",
    authorization_id: null,
    candidate_digest: null,
    target_digest: null,
    gate_digest: null,
    context_digest: null,
    request_ref: null,
    response_ref: null,
    human_actor_id: null
  };
}

export function initializeState({ action, snapshot, profile, oRunId }) {
  if (action.transition_id !== "T01" || !action.initialize || !action.assignment) {
    throw new Error("initializeState only accepts core T01");
  }
  return {
    schema_version: 1,
    runtime_version: profile.runtime_version,
    work_item: {
      ...snapshot.work_item,
      kind: snapshot.work_item.kind ?? "executable"
    },
    state_version: action.initialize.state_version,
    lifecycle: action.initialize.lifecycle,
    contract: action.initialize.contract,
    assignment: {
      assignment_id: action.assignment.assignment_id,
      role: action.assignment.role,
      purpose: action.assignment.purpose,
      issued_from_state_version: 0,
      bound_state_version: action.assignment.state.version,
      fingerprint: action.assignment.state.fingerprint,
      capability_profile: action.assignment.capability_profile,
      dispatch_status: "pending",
      workflow_run_id: null,
      must_differ_from_execution_instances: action.assignment.independence.must_differ_from_execution_instances
    },
    candidate: { kind: "none", generation: 0, digest: null, members: [] },
    checks: snapshot.checks ?? { status: "NOT_REQUIRED", required_set_digest: null, evidence_refs: [] },
    review: {
      status: "NOT_STARTED",
      candidate_digest: null,
      outcome: null,
      evidence_ref: null,
      author_execution_instances: []
    },
    human_requests: { active: [], recent_refs: [] },
    release_authorization: emptyReleaseAuthorization(),
    publication: {
      status: "NOT_STARTED",
      candidate_digest: null,
      evidence_refs: [],
      published_identity: null
    },
    run_receipts: {},
    failure: { active_ref: null, retry_reason: null, non_convergent: false },
    stop: { record_ref: null },
    updated_by: {
      o_run_id: oRunId,
      transition_id: "T01",
      idempotence_key: action.idempotence_key
    }
  };
}

function normalizeHumanRequest(request) {
  if (!request) return null;
  const required = ["request_id", "type", "context_digest", "resolution_route", "request_ref"];
  for (const key of required) if (!(key in request)) throw new Error(`human_request missing ${key}`);
  return { ...request, status: request.status ?? "PENDING" };
}

export function projectAdapterState({ core, state, action, snapshot, profile, oRunId }) {
  let next = state
    ? core.projectAction(state, action, oRunId)
    : initializeState({ action, snapshot, profile, oRunId });

  const roleResult = snapshot.role_result;

  if (roleResult && state?.assignment && roleResult.execution_instance_id) {
    next.run_receipts[state.assignment.assignment_id] = {
      fingerprint: state.assignment.fingerprint,
      assignment_id: state.assignment.assignment_id,
      execution_instance_id: roleResult.execution_instance_id
    };
  }

  if (
    roleResult &&
    !action.assignment &&
    ["T07", "T08", "T11", "T12"].includes(action.transition_id)
  ) {
    next.assignment = null;
  }

  if (roleResult?.role === "D" && action.transition_id === "T04") {
    next.review = {
      status: "PENDING",
      candidate_digest: next.candidate.digest,
      outcome: null,
      evidence_ref: null,
      author_execution_instances: roleResult.execution_instance_id ? [roleResult.execution_instance_id] : []
    };
    next.checks = snapshot.checks;
  }

  if (roleResult?.role === "R" && ["T05", "T06", "T07", "T08"].includes(action.transition_id)) {
    next.review = {
      status: "CURRENT",
      candidate_digest: state.candidate?.digest ?? null,
      outcome: roleResult.payload.outcome,
      evidence_ref: roleResult.evidence_binding,
      author_execution_instances: state.review?.author_execution_instances ?? []
    };
  }

  if (roleResult?.role === "P" && action.transition_id === "T11") {
    next.publication = {
      status: roleResult.payload.publication_status,
      candidate_digest: roleResult.payload.consumed_candidate_digest,
      evidence_refs: [
        ...(roleResult.evidence_binding ? [roleResult.evidence_binding] : []),
        ...(roleResult.payload.deterministic_verification_refs ?? [])
      ],
      published_identity: roleResult.payload.actual_published_identity ?? null
    };
  }

  if (["T03", "T07"].includes(action.transition_id) && action.human_request) {
    const request = normalizeHumanRequest(action.human_request);
    next.human_requests.active = [
      ...next.human_requests.active.filter((item) => item.request_id !== request.request_id),
      request
    ];
  }

  if (action.transition_id === "T10" && snapshot.human_resolution?.request_id) {
    next.human_requests.active = next.human_requests.active.map((item) =>
      item.request_id === snapshot.human_resolution.request_id
        ? { ...item, status: "RESOLVED", response_ref: snapshot.human_resolution.response_binding }
        : item
    );
    if (action.earliest_affected_point && action.earliest_affected_point !== "EARLIEST_DEPENDENT_GATE") {
      next.lifecycle = action.earliest_affected_point;
    }
  }

  if (action.transition_id === "T17") next.stop.record_ref = null;

  if (action.transition_id === "T19") {
    next.assignment = null;
    next.checks = snapshot.checks ?? next.checks;
    next.review = {
      ...next.review,
      status: next.review.status === "NOT_STARTED" ? "NOT_STARTED" : "STALE",
      candidate_digest: next.candidate.digest,
      outcome: null,
      evidence_ref: null
    };
    if (["PENDING", "GRANTED"].includes(next.release_authorization.status)) {
      next.release_authorization = { ...next.release_authorization, status: "STALE" };
    }
    if (!["NOT_STARTED", "FAILED"].includes(next.publication.status)) {
      next.publication = { ...next.publication, status: "STALE" };
    }
  }

  if (action.transition_id === "T13" || action.transition_id === "T18") next.assignment = null;
  return next;
}
