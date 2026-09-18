import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import * as core from "../../../../../../issue-21/target/reference/core/index.mjs";
import { MultiRepoOrchestrator } from "../src/orchestrator.mjs";
import {
  ROLE_RESULT_JSON_END,
  ROLE_RESULT_JSON_START
} from "../src/evidence.mjs";
import { OperationalStore } from "../src/store.mjs";

const transitionTable = JSON.parse(await readFile(
  new URL(
    "../../../../../../issue-21/target/reference/core/transitions.json",
    import.meta.url
  ),
  "utf8"
));

const capability = {
  A: "A_READ_ANALYZE",
  D: "D_WORKSPACE_WRITE",
  R: "R_READ_REVIEW",
  P: "P_PUBLISH"
};

const purpose = {
  A: "SHAPE_INTENT",
  D: "IMPLEMENT_CURRENT_CONTRACT",
  R: "INDEPENDENT_REVIEW",
  P: "PUBLISH_CURRENT_CANDIDATE"
};

function profile({ releaseRequired = false } = {}) {
  return {
    schema_version: 1,
    runtime_version: "0.1.0-child1",
    repository_topology: "multi-repo",
    control_repository: "acme/control",
    implementation_repositories: ["acme/service-a", "acme/service-b"],
    human: { principals: [{ actor_id: 1001, login: "human" }] },
    required_checks: [],
    role_runners: {
      A: {
        adapter_id: "github-workflow://acme/control/a.yml",
        adapter_version: "1",
        capability_profile: "A_READ_ANALYZE"
      },
      D: {
        adapter_id: "github-workflow://acme/service-a/d.yml",
        adapter_version: "1",
        capability_profile: "D_WORKSPACE_WRITE"
      },
      R: {
        adapter_id: "github-workflow://acme/service-b/r.yml",
        adapter_version: "1",
        capability_profile: "R_READ_REVIEW",
        independence_mechanism: "fresh-wrapper"
      },
      P: {
        adapter_id: "github-workflow://acme/control/p.yml",
        adapter_version: "1",
        capability_profile: "P_PUBLISH"
      }
    },
    independent_r_enforcement: {
      mechanisms: {
        "fresh-wrapper": {
          attestation_source: "deterministic-wrapper",
          fresh_execution_required: true
        }
      }
    },
    identities: {
      O: {
        identity_id: "o",
        capability_profile: "O_CONTROL_PLANE",
        dispatch_mechanism: "workflow_dispatch",
        permissions: {
          metadata: "read",
          contents: "read",
          issues: "write",
          pull_requests: "read",
          checks: "read",
          actions: "write",
          deployments: "read"
        }
      },
      P: {
        identity_id: "p",
        capability_profile: "P_PUBLISH",
        dispatch_mechanism: "none",
        permissions: { contents: "write" }
      }
    },
    release_authorization: {
      required: releaseRequired,
      target: "production"
    },
    publication: { boundary_operations: ["MERGE"] },
    state_projection: { marker: "agenti-state:v1", single_writer: "O" }
  };
}

function contractDigest(issue) {
  return core.digest({
    title: issue.title ?? "",
    body: issue.body ?? ""
  });
}

function assignmentProjection(role, version, fingerprint = core.digest({ role, version })) {
  return {
    assignment_id: `asg-${role.toLowerCase()}-${String(version).padStart(8, "0")}`,
    role,
    purpose: purpose[role],
    issued_from_state_version: Math.max(0, version - 1),
    bound_state_version: version,
    fingerprint,
    capability_profile: capability[role],
    dispatch_status: "pending",
    workflow_run_id: null,
    must_differ_from_execution_instances:
      role === "R" ? ["github-actions:acme/service-a:41:1"] : []
  };
}

