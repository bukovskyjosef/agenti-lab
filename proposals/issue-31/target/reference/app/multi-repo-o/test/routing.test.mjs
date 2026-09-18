import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import * as core from "../../../core/index.mjs";
import { runnerTarget } from "../src/dispatch.mjs";
import { enqueueReconcile } from "../src/reconcile.mjs";
import { MultiRepoOrchestrator } from "../src/orchestrator.mjs";
import { executionFailure } from "../src/routing-evidence.mjs";
import { OperationalStore } from "../src/store.mjs";

const profile = JSON.parse(await readFile(
  new URL("../config/project-profile.example.json", import.meta.url),
  "utf8"
));
const transitionTable = JSON.parse(await readFile(
  new URL("../../../core/transitions.json", import.meta.url),
  "utf8"
));
const baseState = JSON.parse(await readFile(
  new URL("../../../conformance/fixtures/base-state.json", import.meta.url),
  "utf8"
));

const OBSERVED = "2026-09-18T12:00:00Z";
const APP_ID = 999;

function capacity(candidate, status, retryAt = null) {
  const source = {
    kind: "ADAPTER_PREFLIGHT",
    trust: "ADAPTER_OBSERVED"
  };
  const body = {
    runner_candidate_id: candidate,
    status,
    observed_at: OBSERVED,
    valid_until: "2026-09-18T13:00:00Z",
    retry_at: retryAt,
    retry_after_seconds: null,
    remaining: null,
    source
  };
  return { ...body, evidence_digest: core.digest(body) };
}

function safety(candidate) {
  const source = {
    kind: "ADMIN_POLICY_ATTESTATION",
    trust: "EXTERNAL_CURRENT_EVIDENCE"
  };
  const body = {
    runner_candidate_id: candidate,
    status: "VERIFIED_NO_PAID_SPILLOVER",
    observed_at: OBSERVED,
    valid_until: "2026-09-18T13:00:00Z",
    source
  };
  return { ...body, evidence_digest: core.digest(body) };
}

