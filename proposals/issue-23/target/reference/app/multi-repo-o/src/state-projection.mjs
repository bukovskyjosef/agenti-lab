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

function transitionAssignmentSpec(transitionTable, transitionId) {
  return transitionTable?.transitions?.find((item) => item.id === transitionId)?.assignment ?? null;
}

function assignmentProjection(assignment, issuedFromStateVersion) {
  if (!assignment) return null;
  return {
    assignment_id: assignment.assignment_id,
    role: assignment.role,
    purpose: assignment.purpose,
    issued_from_state_version: issuedFromStateVersion,
    bound_state_version: assignment.state.version,
    fingerprint: assignment.state.fingerprint,
    capability_profile: assignment.capability_profile,
    dispatch_status: "pending",
    workflow_run_id: null,
    must_differ_from_execution_instances:
      assignment.independence?.must_differ_from_execution_instances ?? []
  };
}

function invalidationStaleSet(action) {
  if (Array.isArray(action.stale) && action.stale.length) {
    return new Set(action.stale);
  }
  if (action.earliest_affected_point === "ANALYSIS") {
    return new Set(["assignment", "review", "release_authorization", "publication"]);
  }
  if (action.earliest_affected_point === "IN_REVIEW") {
    return new Set(["assignment", "review", "release_authorization", "publication"]);
  }
  if (action.earliest_affected_point === "APPROVED") {
    return new Set(["assignment", "release_authorization", "publication"]);
  }
  return new Set(["assignment"]);
}

function recoveryAssignmentSpec({ earliest, profile, transitionTable }) {
  if (earliest === "ANALYSIS") {
    return transitionAssignmentSpec(transitionTable, "T01");
  }
  if (earliest === "IN_REVIEW") {
    return transitionAssignmentSpec(transitionTable, "T04");
  }
  if (
    earliest === "APPROVED" &&
    !profile.release_authorization?.required
  ) {
    return transitionAssignmentSpec(transitionTable, "T08");
  }
  return null;
}

function recoveryIndependence({ role, state, profile }) {
  if (role !== "R") {
    return {
      required: false,
      must_differ_from_execution_instances: [],
      enforcement_mechanism: "none"
    };
  }
  return {
    required: true,
    must_differ_from_execution_instances:
      state.review?.author_execution_instances ?? [],
    enforcement_mechanism:
      profile.role_runners?.R?.independence_mechanism ?? "none"
  };
}

export function projectInvalidationState({
  core,
  state,
  action,
  snapshot,
  profile,
  transitionTable,
  observedAt,
  oRunId
}) {
  if (!state || action?.kind !== "INVALIDATE") {
    throw new Error("projectInvalidationState requires current state and core INVALIDATE action");
  }

  const earliest = action.earliest_affected_point;
  if (!["ANALYSIS", "IN_REVIEW", "APPROVED"].includes(earliest)) {
    throw new Error(`Unsupported INVALIDATE earliest_affected_point ${earliest}`);
  }

  const next = structuredClone(state);
  next.state_version = state.state_version + 1;
  next.lifecycle = earliest;
  next.assignment = null;

  if (earliest === "ANALYSIS") {
    next.contract = {
      ...next.contract,
      source_ref: snapshot.contract_source_ref ?? next.contract.source_ref,
      accepted_revision:
        snapshot.contract_revision ?? next.contract.accepted_revision,
      digest: snapshot.contract_digest ?? next.contract.digest
    };
  }

  if (
    snapshot.candidate &&
    snapshot.candidate.digest !== undefined &&
    snapshot.candidate.digest !== null &&
    earliest !== "ANALYSIS"
  ) {
    next.candidate = structuredClone(snapshot.candidate);
  }
  if (snapshot.checks) next.checks = structuredClone(snapshot.checks);

  const stale = invalidationStaleSet(action);

  if (stale.has("review")) {
    next.review = {
      ...next.review,
      status: action.evidence_status === "INVALID" ? "INVALID" : "STALE",
      candidate_digest: next.candidate?.digest ?? null,
      outcome: null,
      evidence_ref: null
    };
  }

  if (stale.has("release_authorization")) {
    const current = next.release_authorization;
    if (
      earliest === "APPROVED" &&
      profile.release_authorization?.required &&
      current?.authorization_id
    ) {
      next.release_authorization = {
        ...current,
        status: "PENDING",
        response_ref: null,
        human_actor_id: null
      };
    } else if (current?.status !== "NOT_REQUIRED") {
      next.release_authorization = {
        ...current,
        status: "STALE",
        response_ref: null,
        human_actor_id: null
      };
    }
  }

  if (
    stale.has("publication") &&
    !["NOT_STARTED", "FAILED"].includes(next.publication?.status)
  ) {
    next.publication = {
      ...next.publication,
      status: "STALE"
    };
  }

  const spec = recoveryAssignmentSpec({
    earliest,
    profile,
    transitionTable
  });

  if (spec?.role && spec?.purpose) {
    const generated = core.generateAssignment({
      state: next,
      role: spec.role,
      purpose: spec.purpose,
      issued_at: observedAt,
      context_entrypoints: snapshot.context_entrypoints ?? [],
      execution_repository: snapshot.execution_repository ?? null,
      relevant_inputs: {
        invalidation_reason: action.reason,
        required_evidence_digest:
          snapshot.required_evidence_digest ?? null,
        target_digest: snapshot.target_digest ?? null
      },
      independence: recoveryIndependence({
        role: spec.role,
        state: next,
        profile
      })
    });
    next.assignment = assignmentProjection(
      generated,
      state.state_version
    );
  }

  next.updated_by = {
    o_run_id: oRunId,
    transition_id: state.updated_by.transition_id,
    idempotence_key:
      "agenti-invalidate:" +
      core.digest({
        work_item: state.work_item,
        from_state_version: state.state_version,
        earliest,
        reason: action.reason,
        evidence_status: action.evidence_status ?? null,
        contract_digest: next.contract.digest,
        candidate_digest: next.candidate?.digest ?? null
      }).slice(7, 39)
  };

  return next;
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
