import { dispatchAssignment, runnerTarget } from "./dispatch.mjs";
import { reconstructAuthority } from "./authority.mjs";
import { findStateComment } from "./evidence.mjs";
import { projectAdapterState } from "./state-projection.mjs";
import { workItemKey } from "./mapping.mjs";

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
  const freshComments = await gh.listIssueComments(workItem.control_repository, workItem.issue_number);
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
  if (fresh.state_version !== previous.state_version) {
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

  async ensureCurrentAssignmentDispatched(state, observedAt) {
    const assignment = assignmentEnvelopeFromState(state, this.profile, observedAt);
    if (!assignment) return null;
    return dispatchAssignment({
      gh: this.gh,
      profile: this.profile,
      assignment,
      store: this.store
    });
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
      return {
        action,
        state: reconstructed.state,
        dispatched: null,
        safe_hold: true
      };
    }

    if (action.kind === "NO_OP") {
      const dispatched = reconstructed.snapshot.role_result
        ? null
        : await this.ensureCurrentAssignmentDispatched(reconstructed.state, observedAt);
      return { action, state: reconstructed.state, dispatched };
    }

    if (action.kind !== "TRANSITION") throw new Error(`Unsupported core action ${action.kind}`);

    const oRunId = `o:${workItemKey(workItem)}:${action.idempotence_key}`;
    const nextState = projectAdapterState({
      core: this.core,
      state: reconstructed.state,
      action,
      snapshot: reconstructed.snapshot,
      profile: this.profile,
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

    const dispatched = action.assignment
      ? await dispatchAssignment({
          gh: this.gh,
          profile: this.profile,
          assignment: action.assignment,
          store: this.store
        })
      : null;

    return { action, state: nextState, dispatched };
  }

  async verifyAssignment(assignment, runnerRepository) {
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
    if (action.kind !== "NO_OP" || action.reason !== "NO_AUTHORIZED_TRANSITION") {
      return {
        valid: false,
        reason: "AUTHORITY_CHANGED_BEFORE_ROLE_START",
        current_action: action.kind,
        transition_id: action.transition_id ?? null
      };
    }

    return {
      valid: true,
      reason: "CURRENT_EXPLICIT_ASSIGNMENT",
      state_version: reconstructed.state.state_version,
      candidate_digest: reconstructed.state.candidate.digest
    };
  }
}