function assignmentEnvelope(state, issuedAt = OBSERVED) {
  const a = state.assignment;
  return {
    schema_version: 1,
    assignment_id: a.assignment_id,
    issued_at: issuedAt,
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
    semantic_work_digest: a.semantic_work_digest,
    execution_route: a.execution_route,
    context_entrypoints: [
      {
        kind: "work_item",
        ref: state.work_item.control_repository + "#" +
          state.work_item.issue_number
      },
      { kind: "project_profile", ref: ".agenti/project-profile.json" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" }
    ],
    capability_profile: a.capability_profile,
    independence: {
      required: a.role === "R",
      must_differ_from_execution_instances:
        a.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: a.role === "R"
        ? profile.execution_routing.runner_catalog[
            a.execution_route.runner_candidate_id
          ].independence_mechanism
        : "none"
    },
    completion: {
      result_schema_version: 1,
      result_marker: "agenti-role-result:v1",
      callback_event: "agenti.role-result"
    }
  };
}

function buildRoutedDState(issue) {
  const state = structuredClone(baseState);
  state.work_item = {
    control_repository: "acme/control",
    issue_number: 42,
    kind: "executable"
  };
  state.contract = {
    ...state.contract,
    source_ref: "issue:42",
    accepted_revision: issue.updated_at,
    digest: core.digest({
      title: issue.title,
      body: issue.body
    })
  };
  const snapshot = {
    role_result: {
      role: "A",
      status: "COMPLETED",
      result_digest: core.digest({ A: "ready" }),
      payload: { disposition: "READY" }
    },
    dor_passes: true,
    pending_human_request: false,
    context_entrypoints: [
      { kind: "work_item", ref: "acme/control#42" }
    ],
    capacity_observations: [
      capacity("claude-d", "AVAILABLE")
    ],
    billing_safety_observations: [
      safety("claude-d")
    ]
  };
  const action = core.evaluate(
    profile,
    state,
    snapshot,
    { observed_at: OBSERVED },
    transitionTable
  );
  assert.equal(action.transition_id, "T02");
  assert.equal(
    action.assignment.execution_route.runner_candidate_id,
    "claude-d"
  );
  const projected = core.projectAction(state, action, "o-t02");
  projected.assignment.workflow_run_id = "7001";
  projected.assignment.dispatch_status = "running";
  projected.run_receipts[action.assignment.assignment_id] = {
    fingerprint: action.assignment.state.fingerprint,
    assignment_id: action.assignment.assignment_id,
    execution_instance_id:
      "github-actions:acme/service-a:7001:1",
    role: "D",
    purpose: action.assignment.purpose,
    semantic_work_digest: action.assignment.semantic_work_digest,
    freshness_fingerprint: action.assignment.state.fingerprint
  };
  return { state: projected, assignment: action.assignment };
}

function fakeGitHub({ issue, state }) {
  let currentState = structuredClone(state);
  let nextCommentId = 900;
  const comments = [{
    id: 800,
    body: core.renderStateComment(currentState),
    user: { id: 111 },
    performed_via_github_app: { id: APP_ID },
    created_at: OBSERVED,
    updated_at: OBSERVED
  }];
  const created = [];

  return {
    currentState: () => currentState,
    created,
    getIssue: async () => issue,
    listIssueComments: async () => comments,
    createIssueComment: async (_repo, _issue, body) => {
      const comment = {
        id: nextCommentId++,
        body,
        user: { id: 111 },
        performed_via_github_app: { id: APP_ID },
        created_at: OBSERVED,
        updated_at: OBSERVED
      };
      comments.push(comment);
      created.push(comment);
      return comment;
    },
    updateIssueComment: async (_repo, id, body) => {
      const comment = comments.find((x) => x.id === id);
      comment.body = body;
      comment.updated_at = "2026-09-18T12:00:01Z";
      if (id === 800) currentState = core.parseStateComment(body);
      return comment;
    },
    listPullRequests: async () => [],
    listCheckRunsForRef: async () => ({ check_runs: [] }),
    getWorkflow: async (_repo, workflow) => ({
      id: workflow === "agenti-role-d-claude.yml" ? 120 : 999
    }),
    getWorkflowRun: async () => ({
      id: 7001,
      workflow_id: 120,
      run_attempt: 1,
      event: "workflow_dispatch",
      repository: { full_name: "acme/service-a" }
    }),
    workflowDispatch: async () => {
      throw new Error("T14 should wait in this regression");
    }
  };
}

test("routed multi-repo dispatch target is explicit candidate dispatch, not static role mapping", () => {
  const assignment = {
    role: "D",
    execution_route: {
      runner_candidate_id: "claude-d"
    }
  };
  assert.deepEqual(
    runnerTarget(profile, "D", assignment),
    {
      repository: "acme/service-a",
      workflow: "agenti-role-d-claude.yml",
      adapter_version: "1",
      runner_candidate_id: "claude-d"
    }
  );
});

test("trusted owning-run failure is durable evidence and T14 projects bounded wait", async () => {
  const issue = {
    number: 42,
    title: "Capacity failure",
    body: "Stable contract",
    updated_at: OBSERVED,
    labels: [{ name: "agenti:managed" }]
  };
  const built = buildRoutedDState(issue);
  const gh = fakeGitHub({ issue, state: built.state });
  const store = new OperationalStore(":memory:");
  const orchestrator = new MultiRepoOrchestrator({
    gh,
    profile,
    core,
    transitionTable,
    store,
    trustedResultActorIds: new Set([111]),
    trustedStateAppId: APP_ID
  });

  const result = await orchestrator.recordExecutionFailure({
    assignment: assignmentEnvelope(built.state),
    runnerRepository: "acme/service-a",
    workflowRunId: "7001",
    workflowRunAttempt: "1",
    status: "RATE_LIMITED",
    retryAt: "2026-09-18T12:20:00Z",
    observedAt: OBSERVED
  });

  assert.equal(result.accepted, true);
  assert.equal(result.result.action.transition_id, "T14");
  assert.equal(result.result.state.lifecycle, "BLOCKED");
  assert.equal(result.result.state.assignment, null);
  assert.equal(
    result.result.state.execution_routing.wait.status,
    "WAITING_CAPACITY"
  );
  assert.equal(
    result.result.state.execution_routing.routing_attempt_generation,
    1
  );
  assert.ok(
    gh.created.some((comment) =>
      comment.body.includes("agenti-execution-failure:v1")
    )
  );
  store.close();
});

test("multi-repo reconcile suppresses capacity wait before due and enqueues it at due", async () => {
  const waitState = structuredClone(baseState);
  waitState.execution_routing = {
    policy_digest: core.digest({ policy: "d" }),
    pending: {
      role: "D",
      purpose: "IMPLEMENT_CURRENT_CONTRACT",
      semantic_work_digest: core.digest({ work: "d" }),
      source_transition_id: "T14",
      resume_lifecycle: "IN_PROGRESS"
    },
    selected_runner_candidate_id: null,
    routing_attempt_generation: 1,
    attempted_candidates: [],
    wait: {
      status: "WAITING_CAPACITY",
      reason: "RATE_LIMITED",
      candidate_id: "claude-d",
      not_before: "2026-09-18T12:20:00Z",
      max_wait_deadline: "2026-09-18T18:00:00Z"
    }
  };
  waitState.lifecycle = "BLOCKED";
  waitState.assignment = null;

  const stateComment = {
    id: 1,
    body: core.renderStateComment(waitState),
    performed_via_github_app: { id: APP_ID }
  };
  const gh = {
    listManagedIssues: async () => [{ number: 42 }],
    listIssueComments: async () => [stateComment]
  };
  const enqueued = [];
  const store = {
    enqueue: (item) => {
      enqueued.push(item);
      return { inserted: true };
    }
  };

  const before = await enqueueReconcile({
    gh,
    profile,
    store,
    core,
    trustedStateAppId: APP_ID,
    now: Date.parse("2026-09-18T12:10:00Z")
  });
  assert.equal(before, 0);
  assert.equal(enqueued.length, 0);

  const due = await enqueueReconcile({
    gh,
    profile,
    store,
    core,
    trustedStateAppId: APP_ID,
    now: Date.parse("2026-09-18T12:21:00Z")
  });
  assert.equal(due, 1);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].eventName, "reconcile");
});


test("F2 App failure writer marks accepted UNAVAILABLE as T14-routable", () => {
  const issue = {
    number: 42,
    title: "Unavailable writer",
    body: "Stable contract",
    updated_at: OBSERVED,
    labels: [{ name: "agenti:managed" }]
  };
  const built = buildRoutedDState(issue);
  const assignment = assignmentEnvelope(built.state);
  const failure = executionFailure({
    core,
    assignment,
    executionInstanceId: "github-actions:acme/service-a:7001:1",
    status: "UNAVAILABLE",
    observedAt: OBSERVED
  });
  assert.equal(failure.capacity_status, "UNAVAILABLE");
  assert.equal(failure.transient, true);
  assert.equal(failure.objective_retry_reason, "ROUTING_EXECUTION_FAILURE");
  assert.equal(
    failure.semantic_work_digest,
    assignment.semantic_work_digest
  );
});