function baseState({
  issue,
  version = 3,
  lifecycle = "ANALYSIS",
  role = "A",
  acceptedContractDigest = contractDigest(issue)
}) {
  return {
    schema_version: 1,
    runtime_version: "0.1.0-child1",
    work_item: {
      control_repository: "acme/control",
      issue_number: 42,
      kind: "executable"
    },
    state_version: version,
    lifecycle,
    contract: {
      source_ref: "issue:42",
      accepted_revision: issue.updated_at,
      digest: acceptedContractDigest,
      parent: null
    },
    assignment: role ? assignmentProjection(role, version) : null,
    candidate: {
      kind: "none",
      generation: 0,
      digest: null,
      members: []
    },
    checks: {
      status: "NOT_REQUIRED",
      required_set_digest: null,
      evidence_refs: []
    },
    review: {
      status: "NOT_STARTED",
      candidate_digest: null,
      outcome: null,
      evidence_ref: null,
      author_execution_instances: []
    },
    human_requests: {
      active: [],
      recent_refs: []
    },
    release_authorization: {
      status: "NOT_REQUIRED",
      authorization_id: null,
      candidate_digest: null,
      target_digest: null,
      gate_digest: null,
      context_digest: null,
      request_ref: null,
      response_ref: null,
      human_actor_id: null
    },
    publication: {
      status: "NOT_STARTED",
      candidate_digest: null,
      evidence_refs: [],
      published_identity: null
    },
    run_receipts: {},
    failure: {
      active_ref: null,
      retry_reason: null,
      non_convergent: false
    },
    stop: { record_ref: null },
    updated_by: {
      o_run_id: "o-test",
      transition_id: "T01",
      idempotence_key: "agenti:test"
    }
  };
}

function roleResultBody(result) {
  const withoutDigest = structuredClone(result);
  delete withoutDigest.result_digest;
  const normalized = {
    ...withoutDigest,
    result_digest: core.digest(withoutDigest)
  };
  return [
    core.ROLE_RESULT_MARKER,
    ROLE_RESULT_JSON_START,
    JSON.stringify(normalized),
    ROLE_RESULT_JSON_END
  ].join("\n");
}

function fakeGitHub({ issue, state, comments = [], runIds = [9001] }) {
  let currentState = structuredClone(state);
  let nextCommentId = 700;
  const dispatches = [];
  const runs = new Map();
  const workflowIds = new Map([
    ["acme/control:a.yml", 101],
    ["acme/service-a:d.yml", 102],
    ["acme/service-b:r.yml", 103],
    ["acme/control:p.yml", 104]
  ]);

  const stateComment = {
    id: 500,
    body: core.renderStateComment(currentState),
    user: { id: 9999 },
    created_at: "2026-09-18T12:00:00Z",
    updated_at: "2026-09-18T12:00:00Z"
  };
  const allComments = [stateComment, ...comments];

  const workflowId = (repository, workflow) =>
    workflowIds.get(`${repository}:${workflow}`) ?? 999;

  const gh = {
    getIssue: async () => issue,
    listIssueComments: async () => allComments,
    createIssueComment: async (_repository, _issueNumber, body) => {
      const comment = {
        id: nextCommentId++,
        body,
        user: { id: 9999 },
        created_at: "2026-09-18T12:00:01Z",
        updated_at: "2026-09-18T12:00:01Z"
      };
      allComments.push(comment);
      return comment;
    },
    updateIssueComment: async (_repository, commentId, body) => {
      const comment = allComments.find(
        (item) => String(item.id) === String(commentId)
      );
      if (!comment) throw new Error("comment not found");
      comment.body = body;
      comment.updated_at = "2026-09-18T12:00:02Z";
      if (comment.id === 500) {
        currentState = core.parseStateComment(body);
      }
      return comment;
    },
    listPullRequests: async () => [],
    listCheckRunsForRef: async () => [],
    workflowDispatch: async (repository, workflow, ref, inputs) => {
      const runId = runIds.shift();
      if (!runId) throw new Error("no fake workflow run id available");
      const run = {
        id: runId,
        workflow_id: workflowId(repository, workflow),
        run_attempt: 1,
        event: "workflow_dispatch",
        repository: { full_name: repository }
      };
      runs.set(String(runId), run);
      dispatches.push({
        repository,
        workflow,
        ref,
        inputs,
        run_id: String(runId)
      });
      return {
        workflow_run_id: runId,
        run_url: `https://api.github.test/runs/${runId}`,
        html_url: `https://github.test/runs/${runId}`
      };
    },
    getWorkflow: async (repository, workflow) => ({
      id: workflowId(repository, workflow),
      path: `.github/workflows/${workflow}`
    }),
    getWorkflowRun: async (_repository, runId) => {
      const run = runs.get(String(runId));
      if (!run) throw new Error(`unknown fake run ${runId}`);
      return run;
    },
    addRun({ repository, workflow, runId, runAttempt = 1 }) {
      runs.set(String(runId), {
        id: runId,
        workflow_id: workflowId(repository, workflow),
        run_attempt: runAttempt,
        event: "workflow_dispatch",
        repository: { full_name: repository }
      });
    },
    currentState: () => currentState,
    dispatches,
    comments: allComments
  };

  return gh;
}

