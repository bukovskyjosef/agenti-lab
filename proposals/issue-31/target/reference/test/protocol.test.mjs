import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  digest,
  generateAssignment,
  normalizeRoleResult,
  applyRoleResult,
  verifyExecutionIndependence,
  validateSchema,
  evaluate,
  projectAction
} from "../core/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const profile = await readJson("conformance/fixtures/project-profile.valid.json");
const baseState = await readJson("conformance/fixtures/base-state.json");
const roleResultSchema = await readJson("schemas/role-result.schema.json");
const assignmentSchema = await readJson("schemas/assignment.schema.json");

function reviewerAssignment(authorInstance = "exec-author-1") {
  const state = structuredClone(baseState);
  state.lifecycle = "IN_REVIEW";
  state.candidate = {
    kind: "single",
    generation: 1,
    digest: digest({ sha: "a".repeat(40) }),
    members: [
      {
        repository: "example/product",
        pr_number: 7,
        head_sha: "a".repeat(40),
        base_ref_or_sha: "main"
      }
    ]
  };

  const assignment = generateAssignment({
    state,
    role: "R",
    purpose: "INDEPENDENT_REVIEW",
    issued_at: "2026-09-18T10:00:00Z",
    context_entrypoints: [{ kind: "work_item", ref: "example/product#42" }],
    independence: {
      required: true,
      must_differ_from_execution_instances: [authorInstance],
      enforcement_mechanism: "fresh-wrapper"
    }
  });

  assert.deepEqual(validateSchema(assignment, assignmentSchema), []);

  state.assignment = {
    assignment_id: assignment.assignment_id,
    role: "R",
    purpose: assignment.purpose,
    issued_from_state_version: state.state_version,
    bound_state_version: assignment.state.version,
    fingerprint: assignment.state.fingerprint,
    capability_profile: assignment.capability_profile,
    dispatch_status: "running",
    workflow_run_id: "200",
    must_differ_from_execution_instances: [authorInstance]
  };

  return { state, assignment };
}

function trustedFacts(assignment, executionInstance = "exec-review-2", mode = "fresh") {
  return {
    assignment_id: assignment.assignment_id,
    claim_id: "clm-test-current",
    claim_generation: 1,
    observed_state_version: assignment.state.version,
    observed_fingerprint: assignment.state.fingerprint,
    execution_attestation: {
      adapter_id: "fake",
      adapter_version: "1",
      execution_instance_id: executionInstance,
      platform_run: {
        provider: "github-actions",
        run_id: "200",
        run_attempt: 1,
        job_or_worker_id: "review"
      },
      provider_session: {
        mode,
        provider_session_id: null
      },
      issued_for_assignment: assignment.assignment_id,
      attested_by: "deterministic-wrapper"
    },
    candidate: null
  };
}

function approvedProposal(candidateDigest, contractDigest) {
  return {
    role: "R",
    status: "COMPLETED",
    result_type: "REVIEWER",
    evidence_refs: [],
    human_request: null,
    retry_or_failure: null,
    payload: {
      reviewed_candidate_digest: candidateDigest,
      reviewed_contract_digest: contractDigest,
      outcome: "APPROVED",
      findings: [],
      correction_owner: "NONE"
    }
  };
}

test("trusted distinct fresh R execution is accepted", () => {
  const { state, assignment } = reviewerAssignment();
  const proposal = approvedProposal(state.candidate.digest, state.contract.digest);
  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: trustedFacts(assignment),
    assignment,
    roleResultSchema
  });

  assert.equal(normalized.role, "R");
  assert.match(normalized.result_digest, /^sha256:/);

  const applied = applyRoleResult({
    state,
    assignment,
    normalizedResult: normalized,
    projectProfile: profile
  });
  assert.equal(applied.accepted, true);
});

test("R evidence is rejected when execution instance collides with D author", () => {
  const { state, assignment } = reviewerAssignment("exec-author-1");
  const proposal = approvedProposal(state.candidate.digest, state.contract.digest);
  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: trustedFacts(assignment, "exec-author-1"),
    assignment,
    roleResultSchema
  });

  assert.deepEqual(
    verifyExecutionIndependence({
      assignment,
      normalizedResult: normalized,
      projectProfile: profile
    }),
    {
      valid: false,
      reason: "AUTHOR_REVIEWER_EXECUTION_INSTANCE_COLLISION"
    }
  );

  assert.equal(
    applyRoleResult({
      state,
      assignment,
      normalizedResult: normalized,
      projectProfile: profile
    }).accepted,
    false
  );
});

