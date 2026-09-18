import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptMutableEvidence,
  candidateDigest,
  digest,
  doctor,
  evaluate,
  parseStateComment,
  reconstructState,
  renderStateComment,
  runEligibility,
  verifyAcceptedEvidence,
  validateSchema,
  projectAction
} from "../core/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const profile = await readJson("conformance/fixtures/project-profile.valid.json");
const baseState = await readJson("conformance/fixtures/base-state.json");
const transitionTable = await readJson("core/transitions.json");
const schemas = {
  projectProfile: await readJson("schemas/project-profile.schema.json"),
  workflowState: await readJson("schemas/workflow-state.schema.json"),
  assignment: await readJson("schemas/assignment.schema.json"),
  roleResult: await readJson("schemas/role-result.schema.json")
};

test("doctor validates schemas, transitions, O/P split and R independence config", () => {
  const result = doctor({
    projectProfile: profile,
    projectProfileSchema: schemas.projectProfile,
    schemas,
    transitionTable
  });
  assert.deepEqual(result, { ok: true, errors: [] });

  const bad = structuredClone(profile);
  bad.identities.O.permissions.contents = "write";
  const badResult = doctor({
    projectProfile: bad,
    projectProfileSchema: schemas.projectProfile,
    schemas,
    transitionTable
  });
  assert.equal(badResult.ok, false);
  assert.match(badResult.errors.join("\n"), /Contents write/);
});


test("new managed intake emits explicit schema-valid A assignment", () => {
  const action = evaluate(
    profile,
    null,
    {
      intake: { accepted: true },
      work_item: {
        control_repository: "example/product",
        issue_number: 99,
        kind: "executable"
      },
      contract_digest: digest({ issue: 99 }),
      contract_source_ref: "issue:99",
      contract_revision: "2026-09-18T10:00:00Z",
      context_entrypoints: [
        { kind: "work_item", ref: "example/product#99" },
        { kind: "project_profile", ref: ".agenti/project-profile.yml" }
      ]
    },
    { observed_at: "2026-09-18T10:00:00Z" },
    transitionTable
  );

  assert.equal(action.transition_id, "T01");
  assert.equal(action.assignment.role, "A");
  assert.equal(action.assignment.purpose, "SHAPE_INTENT");
  assert.deepEqual(validateSchema(action.assignment, schemas.assignment), []);
});

test("bounded O projection round-trips and cold-reconstructs", () => {
  const rendered = renderStateComment(baseState);
  assert.deepEqual(parseStateComment(rendered), baseState);
  assert.deepEqual(reconstructState(rendered, schemas.workflowState), baseState);
});

test("mutable accepted evidence detects edits and context staleness", () => {
  const context = digest({ candidate: "abc", state: 3 });
  const source = {
    evidence_kind: "issue_comment",
    repository: "example/product",
    object_id: 77,
    actor_id: 1001,
    updated_at: "2026-09-18T09:10:00Z",
    normalized_payload: { command: "grant", id: "RA-1" },
    normalized_outcome: "GRANTED"
  };
  const binding = acceptMutableEvidence({ ...source, context_binding: context });

  assert.equal(
    verifyAcceptedEvidence(binding, source, context).status,
    "CURRENT"
  );

  const edited = {
    ...source,
    updated_at: "2026-09-18T09:11:00Z",
    normalized_payload: { command: "reject", id: "RA-1" },
    normalized_outcome: "REJECTED"
  };
  assert.deepEqual(
    verifyAcceptedEvidence(binding, edited, context),
    {
      status: "DRIFTED",
      reason: "ACCEPTED_MUTABLE_EVIDENCE_CHANGED",
      earliest_affected_point: "SOURCE_AUTHORITY"
    }
  );

  assert.equal(
    verifyAcceptedEvidence(binding, source, digest({ candidate: "new" })).status,
    "STALE"
  );
});

test("run eligibility suppresses duplicate no-op but allows first/change/retry", () => {
  const fp = digest({ state: 1 });
  assert.equal(runEligibility({ current_fingerprint: fp }).reason, "FIRST_RUN");
  assert.equal(
    runEligibility({ last_completed_fingerprint: fp, current_fingerprint: fp }).eligible,
    false
  );
  assert.equal(
    runEligibility({
      last_completed_fingerprint: fp,
      current_fingerprint: digest({ state: 2 })
    }).reason,
    "CHANGED_STATE"
  );
  assert.equal(
    runEligibility({
      last_completed_fingerprint: fp,
      current_fingerprint: fp,
      objective_retry_reason: "TRANSIENT_EXTERNAL_FAILURE"
    }).reason,
    "OBJECTIVE_RETRY_PROGRESS"
  );
});

