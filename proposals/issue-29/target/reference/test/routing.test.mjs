import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRoleResult,
  digest,
  evaluate,
  projectAction,
  semanticWorkDigest,
  selectRunnerCandidate,
  validateBillingSafetyObservation,
  validateCapacityObservation,
  validateRoutingConfiguration,
  validateSchema
} from "../core/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const profile = await json("conformance/fixtures/project-profile.routing.valid.json");
const baseState = await json("conformance/fixtures/base-state.json");
const transitionTable = await json("core/transitions.json");
const assignmentSchema = await json("schemas/assignment.schema.json");
const profileSchema = await json("schemas/project-profile.schema.json");

const OBSERVED = "2026-09-18T12:00:00Z";

function capacity(candidate, status, {
  observedAt = OBSERVED,
  validUntil = "2026-09-18T13:00:00Z",
  retryAt = null
} = {}) {
  const source = {
    kind: "ADAPTER_PREFLIGHT",
    trust: "ADAPTER_OBSERVED"
  };
  const payload = {
    runner_candidate_id: candidate,
    status,
    observed_at: observedAt,
    valid_until: validUntil,
    retry_at: retryAt,
    retry_after_seconds: null,
    remaining: null,
    source
  };
  return {
    ...payload,
    evidence_digest: digest(payload)
  };
}

function billingSafety(candidate, status = "VERIFIED_NO_PAID_SPILLOVER") {
  const source = {
    kind: "ADMIN_POLICY_ATTESTATION",
    trust: "EXTERNAL_CURRENT_EVIDENCE"
  };
  const payload = {
    runner_candidate_id: candidate,
    status,
    observed_at: OBSERVED,
    valid_until: "2026-09-18T13:00:00Z",
    source
  };
  return {
    ...payload,
    evidence_digest: digest(payload)
  };
}

function aReadySnapshot({
  capacities = [],
  billing = [],
  independentWork = false
} = {}) {
  return {
    role_result: {
      role: "A",
      status: "COMPLETED",
      result_digest: digest({ A: "ready" }),
      payload: { disposition: "READY" }
    },
    dor_passes: true,
    pending_human_request: false,
    context_entrypoints: [
      { kind: "work_item", ref: "example/product#42" }
    ],
    capacity_observations: capacities,
    billing_safety_observations: billing,
    independent_work_available: independentWork
  };
}

function routeD({
  capacities,
  billing = [billingSafety("included-primary")]
}) {
  return evaluate(
    profile,
    structuredClone(baseState),
    aReadySnapshot({ capacities, billing }),
    { observed_at: OBSERVED },
    transitionTable
  );
}

test("routing schemas and semantic configuration accept the reference routed profile", () => {
  assert.deepEqual(validateSchema(profile, profileSchema), []);
  assert.deepEqual(validateRoutingConfiguration(profile), []);
});

test("provider-neutral capacity and billing-safety evidence are digest/freshness validated", () => {
  const c = capacity("included-primary", "AVAILABLE");
  assert.deepEqual(
    validateCapacityObservation({
      observation: c,
      runnerCandidate: "included-primary",
      observedAt: OBSERVED
    }),
    { valid: true, reason: null }
  );

  const stale = { ...c, valid_until: "2026-09-18T11:59:00Z" };
  stale.evidence_digest = digest({
    runner_candidate_id: stale.runner_candidate_id,
    status: stale.status,
    observed_at: stale.observed_at,
    valid_until: stale.valid_until,
    retry_at: stale.retry_at,
    retry_after_seconds: stale.retry_after_seconds,
    remaining: stale.remaining,
    source: stale.source
  });
  assert.equal(
    validateCapacityObservation({
      observation: stale,
      runnerCandidate: "included-primary",
      observedAt: OBSERVED
    }).reason,
    "CAPACITY_OBSERVATION_STALE"
  );

  const safety = billingSafety("included-primary");
  assert.deepEqual(
    validateBillingSafetyObservation({
      observation: safety,
      runnerCandidate: "included-primary",
      observedAt: OBSERVED
    }),
    { valid: true, reason: null }
  );
});