function orchestrator({ gh, store, projectProfile }) {
  return new MultiRepoOrchestrator({
    gh,
    profile: projectProfile,
    core,
    transitionTable,
    store,
    trustedResultActorIds: new Set([9999])
  });
}

function workItem() {
  return {
    control_repository: "acme/control",
    issue_number: 42,
    kind: "executable"
  };
}

function assignmentEnvelopeForState(state, projectProfile, issuedAt) {
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
      must_differ_from_execution_instances:
        a.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: a.role === "R"
        ? projectProfile.role_runners.R.independence_mechanism
        : "none"
    },
    completion: {
      result_schema_version: 1,
      result_marker: "agenti-role-result:v1",
      callback_event: "agenti.role-result"
    }
  };
}

test("F1 durable run claim survives total operational DB loss and rejects a second expensive run owner", async () => {
  const issue = {
    number: 42,
    title: "Durable dispatch claim",
    body: "Current contract",
    updated_at: "2026-09-18T12:00:00Z",
    labels: [{ name: "agenti:managed" }]
  };
  const projectProfile = profile();
  const gh = fakeGitHub({
    issue,
    state: baseState({ issue, role: "A", lifecycle: "ANALYSIS" }),
    runIds: [9001, 9002]
  });

  const firstStore = new OperationalStore(":memory:");
  const firstO = orchestrator({
    gh,
    store: firstStore,
    projectProfile
  });

  const first = await firstO.processWorkItem(
    workItem(),
    "2026-09-18T12:01:00Z"
  );
  assert.equal(first.dispatched.dispatched, true);
  assert.equal(String(first.state.assignment.workflow_run_id), "9001");
  assert.equal(first.state.assignment.dispatch_status, "dispatched");
  assert.equal(gh.dispatches.length, 1);
  assert.equal(
    first.state.run_receipts[first.state.assignment.assignment_id]
      .execution_instance_id,
    "github-actions:acme/control:9001:1"
  );

  const dispatchedAssignment = JSON.parse(
    gh.dispatches[0].inputs.assignment_json
  );
  firstStore.close();

  // Complete loss/recreation of the operational SQLite store.
  const freshStore = new OperationalStore(":memory:");
  const restartedO = orchestrator({
    gh,
    store: freshStore,
    projectProfile
  });
  const afterRestart = await restartedO.processWorkItem(
    workItem(),
    "2026-09-18T12:02:00Z"
  );

  assert.equal(gh.dispatches.length, 1);
  assert.equal(afterRestart.dispatched.dispatched, false);
  assert.equal(afterRestart.dispatched.duplicate, true);
  assert.equal(afterRestart.dispatched.durable_claim, true);
  assert.equal(
    String(afterRestart.state.assignment.workflow_run_id),
    "9001"
  );

  const owner = await restartedO.verifyAssignment(
    dispatchedAssignment,
    "acme/control",
    "9001",
    "1"
  );
  assert.equal(owner.valid, true);
  assert.equal(owner.workflow_run_id, "9001");
  assert.equal(gh.currentState().assignment.dispatch_status, "running");

  // Even if a second workflow run exists, it cannot become an applicable
  // provider execution for the already-owned current assignment.
  gh.addRun({
    repository: "acme/control",
    workflow: "a.yml",
    runId: 9002
  });
  const duplicateReceiver = await restartedO.verifyAssignment(
    dispatchedAssignment,
    "acme/control",
    "9002",
    "1"
  );
  assert.equal(duplicateReceiver.valid, false);
  assert.equal(
    duplicateReceiver.reason,
    "ASSIGNMENT_RUN_OWNERSHIP_CONFLICT"
  );

  freshStore.close();
});