test("fresh-execution independence mechanism rejects resumed R session", () => {
  const { assignment } = reviewerAssignment();
  const proposal = approvedProposal(
    digest({ candidate: "x" }),
    baseState.contract.digest
  );
  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: trustedFacts(assignment, "exec-review-3", "resumed"),
    assignment,
    roleResultSchema
  });

  assert.equal(
    verifyExecutionIndependence({
      assignment,
      normalizedResult: normalized,
      projectProfile: profile
    }).reason,
    "FRESH_REVIEW_EXECUTION_REQUIRED"
  );
});

test("provider cannot inject trusted envelope metadata", () => {
  const { assignment } = reviewerAssignment();
  const proposal = {
    ...approvedProposal(digest({ candidate: "x" }), baseState.contract.digest),
    trusted: { execution_instance_id: "self-reported" }
  };

  assert.throws(
    () => normalizeRoleResult({
      proposal,
      trustedFacts: trustedFacts(assignment),
      assignment,
      roleResultSchema
    }),
    /non-allowlisted field/
  );
});

test("R APPROVED cannot carry blocking finding or correction owner", () => {
  const { assignment, state } = reviewerAssignment();
  const proposal = approvedProposal(state.candidate.digest, state.contract.digest);
  proposal.payload.correction_owner = "D";
  proposal.payload.findings = [
    {
      finding_id: "F1",
      severity: "MAJOR",
      disposition: "DEFECT",
      summary: "blocking",
      evidence_refs: [],
      affected_binding: state.candidate.digest
    }
  ];

  assert.throws(
    () => normalizeRoleResult({
      proposal,
      trustedFacts: trustedFacts(assignment),
      assignment,
      roleResultSchema
    }),
    /APPROVED requires/
  );
});


test("F1 round-trip: T02 assignment binds post-transition N+1 and legitimate D result is accepted", async () => {
  const transitionTable = await readJson("core/transitions.json");
  const state = structuredClone(baseState);
  const aResult = {
    role: "A",
    status: "COMPLETED",
    result_digest: digest({ result: "ready-for-d" }),
    payload: { disposition: "READY" }
  };

  const action = evaluate(
    profile,
    state,
    {
      role_result: aResult,
      dor_passes: true,
      pending_human_request: false,
      context_entrypoints: [{ kind: "work_item", ref: "example/product#42" }]
    },
    { observed_at: "2026-09-18T10:30:00Z" },
    transitionTable
  );

  assert.equal(action.transition_id, "T02");
  assert.equal(action.assignment.state.version, state.state_version + 1);

  const projected = projectAction(state, action, "o-run-f1");
  assert.equal(projected.state_version, 4);
  assert.equal(projected.assignment.issued_from_state_version, 3);
  assert.equal(projected.assignment.bound_state_version, 4);
  assert.equal(projected.assignment.fingerprint, action.assignment.state.fingerprint);

  const proposal = {
    role: "D",
    status: "COMPLETED",
    result_type: "DEVELOPER",
    evidence_refs: [],
    human_request: null,
    retry_or_failure: null,
    payload: {
      work_contract_digest: projected.contract.digest,
      base: { repository: "example/product", ref_or_sha: "main" },
      change_artifact: {
        format: "unified-diff",
        artifact_ref: "model:ignored",
        sha256: digest({ ignored: true })
      },
      requested_branch_key: "issue-42",
      author_validation: { refs: [], summary: "ok" },
      blockers: []
    }
  };

  const wrapperArtifact = {
    format: "unified-diff",
    artifact_ref: "wrapper:f1-roundtrip",
    sha256: digest({ artifact: "f1-roundtrip" })
  };

  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: {
      claim_id: "clm-test-current",
      claim_generation: 1,
      assignment_id: action.assignment.assignment_id,
      observed_state_version: action.assignment.state.version,
      observed_fingerprint: action.assignment.state.fingerprint,
      execution_attestation: {
        adapter_id: "fake",
        adapter_version: "1",
        execution_instance_id: "exec-d-f1",
        platform_run: {
          provider: "github-actions",
          run_id: "301",
          run_attempt: 1,
          job_or_worker_id: "developer"
        },
        provider_session: { mode: "fresh", provider_session_id: null },
        issued_for_assignment: action.assignment.assignment_id,
        attested_by: "deterministic-wrapper"
      },
      candidate: null,
      change_artifact: wrapperArtifact,
      author_validation_refs: []
    },
    assignment: action.assignment,
    roleResultSchema
  });

  assert.deepEqual(
    applyRoleResult({
      state: projected,
      assignment: action.assignment,
      normalizedResult: normalized,
      projectProfile: profile
    }),
    {
      accepted: true,
      reason: "CURRENT_SCHEMA_VALID_RESULT",
      routing_proposal: {
        role: "D",
        status: "COMPLETED",
        result_type: "DEVELOPER",
        payload: normalized.payload,
        trusted_candidate: null,
        result_digest: normalized.result_digest
      }
    }
  );

  const stale = structuredClone(normalized);
  stale.trusted.observed_state_version = state.state_version;
  assert.deepEqual(
    applyRoleResult({
      state: projected,
      assignment: action.assignment,
      normalizedResult: stale,
      projectProfile: profile
    }),
    { accepted: false, reason: "STALE_STATE_OR_FINGERPRINT" }
  );
});

