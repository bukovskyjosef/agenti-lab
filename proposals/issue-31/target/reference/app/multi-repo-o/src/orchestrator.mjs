import { dispatchAssignment, runnerTarget } from "./dispatch.mjs";
import { reconstructAuthority } from "./authority.mjs";
import { findStateComment } from "./evidence.mjs";
import {
  projectAdapterState,
  projectInvalidationState
} from "./state-projection.mjs";
import { workItemKey } from "./mapping.mjs";
import { WorkItemMutationFence } from "./mutation-fence.mjs";
import {
  capacityObservation,
  executionFailure,
  renderRoutingEvidenceComment,
  EXECUTION_FAILURE_MARKER
} from "./routing-evidence.mjs";

const RECEIVER_CLAIM_LEASE_MS = 5 * 60 * 1000;

const ROLE_MATERIAL_OPERATIONS = Object.freeze({
  A: new Set(["A_CONTRACT_MUTATION"]),
  D: new Set(["D_CANDIDATE_REF_WRITE"]),
  R: new Set(["R_REVIEW_EVIDENCE_WRITE"]),
  P: new Set(["P_MERGE"])
});

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
  const { issued_at, claim, ...rest } = assignment;
  return {
    ...rest,
    claim: { required: claim?.required === true }
  };
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
  targetDigest,
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
        target_digest: targetDigest,
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
    this.stateMutationFence = new WorkItemMutationFence();
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

  async deriveClaimTarget(state, assignment) {
    const runner = runnerTarget(
      this.profile,
      assignment.role,
      assignment
    );
    const members = [...(state.candidate?.members ?? [])]
      .map((member) => ({
        repository: member.repository,
        pr_number: member.pr_number ?? null,
        head_sha: member.head_sha,
        base_ref_or_sha: member.base_ref_or_sha ?? null
      }))
      .sort((a, b) =>
        (a.repository + ":" + (a.pr_number ?? 0))
          .localeCompare(b.repository + ":" + (b.pr_number ?? 0))
      );

    let binding;
    if (assignment.role === "A") {
      binding = {
        kind: "A_CONTRACT",
        control_repository: state.work_item.control_repository,
        issue_number: state.work_item.issue_number,
        contract_digest: state.contract.digest
      };
    } else if (
      assignment.role === "D" &&
      state.candidate?.kind === "none"
    ) {
      const repository = await this.gh.getRepository(runner.repository);
      const defaultBranch = repository.default_branch;
      if (!defaultBranch) {
        throw new Error("D_TARGET_DEFAULT_BRANCH_MISSING");
      }
      const branch = await this.gh.getBranch(
        runner.repository,
        defaultBranch
      );
      if (!branch.commit?.sha) {
        throw new Error("D_TARGET_BASE_SHA_MISSING");
      }
      binding = {
        kind: "D_BASE",
        repository: runner.repository,
        base_ref: defaultBranch,
        base_sha: branch.commit.sha
      };
    } else {
      binding = {
        kind: assignment.role + "_CANDIDATE",
        execution_repository: runner.repository,
        candidate_kind: state.candidate?.kind ?? "none",
        candidate_digest: state.candidate?.digest ?? null,
        members
      };
      if (assignment.role === "P") {
        binding.release_authorization = {
          status: state.release_authorization?.status ?? null,
          authorization_id:
            state.release_authorization?.authorization_id ?? null,
          candidate_digest:
            state.release_authorization?.candidate_digest ?? null,
          target_digest:
            state.release_authorization?.target_digest ?? null,
          gate_digest:
            state.release_authorization?.gate_digest ?? null,
          context_digest:
            state.release_authorization?.context_digest ?? null
        };
        binding.publication_operations = [
          ...(this.profile.publication?.boundary_operations ?? [])
        ].sort();
      }
    }

    return {
      binding,
      digest: this.core.digest(binding)
    };
  }

  async withStateMutationFence(workItem, fn) {
    return this.stateMutationFence.withKey(
      workItemKey(workItem),
      fn
    );
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
    status,
    targetDigest
  }) {
    const verified = await this.verifyRunnerWorkflowRun({
      assignment,
      runnerRepository,
      workflowRunId,
      workflowRunAttempt
    });
    if (!verified.valid) return verified;

    const activeClaim =
      reconstructed.state?.claim_control?.active_claim ?? null;
    const activeRunId = normalizedRunId(
      activeClaim?.owner?.platform_run_id
    );
    if (
      activeClaim &&
      activeClaim.binding?.target_digest !== targetDigest
    ) {
      return {
        valid: false,
        reason: "CLAIM_TARGET_BINDING_STALE",
        workflow_run_id: activeRunId
      };
    }
    if (activeClaim && activeRunId !== verified.run_id) {
      return {
        valid: false,
        reason: "ASSIGNMENT_RUN_OWNERSHIP_CONFLICT",
        workflow_run_id: activeRunId
      };
    }

    if (
      activeClaim &&
      activeRunId === verified.run_id &&
      reconstructed.state.assignment.dispatch_status === status
    ) {
      return {
        ...verified,
        state: reconstructed.state,
        stateComment: reconstructed.stateComment,
        claim_grant: {
          claim_id: activeClaim.claim_id,
          claim_generation: activeClaim.claim_generation,
          claim_version: reconstructed.state.claim_control.claim_version
        },
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
      targetDigest,
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
        already_claimed: Boolean(activeClaim && activeRunId === verified.run_id)
      };
    } catch (error) {
      if (error.message !== "STATE_VERSION_CAS_MISMATCH") throw error;

      const refreshed = await this.reconstruct(reconstructed.state.work_item);
      const refreshedClaim =
        refreshed.state?.claim_control?.active_claim ?? null;
      const refreshedOwner = normalizedRunId(
        refreshedClaim?.owner?.platform_run_id
      );
      if (
        refreshed.state?.assignment?.assignment_id === assignment.assignment_id &&
        refreshedClaim &&
        refreshedOwner === verified.run_id
      ) {
        return {
          ...verified,
          state: refreshed.state,
          stateComment: refreshed.stateComment,
          claim_grant: {
            claim_id: refreshedClaim.claim_id,
            claim_generation: refreshedClaim.claim_generation,
            claim_version: refreshed.state.claim_control.claim_version
          },
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
    let assignment = assignmentEnvelopeFromState(
      state,
      this.profile,
      observedAt
    );
    if (!assignment) {
      return { state, stateComment: reconstructed.stateComment, dispatched: null };
    }

    const issuanceTarget = await this.deriveClaimTarget(state, assignment);
    assignment = {
      ...assignment,
      claim: {
        ...assignment.claim,
        target_digest: issuanceTarget.digest,
        target_binding: issuanceTarget.binding
      }
    };

    const activeClaim = state.claim_control?.active_claim;
    if (
      activeClaim?.assignment_id === assignment.assignment_id
    ) {
      return {
        state,
        stateComment: reconstructed.stateComment,
        dispatched: {
          dispatched: false,
          duplicate: true,
          durable_claim: true,
          claim_id: activeClaim.claim_id,
          claim_generation: activeClaim.claim_generation,
          workflow_run_id: activeClaim.owner?.platform_run_id ?? null,
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
      status: "dispatched",
      targetDigest: assignment.claim.target_digest
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

  async recoverFailedPlatformClaim(reconstructed, observedAt) {
    const state = reconstructed.state;
    const claim = state?.claim_control?.active_claim;
    if (
      !state?.assignment ||
      !claim ||
      claim.lease?.mode !== "PLATFORM_RUN" ||
      reconstructed.snapshot.role_result
    ) {
      return null;
    }
    if (
      state.material_operation?.claim_id === claim.claim_id &&
      !["NOT_APPLIED"].includes(state.material_operation.status)
    ) {
      return null;
    }

    const assignment = assignmentEnvelopeFromState(
      state,
      this.profile,
      observedAt
    );
    const target = runnerTarget(this.profile, assignment.role, assignment);
    const runId = normalizedRunId(claim.owner?.platform_run_id);
    const runAttempt = normalizedRunAttempt(
      claim.owner?.platform_run_attempt ?? 1
    );
    if (!runId || !runAttempt) return null;

    let verified;
    try {
      verified = await this.verifyRunnerWorkflowRun({
        assignment,
        runnerRepository: target.repository,
        workflowRunId: runId,
        workflowRunAttempt: runAttempt
      });
    } catch (error) {
      if (String(error.message).includes("404")) return null;
      throw error;
    }
    if (!verified.valid) return null;

    let run;
    try {
      run = await this.gh.getWorkflowRun(target.repository, runId);
    } catch (error) {
      if (String(error.message).includes("404")) return null;
      throw error;
    }
    const recoverable = new Set([
      "failure",
      "cancelled",
      "timed_out",
      "action_required",
      "startup_failure",
      "stale",
      "neutral",
      "skipped"
    ]);
    if (
      run.status !== "completed" ||
      !recoverable.has(String(run.conclusion ?? ""))
    ) {
      return null;
    }

    const recovered = this.core.recoverClaim({
      state,
      reason: "FAILED",
      platformRunTerminalNonSuccess: true,
      durableEvidenceRef:
        "actions-run:" + target.repository + ":" + String(run.id)
    });
    if (!recovered.recovered) return null;

    const nextState = recovered.state;
    nextState.assignment = {
      ...nextState.assignment,
      dispatch_status: "pending",
      workflow_run_id: null
    };
    nextState.updated_by = {
      o_run_id:
        "platform-run-recovery:" +
        target.repository + ":" + String(run.id),
      transition_id: state.updated_by?.transition_id ?? null,
      idempotence_key:
        "platform-run-recovery:" +
        this.core.digest({
          claim_id: claim.claim_id,
          claim_generation: claim.claim_generation,
          repository: target.repository,
          run_id: String(run.id),
          conclusion: run.conclusion
        }).slice(7, 39)
    };

    const stateComment = await writeStateCas({
      gh: this.gh,
      workItem: state.work_item,
      previous: state,
      stateComment: reconstructed.stateComment,
      nextState,
      core: this.core,
      trustedStateAppId: this.trustedStateAppId
    });
    return {
      state: nextState,
      stateComment,
      recovered_claim_id: claim.claim_id,
      platform_run_id: String(run.id),
      platform_conclusion: run.conclusion
    };
  }

  async processWorkItem(workItem, observedAt = new Date().toISOString()) {
    return this.withStateMutationFence(
      workItem,
      () => this.processWorkItemUnlocked(workItem, observedAt)
    );
  }

  async processWorkItemUnlocked(workItem, observedAt = new Date().toISOString()) {
    let reconstructed = await this.reconstruct(workItem, observedAt);

    const recovery = await this.recoverFailedPlatformClaim(
      reconstructed,
      observedAt
    );
    if (recovery) {
      reconstructed = {
        ...reconstructed,
        state: recovery.state,
        stateComment: recovery.stateComment,
        snapshot: {
          ...reconstructed.snapshot,
          role_result: null
        }
      };
      const ensured = await this.ensureCurrentAssignmentDispatched(
        reconstructed,
        observedAt
      );
      return {
        action: {
          kind: "NO_OP",
          reason: "PLATFORM_RUN_RECOVERED"
        },
        state: ensured.state,
        dispatched: ensured.dispatched,
        recovered: true,
        recovered_claim_id: recovery.recovered_claim_id,
        platform_run_id: recovery.platform_run_id,
        platform_conclusion: recovery.platform_conclusion
      };
    }

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

  async validateMaterialTarget({
    reconstructed,
    assignment,
    operationKind,
    targetBinding,
    observedAt
  }) {
    const action = this.core.evaluate(
      this.profile,
      reconstructed.state,
      reconstructed.snapshot,
      { observed_at: observedAt },
      this.transitionTable
    );
    if (
      action.kind !== "NO_OP" ||
      action.reason !== "NO_AUTHORIZED_TRANSITION"
    ) {
      return {
        valid: false,
        reason: "AUTHORITY_CHANGED_BEFORE_MATERIAL_WRITE",
        current_action: action.kind,
        transition_id: action.transition_id ?? null
      };
    }

    const state = reconstructed.state;
    if (operationKind === "A_CONTRACT_MUTATION") {
      if (
        targetBinding.repository !== this.profile.control_repository ||
        Number(targetBinding.issue_number) !==
          Number(state.work_item.issue_number) ||
        targetBinding.expected_contract_digest !== state.contract.digest
      ) {
        return { valid: false, reason: "A_CONTRACT_TARGET_NOT_CURRENT" };
      }
      return { valid: true };
    }

    if (operationKind === "D_CANDIDATE_REF_WRITE") {
      if (!targetBinding.base_ref || !targetBinding.expected_base_sha) {
        return { valid: false, reason: "D_IMMUTABLE_BASE_REQUIRED" };
      }
      if (state.candidate?.kind === "single") {
        if (
          targetBinding.expected_base_sha !==
          state.candidate.members?.[0]?.head_sha
        ) {
          return { valid: false, reason: "D_CANDIDATE_BASE_NOT_CURRENT" };
        }
      } else {
        const branch = await this.gh.getBranch(
          targetBinding.repository,
          targetBinding.base_ref
        );
        if (branch.commit?.sha !== targetBinding.expected_base_sha) {
          return { valid: false, reason: "D_DEFAULT_BASE_NOT_CURRENT" };
        }
      }
      return { valid: true };
    }

    if (operationKind === "R_REVIEW_EVIDENCE_WRITE") {
      if (
        !state.candidate?.digest ||
        targetBinding.candidate_digest !== state.candidate.digest
      ) {
        return { valid: false, reason: "R_CANDIDATE_TARGET_NOT_CURRENT" };
      }
      return { valid: true };
    }

    if (operationKind === "P_MERGE") {
      if (
        !state.candidate?.digest ||
        targetBinding.candidate_digest !== state.candidate.digest ||
        !targetBinding.repository ||
        !Number.isInteger(Number(targetBinding.pr_number)) ||
        !targetBinding.expected_head ||
        !targetBinding.target_branch
      ) {
        return { valid: false, reason: "P_EXACT_TARGET_REQUIRED" };
      }
      const member = (state.candidate.members ?? []).find(
        (item) =>
          item.repository === targetBinding.repository &&
          Number(item.pr_number) === Number(targetBinding.pr_number)
      );
      if (
        !member ||
        member.head_sha !== targetBinding.expected_head
      ) {
        return { valid: false, reason: "P_CANDIDATE_TARGET_NOT_CURRENT" };
      }
      const pull = await this.gh.getPullRequest(
        targetBinding.repository,
        Number(targetBinding.pr_number)
      );
      if (
        pull.head?.sha !== targetBinding.expected_head ||
        pull.base?.ref !== targetBinding.target_branch
      ) {
        return { valid: false, reason: "P_PULL_TARGET_NOT_CURRENT" };
      }
      return { valid: true };
    }

    return { valid: false, reason: "MATERIAL_OPERATION_NOT_ALLOWLISTED" };
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
    const allowed =
      ROLE_MATERIAL_OPERATIONS[assignment?.role] ?? new Set();
    if (!allowed.has(operationKind)) {
      return { valid: false, reason: "MATERIAL_OPERATION_NOT_ALLOWLISTED" };
    }
    if (
      operationKind === "P_MERGE" &&
      !this.profile.publication?.boundary_operations?.includes("MERGE")
    ) {
      return { valid: false, reason: "P_MERGE_NOT_CONFIGURED" };
    }
    if (!targetBinding || typeof targetBinding !== "object") {
      return { valid: false, reason: "MATERIAL_TARGET_BINDING_REQUIRED" };
    }
    const targetRepository =
      targetBinding.repository ?? assignment.execution_repository?.repository;
    if (
      targetRepository &&
      ![
        this.profile.control_repository,
        ...(this.profile.implementation_repositories ?? [])
      ].includes(targetRepository)
    ) {
      return { valid: false, reason: "MATERIAL_TARGET_REPOSITORY_NOT_CONFIGURED" };
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

    return this.withStateMutationFence(workItem, async () => {
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

        const targetCheck = await this.validateMaterialTarget({
          reconstructed,
          assignment,
          operationKind,
          targetBinding,
          observedAt: preparedAt
        });
        if (!targetCheck.valid) return targetCheck;

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

    return this.withStateMutationFence(workItem, async () => {
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
    const evidenceWrite = await this.withStateMutationFence(
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

    return this.withStateMutationFence(
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

          if (!assignment.claim?.target_digest) {
            return {
              valid: false,
              reason: "ASSIGNMENT_TARGET_BINDING_MISSING"
            };
          }
          const currentTarget = await this.deriveClaimTarget(
            reconstructed.state,
            assignment
          );
          if (currentTarget.digest !== assignment.claim.target_digest) {
            return {
              valid: false,
              reason: "ASSIGNMENT_TARGET_BINDING_STALE",
              expected_target_digest: assignment.claim.target_digest,
              current_target_digest: currentTarget.digest
            };
          }

          const claim = await this.bindAssignmentRun({
            reconstructed,
            assignment,
            runnerRepository,
            workflowRunId,
            workflowRunAttempt,
            status: "running",
            targetDigest: assignment.claim.target_digest
          });
          if (!claim.valid) {
            return {
              valid: false,
              reason: claim.reason,
              workflow_run_id: claim.workflow_run_id ?? null
            };
          }

          const postClaim = await this.reconstruct(workItem);
          const postTarget = await this.deriveClaimTarget(
            postClaim.state,
            assignment
          );
          const postActive = postClaim.state.claim_control?.active_claim;
          if (
            !postActive ||
            postActive.claim_id !==
              (claim.claim_grant?.claim_id ?? postActive.claim_id) ||
            postActive.binding?.target_digest !==
              assignment.claim.target_digest ||
            postTarget.digest !== assignment.claim.target_digest
          ) {
            let revokedState = postClaim.state;
            if (postActive) {
              revokedState = this.core.terminalizeClaim({
                state: postClaim.state,
                terminalReason: "REVOKED_DRIFT",
                durableEvidenceRef: "app-pre-provider-target-drift"
              }).state;
              await writeStateCas({
                gh: this.gh,
                workItem,
                previous: postClaim.state,
                stateComment: postClaim.stateComment,
                nextState: revokedState,
                core: this.core,
                trustedStateAppId: this.trustedStateAppId
              });
            }
            return {
              valid: false,
              reason: "ASSIGNMENT_TARGET_CHANGED_DURING_CLAIM"
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