test("F1 concurrent receiver preflights serialize from the same unclaimed GitHub state after DB recreation", async () => {
  const issue = {
    number: 42,
    title: "Concurrent receiver claim",
    body: "Stable contract",
    updated_at: "2026-09-18T12:00:00Z",
    labels: [{ name: "agenti:managed" }]
  };
  const projectProfile = profile();
  const state = baseState({
    issue,
    role: "A",
    lifecycle: "ANALYSIS",
    version: 4
  });
  const assignment = assignmentEnvelopeForState(
    state,
    projectProfile,
    "2026-09-18T12:00:00Z"
  );
  const gh = fakeGitHub({
    issue,
    state,
    runIds: []
  });

  gh.addRun({
    repository: "acme/control",
    workflow: "a.yml",
    runId: 9301
  });
  gh.addRun({
    repository: "acme/control",
    workflow: "a.yml",
    runId: 9302
  });

  // Simulate complete loss of the prior operational database. The recreated
  // store starts empty, while GitHub still contains the same unclaimed
  // authoritative assignment.
  const lostStore = new OperationalStore(":memory:");
  lostStore.beginEffect({
    effectKey: `dispatch:${assignment.assignment_id}`,
    kind: "workflow_dispatch"
  });
  lostStore.close();

  const recreatedStore = new OperationalStore(":memory:");
  assert.deepEqual(recreatedStore.counts(), []);
  const restartedO = orchestrator({
    gh,
    store: recreatedStore,
    projectProfile
  });

  // Promise evaluation starts receiver 9301 until its first await; it has
  // already acquired the per-work-item claim mutex. Receiver 9302 therefore
  // races against the same unclaimed GitHub projection while 9301 still owns
  // the critical section.
  const [first, second] = await Promise.all([
    restartedO.verifyAssignment(
      assignment,
      "acme/control",
      "9301",
      "1"
    ),
    restartedO.verifyAssignment(
      assignment,
      "acme/control",
      "9302",
      "1"
    )
  ]);

  const results = [first, second];
  const winners = results.filter((result) => result.valid);
  const losers = results.filter((result) => !result.valid);

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(
    losers[0].reason,
    "ASSIGNMENT_RUN_OWNERSHIP_CONFLICT"
  );

  assert.equal(
    String(losers[0].workflow_run_id),
    String(winners[0].workflow_run_id)
  );

  const winnerRunId = String(winners[0].workflow_run_id);
  assert.ok(["9301", "9302"].includes(winnerRunId));
  assert.equal(
    String(gh.currentState().assignment.workflow_run_id),
    winnerRunId
  );
  assert.equal(
    gh.currentState().assignment.dispatch_status,
    "running"
  );
  assert.equal(
    gh.currentState().run_receipts[assignment.assignment_id]
      .execution_instance_id,
    `github-actions:acme/control:${winnerRunId}:1`
  );

  // A later retry by the losing run observes the durable GitHub owner and
  // still cannot obtain provider-work authority after the mutex is released.
  const losingRunId = winnerRunId === "9301" ? "9302" : "9301";
  const losingRetry = await restartedO.verifyAssignment(
    assignment,
    "acme/control",
    losingRunId,
    "1"
  );
  assert.equal(losingRetry.valid, false);
  assert.equal(
    losingRetry.reason,
    "ASSIGNMENT_RUN_OWNERSHIP_CONFLICT"
  );
  assert.equal(
    String(losingRetry.workflow_run_id),
    winnerRunId
  );

  recreatedStore.close();
});