test("F1 generic guard rejects an assignment that is not bound to transition N+1", async () => {
  const transitionTable = await readJson("core/transitions.json");
  const state = structuredClone(baseState);
  const action = evaluate(
    profile,
    state,
    {
      role_result: {
        role: "A",
        status: "COMPLETED",
        result_digest: digest({ result: "ready" }),
        payload: { disposition: "READY" }
      },
      dor_passes: true,
      pending_human_request: false
    },
    { observed_at: "2026-09-18T10:31:00Z" },
    transitionTable
  );

  const invalid = structuredClone(action);
  invalid.assignment.state.version = state.state_version;

  assert.throws(
    () => projectAction(state, invalid, "o-run-invalid-binding"),
    /post-transition projection version/
  );
});

test("D change artifact is injected by deterministic wrapper, not trusted from model", () => {
  const state = structuredClone(baseState);
  state.lifecycle = "IN_PROGRESS";
  const assignment = generateAssignment({
    state,
    role: "D",
    purpose: "IMPLEMENT_CURRENT_CONTRACT",
    issued_at: "2026-09-18T10:20:00Z",
    context_entrypoints: [{ kind: "work_item", ref: "example/product#42" }]
  });

  const proposal = {
    role: "D",
    status: "COMPLETED",
    result_type: "DEVELOPER",
    evidence_refs: [],
    human_request: null,
    retry_or_failure: null,
    payload: {
      work_contract_digest: state.contract.digest,
      base: { repository: "example/product", ref_or_sha: "main" },
      change_artifact: {
        format: "unified-diff",
        artifact_ref: "model:untrusted",
        sha256: digest({ artifact: "model" })
      },
      requested_branch_key: "issue-42",
      author_validation: { refs: [], summary: "author checks" },
      blockers: []
    }
  };

  const trustedArtifact = {
    format: "unified-diff",
    artifact_ref: "wrapper:artifact-1",
    sha256: digest({ artifact: "trusted-wrapper-bytes" })
  };

  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: {
      claim_id: "clm-test-current",
      claim_generation: 1,
      ...trustedFacts(assignment, "exec-developer-1"),
      change_artifact: trustedArtifact,
      author_validation_refs: []
    },
    assignment,
    roleResultSchema
  });

  assert.deepEqual(normalized.payload.change_artifact, trustedArtifact);
  assert.notEqual(
    normalized.payload.change_artifact.artifact_ref,
    proposal.payload.change_artifact.artifact_ref
  );

  assert.throws(
    () => normalizeRoleResult({
      proposal,
      trustedFacts: trustedFacts(assignment, "exec-developer-2"),
      assignment,
      roleResultSchema
    }),
    /wrapper-owned trusted change_artifact/
  );
});

test("P result cannot emit Done", () => {
  const state = structuredClone(baseState);
  state.lifecycle = "APPROVED";
  state.candidate = {
    kind: "single",
    generation: 1,
    digest: digest({ sha: "c".repeat(40) }),
    members: [
      {
        repository: "example/product",
        pr_number: 9,
        head_sha: "c".repeat(40),
        base_ref_or_sha: "main"
      }
    ]
  };

  const assignment = generateAssignment({
    state,
    role: "P",
    purpose: "PUBLISH_CURRENT_CANDIDATE",
    issued_at: "2026-09-18T10:10:00Z",
    context_entrypoints: [{ kind: "work_item", ref: "example/product#42" }]
  });

  const proposal = {
    role: "P",
    status: "COMPLETED",
    result_type: "PUBLISHER",
    evidence_refs: [],
    human_request: null,
    retry_or_failure: null,
    payload: {
      consumed_candidate_digest: state.candidate.digest,
      target_digest: digest({ target: "main" }),
      publication_status: "SUCCEEDED",
      operations: [],
      actual_published_identity: null,
      deterministic_verification_refs: [],
      done: true
    }
  };

  assert.throws(
    () => normalizeRoleResult({
      proposal,
      trustedFacts: trustedFacts(assignment, "exec-publish-1"),
      assignment,
      roleResultSchema
    }),
    /may not emit Done/
  );
});
