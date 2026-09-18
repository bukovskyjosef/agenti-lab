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
  validateSchema
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
