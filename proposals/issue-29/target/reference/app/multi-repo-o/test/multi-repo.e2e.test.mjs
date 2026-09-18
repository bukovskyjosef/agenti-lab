import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as core from "../../../core/index.mjs";
import { reconstructAuthority } from "../src/authority.mjs";
import { projectAdapterState } from "../src/state-projection.mjs";
import { OperationalStore } from "../src/store.mjs";

const transitions = JSON.parse(await readFile(
  new URL("../../../core/transitions.json", import.meta.url),
  "utf8"
));

const sha = (letter) => letter.repeat(40);
const profile = {
  schema_version: 1,
  runtime_version: "0.1.0-child1",
  repository_topology: "multi-repo",
  control_repository: "acme/control",
  implementation_repositories: ["acme/service-a", "acme/service-b"],
  human: { principals: [{ actor_id: 1001, login: "human" }] },
  required_checks: ["unit"],
  role_runners: {
    A: { adapter_id: "github-workflow://acme/control/a.yml", adapter_version: "1", capability_profile: "A_READ_ANALYZE" },
    D: { adapter_id: "github-workflow://acme/service-a/d.yml", adapter_version: "1", capability_profile: "D_WORKSPACE_WRITE" },
    R: { adapter_id: "github-workflow://acme/service-b/r.yml", adapter_version: "1", capability_profile: "R_READ_REVIEW", independence_mechanism: "fresh-wrapper" },
    P: { adapter_id: "github-workflow://acme/control/p.yml", adapter_version: "1", capability_profile: "P_PUBLISH" }
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
        metadata: "read", contents: "read", issues: "write",
        pull_requests: "read", checks: "read", actions: "write", deployments: "read"
      }
    },
    P: {
      identity_id: "p",
      capability_profile: "P_PUBLISH",
      dispatch_mechanism: "none",
      permissions: { contents: "write" }
    }
  },
  release_authorization: { required: true, target: "production" },
  publication: { boundary_operations: ["MERGE"] },
  state_projection: { marker: "agenti-state:v1", single_writer: "O" }
};