test("strict INCLUDED_ALLOWANCE is fail-closed when stock subscription billing safety is UNKNOWN", () => {
  const action = routeD({
    capacities: [capacity("included-primary", "UNKNOWN")]
  });
  assert.equal(action.transition_id, "T02");
  assert.equal(action.assignment.execution_route.runner_candidate_id, "included-secondary");

  const strictOnly = structuredClone(profile);
  strictOnly.execution_routing.policies[0].candidates = ["included-primary"];
  const blocked = evaluate(
    strictOnly,
    structuredClone(baseState),
    aReadySnapshot({
      capacities: [capacity("included-primary", "UNKNOWN")],
      billing: []
    }),
    { observed_at: OBSERVED },
    transitionTable
  );
  assert.equal(blocked.transition_id, "T02");
  assert.equal(blocked.assignment, undefined);
  assert.equal(blocked.lifecycle, "BLOCKED");
  assert.equal(blocked.execution_routing.wait.status, "WAITING_CAPACITY");
  assert.equal(
    blocked.execution_routing.attempted_candidates[0].ineligible_reason,
    "BILLING_SAFETY_UNKNOWN"
  );
});

test("preferred included candidate AVAILABLE + verified no-spillover is selected", () => {
  const action = routeD({
    capacities: [capacity("included-primary", "AVAILABLE")]
  });
  assert.equal(action.transition_id, "T02");
  assert.equal(action.assignment.role, "D");
  assert.equal(
    action.assignment.execution_route.runner_candidate_id,
    "included-primary"
  );
  assert.match(action.assignment.semantic_work_digest, /^sha256:/);
  assert.deepEqual(validateSchema(action.assignment, assignmentSchema), []);
});

test("preferred exhausted deterministically falls back to second included candidate", () => {
  const action = routeD({
    capacities: [
      capacity(
        "included-primary",
        "TEMPORARILY_EXHAUSTED",
        { retryAt: "2026-09-18T12:30:00Z" }
      ),
      capacity("included-secondary", "AVAILABLE")
    ]
  });
  assert.equal(
    action.assignment.execution_route.runner_candidate_id,
    "included-secondary"
  );
  assert.deepEqual(
    action.execution_routing.attempted_candidates.map((x) => x.candidate_id),
    ["included-primary", "included-secondary"]
  );
});

test("all included candidates exhausted produces bounded wait and no invocation", () => {
  const action = routeD({
    capacities: [
      capacity(
        "included-primary",
        "TEMPORARILY_EXHAUSTED",
        { retryAt: "2026-09-18T12:30:00Z" }
      ),
      capacity(
        "included-secondary",
        "RATE_LIMITED",
        { retryAt: "2026-09-18T12:20:00Z" }
      )
    ]
  });
  assert.equal(action.assignment, undefined);
  assert.equal(action.lifecycle, "BLOCKED");
  assert.equal(action.execution_routing.wait.status, "WAITING_CAPACITY");
  assert.equal(action.execution_routing.wait.not_before, "2026-09-18T12:20:00.000Z");
});

test("paid candidate is filtered when policy forbids paid execution", () => {
  const paidForbidden = structuredClone(profile);
  paidForbidden.execution_routing.policies[0].candidates = ["metered-api"];
  assert.ok(
    validateRoutingConfiguration(paidForbidden)
      .some((error) => error.includes("paid execution is FORBIDDEN"))
  );

  const selection = selectRunnerCandidate({
    profile: paidForbidden,
    role: "D",
    purpose: "IMPLEMENT_CURRENT_CONTRACT",
    capability_profile: "D_WORKSPACE_WRITE",
    semantic_work_digest: digest({ work: 1 }),
    capacity_observations: [capacity("metered-api", "AVAILABLE")],
    billing_safety_observations: [],
    routing_attempt_generation: 0,
    observed_at: OBSERVED
  });
  assert.equal(selection.kind, "WAIT");
  assert.equal(
    selection.attempted_candidates[0].ineligible_reason,
    "PAID_EXECUTION_FORBIDDEN"
  );
});

