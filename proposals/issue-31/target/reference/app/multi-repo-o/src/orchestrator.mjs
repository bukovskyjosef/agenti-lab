import { dispatchAssignment, runnerTarget } from "./dispatch.mjs";
import { reconstructAuthority } from "./authority.mjs";
import { findStateComment } from "./evidence.mjs";
import {
  projectAdapterState,
  projectInvalidationState
} from "./state-projection.mjs";
import { workItemKey } from "./mapping.mjs";
import {
  capacityObservation,
  executionFailure,
  renderRoutingEvidenceComment,
  EXECUTION_FAILURE_MARKER
} from "./routing-evidence.mjs";

const RECEIVER_CLAIM_LEASE_MS = 5 * 60 * 1000;

function assignmentEnvelopeFromState(state, profile, observedAt) {
  if (!state?.assignment) return null;
  const a = state.assignment;
  return {
    schema_version: 1,
    assignment_id: a.assignment_id,
    issued_at: observedAt,
    role: a.role,
    purpose: a.purpose,
    work_item: {
      control_repository: state.work_item.control_repository,
      issue_number: state.work_item.issue_number
    },
    execution_repository: null,
    state: {
      version: a.bound_state_version,
      fingerprint: a.fingerprint,
      contract_digest: state.contract.digest
    },
    candidate: {
      kind: state.candidate.kind,
      digest: state.candidate.digest,
      members: state.candidate.members
    },
    ...(a.semantic_work_digest
      ? {
          semantic_work_digest: a.semantic_work_digest,
          execution_route: a.execution_route
        }
      : {}),
    context_entrypoints: [
      {
        kind: "work_item",
        ref: `${state.work_item.control_repository}#${state.work_item.issue_number}`
      },
      { kind: "project_profile", ref: ".agenti/project-profile.json" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" },
      ...(state.candidate?.members ?? []).map((member) => ({
        kind: "candidate",
        ref: `${member.repository}#${member.pr_number}@${member.head_sha}`
      }))
    ],
    capability_profile: a.capability_profile,
    claim: { required: true },
    independence: {
      required: a.role === "R",
      must_differ_from_execution_instances: a.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: a.role === "R"
        ? (
            profile.execution_routing?.runner_catalog?.[
              a.execution_route?.runner_candidate_id
            ]?.independence_mechanism ??
            profile.role_runners.R.independence_mechanism
          )
        : "none"
    },
    completion: {
      result_schema_version: 1,
      result_marker: "agenti-role-result:v1",
      callback_event: "agenti.role-result"
    }
  };
}

async function writeStateCas({
  gh,
  workItem,
  previous,
  stateComment,
  nextState,
  core,
  trustedStateAppId
}) {
  const freshComments = await gh.listIssueComments(
    workItem.control_repository,
    workItem.issue_number
  );
  const freshStateComment = findStateComment(
    freshComments,
    core,
    trustedStateAppId
  );

  if (!previous) {
    if (freshStateComment) throw new Error("STATE_VERSION_CAS_MISMATCH");
    try {
      return await gh.createIssueComment(
        workItem.control_repository,
        workItem.issue_number,
        core.renderStateComment(nextState)
      );
    } catch (error) {
      const afterComments = await gh.listIssueComments(
        workItem.control_repository,
        workItem.issue_number
      );
      const durable = findStateComment(
        afterComments,
        core,
        trustedStateAppId
      );
      if (
        durable &&
        core.digest(core.parseStateComment(durable.body)) === core.digest(nextState)
      ) {
        return durable;
      }
      throw error;
    }
  }

  if (!freshStateComment || freshStateComment.id !== stateComment?.id) {
    throw new Error("STATE_VERSION_CAS_MISMATCH");
  }

  const fresh = core.parseStateComment(freshStateComment.body);
  if (
    fresh.state_version !== previous.state_version ||
    core.digest(fresh) !== core.digest(previous)
  ) {
    throw new Error("STATE_VERSION_CAS_MISMATCH");
  }

  const body = core.renderStateComment(nextState);
  try {
    return await gh.updateIssueComment(
      workItem.control_repository,
      freshStateComment.id,
      body
    );
  } catch (firstError) {
    const afterComments = await gh.listIssueComments(
      workItem.control_repository,
      workItem.issue_number
    );
    const afterComment = findStateComment(
      afterComments,
      core,
      trustedStateAppId
    );
    if (!afterComment || afterComment.id !== freshStateComment.id) {
      throw new Error("STATE_VERSION_CAS_MISMATCH");
    }
    const observed = core.parseStateComment(afterComment.body);
    if (core.digest(observed) === core.digest(nextState)) return afterComment;
    if (core.digest(observed) !== core.digest(fresh)) {
      throw new Error(
        "STATE_VERSION_CAS_AMBIGUOUS_CONFLICT: " +
        String(firstError.message ?? firstError)
      );
    }

    try {
      return await gh.updateIssueComment(
        workItem.control_repository,
        afterComment.id,
        body
      );
    } catch (secondError) {
      const finalComments = await gh.listIssueComments(
        workItem.control_repository,
        workItem.issue_number
      );
      const finalComment = findStateComment(
        finalComments,
        core,
        trustedStateAppId
      );
      if (
        finalComment &&
        core.digest(core.parseStateComment(finalComment.body)) ===
          core.digest(nextState)
      ) {
        return finalComment;
      }
      throw secondError;
    }
  }
}

function comparableAssignment(assignment) {
  if (!assignment) return null;
  const { issued_at, ...rest } = assignment;
  return rest;
}

function assignmentMatchesState(assignment, state, profile, core) {
  const expected = assignmentEnvelopeFromState(
    state,
    profile,
    assignment?.issued_at ?? state?.contract?.accepted_revision
  );
  return Boolean(
    expected &&
    core.digest(comparableAssignment(assignment)) ===
      core.digest(comparableAssignment(expected))
  );
}

function normalizedRunId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizedRunAttempt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

function claimedState({
  state,
  assignment,
  runId,
  runAttempt,
  status,
  executionInstanceId,
  core,
  oRunId
}) {
  let next = structuredClone(state);
  let grant = null;
  const active = next.claim_control?.active_claim ?? null;

  if (active) {
    const verified = core.verifyActiveClaim({
      state: next,
      assignmentId: assignment.assignment_id,
      claimId: active.claim_id,
      claimGeneration: active.claim_generation,
      executionInstanceId
    });
    if (!verified.valid) {
      return { valid: false, reason: verified.reason, state };
    }
    grant = {
      claim_id: active.claim_id,
      claim_generation: active.claim_generation,
      claim_version: next.claim_control.claim_version
    };
  } else {
    const request = {
      schema_version: 1,
      work_item: assignment.work_item,
      assignment_id: assignment.assignment_id,
      role: assignment.role,
      purpose: assignment.purpose,
      expected: {
        workflow_state_version: next.state_version,
        claim_version: next.claim_control?.claim_version ?? 0,
        assignment_freshness_fingerprint: assignment.state.fingerprint,
        semantic_work_digest: assignment.semantic_work_digest ?? null,
        candidate_digest: next.candidate?.digest ?? null,
        active_claim: "ABSENT"
      },
      claimant: {
        execution_attestation: {
          adapter_id: assignment.execution_route?.adapter_id ?? "github-workflow",
          adapter_version: assignment.execution_route?.adapter_version ?? "1",
          execution_instance_id: executionInstanceId,
          platform_run: {
            provider: "github-actions",
            run_id: runId,
            run_attempt: runAttempt,
            job_or_worker_id: null
          },
          provider_session: {
            mode: "fresh",
            provider_session_id: null
          },
          issued_for_assignment: assignment.assignment_id,
          attested_by: "deterministic-wrapper"
        }
      },
      lease: { mode: "PLATFORM_RUN" },
      requested_at: new Date().toISOString(),
      request_id:
        "app-claim-" +
        core.digest({
          assignment_id: assignment.assignment_id,
          run_id: runId,
          run_attempt: runAttempt
        }).slice(7, 31)
    };
    const acquired = core.acquireClaimCAS({
      state: next,
      request,
      acquiredAt: request.requested_at
    });
    if (!acquired.acquired) {
      return { valid: false, reason: acquired.reason, state };
    }
    next = acquired.state;
    grant = acquired.grant;
  }

  next.assignment = {
    ...next.assignment,
    dispatch_status: status,
    workflow_run_id: runId
  };
  next.run_receipts = {
    ...next.run_receipts,
    [assignment.assignment_id]: {
      ...(next.run_receipts?.[assignment.assignment_id] ?? {}),
      fingerprint: assignment.state.fingerprint,
      assignment_id: assignment.assignment_id,
      execution_instance_id: executionInstanceId,
      claim_id: grant.claim_id,
      claim_generation: grant.claim_generation,
      ...(assignment.semantic_work_digest
        ? {
            role: assignment.role,
            purpose: assignment.purpose,
            semantic_work_digest: assignment.semantic_work_digest,
            freshness_fingerprint: assignment.state.fingerprint
          }
        : {})
    }
  };
  next.updated_by = {
    o_run_id: oRunId,
    transition_id: state.updated_by.transition_id,
    idempotence_key:
      "agenti-run-claim:" +
      core.digest({
        assignment_id: assignment.assignment_id,
        claim_id: grant.claim_id,
        claim_generation: grant.claim_generation,
        run_id: runId,
        run_attempt: runAttempt,
        status
      }).slice(7, 39)
  };
  return { valid: true, state: next, grant };
}

function receiverClaimLeaseKey(workItem) {
  return workItemKey(workItem);
}

function receiverClaimLeaseOwner({
  assignmentId,
  runnerRepository,
  workflowRunId,
  workflowRunAttempt,
  source
}) {
  return [
    source,
    assignmentId,
    runnerRepository,
    normalizedRunId(workflowRunId) ?? "unknown-run",
    normalizedRunAttempt(workflowRunAttempt) ?? "unknown-attempt"
  ].join(":");
}

export class MultiRepoOrchestrator {
  constructor({
    gh,
    profile,
    core,
    transitionTable,
    store,
    trustedResultActorIds,
    trustedStateAppId = null
  }) {
    this.gh = gh;
    this.profile = profile;
    this.core = core;
    this.transitionTable = transitionTable;
    this.store = store;
    this.trustedResultActorIds = trustedResultActorIds;
    this.trustedStateAppId = trustedStateAppId;
    this.receiverClaimLocks = new Map();
  }

  async reconstruct(workItem, observedAt = new Date().toISOString()) {
    return reconstructAuthority({
      gh: this.gh,
      profile: this.profile,
      workItem,
      core: this.core,
      trustedResultActorIds: this.trustedResultActorIds,
      trustedStateAppId: this.trustedStateAppId,
      observedAt
    });
  }

  async withReceiverClaimMutex(workItem, fn) {
    const key = workItemKey(workItem);
    const previous = this.receiverClaimLocks.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.receiverClaimLocks.set(key, tail);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.receiverClaimLocks.get(key) === tail) {
        this.receiverClaimLocks.delete(key);
      }
    }
  }

  async materializeHumanRequest(workItem, state, action) {
    if (!action.human_request || action.human_request.request_ref) {
      return action;
    }

    const proposed = action.human_request;
    const requestId =
      "hir-" + action.idempotence_key.slice(-16);
    const contextDigest = this.core.digest({
      request_id: requestId,
      state_version: state.state_version,
      contract_digest: state.contract.digest,
      candidate_digest: state.candidate?.digest ?? null,
      action_idempotence_key: action.idempotence_key
    });
    const normalizedPayload = {
      request_id: requestId,
      type: proposed.type ?? "DECISION",
      status: "PENDING",
      raised_by: proposed.raised_by ?? "O",
      context_digest: contextDigest,
      resolution_route:
        proposed.resolution_route ?? "ANALYST_REEVALUATE"
    };
    const comment = await this.gh.createIssueComment(
      workItem.control_repository,
      workItem.issue_number,
      [
        "Human input required.",
        "",
        proposed.question ??
          "Human decision is required before automated delivery can continue.",
        "",
        "Resolve with:",
        "/agenti resolve " + requestId,
        "<answer>"
      ].join("\n")
    );
    const requestRef = this.core.acceptMutableEvidence({
      evidence_kind: "issue_comment",
      repository: workItem.control_repository,
      object_id: comment.id,
      actor_id: comment.user?.id,
      updated_at: comment.updated_at ?? comment.created_at,
      normalized_payload: normalizedPayload,
      normalized_outcome: "PENDING",
      context_binding: contextDigest
    });

    return {
      ...action,
      human_request: {
        ...normalizedPayload,
        request_ref: requestRef,
        response_ref: null
      }
    };
  }

  async verifyRunnerWorkflowRun({
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt
  }) {
    const target = runnerTarget(this.profile, assignment.role, assignment);
    if (runnerRepository !== target.repository) {
      return { valid: false, reason: "RUNNER_REPOSITORY_MISMATCH" };
    }

    const runId = normalizedRunId(workflowRunId);
    const runAttempt = normalizedRunAttempt(workflowRunAttempt);
    if (!runId || !runAttempt) {
      return { valid: false, reason: "WORKFLOW_RUN_IDENTITY_REQUIRED" };
    }

    const [workflow, run] = await Promise.all([
      this.gh.getWorkflow(target.repository, target.workflow),
      this.gh.getWorkflowRun(target.repository, runId)
    ]);

    const runRepository =
      run.repository?.full_name ?? run.head_repository?.full_name ?? null;
    if (runRepository !== target.repository) {
      return { valid: false, reason: "WORKFLOW_RUN_REPOSITORY_MISMATCH" };
    }
    if (Number(run.workflow_id) !== Number(workflow.id)) {
      return { valid: false, reason: "WORKFLOW_RUN_WORKFLOW_MISMATCH" };
    }
    if (String(run.id) !== runId) {
      return { valid: false, reason: "WORKFLOW_RUN_ID_MISMATCH" };
    }
    if (Number(run.run_attempt) !== runAttempt) {
      return { valid: false, reason: "WORKFLOW_RUN_ATTEMPT_MISMATCH" };
    }
    if (run.event !== "workflow_dispatch") {
      return { valid: false, reason: "WORKFLOW_RUN_EVENT_MISMATCH" };
    }

    return {
      valid: true,
      target,
      run_id: runId,
      run_attempt: runAttempt,
      execution_instance_id:
        `github-actions:${target.repository}:${runId}:${runAttempt}`
    };
  }

  async bindAssignmentRun({
    reconstructed,
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt,
    status
  }) {
    const verified = await this.verifyRunnerWorkflowRun({
      assignment,
      runnerRepository,
      workflowRunId,
      workflowRunAttempt
    });
    if (!verified.valid) return verified;

    const currentOwner = normalizedRunId(
      reconstructed.state?.assignment?.workflow_run_id
    );
    if (currentOwner && currentOwner !== verified.run_id) {
      return {
        valid: false,
        reason: "ASSIGNMENT_RUN_OWNERSHIP_CONFLICT",
        workflow_run_id: currentOwner
      };
    }

    if (
      currentOwner === verified.run_id &&
      reconstructed.state.assignment.dispatch_status === status
    ) {
      return {
        ...verified,
        state: reconstructed.state,
        stateComment: reconstructed.stateComment,
        already_claimed: true
      };
    }

    const claimed = claimedState({
      state: reconstructed.state,
      assignment,
      runId: verified.run_id,
      runAttempt: verified.run_attempt,
      status,
      executionInstanceId: verified.execution_instance_id,
      core: this.core,
      oRunId:
        `run-claim:${assignment.assignment_id}:${verified.run_id}:${verified.run_attempt}`
    });
    if (!claimed.valid) return claimed;
    const nextState = claimed.state;

    try {
      const stateComment = await writeStateCas({
        gh: this.gh,
        workItem: reconstructed.state.work_item,
        previous: reconstructed.state,
        stateComment: reconstructed.stateComment,
        nextState,
        core: this.core,
        trustedStateAppId: this.trustedStateAppId
      });
      return {
        ...verified,
        state: nextState,
        stateComment,
        claim_grant: claimed.grant,
        already_claimed: currentOwner === verified.run_id
      };
    } catch (error) {
      if (error.message !== "STATE_VERSION_CAS_MISMATCH") throw error;

      const refreshed = await this.reconstruct(reconstructed.state.work_item);
      const refreshedOwner = normalizedRunId(
        refreshed.state?.assignment?.workflow_run_id
      );
      if (
        refreshed.state?.assignment?.assignment_id === assignment.assignment_id &&
        refreshedOwner === verified.run_id
      ) {
        return {
          ...verified,
          state: refreshed.state,
          stateComment: refreshed.stateComment,
          already_claimed: true
        };
      }

      return {
        valid: false,
        reason: "ASSIGNMENT_RUN_CLAIM_CAS_LOST",
        workflow_run_id: refreshedOwner
      };
    }
  }

  async ensureCurrentAssignmentDispatched(reconstructed, observedAt) {
    const state = reconstructed.state;
    const assignment = assignmentEnvelopeFromState(
      state,
      this.profile,
      observedAt
    );
    if (!assignment) {
      return { state, stateComment: reconstructed.stateComment, dispatched: null };
    }

    if (state.assignment.workflow_run_id !== null &&
        state.assignment.workflow_run_id !== undefined) {
      return {
        state,
        stateComment: reconstructed.stateComment,
        dispatched: {
          dispatched: false,
          duplicate: true,
          durable_claim: true,
          workflow_run_id: state.assignment.workflow_run_id,
          target: runnerTarget(this.profile, assignment.role, assignment)
        }
      };
    }

    const dispatched = await dispatchAssignment({
      gh: this.gh,
      profile: this.profile,
      assignment,
      store: this.store
    });

    if (!dispatched.workflow_run_id) {
      return {
        state,
        stateComment: reconstructed.stateComment,
        dispatched
      };
    }

    const fresh = await this.reconstruct(state.work_item);
    const claim = await this.bindAssignmentRun({
      reconstructed: fresh,
      assignment,
      runnerRepository: dispatched.target.repository,
      workflowRunId: dispatched.workflow_run_id,
      workflowRunAttempt: dispatched.run_attempt ?? 1,
      status: "dispatched"
    });

    if (!claim.valid) {
      throw new Error(`DURABLE_RUN_CLAIM_FAILED:${claim.reason}`);
    }

    return {
      state: claim.state,
      stateComment: claim.stateComment,
      dispatched: {
        ...dispatched,
        durable_claim: true,
        claim_id: claim.claim_grant?.claim_id ??
          claim.state.claim_control?.active_claim?.claim_id,
        claim_generation: claim.claim_grant?.claim_generation ??
          claim.state.claim_control?.active_claim?.claim_generation,
        execution_instance_id: claim.execution_instance_id
      }
    };
  }

  async processWorkItem(workItem, observedAt = new Date().toISOString()) {
    const reconstructed = await this.reconstruct(workItem, observedAt);
    if (
      reconstructed.state.material_operation?.status === "PREPARED" ||
      reconstructed.state.material_operation?.status === "HUMAN_ACTION_REQUIRED"
    ) {
      return {
        action: {
          kind: "BLOCKED",
          reason: reconstructed.state.material_operation.status === "PREPARED"
            ? "MATERIAL_OPERATION_IN_FLIGHT"
            : "MATERIAL_OPERATION_REQUIRES_HUMAN"
        },
        state: reconstructed.state,
        dispatched: null,
        safe_hold: true,
        material_operation: reconstructed.state.material_operation
      };
    }
    if (reconstructed.snapshot.role_result) {
      const claimResult = this.core.verifyRoleResultClaim({
        state: reconstructed.state,
        normalizedResult: reconstructed.snapshot.role_result.normalized ??
          reconstructed.snapshot.role_result
      });
      if (!claimResult.valid) {
        return {
          action: { kind: "BLOCKED", reason: "ROLE_RESULT_CLAIM_INVALID" },
          state: reconstructed.state,
          dispatched: null,
          safe_hold: true,
          claim_reason: claimResult.reason
        };
      }
    }
    const action = this.core.evaluate(
      this.profile,
      reconstructed.state,
      reconstructed.snapshot,
      { observed_at: observedAt },
      this.transitionTable
    );

    if (action.kind === "BLOCKED") {
      return { action, state: reconstructed.state, dispatched: null };
    }

    if (action.kind === "INVALIDATE") {
      const oRunId =
        `o:${workItemKey(workItem)}:invalidate:${reconstructed.state.state_version}`;
      const nextState = projectInvalidationState({
        core: this.core,
        state: reconstructed.state,
        action,
        snapshot: reconstructed.snapshot,
        profile: this.profile,
        transitionTable: this.transitionTable,
        observedAt,
        oRunId
      });

      await writeStateCas({
        gh: this.gh,
        workItem,
        previous: reconstructed.state,
        stateComment: reconstructed.stateComment,
        nextState,
        core: this.core,
        trustedStateAppId: this.trustedStateAppId
      });

      return {
        action,
        state: nextState,
        dispatched: null,
        safe_hold: false,
        invalidation_projected: true
      };
    }

    if (action.kind === "NO_OP") {
      if (reconstructed.snapshot.role_result) {
        return { action, state: reconstructed.state, dispatched: null };
      }
      const ensured = await this.ensureCurrentAssignmentDispatched(
        reconstructed,
        observedAt
      );
      return {
        action,
        state: ensured.state,
        dispatched: ensured.dispatched
      };
    }

    if (action.kind !== "TRANSITION") {
      throw new Error(`Unsupported core action ${action.kind}`);
    }

    const materializedAction = await this.materializeHumanRequest(
      workItem,
      reconstructed.state,
      action
    );
    const oRunId =
      `o:${workItemKey(workItem)}:${materializedAction.idempotence_key}`;
    const nextState = projectAdapterState({
      core: this.core,
      state: reconstructed.state,
      action: materializedAction,
      snapshot: reconstructed.snapshot,
      profile: this.profile,
      oRunId
    });

    const stateComment = await writeStateCas({
      gh: this.gh,
      workItem,
      previous: reconstructed.state,
      stateComment: reconstructed.stateComment,
      nextState,
      core: this.core,
      trustedStateAppId: this.trustedStateAppId
    });

    if (!materializedAction.assignment) {
      return {
        action: materializedAction,
        state: nextState,
        dispatched: null
      };
    }

    const ensured = await this.ensureCurrentAssignmentDispatched(
      {
        ...reconstructed,
        state: nextState,
        stateComment
      },
      observedAt
    );

    return {
      action: materializedAction,
      state: ensured.state,
      dispatched: ensured.dispatched
    };
  }

  async prepareMaterialWrite({
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt,
    claimId,
    claimGeneration,
    operationKind,
    targetBinding,
    preparedAt = new Date().toISOString()
  }) {
    if (
      !operationKind ||
      !operationKind.startsWith(String(assignment?.role ?? "") + "_")
    ) {
      return { valid: false, reason: "MATERIAL_OPERATION_ROLE_MISMATCH" };
    }
    if (!targetBinding || typeof targetBinding !== "object") {
      return { valid: false, reason: "MATERIAL_TARGET_BINDING_REQUIRED" };
    }

    const workItem = {
      control_repository: assignment.work_item?.control_repository,
      issue_number: assignment.work_item?.issue_number,
      kind: "executable"
    };
    if (
      workItem.control_repository !== this.profile.control_repository ||
      !Number.isInteger(workItem.issue_number)
    ) {
      return { valid: false, reason: "WORK_ITEM_NOT_IN_CONTROL_REPOSITORY" };
    }

    return this.withReceiverClaimMutex(workItem, async () => {
      const leaseKey = receiverClaimLeaseKey(workItem);
      const leaseOwner = receiverClaimLeaseOwner({
        assignmentId: assignment.assignment_id,
        runnerRepository,
        workflowRunId,
        workflowRunAttempt,
        source: "material-prepare"
      });
      if (!this.store.acquireWorkLease({
        workKey: leaseKey,
        owner: leaseOwner,
        leaseMs: RECEIVER_CLAIM_LEASE_MS
      })) {
        return { valid: false, reason: "WORK_ITEM_MUTATION_BUSY" };
      }

      try {
        const reconstructed = await this.reconstruct(workItem, preparedAt);
        if (!assignmentMatchesState(
          assignment,
          reconstructed.state,
          this.profile,
          this.core
        )) {
          return { valid: false, reason: "ASSIGNMENT_NOT_CURRENT" };
        }

        const verifiedRun = await this.verifyRunnerWorkflowRun({
          assignment,
          runnerRepository,
          workflowRunId,
          workflowRunAttempt
        });
        if (!verifiedRun.valid) return verifiedRun;

        const claimCheck = this.core.verifyActiveClaim({
          state: reconstructed.state,
          assignmentId: assignment.assignment_id,
          claimId,
          claimGeneration,
          executionInstanceId: verifiedRun.execution_instance_id
        });
        if (!claimCheck.valid) {
          return { valid: false, reason: claimCheck.reason };
        }

        const prepared = this.core.prepareMaterialOperation({
          state: reconstructed.state,
          claimId,
          claimGeneration,
          assignmentId: assignment.assignment_id,
          executionInstanceId: verifiedRun.execution_instance_id,
          operationKind,
          targetBinding,
          preparedAt
        });

        if (!prepared.prepared) {
          if (
            prepared.reason === "MATERIAL_OPERATION_ALREADY_PREPARED" ||
            prepared.reason === "MATERIAL_OPERATION_ALREADY_APPLIED"
          ) {
            return {
              valid: true,
              prepared: false,
              reason: prepared.reason,
              material_operation: prepared.material_operation ??
                reconstructed.state.material_operation
            };
          }
          return { valid: false, reason: prepared.reason };
        }

        prepared.state.updated_by = {
          o_run_id:
            "material-prepare:" + prepared.material_operation.material_operation_id,
          transition_id: reconstructed.state.updated_by?.transition_id ?? null,
          idempotence_key:
            "material-prepare:" + prepared.material_operation.material_operation_id
        };

        const stateComment = await writeStateCas({
          gh: this.gh,
          workItem,
          previous: reconstructed.state,
          stateComment: reconstructed.stateComment,
          nextState: prepared.state,
          core: this.core,
          trustedStateAppId: this.trustedStateAppId
        });

        return {
          valid: true,
          prepared: true,
          reason: "PREPARED",
          material_operation: prepared.material_operation,
          claim_version: prepared.state.claim_control.claim_version,
          state_comment_id: stateComment.id
        };
      } finally {
        this.store.releaseWorkLease(leaseKey, leaseOwner);
      }
    });
  }

  async resolveMaterialWrite({
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt,
    claimId,
    claimGeneration,
    materialOperationId,
    outcome,
    evidenceRef = null,
    observedAt = new Date().toISOString()
  }) {
    const workItem = {
      control_repository: assignment.work_item?.control_repository,
      issue_number: assignment.work_item?.issue_number,
      kind: "executable"
    };
    if (
      workItem.control_repository !== this.profile.control_repository ||
      !Number.isInteger(workItem.issue_number)
    ) {
      return { valid: false, reason: "WORK_ITEM_NOT_IN_CONTROL_REPOSITORY" };
    }

    return this.withReceiverClaimMutex(workItem, async () => {
      const leaseKey = receiverClaimLeaseKey(workItem);
      const leaseOwner = receiverClaimLeaseOwner({
        assignmentId: assignment.assignment_id,
        runnerRepository,
        workflowRunId,
        workflowRunAttempt,
        source: "material-resolve"
      });
      if (!this.store.acquireWorkLease({
        workKey: leaseKey,
        owner: leaseOwner,
        leaseMs: RECEIVER_CLAIM_LEASE_MS
      })) {
        return { valid: false, reason: "WORK_ITEM_MUTATION_BUSY" };
      }

      try {
        const reconstructed = await this.reconstruct(workItem, observedAt);
        if (!assignmentMatchesState(
          assignment,
          reconstructed.state,
          this.profile,
          this.core
        )) {
          return { valid: false, reason: "ASSIGNMENT_NOT_CURRENT" };
        }

        const verifiedRun = await this.verifyRunnerWorkflowRun({
          assignment,
          runnerRepository,
          workflowRunId,
          workflowRunAttempt
        });
        if (!verifiedRun.valid) return verifiedRun;

        const claimCheck = this.core.verifyActiveClaim({
          state: reconstructed.state,
          assignmentId: assignment.assignment_id,
          claimId,
          claimGeneration,
          executionInstanceId: verifiedRun.execution_instance_id
        });
        if (!claimCheck.valid) {
          return { valid: false, reason: claimCheck.reason };
        }

        const resolved = this.core.resolveMaterialOperation({
          state: reconstructed.state,
          materialOperationId,
          outcome,
          evidenceRef
        });
        if (!resolved.resolved) {
          return { valid: false, reason: resolved.reason };
        }
        if (resolved.idempotent) {
          return {
            valid: true,
            resolved: true,
            idempotent: true,
            reason: resolved.reason,
            material_operation: resolved.material_operation
          };
        }

        resolved.state.updated_by = {
          o_run_id: "material-resolve:" + materialOperationId,
          transition_id: reconstructed.state.updated_by?.transition_id ?? null,
          idempotence_key:
            "material-resolve:" + materialOperationId + ":" + outcome
        };

        const stateComment = await writeStateCas({
          gh: this.gh,
          workItem,
          previous: reconstructed.state,
          stateComment: reconstructed.stateComment,
          nextState: resolved.state,
          core: this.core,
          trustedStateAppId: this.trustedStateAppId
        });

        return {
          valid: true,
          resolved: true,
          idempotent: false,
          reason: resolved.reason,
          material_operation: resolved.material_operation,
          claim_version: resolved.state.claim_control.claim_version,
          state_comment_id: stateComment.id
        };
      } finally {
        this.store.releaseWorkLease(leaseKey, leaseOwner);
      }
    });
  }

  async recordExecutionFailure({
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt,
    status,
    retryAt = null,
    observedAt = new Date().toISOString()
  }) {
    if (
      !["TEMPORARILY_EXHAUSTED", "RATE_LIMITED", "UNAVAILABLE"]
        .includes(status)
    ) {
      return { accepted: false, reason: "UNSUPPORTED_FAILURE_STATUS" };
    }
    if (!assignment?.semantic_work_digest || !assignment?.execution_route) {
      return { accepted: false, reason: "ASSIGNMENT_NOT_ROUTED" };
    }

    const workItem = {
      control_repository: assignment.work_item?.control_repository,
      issue_number: assignment.work_item?.issue_number,
      kind: "executable"
    };
    if (
      workItem.control_repository !== this.profile.control_repository ||
      !Number.isInteger(workItem.issue_number)
    ) {
      return { accepted: false, reason: "WORK_ITEM_NOT_IN_CONTROL_REPOSITORY" };
    }

    const mutationKey = receiverClaimLeaseKey(workItem);
    const mutationOwner = receiverClaimLeaseOwner({
      assignmentId: assignment.assignment_id,
      runnerRepository,
      workflowRunId,
      workflowRunAttempt,
      source: "failure"
    });
    if (!this.store.acquireWorkLease({
      workKey: mutationKey,
      owner: mutationOwner,
      leaseMs: RECEIVER_CLAIM_LEASE_MS
    })) {
      return { accepted: false, reason: "WORK_ITEM_MUTATION_BUSY" };
    }

    try {
    const evidenceWrite = await this.withReceiverClaimMutex(
      workItem,
      async () => {
        const reconstructed = await this.reconstruct(workItem, observedAt);
        if (
          reconstructed.state.material_operation?.status === "PREPARED" ||
          reconstructed.state.material_operation?.status ===
            "HUMAN_ACTION_REQUIRED"
        ) {
          return {
            accepted: false,
            reason: "MATERIAL_OPERATION_RECONCILIATION_REQUIRED"
          };
        }
        if (!assignmentMatchesState(
          assignment,
          reconstructed.state,
          this.profile,
          this.core
        )) {
          return { accepted: false, reason: "ASSIGNMENT_NOT_CURRENT" };
        }

        const verified = await this.verifyRunnerWorkflowRun({
          assignment,
          runnerRepository,
          workflowRunId,
          workflowRunAttempt
        });
        if (!verified.valid) {
          return { accepted: false, reason: verified.reason };
        }

        const currentOwner = normalizedRunId(
          reconstructed.state.assignment?.workflow_run_id
        );
        if (currentOwner !== verified.run_id) {
          return {
            accepted: false,
            reason: "ASSIGNMENT_RUN_OWNERSHIP_CONFLICT",
            workflow_run_id: currentOwner
          };
        }

        const activeClaim = reconstructed.state.claim_control?.active_claim;
        const claimCheck = this.core.verifyActiveClaim({
          state: reconstructed.state,
          assignmentId: assignment.assignment_id,
          claimId: activeClaim?.claim_id,
          claimGeneration: activeClaim?.claim_generation,
          executionInstanceId: verified.execution_instance_id
        });
        if (!claimCheck.valid) {
          return { accepted: false, reason: "FAILURE_CLAIM_" + claimCheck.reason };
        }

        const capacity = capacityObservation({
          core: this.core,
          candidateId:
            assignment.execution_route.runner_candidate_id,
          status,
          observedAt,
          retryAt
        });
        const failure = executionFailure({
          core: this.core,
          assignment,
          executionInstanceId: verified.execution_instance_id,
          claimId: activeClaim.claim_id,
          claimGeneration: activeClaim.claim_generation,
          status,
          observedAt,
          retryAt
        });

        const comment = await this.gh.createIssueComment(
          workItem.control_repository,
          workItem.issue_number,
          renderRoutingEvidenceComment(
            EXECUTION_FAILURE_MARKER,
            "Trusted execution failure for current routed assignment.",
            {
              failure,
              capacity_observation: capacity
            }
          )
        );

        return {
          accepted: true,
          evidence_comment_id: comment.id,
          failure,
          capacity_observation: capacity
        };
      }
    );

    if (!evidenceWrite.accepted) return evidenceWrite;

    // Release the receiver-claim critical section before T14 processing.
    // Replacement dispatch may acquire the same per-work-item claim mutex.
    const result = await this.processWorkItem(workItem, observedAt);
    return {
      ...evidenceWrite,
      result
    };
    } finally {
      this.store.releaseWorkLease(mutationKey, mutationOwner);
    }
  }

  async verifyAssignment(
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt
  ) {
    const workItem = {
      control_repository: assignment.work_item?.control_repository,
      issue_number: assignment.work_item?.issue_number,
      kind: "executable"
    };
    if (
      workItem.control_repository !== this.profile.control_repository ||
      !Number.isInteger(workItem.issue_number)
    ) {
      return { valid: false, reason: "WORK_ITEM_NOT_IN_CONTROL_REPOSITORY" };
    }

    const expectedRunner = runnerTarget(this.profile, assignment.role, assignment);
    if (runnerRepository !== expectedRunner.repository) {
      return { valid: false, reason: "RUNNER_REPOSITORY_MISMATCH" };
    }

    return this.withReceiverClaimMutex(
      workItem,
      async () => {
        const claimKey = receiverClaimLeaseKey(workItem);
        const claimOwner = receiverClaimLeaseOwner({
          assignmentId: assignment.assignment_id,
          runnerRepository,
          workflowRunId,
          workflowRunAttempt,
          source: "receiver"
        });

        if (!this.store.acquireWorkLease({
          workKey: claimKey,
          owner: claimOwner,
          leaseMs: RECEIVER_CLAIM_LEASE_MS
        })) {
          return {
            valid: false,
            reason: "ASSIGNMENT_RUN_CLAIM_CONFLICT",
            workflow_run_id: null
          };
        }

        try {
          const reconstructed = await this.reconstruct(workItem);
          if (!assignmentMatchesState(
            assignment,
            reconstructed.state,
            this.profile,
            this.core
          )) {
            return { valid: false, reason: "ASSIGNMENT_NOT_CURRENT" };
          }
          if (reconstructed.snapshot.role_result) {
            return { valid: false, reason: "CURRENT_RESULT_ALREADY_EXISTS" };
          }

          const action = this.core.evaluate(
            this.profile,
            reconstructed.state,
            reconstructed.snapshot,
            { observed_at: new Date().toISOString() },
            this.transitionTable
          );
          if (
            action.kind !== "NO_OP" ||
            action.reason !== "NO_AUTHORIZED_TRANSITION"
          ) {
            return {
              valid: false,
              reason: "AUTHORITY_CHANGED_BEFORE_ROLE_START",
              current_action: action.kind,
              transition_id: action.transition_id ?? null
            };
          }

          const claim = await this.bindAssignmentRun({
            reconstructed,
            assignment,
            runnerRepository,
            workflowRunId,
            workflowRunAttempt,
            status: "running"
          });
          if (!claim.valid) {
            return {
              valid: false,
              reason: claim.reason,
              workflow_run_id: claim.workflow_run_id ?? null
            };
          }

          return {
            valid: true,
            reason: claim.already_claimed
              ? "CURRENT_EXPLICIT_ASSIGNMENT_RUN_CONFIRMED"
              : "CURRENT_EXPLICIT_ASSIGNMENT_RUN_CLAIMED",
            state_version: claim.state.state_version,
            candidate_digest: claim.state.candidate.digest,
            workflow_run_id: claim.run_id,
            run_attempt: claim.run_attempt,
            execution_instance_id: claim.execution_instance_id,
            claim_id: claim.claim_grant?.claim_id ??
              claim.state.claim_control?.active_claim?.claim_id,
            claim_generation: claim.claim_grant?.claim_generation ??
              claim.state.claim_control?.active_claim?.claim_generation,
            claim_version: claim.state.claim_control?.claim_version
          };
        } finally {
          this.store.releaseWorkLease(claimKey, claimOwner);
        }
      }
    ); }}