test("F2 contract drift projects ANALYSIS + canonical A assignment and converges on next reconcile", async () => {
  const issue = {
    number: 42,
    title: "Contract changed",
    body: "New authoritative contract",
    updated_at: "2026-09-18T12:10:00Z",
    labels: [{ name: "agenti:managed" }]
  };
  const oldIssue = {
    ...issue,
    body: "Old accepted contract",
    updated_at: "2026-09-18T12:00:00Z"
  };
  const projectProfile = profile();
  const gh = fakeGitHub({
    issue,
    state: baseState({
      issue: oldIssue,
      acceptedContractDigest: contractDigest(oldIssue),
      lifecycle: "IN_PROGRESS",
      role: "D",
      version: 5
    }),
    runIds: [9101]
  });
  const store = new OperationalStore(":memory:");
  const o = orchestrator({ gh, store, projectProfile });

  const invalidated = await o.processWorkItem(
    workItem(),
    "2026-09-18T12:11:00Z"
  );
  assert.equal(invalidated.action.kind, "INVALIDATE");
  assert.equal(
    invalidated.action.earliest_affected_point,
    "ANALYSIS"
  );
  assert.equal(invalidated.invalidation_projected, true);
  assert.equal(invalidated.safe_hold, false);
  assert.equal(invalidated.state.lifecycle, "ANALYSIS");
  assert.equal(invalidated.state.state_version, 6);
  assert.equal(
    invalidated.state.contract.digest,
    contractDigest(issue)
  );
  assert.equal(invalidated.state.assignment.role, "A");
  assert.equal(
    invalidated.state.assignment.bound_state_version,
    6
  );
  assert.equal(gh.dispatches.length, 0);

  const converged = await o.processWorkItem(
    workItem(),
    "2026-09-18T12:12:00Z"
  );
  assert.equal(converged.action.kind, "NO_OP");
  assert.notEqual(converged.action.kind, "INVALIDATE");
  assert.equal(gh.dispatches.length, 1);
  assert.equal(gh.dispatches[0].inputs.role, "A");
  assert.equal(
    String(converged.state.assignment.workflow_run_id),
    "9101"
  );

  store.close();
});

test("F2 mutable review evidence drift converges to IN_REVIEW and canonical fresh R", async () => {
  const issue = {
    number: 42,
    title: "Review evidence drift",
    body: "Stable contract",
    updated_at: "2026-09-18T12:00:00Z",
    labels: [{ name: "agenti:managed" }]
  };
  const projectProfile = profile();

  const reviewResult = {
    schema_version: 1,
    role: "R",
    status: "COMPLETED",
    result_type: "REVIEWER",
    evidence_refs: [],
    human_request: null,
    retry_or_failure: null,
    trusted: {
      assignment_id: "asg-old-review",
      observed_state_version: 6,
      observed_fingerprint: core.digest({ old: "review" }),
      execution_attestation: {
        adapter_id: "github-workflow",
        adapter_version: "1",
        execution_instance_id:
          "github-actions:acme/service-b:88:1",
        platform_run: {
          provider: "github-actions",
          run_id: "88",
          run_attempt: 1,
          job_or_worker_id: "review"
        },
        provider_session: {
          mode: "fresh",
          provider_session_id: null
        },
        issued_for_assignment: "asg-old-review",
        attested_by: "deterministic-wrapper"
      },
      candidate: null
    },
    payload: {
      reviewed_candidate_digest: core.digest({ candidate: "old" }),
      reviewed_contract_digest: contractDigest(issue),
      outcome: "APPROVED",
      findings: [],
      correction_owner: "NONE"
    }
  };
  const reviewBody = roleResultBody(reviewResult);
  const parsedReview = (() => {
    const start = reviewBody.indexOf(ROLE_RESULT_JSON_START);
    const end = reviewBody.indexOf(ROLE_RESULT_JSON_END);
    return JSON.parse(
      reviewBody.slice(
        start + ROLE_RESULT_JSON_START.length,
        end
      ).trim()
    );
  })();

  const reviewContext = core.digest({
    role: "R",
    contract_digest: contractDigest(issue),
    candidate_digest: null
  });
  const reviewBinding = core.acceptMutableEvidence({
    evidence_kind: "role_result_comment",
    repository: "acme/control",
    object_id: 601,
    actor_id: 9999,
    updated_at: "2026-09-18T12:01:00Z",
    normalized_payload: parsedReview,
    normalized_outcome: "APPROVED",
    context_binding: reviewContext
  });

  const state = baseState({
    issue,
    lifecycle: "APPROVED",
    role: "P",
    version: 7
  });
  state.review = {
    status: "CURRENT",
    candidate_digest: null,
    outcome: "APPROVED",
    evidence_ref: reviewBinding,
    author_execution_instances: [
      "github-actions:acme/service-a:41:1"
    ]
  };

  const driftedReviewComment = {
    id: 601,
    body: reviewBody,
    user: { id: 9999 },
    created_at: "2026-09-18T12:01:00Z",
    // Edit makes accepted revision drift while normalized payload remains same.
    updated_at: "2026-09-18T12:05:00Z"
  };

  const gh = fakeGitHub({
    issue,
    state,
    comments: [driftedReviewComment],
    runIds: [9201]
  });
  const store = new OperationalStore(":memory:");
  const o = orchestrator({ gh, store, projectProfile });

  const invalidated = await o.processWorkItem(
    workItem(),
    "2026-09-18T12:06:00Z"
  );
  assert.equal(invalidated.action.kind, "INVALIDATE");
  assert.equal(
    invalidated.action.earliest_affected_point,
    "IN_REVIEW"
  );
  assert.equal(invalidated.state.lifecycle, "IN_REVIEW");
  assert.equal(invalidated.state.review.status, "STALE");
  assert.equal(invalidated.state.review.evidence_ref, null);
  assert.equal(invalidated.state.assignment.role, "R");
  assert.deepEqual(
    invalidated.state.assignment.must_differ_from_execution_instances,
    ["github-actions:acme/service-a:41:1"]
  );

  const converged = await o.processWorkItem(
    workItem(),
    "2026-09-18T12:07:00Z"
  );
  assert.equal(converged.action.kind, "NO_OP");
  assert.equal(gh.dispatches.length, 1);
  assert.equal(gh.dispatches[0].inputs.role, "R");

  store.close();
});

