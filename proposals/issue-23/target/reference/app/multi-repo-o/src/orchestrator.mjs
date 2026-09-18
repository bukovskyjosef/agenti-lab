import { dispatchAssignment, runnerTarget } from "./dispatch.mjs";
import { reconstructAuthority } from "./authority.mjs";
import { findStateComment } from "./evidence.mjs";
import {
  projectAdapterState,
  projectInvalidationState
} from "./state-projection.mjs";
import { workItemKey } from "./mapping.mjs";

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
    independence: {
      required: a.role === "R",
      must_differ_from_execution_instances: a.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: a.role === "R"
        ? profile.role_runners.R.independence_mechanism
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
    return gh.createIssueComment(
      workItem.control_repository,
      workItem.issue_number,
      core.renderStateComment(nextState)
    );
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

  return gh.updateIssueComment(
    workItem.control_repository,
    freshStateComment.id,
    core.renderStateComment(nextState)
  );
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
  const next = structuredClone(state);
  next.assignment = {
    ...next.assignment,
    dispatch_status: status,
    workflow_run_id: runId
  };
  next.run_receipts = {
    ...next.run_receipts,
    [assignment.assignment_id]: {
      fingerprint: assignment.state.fingerprint,
      assignment_id: assignment.assignment_id,
      execution_instance_id: executionInstanceId
    }
  };
  next.updated_by = {
    o_run_id: oRunId,
    transition_id: state.updated_by.transition_id,
    idempotence_key:
      "agenti-run-claim:" +
      core.digest({
        assignment_id: assignment.assignment_id,
        run_id: runId,
        run_attempt: runAttempt,
        status
      }).slice(7, 39)
  };
  return next;
}

function receiverClaimLeaseKey(workItem) {
  return `receiver-claim:${workItemKey(workItem)}`;
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

  async reconstruct(workItem) {
    return reconstructAuthority({
      gh: this.gh,
      profile: this.profile,
      workItem,
      core: this.core,
      trustedResultActorIds: this.trustedResultActorIds,
      trustedStateAppId: this.trustedStateAppId
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

  async verifyRunnerWorkflowRun({
    assignment,
    runnerRepository,
    workflowRunId,
    workflowRunAttempt
  }) {
    const target = runnerTarget(this.profile, assignment.role);
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

    const nextState = claimedState({
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
          target: runnerTarget(this.profile, assignment.role)
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

    return this.withReceiverClaimMutex(
      state.work_item,
      async () => {
        const claimKey = receiverClaimLeaseKey(state.work_item);
        const claimOwner = receiverClaimLeaseOwner({
          assignmentId: assignment.assignment_id,
          runnerRepository: dispatched.target.repository,
          workflowRunId: dispatched.workflow_run_id,
          workflowRunAttempt: dispatched.run_attempt ?? 1,
          source: "dispatch"
        });

        if (!this.store.acquireWorkLease({
          workKey: claimKey,
          owner: claimOwner,
          leaseMs: RECEIVER_CLAIM_LEASE_MS
        })) {
          throw new Error("DURABLE_RUN_CLAIM_BUSY");
        }

        try {
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
              execution_instance_id: claim.execution_instance_id
            }
          };
        } finally {
          this.store.releaseWorkLease(claimKey, claimOwner);
        }
      }
    );
  }

  async processWorkItem(workItem, observedAt = new Date().toISOString()) {
    const reconstructed = await this.reconstruct(workItem);
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

    const oRunId = `o:${workItemKey(workItem)}:${action.idempotence_key}`;
    const nextState = projectAdapterState({
      core: this.core,
      state: reconstructed.state,
      action,
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

    if (!action.assignment) {
      return { action, state: nextState, dispatched: null };
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
      action,
      state: ensured.state,
      dispatched: ensured.dispatched
    };
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

    const expectedRunner = runnerTarget(this.profile, assignment.role);
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
            execution_instance_id: claim.execution_instance_id
          };
        } finally {
          this.store.releaseWorkLease(claimKey, claimOwner);
        }
      }
    ); }}