test("paid candidate requires explicit budget and hard enforcement", () => {
  const paid = structuredClone(profile);
  paid.execution_routing.policies[0].candidates = ["metered-api"];
  paid.execution_routing.policies[0].paid_execution = {
    mode: "ALLOWED_WITH_BUDGET",
    budget: { currency: "USD", max_per_run: 2 },
    enforcement: "ADAPTER_HARD_LIMIT"
  };
  assert.deepEqual(validateRoutingConfiguration(paid), []);

  const selected = selectRunnerCandidate({
    profile: paid,
    role: "D",
    purpose: "IMPLEMENT_CURRENT_CONTRACT",
    capability_profile: "D_WORKSPACE_WRITE",
    semantic_work_digest: digest({ work: 2 }),
    capacity_observations: [capacity("metered-api", "AVAILABLE")],
    billing_safety_observations: [],
    routing_attempt_generation: 0,
    observed_at: OBSERVED
  });
  assert.equal(selected.kind, "SELECTED");
  assert.equal(selected.execution_route.billing_mode, "METERED");
  assert.match(selected.execution_route.paid_authority_digest, /^sha256:/);

  paid.execution_routing.runner_catalog["metered-api"].budget_enforcement.hard_limit = false;
  assert.ok(
    validateRoutingConfiguration(paid)
      .some((error) => error.includes("lacks enforceable hard budget"))
  );
});

test("semantic work digest ignores capacity/routing bookkeeping while freshness route changes", () => {
  const state = structuredClone(baseState);
  const one = semanticWorkDigest({
    state,
    role: "D",
    purpose: "IMPLEMENT_CURRENT_CONTRACT",
    relevant_inputs: { required_evidence_digest: digest({ gates: 1 }) }
  });
  state.state_version += 5;
  state.lifecycle = "BLOCKED";
  state.execution_routing = {
    policy_digest: digest({ p: 1 }),
    pending: null,
    selected_runner_candidate_id: "included-secondary",
    routing_attempt_generation: 7,
    attempted_candidates: [],
    wait: {
      status: "NONE",
      reason: null,
      candidate_id: null,
      not_before: null,
      max_wait_deadline: null
    }
  };
  const two = semanticWorkDigest({
    state,
    role: "D",
    purpose: "IMPLEMENT_CURRENT_CONTRACT",
    relevant_inputs: { required_evidence_digest: digest({ gates: 1 }) }
  });
  assert.equal(one, two);
});