test("F2 mutable H release evidence drift converges to APPROVED pending release gate without repeat INVALIDATE", async () => {
  const issue = {
    number: 42,
    title: "Human evidence drift",
    body: "Stable contract",
    updated_at: "2026-09-18T12:00:00Z",
    labels: [{ name: "agenti:managed" }]
  };
  const projectProfile = profile({ releaseRequired: true });
  const state = baseState({
    issue,
    lifecycle: "APPROVED",
    role: "P",
    version: 9
  });

  const contextDigest = core.digest({
    candidate_digest: null,
    target_digest: core.digest({ target: "production" }),
    gate_digest: core.digest([])
  });
  const currentObject = {
    evidence_kind: "issue_comment",
    repository: "acme/control",
    object_id: 602,
    actor_id: 1001,
    updated_at: "2026-09-18T12:01:00Z",
    normalized_payload: {
      command: "release-grant",
      authorization_id: "ra-1"
    },
    normalized_outcome: "GRANTED"
  };
  const hBinding = core.acceptMutableEvidence({
    ...currentObject,
    context_binding: contextDigest
  });

  state.release_authorization = {
    status: "GRANTED",
    authorization_id: "ra-1",
    candidate_digest: null,
    target_digest: core.digest({
      target: "production",
      boundary_operations: ["MERGE"]
    }),
    gate_digest: core.digest([]),
    context_digest: contextDigest,
    request_ref: null,
    response_ref: hBinding,
    human_actor_id: 1001
  };
  state.publication = {
    status: "ASSIGNED",
    candidate_digest: null,
    evidence_refs: [],
    published_identity: null
  };

  const editedHumanComment = {
    id: 602,
    body: "/agenti release reject ra-1",
    user: { id: 1001 },
    created_at: "2026-09-18T12:01:00Z",
    updated_at: "2026-09-18T12:05:00Z"
  };

  const gh = fakeGitHub({
    issue,
    state,
    comments: [editedHumanComment],
    runIds: []
  });
  const store = new OperationalStore(":memory:");
  const o = orchestrator({ gh, store, projectProfile });

  const invalidated = await o.processWorkItem(
    workItem(),
    "2026-09-18T12:06:00Z"
  );
  assert.equal(invalidated.action.kind, "INVALIDATE");
  assert.equal(
    invalidated.action.earliest_affected_point,
    "APPROVED"
  );
  assert.equal(invalidated.state.lifecycle, "APPROVED");
  assert.equal(invalidated.state.assignment, null);
  assert.equal(
    invalidated.state.release_authorization.status,
    "PENDING"
  );
  assert.equal(
    invalidated.state.release_authorization.response_ref,
    null
  );
  assert.equal(invalidated.state.publication.status, "STALE");

  const converged = await o.processWorkItem(
    workItem(),
    "2026-09-18T12:07:00Z"
  );
  assert.equal(converged.action.kind, "NO_OP");
  assert.notEqual(converged.action.kind, "INVALIDATE");
  assert.equal(converged.state.lifecycle, "APPROVED");
  assert.equal(
    converged.state.release_authorization.status,
    "PENDING"
  );
  assert.equal(gh.dispatches.length, 0);

  store.close();
});