test("candidate digest is stable across member ordering", () => {
  const a = {
    kind: "composite",
    members: [
      { repository: "x/b", pr_number: 2, head_sha: "b".repeat(40) },
      { repository: "x/a", pr_number: 1, head_sha: "a".repeat(40) }
    ]
  };
  const b = { ...a, members: [...a.members].reverse() };
  assert.equal(candidateDigest(a), candidateDigest(b));
});

test("Stopped rejects ordinary wakes and only explicit reopen produces T17", () => {
  const stopped = structuredClone(baseState);
  stopped.lifecycle = "STOPPED";

  const ordinary = evaluate(
    profile,
    stopped,
    {},
    { observed_at: "2026-09-18T10:00:00Z" },
    transitionTable
  );
  assert.deepEqual(ordinary, { kind: "NO_OP", reason: "STOPPED_TERMINAL_GUARD" });

  const reopened = evaluate(
    profile,
    stopped,
    {
      reopen_authority: { valid: true, binding: "reopen:1" },
      earliest_lifecycle: "ANALYSIS"
    },
    { observed_at: "2026-09-18T10:01:00Z" },
    transitionTable
  );
  assert.equal(reopened.transition_id, "T17");
  assert.equal(reopened.lifecycle, "ANALYSIS");
});

test("A READY deterministically produces explicit D assignment", () => {
  const result = {
    role: "A",
    status: "COMPLETED",
    result_digest: digest({ result: "a-ready" }),
    payload: { disposition: "READY" }
  };

  const action = evaluate(
    profile,
    baseState,
    {
      role_result: result,
      dor_passes: true,
      pending_human_request: false,
      context_entrypoints: [
        { kind: "work_item", ref: "example/product#42" },
        { kind: "project_profile", ref: ".agenti/project-profile.yml" }
      ]
    },
    { observed_at: "2026-09-18T10:02:00Z" },
    transitionTable
  );

  assert.equal(action.transition_id, "T02");
  assert.equal(action.assignment.role, "D");
  assert.equal(action.assignment.purpose, "IMPLEMENT_CURRENT_CONTRACT");
  assert.match(action.assignment.assignment_id, /^asg-/);
});

function buildPendingReleaseState() {
  const state = structuredClone(baseState);
  state.lifecycle = "IN_REVIEW";
  state.candidate = {
    kind: "single",
    generation: 1,
    digest: digest({ sha: "d".repeat(40) }),
    members: [
      {
        repository: "example/product",
        pr_number: 11,
        head_sha: "d".repeat(40),
        base_ref_or_sha: "main"
      }
    ]
  };

  const targetDigest = digest({ target: "production" });
  const gateDigest = digest({ checks: ["unit"], review: "approved" });
  const approvedR = {
    role: "R",
    status: "COMPLETED",
    result_digest: digest({ result: "r-approved-release" }),
    payload: {
      outcome: "APPROVED",
      correction_owner: "NONE"
    }
  };

  const t08 = evaluate(
    profile,
    state,
    {
      role_result: approvedR,
      required_gates_current: true,
      required_evidence_digest: gateDigest,
      target_digest: targetDigest
    },
    { observed_at: "2026-09-18T10:40:00Z" },
    transitionTable
  );

  assert.equal(t08.transition_id, "T08");
  assert.equal(t08.release_authorization.status, "PENDING");

  const projected = projectAction(state, t08, "o-run-t08");
  return { state: projected, targetDigest, gateDigest };
}

function exactGrantSnapshot(releaseState, targetDigest, gateDigest) {
  const authorization = releaseState.release_authorization;
  const currentResponse = {
    evidence_kind: "issue_comment",
    repository: "example/product",
    object_id: 990,
    actor_id: 1001,
    updated_at: "2026-09-18T10:41:00Z",
    normalized_payload: {
      command: "release-grant",
      authorization_id: authorization.authorization_id
    },
    normalized_outcome: "GRANTED"
  };
  const responseBinding = acceptMutableEvidence({
    ...currentResponse,
    context_binding: authorization.context_digest
  });

  return {
    required_gates_current: true,
    required_evidence_digest: gateDigest,
    target_digest: targetDigest,
    release_response: {
      status: "GRANTED",
      authorization_id: authorization.authorization_id,
      candidate_digest: releaseState.candidate.digest,
      target_digest: targetDigest,
      gate_digest: gateDigest,
      context_digest: authorization.context_digest,
      response_binding: responseBinding,
      current_response: currentResponse
    }
  };
}