test("T14 failed assignment reroutes same authority once, marks old receipt failed, and rejects late old result", () => {
  const first = routeD({
    capacities: [capacity("included-primary", "AVAILABLE")]
  });
  const state = projectAction(
    structuredClone(baseState),
    first,
    "o-t02"
  );
  const oldAssignment = structuredClone(first.assignment);
  assert.equal(state.execution_routing.routing_attempt_generation, 0);

  const failureEvidence = {
    transient: true,
    objective_retry_reason: "TEMPORARY_CAPACITY",
    failed_assignment_id: oldAssignment.assignment_id,
    semantic_work_digest: oldAssignment.semantic_work_digest,
    execution_instance_id: "exec-d-primary",
    capacity_status: "TEMPORARILY_EXHAUSTED",
    retry_at: "2026-09-18T12:30:00Z",
    ref: "failure:primary",
    evidence_digest: digest({ failure: "primary-exhausted" })
  };
  const reroute = evaluate(
    profile,
    state,
    {
      failure: failureEvidence,
      capacity_observations: [
        capacity(
          "included-primary",
          "TEMPORARILY_EXHAUSTED",
          { retryAt: "2026-09-18T12:30:00Z" }
        ),
        capacity("included-secondary", "AVAILABLE")
      ],
      billing_safety_observations: [billingSafety("included-primary")],
      context_entrypoints: [{ kind: "work_item", ref: "example/product#42" }]
    },
    { observed_at: "2026-09-18T12:05:00Z" },
    transitionTable
  );

  assert.equal(reroute.transition_id, "T14");
  assert.equal(reroute.assignment.role, "D");
  assert.equal(
    reroute.assignment.execution_route.runner_candidate_id,
    "included-secondary"
  );
  assert.equal(
    reroute.assignment.execution_route.routing_attempt_generation,
    1
  );
  assert.equal(
    reroute.assignment.semantic_work_digest,
    oldAssignment.semantic_work_digest
  );
  assert.notEqual(reroute.assignment.assignment_id, oldAssignment.assignment_id);

  const projected = projectAction(state, reroute, "o-t14");
  assert.equal(
    projected.run_receipts[oldAssignment.assignment_id].completion_status,
    "FAILED_BEFORE_RESULT"
  );
  assert.equal(projected.execution_routing.routing_attempt_generation, 1);

  const replay = evaluate(
    profile,
    projected,
    {
      failure: failureEvidence,
      capacity_observations: [capacity("included-secondary", "AVAILABLE")],
      billing_safety_observations: []
    },
    { observed_at: "2026-09-18T12:06:00Z" },
    transitionTable
  );
  assert.equal(replay.kind, "NO_OP");
  assert.equal(replay.reason, "FAILED_ASSIGNMENT_NOT_CURRENT");

  const staleResult = {
    trusted: {
      observed_state_version: oldAssignment.state.version,
      observed_fingerprint: oldAssignment.state.fingerprint,
      semantic_work_digest: oldAssignment.semantic_work_digest,
      execution_route_digest: digest(oldAssignment.execution_route),
      execution_attestation: {
        adapter_id: oldAssignment.execution_route.adapter_id,
        adapter_version: oldAssignment.execution_route.adapter_version
      }
    }
  };
  assert.equal(
    applyRoleResult({
      state: projected,
      assignment: oldAssignment,
      normalizedResult: staleResult,
      projectProfile: profile
    }).reason,
    "ASSIGNMENT_NOT_CURRENT"
  );
});

test("T14 wait increments generation once, pre-due reconcile is cheap, due recovery emits same-authority replacement", () => {
  const first = routeD({
    capacities: [capacity("included-primary", "AVAILABLE")]
  });
  const state = projectAction(structuredClone(baseState), first, "o-t02");
  const old = first.assignment;
  const failure = {
    transient: true,
    objective_retry_reason: "TEMPORARY_CAPACITY",
    failed_assignment_id: old.assignment_id,
    semantic_work_digest: old.semantic_work_digest,
    execution_instance_id: "exec-d-primary",
    capacity_status: "TEMPORARILY_EXHAUSTED",
    ref: "failure:wait",
    evidence_digest: digest({ failure: "wait" })
  };

  const waitingAction = evaluate(
    profile,
    state,
    {
      failure,
      capacity_observations: [
        capacity(
          "included-primary",
          "TEMPORARILY_EXHAUSTED",
          { retryAt: "2026-09-18T12:30:00Z" }
        ),
        capacity(
          "included-secondary",
          "RATE_LIMITED",
          { retryAt: "2026-09-18T12:20:00Z" }
        )
      ],
      billing_safety_observations: [billingSafety("included-primary")]
    },
    { observed_at: "2026-09-18T12:05:00Z" },
    transitionTable
  );
  assert.equal(waitingAction.transition_id, "T14");
  assert.equal(waitingAction.assignment, undefined);
  assert.equal(waitingAction.execution_routing.routing_attempt_generation, 1);

  const waiting = projectAction(state, waitingAction, "o-t14-wait");
  assert.equal(waiting.lifecycle, "BLOCKED");

  const early = evaluate(
    profile,
    waiting,
    {
      capacity_observations: [capacity("included-secondary", "AVAILABLE")],
      billing_safety_observations: []
    },
    { observed_at: "2026-09-18T12:10:00Z" },
    transitionTable
  );
  assert.equal(early.kind, "NO_OP");
  assert.equal(early.reason, "ROUTING_WAIT_NOT_DUE");

  const dueCapacity = capacity("included-secondary", "AVAILABLE", {
    observedAt: "2026-09-18T12:21:00Z",
    validUntil: "2026-09-18T13:00:00Z"
  });
  const due = evaluate(
    profile,
    waiting,
    {
      capacity_observations: [dueCapacity],
      billing_safety_observations: []
    },
    { observed_at: "2026-09-18T12:21:00Z" },
    transitionTable
  );
  assert.equal(due.transition_id, "T14");
  assert.equal(due.assignment.role, "D");
  assert.equal(
    due.assignment.execution_route.routing_attempt_generation,
    1
  );
  assert.equal(due.assignment.semantic_work_digest, old.semantic_work_digest);
});

