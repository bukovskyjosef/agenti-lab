import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";
import {
  digest,
  generateAssignment,
  normalizeRoleResult,
  applyRoleResult,
  verifyExecutionIndependence
} from "../core/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const profile = await readJson("conformance/fixtures/project-profile.valid.json");
const baseState = await readJson("conformance/fixtures/base-state.json");
const roleResultSchema = await readJson("schemas/role-result.schema.json");

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

  state.assignment = {
    assignment_id: assignment.assignment_id,
    role: "R",
    purpose: assignment.purpose,
    issued_from_state_version: state.state_version,
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
