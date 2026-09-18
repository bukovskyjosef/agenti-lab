import {
  digest,
  makeIdempotenceKey,
  validateProjectProfileSemantics,
  validateTransitionTable,
  verifyAcceptedEvidence
} from "./schema.mjs";
import {
  casKey,
  earliestAffectedPoint,
  generateAssignment,
  runEligibility
} from "./protocol.mjs";

function transitionById(table, id) {
  const transition = table.transitions.find((item) => item.id === id);
  if (!transition) throw new Error("Transition " + id + " not found");
  return transition;
}

function baseAction(table, id, state, snapshot, extras = {}) {
  const transition = transitionById(table, id);
  const inputs = extras.idempotence_inputs ?? {};
  const idempotenceKey = state
    ? casKey({ state, transition_id: id, inputs })
    : makeIdempotenceKey(id, snapshot?.work_item, inputs);

  const { idempotence_inputs, ...rest } = extras;
  return {
    kind: "TRANSITION",
    transition_id: id,
    name: transition.name,
    from_state_version: state?.state_version ?? null,
    idempotence_key: idempotenceKey,
    ...rest
  };
}

function assignmentFor({
  state,
  snapshot,
  transition,
  projectProfile,
  issuedAt,
  projected = {}
}) {
  if (!transition.assignment) return null;
  const role = transition.assignment.role;
  const mustDiffer = role === "R"
    ? [...new Set(snapshot?.author_execution_instances ?? state?.review?.author_execution_instances ?? [])]
    : [];

  const bindingState = {
    ...state,
    state_version: state.state_version + 1,
    lifecycle: projected.lifecycle ?? state.lifecycle,
    candidate: projected.candidate ?? state.candidate,
    contract: projected.contract ?? state.contract
  };

  return generateAssignment({
    state: bindingState,
    role,
    purpose: transition.assignment.purpose,
    issued_at: issuedAt,
    context_entrypoints: snapshot.context_entrypoints ?? [
      { kind: "work_item", ref: state.work_item.control_repository + "#" + state.work_item.issue_number },
      { kind: "project_profile", ref: ".agenti/project-profile.yml" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" }
    ],
    execution_repository: snapshot.execution_repository ?? null,
    relevant_inputs: {
      required_evidence_digest: snapshot.required_evidence_digest ?? null,
      target_digest: snapshot.target_digest ?? null,
      role_result_digest: snapshot.role_result?.result_digest ?? null
    },
    independence: {
      required: role === "R",
      must_differ_from_execution_instances: mustDiffer,
      enforcement_mechanism: role === "R"
        ? projectProfile.role_runners.R.independence_mechanism
        : "none"
    }
  });
}

function releaseAuthorizationContextDigest({
  authorization_id,
  candidate_digest,
  target_digest,
  gate_digest
}) {
  return digest({
    authorization_id,
    candidate_digest,
    target_digest,
    gate_digest
  });
}

function makeReleaseAuthorization(workflowState, snapshot) {
  const candidateDigest = workflowState.candidate?.digest ?? null;
  const targetDigest = snapshot.target_digest ?? null;
  const gateDigest = snapshot.required_evidence_digest ?? null;
  const authorizationId =
    "ra-" +
    digest({
      work_item: workflowState.work_item,
      state_version: workflowState.state_version + 1,
      candidate_digest: candidateDigest,
      target_digest: targetDigest,
      gate_digest: gateDigest
    }).slice(7, 31);

  return {
    status: "PENDING",
    authorization_id: authorizationId,
    candidate_digest: candidateDigest,
    target_digest: targetDigest,
    gate_digest: gateDigest,
    context_digest: releaseAuthorizationContextDigest({
      authorization_id: authorizationId,
      candidate_digest: candidateDigest,
      target_digest: targetDigest,
      gate_digest: gateDigest
    }),
    request_ref: null,
    response_ref: null,
    human_actor_id: null
  };
}

function validateReleaseGrant(projectProfile, workflowState, snapshot) {
  const authorization = workflowState.release_authorization;
  const response = snapshot.release_response;

  if (!authorization || authorization.status !== "PENDING") {
    return {
      valid: false,
      reason: "RELEASE_AUTHORIZATION_NOT_CURRENT_PENDING",
      earliest_affected_point: "APPROVED"
    };
  }

  if (!response || response.status !== "GRANTED") {
    return {
      valid: false,
      reason: "RELEASE_RESPONSE_NOT_CURRENT_GRANT",
      earliest_affected_point: "APPROVED"
    };
  }

  const currentCandidate = workflowState.candidate?.digest ?? null;
  const currentTarget = snapshot.target_digest ?? null;
  const currentGateDigest = snapshot.required_evidence_digest ?? null;

  if (
    authorization.authorization_id !== response.authorization_id ||
    authorization.candidate_digest !== currentCandidate ||
    response.candidate_digest !== currentCandidate
  ) {
    return {
      valid: false,
      reason: "RELEASE_CANDIDATE_OR_AUTHORIZATION_DRIFT",
      earliest_affected_point: "IN_REVIEW"
    };
  }

  if (
    authorization.target_digest !== currentTarget ||
    response.target_digest !== currentTarget
  ) {
    return {
      valid: false,
      reason: "RELEASE_TARGET_DRIFT",
      earliest_affected_point: "APPROVED"
    };
  }

  if (
    snapshot.required_gates_current !== true ||
    authorization.gate_digest !== currentGateDigest ||
    response.gate_digest !== currentGateDigest
  ) {
    return {
      valid: false,
      reason: "RELEASE_GATE_DRIFT",
      earliest_affected_point: "IN_REVIEW"
    };
  }

  const expectedContext = releaseAuthorizationContextDigest({
    authorization_id: authorization.authorization_id,
    candidate_digest: currentCandidate,
    target_digest: currentTarget,
    gate_digest: currentGateDigest
  });

  if (
    authorization.context_digest !== expectedContext ||
    response.context_digest !== expectedContext
  ) {
    return {
      valid: false,
      reason: "RELEASE_CONTEXT_DRIFT",
      earliest_affected_point: "APPROVED"
    };
  }

  const humanActorIds = new Set(
    (projectProfile?.human?.principals ?? []).map((principal) => principal.actor_id)
  );
  if (
    !response.response_binding ||
    !response.current_response ||
    response.response_binding.normalized_outcome !== "GRANTED" ||
    !humanActorIds.has(response.response_binding.actor_id)
  ) {
    return {
      valid: false,
      reason: "RELEASE_HUMAN_RESPONSE_INVALID",
      earliest_affected_point: "APPROVED"
    };
  }

  const evidence = verifyAcceptedEvidence(
    response.response_binding,
    response.current_response,
    expectedContext
  );
  if (evidence.status !== "CURRENT") {
    return {
      valid: false,
      reason: evidence.reason,
      evidence_status: evidence.status,
      earliest_affected_point: "APPROVED"
    };
  }

  return {
    valid: true,
    authorization: {
      ...authorization,
      status: "GRANTED",
      response_ref: response.response_binding,
      human_actor_id: response.response_binding.actor_id
    }
  };
}

export function evaluate(projectProfile, workflowState, authoritativeSnapshot, wakeEvent, transitionTable) {
  const profileErrors = validateProjectProfileSemantics(projectProfile);
  const tableErrors = validateTransitionTable(transitionTable);
  if (profileErrors.length || tableErrors.length) {
    return { kind: "BLOCKED", reason: "INVALID_CONFIGURATION", errors: [...profileErrors, ...tableErrors] };
  }

  const snapshot = authoritativeSnapshot ?? {};
  const issuedAt = wakeEvent?.observed_at;
  if (!issuedAt) return { kind: "BLOCKED", reason: "WAKE_EVENT_MISSING_OBSERVED_AT" };

  if (!workflowState) {
    if (!snapshot.intake?.accepted || !snapshot.work_item || !snapshot.contract_digest) {
      return { kind: "NO_OP", reason: "NO_MANAGED_INTAKE" };
    }

    const initialState = {
      work_item: snapshot.work_item,
      state_version: snapshot.initial_state_version ?? 1,
      lifecycle: "ANALYSIS",
      contract: {
        source_ref: snapshot.contract_source_ref ?? ("issue:" + snapshot.work_item.issue_number),
        accepted_revision: snapshot.contract_revision ?? issuedAt,
        digest: snapshot.contract_digest,
        parent: snapshot.parent_binding ?? null
      },
      candidate: { kind: "none", generation: 0, digest: null, members: [] },
      review: { author_execution_instances: [] }
    };
    const transition = transitionById(transitionTable, "T01");
    const assignment = generateAssignment({
      state: initialState,
      role: "A",
      purpose: transition.assignment.purpose,
      issued_at: issuedAt,
      context_entrypoints: snapshot.context_entrypoints ?? [
        { kind: "work_item", ref: initialState.work_item.control_repository + "#" + initialState.work_item.issue_number },
        { kind: "project_profile", ref: ".agenti/project-profile.yml" },
        { kind: "agent_entrypoint", ref: "AGENTS.md" }
      ],
      execution_repository: snapshot.execution_repository ?? null,
      relevant_inputs: {
        required_evidence_digest: snapshot.required_evidence_digest ?? null,
        target_digest: snapshot.target_digest ?? null,
        role_result_digest: null
      }
    });

    return {
      kind: "TRANSITION",
      transition_id: "T01",
      name: transition.name,
      from_state_version: null,
      idempotence_key: makeIdempotenceKey(snapshot.work_item, "T01", snapshot.contract_digest),
      initialize: {
        lifecycle: "ANALYSIS",
        work_item: snapshot.work_item,
        contract: initialState.contract,
        state_version: initialState.state_version
      },
      assignment
    };
  }

  if (workflowState.lifecycle === "STOPPED") {
    if (snapshot.reopen_authority?.valid) {
      return baseAction(transitionTable, "T17", workflowState, snapshot, {
        lifecycle: snapshot.earliest_lifecycle ?? "ANALYSIS",
        clear_terminal_guard: true,
        idempotence_inputs: { reopen: snapshot.reopen_authority.binding }
      });
    }
    return { kind: "NO_OP", reason: "STOPPED_TERMINAL_GUARD" };
  }

  if (
    snapshot.cas_expected_state_version !== undefined &&
    snapshot.cas_expected_state_version !== workflowState.state_version
  ) {
    return {
      kind: "NO_OP",
      reason: "STATE_VERSION_CAS_MISMATCH",
      expected: snapshot.cas_expected_state_version,
      actual: workflowState.state_version
    };
  }

  for (const item of snapshot.accepted_evidence ?? []) {
    const verification = verifyAcceptedEvidence(
      item.binding,
      item.current,
      item.expected_context_binding
    );
    if (verification.status !== "CURRENT") {
      return {
        kind: "INVALIDATE",
        reason: verification.reason,
        evidence_status: verification.status,
        earliest_affected_point:
          item.earliest_affected_point ?? verification.earliest_affected_point
      };
    }
  }

  const affected = earliestAffectedPoint(snapshot.drift ?? {});
  if (affected) {
    return {
      kind: "INVALIDATE",
      reason: "DEPENDENCY_DRIFT",
      earliest_affected_point: affected,
      stale: ["assignment", "review", "release_authorization", "publication"]
    };
  }

  if (snapshot.stop_authority?.valid) {
    return baseAction(transitionTable, "T16", workflowState, snapshot, {
      lifecycle: "STOPPED",
      clear_assignment: true,
      stop_record: snapshot.stop_authority.binding,
      idempotence_inputs: { stop: snapshot.stop_authority.binding }
    });
  }

  if (projectProfile.repository_topology === "multi-repo" && snapshot.composite?.changed) {
    return baseAction(transitionTable, "T19", workflowState, snapshot, {
      candidate: snapshot.composite.candidate,
      invalidate_dependent_gates_only: true,
      idempotence_inputs: { composite_digest: snapshot.composite.candidate?.digest }
    });
  }

  if (snapshot.release_response?.status === "GRANTED") {
    const releaseValidation = validateReleaseGrant(
      projectProfile,
      workflowState,
      snapshot
    );

    if (!releaseValidation.valid) {
      return {
        kind: "INVALIDATE",
        reason: releaseValidation.reason,
        evidence_status: releaseValidation.evidence_status ?? null,
        earliest_affected_point: releaseValidation.earliest_affected_point,
        stale: ["release_authorization", "assignment", "publication"]
      };
    }

    const transition = transitionById(transitionTable, "T09");
    const assignment = assignmentFor({
      state: workflowState, snapshot, transition, projectProfile, issuedAt,
      projected: { lifecycle: "APPROVED" }
    });
    return baseAction(transitionTable, "T09", workflowState, snapshot, {
      lifecycle: "APPROVED",
      assignment,
      release_authorization: releaseValidation.authorization,
      idempotence_inputs: {
        authorization_id: releaseValidation.authorization.authorization_id,
        response_binding: releaseValidation.authorization.response_ref
      }
    });
  }

  if (snapshot.human_resolution?.valid) {
    return baseAction(transitionTable, "T10", workflowState, snapshot, {
      route: snapshot.human_resolution.resolution_route,
      earliest_affected_point: snapshot.human_resolution.earliest_affected_point,
      idempotence_inputs: {
        request_id: snapshot.human_resolution.request_id,
        response_binding: snapshot.human_resolution.response_binding
      }
    });
  }

  if (snapshot.failure?.transient && snapshot.failure?.objective_retry_reason) {
    return baseAction(transitionTable, "T14", workflowState, snapshot, {
      retry_authority: snapshot.failure.retry_authority,
      failure_ref: snapshot.failure.ref,
      idempotence_inputs: {
        failure_ref: snapshot.failure.ref,
        retry_context: snapshot.failure.objective_retry_reason
      }
    });
  }

  if (snapshot.blocker?.active && !snapshot.blocker?.independent_work_available) {
    return baseAction(transitionTable, "T15", workflowState, snapshot, {
      lifecycle: "BLOCKED",
      clear_assignment: true,
      blocker: snapshot.blocker,
      idempotence_inputs: {
        blocker: snapshot.blocker.digest ?? snapshot.blocker.ref
      }
    });
  }

  const result = snapshot.role_result;
  if (result?.status === "COMPLETED") {
    if (result.role === "A") {
      if (result.payload.disposition === "HUMAN_INPUT_REQUIRED") {
        return baseAction(transitionTable, "T03", workflowState, snapshot, {
          lifecycle: snapshot.independent_work_available
            ? workflowState.lifecycle
            : "BLOCKED",
          human_request: result.human_request,
          clear_assignment: true,
          idempotence_inputs: {
            result_digest: result.result_digest,
            request: result.human_request
          }
        });
      }

      if (
        result.payload.disposition === "READY" &&
        snapshot.dor_passes &&
        !snapshot.pending_human_request
      ) {
        const transition = transitionById(transitionTable, "T02");
        const assignment = assignmentFor({
          state: workflowState, snapshot, transition, projectProfile, issuedAt,
          projected: { lifecycle: "IN_PROGRESS" }
        });
        return baseAction(transitionTable, "T02", workflowState, snapshot, {
          lifecycle: "IN_PROGRESS",
          assignment,
          idempotence_inputs: {
            contract_digest: workflowState.contract.digest,
            result_digest: result.result_digest
          }
        });
      }
    }

    if (
      result.role === "D" &&
      snapshot.candidate?.digest &&
      snapshot.checks?.status === "PASSED" &&
      !snapshot.pending_human_request
    ) {
      const transition = transitionById(transitionTable, "T04");
      const assignment = assignmentFor({
        state: workflowState, snapshot, transition, projectProfile, issuedAt,
        projected: { lifecycle: "IN_REVIEW", candidate: snapshot.candidate }
      });
      return baseAction(transitionTable, "T04", workflowState, snapshot, {
        lifecycle: "IN_REVIEW",
        candidate: snapshot.candidate,
        assignment,
        idempotence_inputs: {
          candidate_digest: snapshot.candidate.digest,
          evidence_digest: snapshot.required_evidence_digest
        }
      });
    }

    if (result.role === "R") {
      const outcome = result.payload.outcome;
      const owner = result.payload.correction_owner;

      if (outcome === "CHANGES_REQUIRED" && owner === "D") {
        const eligibility = runEligibility({
          last_completed_fingerprint: snapshot.last_D_fingerprint ?? null,
          current_fingerprint:
            snapshot.next_D_fingerprint ??
            digest({
              result: result.result_digest,
              candidate: workflowState.candidate?.digest
            }),
          objective_retry_reason: snapshot.objective_progress_reason
        });
        if (!eligibility.eligible) return { kind: "NO_OP", reason: eligibility.reason };

        const transition = transitionById(transitionTable, "T05");
        const assignment = assignmentFor({
          state: workflowState, snapshot, transition, projectProfile, issuedAt,
          projected: { lifecycle: "CHANGES_REQUIRED" }
        });
        return baseAction(transitionTable, "T05", workflowState, snapshot, {
          lifecycle: "CHANGES_REQUIRED",
          assignment,
          idempotence_inputs: {
            result_digest: result.result_digest,
            candidate_generation: workflowState.candidate?.generation
          }
        });
      }

      if (outcome === "CHANGES_REQUIRED" && owner === "A") {
        const transition = transitionById(transitionTable, "T06");
        const assignment = assignmentFor({
          state: workflowState, snapshot, transition, projectProfile, issuedAt,
          projected: { lifecycle: "ANALYSIS" }
        });
        return baseAction(transitionTable, "T06", workflowState, snapshot, {
          lifecycle: "ANALYSIS",
          assignment,
          idempotence_inputs: {
            result_digest: result.result_digest,
            contract_digest: workflowState.contract.digest
          }
        });
      }

      if (outcome === "DECISION_REQUIRED" && owner === "H") {
        return baseAction(transitionTable, "T07", workflowState, snapshot, {
          lifecycle: snapshot.independent_work_available
            ? workflowState.lifecycle
            : "BLOCKED",
          human_request: result.human_request,
          idempotence_inputs: {
            result_digest: result.result_digest,
            human_request: result.human_request
          }
        });
      }

      if (outcome === "APPROVED" && snapshot.required_gates_current) {
        if (projectProfile.release_authorization.required) {
          const releaseAuthorization = makeReleaseAuthorization(
            workflowState,
            snapshot
          );
          return baseAction(transitionTable, "T08", workflowState, snapshot, {
            lifecycle: "APPROVED",
            release_authorization: releaseAuthorization,
            idempotence_inputs: {
              authorization_id: releaseAuthorization.authorization_id,
              candidate_digest: releaseAuthorization.candidate_digest,
              target_digest: releaseAuthorization.target_digest,
              gates: releaseAuthorization.gate_digest
            }
          });
        }

        const transition = transitionById(transitionTable, "T08");
        const assignment = assignmentFor({
          state: workflowState, snapshot, transition, projectProfile, issuedAt,
          projected: { lifecycle: "APPROVED" }
        });
        return baseAction(transitionTable, "T08", workflowState, snapshot, {
          lifecycle: "APPROVED",
          assignment,
          idempotence_inputs: {
            candidate_digest: workflowState.candidate.digest,
            target_digest: snapshot.target_digest,
            gates: snapshot.required_evidence_digest
          }
        });
      }
    }

    if (result.role === "P" && result.payload.publication_status === "SUCCEEDED") {
      if (snapshot.post_publication_r_required) {
        const transition = transitionById(transitionTable, "T11");
        const assignment = assignmentFor({
          state: workflowState, snapshot, transition, projectProfile, issuedAt,
          projected: { lifecycle: workflowState.lifecycle }
        });
        return baseAction(transitionTable, "T11", workflowState, snapshot, {
          assignment,
          publication: result.payload,
          idempotence_inputs: {
            candidate_digest: result.payload.consumed_candidate_digest,
            published: result.payload.actual_published_identity
          }
        });
      }

      return baseAction(transitionTable, "T11", workflowState, snapshot, {
        publication: result.payload,
        invoke_completion_evaluation: true,
        idempotence_inputs: {
          candidate_digest: result.payload.consumed_candidate_digest,
          published: result.payload.actual_published_identity
        }
      });
    }
  }

  if (snapshot.post_publication_review_result?.current) {
    return baseAction(transitionTable, "T12", workflowState, snapshot, {
      route: snapshot.post_publication_review_result.route,
      idempotence_inputs: {
        result_digest: snapshot.post_publication_review_result.result_digest,
        published: snapshot.publication_identity
      }
    });
  }

  if (
    workflowState.work_item.kind === "parent_intent" &&
    snapshot.parent_rollup?.mechanically_complete
  ) {
    return baseAction(transitionTable, "T18", workflowState, snapshot, {
      lifecycle: "DONE",
      idempotence_inputs: {
        child_set_digest: snapshot.parent_rollup.child_set_digest,
        completion_condition_digest:
          snapshot.parent_rollup.completion_condition_digest
      }
    });
  }

  if (
    snapshot.completion?.all_objective_conditions_true &&
    !snapshot.pending_human_request &&
    !snapshot.failure?.active
  ) {
    return baseAction(transitionTable, "T13", workflowState, snapshot, {
      lifecycle: "DONE",
      clear_assignment: true,
      idempotence_inputs: { completion_digest: snapshot.completion.digest }
    });
  }

  return { kind: "NO_OP", reason: "NO_AUTHORIZED_TRANSITION" };
}

export function projectAction(state, action, oRunId) {
  if (action.kind !== "TRANSITION") return state;
  if (!state) throw new Error("projectAction requires existing state; T01 initialization is adapter-owned");

  const next = structuredClone(state);
  next.state_version += 1;
  if (action.lifecycle) next.lifecycle = action.lifecycle;
  if (action.clear_assignment) next.assignment = null;

  if (action.assignment) {
    const expectedBoundStateVersion = state.state_version + 1;
    if (action.assignment.state.version !== expectedBoundStateVersion) {
      throw new Error(
        "Assignment must bind the post-transition projection version " +
        expectedBoundStateVersion
      );
    }

    next.assignment = {
      assignment_id: action.assignment.assignment_id,
      role: action.assignment.role,
      purpose: action.assignment.purpose,
      issued_from_state_version: state.state_version,
      bound_state_version: action.assignment.state.version,
      fingerprint: action.assignment.state.fingerprint,
      capability_profile: action.assignment.capability_profile,
      dispatch_status: "pending",
      workflow_run_id: null,
      must_differ_from_execution_instances:
        action.assignment.independence.must_differ_from_execution_instances
    };
  }

  if (action.candidate) next.candidate = action.candidate;
  if (action.release_authorization) {
    next.release_authorization = {
      ...next.release_authorization,
      ...action.release_authorization
    };
  }
  if (action.publication) {
    next.publication = { ...next.publication, ...action.publication };
  }
  if (action.stop_record) next.stop.record_ref = action.stop_record;

  next.updated_by = {
    o_run_id: oRunId,
    transition_id: action.transition_id,
    idempotence_key: action.idempotence_key
  };
  return next;
}