test("R T14 reroute preserves D-author exclusion set", () => {
  const state = structuredClone(baseState);
  state.lifecycle = "IN_PROGRESS";
  state.assignment = {
    ...state.assignment,
    role: "D",
    purpose: "IMPLEMENT_CURRENT_CONTRACT",
    capability_profile: "D_WORKSPACE_WRITE"
  };
  const candidate = {
    kind: "single",
    generation: 1,
    digest: digest({ candidate: "r-route" }),
    members: [{
      repository: "example/product",
      pr_number: 9,
      head_sha: "a".repeat(40),
      base_ref_or_sha: "main"
    }]
  };
  const rAction = evaluate(
    profile,
    state,
    {
      role_result: {
        role: "D",
        status: "COMPLETED",
        result_digest: digest({ D: "done" }),
        payload: {}
      },
      candidate,
      checks: {
        status: "PASSED",
        required_set_digest: digest(["unit"]),
        evidence_refs: []
      },
      required_evidence_digest: digest({ checks: "passed" }),
      author_execution_instances: ["exec-d-author"],
      capacity_observations: [capacity("included-primary", "AVAILABLE")],
      billing_safety_observations: [billingSafety("included-primary")],
      pending_human_request: false
    },
    { observed_at: OBSERVED },
    transitionTable
  );
  assert.equal(rAction.transition_id, "T04");
  assert.equal(rAction.assignment.role, "R");
  assert.deepEqual(
    rAction.assignment.independence.must_differ_from_execution_instances,
    ["exec-d-author"]
  );
  const rState = projectAction(state, rAction, "o-r");

  const failure = {
    transient: true,
    objective_retry_reason: "RATE_LIMIT",
    failed_assignment_id: rAction.assignment.assignment_id,
    semantic_work_digest: rAction.assignment.semantic_work_digest,
    execution_instance_id: "exec-r-primary",
    capacity_status: "RATE_LIMITED",
    ref: "failure:r",
    evidence_digest: digest({ failure: "r-rate" })
  };
  const reroute = evaluate(
    profile,
    rState,
    {
      failure,
      capacity_observations: [
        capacity("included-primary", "RATE_LIMITED", {
          retryAt: "2026-09-18T12:20:00Z"
        }),
        capacity("included-secondary", "AVAILABLE")
      ],
      billing_safety_observations: [billingSafety("included-primary")]
    },
    { observed_at: "2026-09-18T12:05:00Z" },
    transitionTable
  );
  assert.equal(reroute.assignment.role, "R");
  assert.deepEqual(
    reroute.assignment.independence.must_differ_from_execution_instances,
    ["exec-d-author"]
  );
});