function fakeGitHub() {
  const issue = {
    number: 42,
    title: "Ship composite candidate",
    body: "Contract body",
    updated_at: "2026-09-18T12:00:00Z",
    labels: [{ name: "agenti:managed" }]
  };
  const contractDigest = core.digest({ title: issue.title, body: issue.body });
  const oldCandidate = {
    kind: "composite",
    generation: 1,
    members: [
      { repository: "acme/service-a", pr_number: 10, head_sha: sha("a"), base_ref_or_sha: "main" },
      { repository: "acme/service-b", pr_number: 20, head_sha: sha("b"), base_ref_or_sha: "main" }
    ]
  };
  oldCandidate.digest = core.candidateDigest(oldCandidate);
  const bindingDigest = core.digest({ old: oldCandidate.digest });

  let state = {
    schema_version: 1,
    runtime_version: "0.1.0-child1",
    work_item: {
      control_repository: "acme/control",
      issue_number: 42,
      kind: "executable"
    },
    state_version: 7,
    lifecycle: "IN_REVIEW",
    contract: {
      source_ref: "issue:42",
      accepted_revision: issue.updated_at,
      digest: contractDigest,
      parent: null
    },
    assignment: {
      assignment_id: "asg-current-review",
      role: "R",
      purpose: "INDEPENDENT_REVIEW",
      issued_from_state_version: 6,
      bound_state_version: 7,
      fingerprint: core.digest({ fp: 7 }),
      capability_profile: "R_READ_REVIEW",
      dispatch_status: "running",
      workflow_run_id: null,
      must_differ_from_execution_instances: ["github-actions:acme/service-a:9:1"]
    },
    candidate: oldCandidate,
    checks: {
      status: "PASSED",
      required_set_digest: core.digest(["unit"]),
      evidence_refs: []
    },
    review: {
      status: "CURRENT",
      candidate_digest: oldCandidate.digest,
      outcome: "APPROVED",
      evidence_ref: null,
      author_execution_instances: ["github-actions:acme/service-a:9:1"]
    },
    human_requests: { active: [], recent_refs: [] },
    release_authorization: {
      status: "PENDING",
      authorization_id: "ra-existing",
      candidate_digest: oldCandidate.digest,
      target_digest: bindingDigest,
      gate_digest: bindingDigest,
      context_digest: bindingDigest,
      request_ref: null,
      response_ref: null,
      human_actor_id: null
    },
    publication: {
      status: "ASSIGNED",
      candidate_digest: oldCandidate.digest,
      evidence_refs: [],
      published_identity: null
    },
    run_receipts: {},
    failure: { active_ref: null, retry_reason: null, non_convergent: false },
    stop: { record_ref: null },
    updated_by: {
      o_run_id: "o-7",
      transition_id: "T08",
      idempotence_key: "agenti:old"
    }
  };

  const comments = [{
    id: 500,
    body: core.renderStateComment(state),
    user: { id: 999 },
    created_at: "2026-09-18T12:00:01Z",
    updated_at: "2026-09-18T12:00:01Z"
  }];

  const prs = {
    "acme/service-a": [{
      number: 10,
      body: "<!-- agenti-control: acme/control#42 -->",
      head: { sha: sha("c") },
      base: { ref: "main", sha: sha("d") }
    }],
    "acme/service-b": [{
      number: 20,
      body: "<!-- agenti-control: acme/control#42 -->",
      head: { sha: sha("b") },
      base: { ref: "main", sha: sha("e") }
    }]
  };

  const gh = {
    getIssue: async () => issue,
    listIssueComments: async () => comments,
    listPullRequests: async (repository) => prs[repository] ?? [],
    listCheckRunsForRef: async (_repository, ref) => [{
      id: Number.parseInt(ref.slice(0, 6), 16) || 1,
      name: "unit",
      status: "completed",
      conclusion: "success"
    }],
    replaceState(next) {
      state = next;
      comments[0] = {
        ...comments[0],
        body: core.renderStateComment(next),
        updated_at: "2026-09-18T12:05:00Z"
      };
    },
    currentState() { return state; }
  };
  return gh;
}

test("two implementation repositories rebind through exact Child #21 T19 and restart from GitHub", async () => {
  const gh = fakeGitHub();
  const workItem = {
    control_repository: "acme/control",
    issue_number: 42,
    kind: "executable"
  };

  const before = await reconstructAuthority({
    gh,
    profile,
    workItem,
    core,
    trustedResultActorIds: new Set([9999])
  });

  assert.equal(before.snapshot.candidate.members.length, 2);
  assert.equal(before.snapshot.composite.changed, true);

  const action = core.evaluate(
    profile,
    before.state,
    before.snapshot,
    { observed_at: "2026-09-18T12:01:00Z" },
    transitions
  );
  assert.equal(action.transition_id, "T19");

  const rebound = projectAdapterState({
    core,
    state: before.state,
    action,
    snapshot: before.snapshot,
    profile,
    oRunId: "o-t19"
  });

  assert.equal(rebound.candidate.members.length, 2);
  assert.equal(rebound.candidate.digest, before.snapshot.candidate.digest);
  assert.equal(rebound.assignment, null);
  assert.equal(rebound.review.status, "STALE");
  assert.equal(rebound.release_authorization.status, "STALE");
  assert.equal(rebound.publication.status, "STALE");

  gh.replaceState(rebound);

  const lostOperationalStore = new OperationalStore(":memory:");
  const afterRestart = await reconstructAuthority({
    gh,
    profile,
    workItem,
    core,
    trustedResultActorIds: new Set([9999])
  });
  assert.equal(afterRestart.state.candidate.digest, rebound.candidate.digest);
  assert.equal(afterRestart.snapshot.composite.changed, false);
  assert.equal(afterRestart.snapshot.candidate.members.length, 2);
  assert.deepEqual(lostOperationalStore.counts(), []);
  lostOperationalStore.close();
});
