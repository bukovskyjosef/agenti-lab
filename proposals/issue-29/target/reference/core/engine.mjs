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
import {
  routingProjection,
  routingWaitDue,
  selectRunnerCandidate,
  semanticWorkDigest,
  validateRoutingConfiguration
} from "./routing.mjs";

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

function evaluateBase(projectProfile, workflowState, authoritativeSnapshot, wakeEvent, transitionTable) {
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
          last_completed_semantic_work_digest:
            snapshot.last_D_semantic_work_digest ?? null,
          current_semantic_work_digest:
            snapshot.next_D_semantic_work_digest ?? null,
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


function routingRelevantInputs(snapshot) {
  return {
    required_evidence_digest: snapshot.required_evidence_digest ?? null,
    target_digest: snapshot.target_digest ?? null,
    role_result_digest: snapshot.role_result?.result_digest ?? null,
    human_input_digest: snapshot.human_input_digest ?? null,
    human_decision_digest: snapshot.human_decision_digest ?? null,
    publication_target_digest: snapshot.publication_target_digest ?? null,
    parent_input_digest: snapshot.parent_input_digest ?? null
  };
}

function routingIndependence({ role, state, snapshot, projectProfile }) {
  const mustDiffer = role === "R"
    ? [...new Set(
        snapshot?.author_execution_instances ??
        state?.review?.author_execution_instances ??
        []
      )]
    : [];
  const selectedCandidate = snapshot?.selected_runner_candidate_id
    ? projectProfile.execution_routing?.runner_catalog?.[
        snapshot.selected_runner_candidate_id
      ]
    : null;
  return {
    required: role === "R",
    must_differ_from_execution_instances: mustDiffer,
    enforcement_mechanism: role === "R"
      ? (
          selectedCandidate?.independence_mechanism ??
          projectProfile.role_runners.R.independence_mechanism
        )
      : "none"
  };
}

function bindingStateForAction(state, action, snapshot) {
  if (!state) {
    return {
      work_item: action.initialize.work_item,
      state_version: action.initialize.state_version,
      lifecycle: action.initialize.lifecycle,
      contract: action.initialize.contract,
      candidate: { kind: "none", generation: 0, digest: null, members: [] },
      review: { author_execution_instances: [] }
    };
  }
  return {
    ...state,
    state_version: state.state_version + 1,
    lifecycle: action.lifecycle ?? state.lifecycle,
    candidate: action.candidate ?? state.candidate,
    contract: action.contract ?? state.contract
  };
}

function resumeLifecycleFor({ action, state, role, purpose }) {
  if (action?.lifecycle && action.lifecycle !== "BLOCKED") return action.lifecycle;
  if (state?.lifecycle && state.lifecycle !== "BLOCKED") return state.lifecycle;
  if (role === "A") return "ANALYSIS";
  if (role === "R") return "IN_REVIEW";
  if (role === "P") return "APPROVED";
  if (role === "D" && purpose === "CORRECT_REVIEW_DEFECTS") {
    return "CHANGES_REQUIRED";
  }
  return "IN_PROGRESS";
}

function lastCompletedSemanticDigest(state, role, purpose) {
  const receipts = Object.values(state?.run_receipts ?? {});
  const matches = receipts.filter((receipt) =>
    receipt.role === role &&
    receipt.purpose === purpose &&
    receipt.completion_status === "APPLICABLE_COMPLETED" &&
    receipt.semantic_work_digest
  );
  return matches.at(-1)?.semantic_work_digest ?? null;
}

function routeAssignmentAction({
  projectProfile,
  workflowState,
  snapshot,
  action,
  issuedAt
}) {
  if (!projectProfile.execution_routing || !action.assignment) return action;

  const role = action.assignment.role;
  const purpose = action.assignment.purpose;
  const bindingState = bindingStateForAction(workflowState, action, snapshot);
  const relevantInputs = routingRelevantInputs(snapshot);
  const semanticDigest = semanticWorkDigest({
    state: bindingState,
    role,
    purpose,
    relevant_inputs: relevantInputs
  });

  const completed = lastCompletedSemanticDigest(
    workflowState,
    role,
    purpose
  );
  if (completed && completed === semanticDigest) {
    return {
      kind: "NO_OP",
      reason: "SEMANTIC_WORK_ALREADY_COMPLETED",
      semantic_work_digest: semanticDigest
    };
  }

  const generation =
    workflowState?.execution_routing?.routing_attempt_generation ?? 0;
  const selection = selectRunnerCandidate({
    profile: projectProfile,
    role,
    purpose,
    capability_profile: action.assignment.capability_profile,
    semantic_work_digest: semanticDigest,
    capacity_observations: snapshot.capacity_observations ?? [],
    billing_safety_observations:
      snapshot.billing_safety_observations ?? [],
    routing_attempt_generation: generation,
    observed_at: issuedAt,
    existing_wait_deadline:
      workflowState?.execution_routing?.wait?.max_wait_deadline ?? null
  });
  const resumeLifecycle = resumeLifecycleFor({
    action,
    state: workflowState,
    role,
    purpose
  });

  const routed = {
    ...action,
    execution_routing: routingProjection({
      selection,
      role,
      purpose,
      source_transition_id: action.transition_id,
      resume_lifecycle: resumeLifecycle
    })
  };

  if (selection.kind === "WAIT") {
    delete routed.assignment;
    routed.clear_assignment = Boolean(workflowState?.assignment);
    if (!snapshot.independent_work_available) {
      routed.lifecycle = "BLOCKED";
      if (!workflowState && routed.initialize) {
        routed.initialize = {
          ...routed.initialize,
          lifecycle: "BLOCKED"
        };
      }
    }
    routed.routing_wait = true;
    return routed;
  }

  if (selection.kind !== "SELECTED") return routed;

  const independence = routingIndependence({
    role,
    state: bindingState,
    snapshot: {
      ...snapshot,
      selected_runner_candidate_id:
        selection.execution_route.runner_candidate_id
    },
    projectProfile
  });
  routed.assignment = generateAssignment({
    state: bindingState,
    role,
    purpose,
    issued_at: issuedAt,
    context_entrypoints: snapshot.context_entrypoints ?? [
      {
        kind: "work_item",
        ref:
          bindingState.work_item.control_repository +
          "#" +
          bindingState.work_item.issue_number
      },
      { kind: "project_profile", ref: ".agenti/project-profile.yml" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" }
    ],
    execution_repository: snapshot.execution_repository ?? null,
    relevant_inputs: relevantInputs,
    semantic_work_digest: semanticDigest,
    execution_route: selection.execution_route,
    independence
  });
  return routed;
}

function failureEvidenceDigest(failure) {
  return failure?.evidence_digest ?? digest({
    failed_assignment_id: failure?.failed_assignment_id ?? null,
    execution_instance_id: failure?.execution_instance_id ?? null,
    capacity_status: failure?.capacity_status ?? null,
    retry_at: failure?.retry_at ?? null,
    ref: failure?.ref ?? null
  });
}

function t14FailureAction({
  projectProfile,
  workflowState,
  snapshot,
  action,
  issuedAt,
  transitionTable
}) {
  if (!projectProfile.execution_routing) return action;
  const current = workflowState?.assignment;
  if (!current) {
    return { kind: "NO_OP", reason: "FAILED_ASSIGNMENT_NOT_CURRENT" };
  }
  if (
    snapshot.failure?.failed_assignment_id &&
    snapshot.failure.failed_assignment_id !== current.assignment_id
  ) {
    return { kind: "NO_OP", reason: "FAILED_ASSIGNMENT_NOT_CURRENT" };
  }
  if (snapshot.role_result?.status === "COMPLETED") {
    return { kind: "NO_OP", reason: "APPLICABLE_RESULT_ALREADY_AVAILABLE" };
  }

  const semanticDigest =
    current.semantic_work_digest ??
    semanticWorkDigest({
      state: workflowState,
      role: current.role,
      purpose: current.purpose,
      relevant_inputs: routingRelevantInputs(snapshot)
    });
  if (
    snapshot.failure?.semantic_work_digest &&
    snapshot.failure.semantic_work_digest !== semanticDigest
  ) {
    return { kind: "NO_OP", reason: "FAILURE_SEMANTIC_BINDING_STALE" };
  }

  const sourceGeneration =
    current.execution_route?.routing_attempt_generation ??
    workflowState.execution_routing?.routing_attempt_generation ??
    0;
  const nextGeneration = sourceGeneration + 1;
  const selection = selectRunnerCandidate({
    profile: projectProfile,
    role: current.role,
    purpose: current.purpose,
    capability_profile: current.capability_profile,
    semantic_work_digest: semanticDigest,
    capacity_observations: snapshot.capacity_observations ?? [],
    billing_safety_observations:
      snapshot.billing_safety_observations ?? [],
    routing_attempt_generation: nextGeneration,
    observed_at: issuedAt,
    existing_wait_deadline:
      workflowState.execution_routing?.wait?.max_wait_deadline ?? null
  });

  const resumeLifecycle = resumeLifecycleFor({
    action: null,
    state: workflowState,
    role: current.role,
    purpose: current.purpose
  });
  const routed = {
    ...action,
    clear_assignment: true,
    idempotence_key: makeIdempotenceKey(
      workflowState.work_item,
      "T14",
      current.assignment_id,
      failureEvidenceDigest(snapshot.failure),
      semanticDigest,
      sourceGeneration
    ),
    execution_routing: routingProjection({
      selection,
      role: current.role,
      purpose: current.purpose,
      source_transition_id: "T14",
      resume_lifecycle: resumeLifecycle
    }),
    failed_run_receipt: {
      role: current.role,
      purpose: current.purpose,
      semantic_work_digest: semanticDigest,
      assignment_id: current.assignment_id,
      freshness_fingerprint: current.fingerprint,
      execution_instance_id:
        snapshot.failure?.execution_instance_id ??
        workflowState.run_receipts?.[current.assignment_id]
          ?.execution_instance_id ??
        "unknown-failed-execution",
      completion_status: "FAILED_BEFORE_RESULT"
    }
  };

  if (selection.kind === "WAIT") {
    delete routed.assignment;
    if (!snapshot.independent_work_available) routed.lifecycle = "BLOCKED";
    routed.routing_wait = true;
    return routed;
  }

  if (selection.kind !== "SELECTED") return routed;

  const bindingState = {
    ...workflowState,
    state_version: workflowState.state_version + 1,
    lifecycle: resumeLifecycle
  };
  routed.lifecycle = resumeLifecycle;
  routed.assignment = generateAssignment({
    state: bindingState,
    role: current.role,
    purpose: current.purpose,
    issued_at: issuedAt,
    context_entrypoints: snapshot.context_entrypoints ?? [],
    execution_repository: snapshot.execution_repository ?? null,
    relevant_inputs: routingRelevantInputs(snapshot),
    semantic_work_digest: semanticDigest,
    execution_route: selection.execution_route,
    independence: {
      required: current.role === "R",
      must_differ_from_execution_instances:
        current.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: current.role === "R"
        ? (
            projectProfile.execution_routing.runner_catalog[
              selection.execution_route.runner_candidate_id
            ]?.independence_mechanism ??
            projectProfile.role_runners.R.independence_mechanism
          )
        : "none"
    }
  });
  return routed;
}

function waitSemanticEarliest(role) {
  if (role === "R") return "IN_REVIEW";
  if (role === "P") return "APPROVED";
  return "ANALYSIS";
}

function dueRoutingWaitAction({
  projectProfile,
  workflowState,
  snapshot,
  issuedAt,
  transitionTable
}) {
  const routing = workflowState?.execution_routing;
  if (!projectProfile.execution_routing || !routing?.pending) return null;
  if (routing.wait?.status !== "WAITING_CAPACITY") return null;

  const pending = routing.pending;
  const currentSemantic = semanticWorkDigest({
    state: workflowState,
    role: pending.role,
    purpose: pending.purpose,
    relevant_inputs: routingRelevantInputs(snapshot)
  });
  if (currentSemantic !== pending.semantic_work_digest) {
    return {
      kind: "INVALIDATE",
      reason: "ROUTING_WAIT_SEMANTIC_DRIFT",
      earliest_affected_point: waitSemanticEarliest(pending.role),
      stale: ["assignment", "review", "release_authorization", "publication"]
    };
  }

  if (!routingWaitDue(routing, issuedAt)) {
    return {
      kind: "NO_OP",
      reason: "ROUTING_WAIT_NOT_DUE",
      not_before: routing.wait.not_before
    };
  }

  const selection = selectRunnerCandidate({
    profile: projectProfile,
    role: pending.role,
    purpose: pending.purpose,
    semantic_work_digest: pending.semantic_work_digest,
    capacity_observations: snapshot.capacity_observations ?? [],
    billing_safety_observations:
      snapshot.billing_safety_observations ?? [],
    routing_attempt_generation: routing.routing_attempt_generation,
    observed_at: issuedAt,
    existing_wait_deadline: routing.wait.max_wait_deadline
  });
  const action = baseAction(
    transitionTable,
    "T14",
    workflowState,
    snapshot,
    {
      lifecycle: pending.resume_lifecycle,
      clear_assignment: true,
      execution_routing: routingProjection({
        selection,
        role: pending.role,
        purpose: pending.purpose,
        source_transition_id: "T14",
        resume_lifecycle: pending.resume_lifecycle
      }),
      idempotence_inputs: {
        routing_wait: pending.semantic_work_digest,
        routing_attempt_generation: routing.routing_attempt_generation,
        observation_set: selection.attempted_candidates
      }
    }
  );

  if (selection.kind === "WAIT") {
    delete action.assignment;
    if (!snapshot.independent_work_available) action.lifecycle = "BLOCKED";
    action.routing_wait = true;
    return action;
  }

  if (selection.kind !== "SELECTED") return action;

  const bindingState = {
    ...workflowState,
    state_version: workflowState.state_version + 1,
    lifecycle: pending.resume_lifecycle
  };
  action.assignment = generateAssignment({
    state: bindingState,
    role: pending.role,
    purpose: pending.purpose,
    issued_at: issuedAt,
    context_entrypoints: snapshot.context_entrypoints ?? [],
    execution_repository: snapshot.execution_repository ?? null,
    relevant_inputs: routingRelevantInputs(snapshot),
    semantic_work_digest: pending.semantic_work_digest,
    execution_route: selection.execution_route,
    independence: {
      required: pending.role === "R",
      must_differ_from_execution_instances:
        workflowState.review?.author_execution_instances ?? [],
      enforcement_mechanism: pending.role === "R"
        ? (
            projectProfile.execution_routing.runner_catalog[
              selection.execution_route.runner_candidate_id
            ]?.independence_mechanism ??
            projectProfile.role_runners.R.independence_mechanism
          )
        : "none"
    }
  });
  return action;
}

function attachCompletedRunReceipt(action, workflowState, snapshot) {
  if (
    action.kind !== "TRANSITION" ||
    !workflowState?.assignment ||
    snapshot.role_result?.status !== "COMPLETED" ||
    !workflowState.assignment.semantic_work_digest
  ) {
    return action;
  }
  return {
    ...action,
    completed_run_receipt: {
      role: workflowState.assignment.role,
      purpose: workflowState.assignment.purpose,
      semantic_work_digest:
        workflowState.assignment.semantic_work_digest,
      assignment_id: workflowState.assignment.assignment_id,
      freshness_fingerprint: workflowState.assignment.fingerprint,
      execution_instance_id:
        snapshot.role_result.trusted?.execution_attestation
          ?.execution_instance_id ??
        snapshot.role_result.execution_instance_id ??
        "unknown-completed-execution",
      completion_status: "APPLICABLE_COMPLETED"
    }
  };
}

export function evaluate(
  projectProfile,
  workflowState,
  authoritativeSnapshot,
  wakeEvent,
  transitionTable
) {
  const routingErrors = validateRoutingConfiguration(projectProfile);
  if (routingErrors.length) {
    return {
      kind: "BLOCKED",
      reason: "INVALID_ROUTING_CONFIGURATION",
      errors: routingErrors
    };
  }

  const snapshot = authoritativeSnapshot ?? {};
  const issuedAt = wakeEvent?.observed_at;
  const routedSnapshot =
    projectProfile.execution_routing &&
    snapshot.role_result?.role === "R" &&
    snapshot.role_result?.payload?.outcome === "CHANGES_REQUIRED"
      ? {
          ...snapshot,
          last_D_semantic_work_digest:
            snapshot.last_D_semantic_work_digest ??
            lastCompletedSemanticDigest(
              workflowState,
              "D",
              "CORRECT_REVIEW_DEFECTS"
            ),
          next_D_semantic_work_digest:
            snapshot.next_D_semantic_work_digest ??
            semanticWorkDigest({
              state: workflowState,
              role: "D",
              purpose: "CORRECT_REVIEW_DEFECTS",
              relevant_inputs: routingRelevantInputs(snapshot)
            })
        }
      : snapshot;

  // Under routing, a current applicable role result wins over a simultaneous
  // transient execution callback for the same assignment.
  const baseSnapshot =
    projectProfile.execution_routing &&
    routedSnapshot.role_result?.status === "COMPLETED"
      ? { ...routedSnapshot, failure: null }
      : routedSnapshot;

  let action = evaluateBase(
    projectProfile,
    workflowState,
    baseSnapshot,
    wakeEvent,
    transitionTable
  );

  if (!projectProfile.execution_routing) return action;
  if (!issuedAt) return action;

  if (action.kind === "TRANSITION" && action.transition_id === "T14") {
    action = t14FailureAction({
      projectProfile,
      workflowState,
      snapshot: routedSnapshot,
      action,
      issuedAt,
      transitionTable
    });
    return action;
  }

  if (action.kind === "NO_OP") {
    const waitAction = dueRoutingWaitAction({
      projectProfile,
      workflowState,
      snapshot: routedSnapshot,
      issuedAt,
      transitionTable
    });
    if (waitAction) return waitAction;
  }

  if (action.kind === "TRANSITION" && action.assignment) {
    action = routeAssignmentAction({
      projectProfile,
      workflowState,
      snapshot: routedSnapshot,
      action,
      issuedAt
    });
  }

  return attachCompletedRunReceipt(
    action,
    workflowState,
    routedSnapshot
  );
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
      ...(action.assignment.semantic_work_digest
        ? {
            semantic_work_digest: action.assignment.semantic_work_digest,
            execution_route: action.assignment.execution_route
          }
        : {}),
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
  if (action.execution_routing) {
    next.execution_routing = structuredClone(action.execution_routing);
  }
  if (action.failed_run_receipt) {
    next.run_receipts[action.failed_run_receipt.assignment_id] = {
      fingerprint: action.failed_run_receipt.freshness_fingerprint,
      assignment_id: action.failed_run_receipt.assignment_id,
      execution_instance_id: action.failed_run_receipt.execution_instance_id,
      role: action.failed_run_receipt.role,
      purpose: action.failed_run_receipt.purpose,
      semantic_work_digest: action.failed_run_receipt.semantic_work_digest,
      freshness_fingerprint: action.failed_run_receipt.freshness_fingerprint,
      completion_status: action.failed_run_receipt.completion_status
    };
  }
  if (action.completed_run_receipt) {
    next.run_receipts[action.completed_run_receipt.assignment_id] = {
      fingerprint: action.completed_run_receipt.freshness_fingerprint,
      assignment_id: action.completed_run_receipt.assignment_id,
      execution_instance_id: action.completed_run_receipt.execution_instance_id,
      role: action.completed_run_receipt.role,
      purpose: action.completed_run_receipt.purpose,
      semantic_work_digest: action.completed_run_receipt.semantic_work_digest,
      freshness_fingerprint: action.completed_run_receipt.freshness_fingerprint,
      completion_status: action.completed_run_receipt.completion_status
    };
  }

  next.updated_by = {
    o_run_id: oRunId,
    transition_id: action.transition_id,
    idempotence_key: action.idempotence_key
  };
  return next;
}