test("F2 positive: T09 dispatches P only for exact current release grant", () => {
  const { state, targetDigest, gateDigest } = buildPendingReleaseState();
  const snapshot = exactGrantSnapshot(state, targetDigest, gateDigest);

  const t09 = evaluate(
    profile,
    state,
    snapshot,
    { observed_at: "2026-09-18T10:42:00Z" },
    transitionTable
  );

  assert.equal(t09.transition_id, "T09");
  assert.equal(t09.assignment.role, "P");
  assert.equal(t09.assignment.state.version, state.state_version + 1);
  assert.equal(t09.release_authorization.status, "GRANTED");

  const projected = projectAction(state, t09, "o-run-t09");
  assert.equal(projected.assignment.bound_state_version, projected.state_version);
  assert.equal(projected.release_authorization.status, "GRANTED");
});

test("F2 candidate drift invalidates release grant and never dispatches P", () => {
  const { state, targetDigest, gateDigest } = buildPendingReleaseState();
  const snapshot = exactGrantSnapshot(state, targetDigest, gateDigest);
  snapshot.release_response.candidate_digest = digest({ candidate: "other" });

  const action = evaluate(
    profile,
    state,
    snapshot,
    { observed_at: "2026-09-18T10:43:00Z" },
    transitionTable
  );

  assert.equal(action.kind, "INVALIDATE");
  assert.equal(action.reason, "RELEASE_CANDIDATE_OR_AUTHORIZATION_DRIFT");
  assert.equal(action.earliest_affected_point, "IN_REVIEW");
  assert.equal(action.assignment, undefined);
});

test("F2 target drift invalidates release grant and never dispatches P", () => {
  const { state, targetDigest, gateDigest } = buildPendingReleaseState();
  const snapshot = exactGrantSnapshot(state, targetDigest, gateDigest);
  snapshot.target_digest = digest({ target: "different-production" });

  const action = evaluate(
    profile,
    state,
    snapshot,
    { observed_at: "2026-09-18T10:44:00Z" },
    transitionTable
  );

  assert.equal(action.kind, "INVALIDATE");
  assert.equal(action.reason, "RELEASE_TARGET_DRIFT");
  assert.equal(action.assignment, undefined);
});

test("F2 gate drift invalidates release grant and never dispatches P", () => {
  const { state, targetDigest, gateDigest } = buildPendingReleaseState();
  const snapshot = exactGrantSnapshot(state, targetDigest, gateDigest);
  snapshot.required_gates_current = false;

  const action = evaluate(
    profile,
    state,
    snapshot,
    { observed_at: "2026-09-18T10:45:00Z" },
    transitionTable
  );

  assert.equal(action.kind, "INVALIDATE");
  assert.equal(action.reason, "RELEASE_GATE_DRIFT");
  assert.equal(action.earliest_affected_point, "IN_REVIEW");
  assert.equal(action.assignment, undefined);
});

test("F2 mutable H response drift invalidates release grant and never dispatches P", () => {
  const { state, targetDigest, gateDigest } = buildPendingReleaseState();
  const snapshot = exactGrantSnapshot(state, targetDigest, gateDigest);
  snapshot.release_response.current_response = {
    ...snapshot.release_response.current_response,
    updated_at: "2026-09-18T10:46:00Z",
    normalized_payload: {
      command: "release-reject",
      authorization_id: state.release_authorization.authorization_id
    },
    normalized_outcome: "REJECTED"
  };

  const action = evaluate(
    profile,
    state,
    snapshot,
    { observed_at: "2026-09-18T10:46:30Z" },
    transitionTable
  );

  assert.equal(action.kind, "INVALIDATE");
  assert.equal(action.reason, "ACCEPTED_MUTABLE_EVIDENCE_CHANGED");
  assert.equal(action.evidence_status, "DRIFTED");
  assert.equal(action.assignment, undefined);
});

test("multi-repo candidate change uses mechanical T19 rebind", () => {
  const multiProfile = structuredClone(profile);
  multiProfile.repository_topology = "multi-repo";
  multiProfile.implementation_repositories = ["example/api", "example/web"];

  const state = structuredClone(baseState);
  state.lifecycle = "IN_REVIEW";

  const candidate = {
    kind: "composite",
    generation: 2,
    digest: digest({ members: ["api", "web"] }),
    members: [
      { repository: "example/api", pr_number: 1, head_sha: "a".repeat(40), base_ref_or_sha: "main" },
      { repository: "example/web", pr_number: 2, head_sha: "b".repeat(40), base_ref_or_sha: "main" }
    ]
  };

  const action = evaluate(
    multiProfile,
    state,
    { composite: { changed: true, candidate } },
    { observed_at: "2026-09-18T10:03:00Z" },
    transitionTable
  );

  assert.equal(action.transition_id, "T19");
  assert.equal(action.invalidate_dependent_gates_only, true);
  assert.equal(action.candidate.digest, candidate.digest);
});
