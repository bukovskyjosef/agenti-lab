import { digest } from "./schema.mjs";

export const CAPACITY_STATUSES = Object.freeze([
  "AVAILABLE",
  "TEMPORARILY_EXHAUSTED",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "UNKNOWN"
]);

export const BILLING_MODES = Object.freeze([
  "NONE",
  "INCLUDED_ALLOWANCE",
  "PREPAID_CREDIT",
  "METERED"
]);

export const BILLING_SAFETY_STATUSES = Object.freeze([
  "VERIFIED_NO_PAID_SPILLOVER",
  "PAID_SPILLOVER_POSSIBLE",
  "UNKNOWN"
]);

const ROLE_CAPABILITIES = Object.freeze({
  A: "A_READ_ANALYZE",
  D: "D_WORKSPACE_WRITE",
  R: "R_READ_REVIEW",
  P: "P_PUBLISH"
});

const SEMANTIC_RELEVANT_KEYS = Object.freeze([
  "required_evidence_digest",
  "target_digest",
  "role_result_digest",
  "human_input_digest",
  "human_decision_digest",
  "publication_target_digest",
  "parent_input_digest"
]);

function parsedTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function nowMs(value) {
  const parsed = parsedTime(value);
  if (parsed === null) throw new Error("routing selection requires valid observed_at");
  return parsed;
}

function semanticRelevantInputs(relevantInputs = {}) {
  const out = {};
  for (const key of SEMANTIC_RELEVANT_KEYS) {
    if (relevantInputs[key] !== undefined && relevantInputs[key] !== null) {
      out[key] = relevantInputs[key];
    }
  }
  return out;
}

export function semanticWorkDigest({
  state,
  role,
  purpose,
  relevant_inputs = {}
}) {
  if (!state?.work_item || !state?.contract?.digest) {
    throw new Error("semanticWorkDigest requires bounded work item + contract state");
  }
  return digest({
    work_item: state.work_item,
    role,
    purpose,
    contract_digest: state.contract.digest,
    candidate_digest: state.candidate?.digest ?? null,
    semantic_inputs: semanticRelevantInputs(relevant_inputs)
  });
}

export function executionRouteDigest(route) {
  return route ? digest(route) : null;
}

export function resolveRoutingPolicy(profile, role, purpose) {
  const routing = profile?.execution_routing;
  if (!routing) return null;
  const matches = (routing.policies ?? []).filter((policy) => {
    const roles = policy.match?.roles ?? [];
    const purposes = policy.match?.purposes ?? [];
    return roles.includes(role) && (purposes.includes("*") || purposes.includes(purpose));
  });
  if (matches.length === 0) {
    throw new Error("NO_MATCHING_ROUTING_POLICY:" + role + "/" + purpose);
  }
  if (matches.length > 1) {
    throw new Error("AMBIGUOUS_ROUTING_POLICY:" + role + "/" + purpose);
  }
  return matches[0];
}

export function validateCapacityObservation({
  observation,
  runnerCandidate,
  observedAt
}) {
  if (!observation) return { valid: false, reason: "MISSING_CAPACITY_OBSERVATION" };
  if (observation.runner_candidate_id !== runnerCandidate) {
    return { valid: false, reason: "CAPACITY_CANDIDATE_MISMATCH" };
  }
  if (!CAPACITY_STATUSES.includes(observation.status)) {
    return { valid: false, reason: "CAPACITY_STATUS_INVALID" };
  }
  const observed = parsedTime(observation.observed_at);
  if (observed === null) return { valid: false, reason: "CAPACITY_OBSERVED_AT_INVALID" };
  const current = nowMs(observedAt);
  if (observed > current) return { valid: false, reason: "CAPACITY_OBSERVATION_FROM_FUTURE" };
  if (observation.valid_until) {
    const validUntil = parsedTime(observation.valid_until);
    if (validUntil === null || validUntil < current) {
      return { valid: false, reason: "CAPACITY_OBSERVATION_STALE" };
    }
  }
  if (observation.retry_at && parsedTime(observation.retry_at) === null) {
    return { valid: false, reason: "CAPACITY_RETRY_AT_INVALID" };
  }
  const expected = digest({
    runner_candidate_id: observation.runner_candidate_id,
    status: observation.status,
    observed_at: observation.observed_at,
    valid_until: observation.valid_until ?? null,
    retry_at: observation.retry_at ?? null,
    retry_after_seconds: observation.retry_after_seconds ?? null,
    remaining: observation.remaining ?? null,
    source: observation.source
  });
  if (observation.evidence_digest !== expected) {
    return { valid: false, reason: "CAPACITY_EVIDENCE_DIGEST_MISMATCH" };
  }
  return { valid: true, reason: null };
}

export function validateBillingSafetyObservation({
  observation,
  runnerCandidate,
  observedAt
}) {
  if (!observation) return { valid: false, reason: "MISSING_BILLING_SAFETY_OBSERVATION" };
  if (observation.runner_candidate_id !== runnerCandidate) {
    return { valid: false, reason: "BILLING_SAFETY_CANDIDATE_MISMATCH" };
  }
  if (!BILLING_SAFETY_STATUSES.includes(observation.status)) {
    return { valid: false, reason: "BILLING_SAFETY_STATUS_INVALID" };
  }
  const observed = parsedTime(observation.observed_at);
  if (observed === null) return { valid: false, reason: "BILLING_SAFETY_OBSERVED_AT_INVALID" };
  const current = nowMs(observedAt);
  if (observed > current) return { valid: false, reason: "BILLING_SAFETY_FROM_FUTURE" };
  if (observation.valid_until) {
    const validUntil = parsedTime(observation.valid_until);
    if (validUntil === null || validUntil < current) {
      return { valid: false, reason: "BILLING_SAFETY_STALE" };
    }
  }
  const expected = digest({
    runner_candidate_id: observation.runner_candidate_id,
    status: observation.status,
    observed_at: observation.observed_at,
    valid_until: observation.valid_until ?? null,
    source: observation.source
  });
  if (observation.evidence_digest !== expected) {
    return { valid: false, reason: "BILLING_SAFETY_EVIDENCE_DIGEST_MISMATCH" };
  }
  return { valid: true, reason: null };
}

function latestObservation(items, candidateId, observedAt, validator) {
  const matching = (items ?? [])
    .filter((item) => item.runner_candidate_id === candidateId)
    .sort((a, b) => (parsedTime(b.observed_at) ?? 0) - (parsedTime(a.observed_at) ?? 0));
  for (const item of matching) {
    const validation = validator({
      observation: item,
      runnerCandidate: candidateId,
      observedAt
    });
    if (validation.valid) return item;
  }
  return null;
}

function billingEligibility({
  candidate,
  candidateId,
  policy,
  billingSafetyObservations,
  observedAt
}) {
  const billing = candidate.billing ?? {};
  const mode = billing.mode;
  if (!BILLING_MODES.includes(mode)) {
    return { eligible: false, reason: "BILLING_MODE_INVALID" };
  }

  if (mode === "NONE") {
    return { eligible: true, safety: null, paid_authority_digest: null };
  }

  if (mode === "INCLUDED_ALLOWANCE") {
    if (policy.paid_execution?.mode !== "FORBIDDEN") {
      return {
        eligible: true,
        safety: null,
        paid_authority_digest: digest(policy.paid_execution)
      };
    }

    if (candidate.billing_safety?.mode === "TECHNICALLY_ISOLATED") {
      return { eligible: true, safety: null, paid_authority_digest: null };
    }

    const safety = latestObservation(
      billingSafetyObservations,
      candidateId,
      observedAt,
      validateBillingSafetyObservation
    );
    if (!safety) return { eligible: false, reason: "BILLING_SAFETY_UNKNOWN" };
    if (safety.status !== "VERIFIED_NO_PAID_SPILLOVER") {
      return {
        eligible: false,
        reason: safety.status === "PAID_SPILLOVER_POSSIBLE"
          ? "PAID_SPILLOVER_POSSIBLE"
          : "BILLING_SAFETY_UNKNOWN"
      };
    }
    return { eligible: true, safety, paid_authority_digest: null };
  }

  if (policy.paid_execution?.mode !== "ALLOWED_WITH_BUDGET") {
    return { eligible: false, reason: "PAID_EXECUTION_FORBIDDEN" };
  }
  if (!policy.paid_execution?.budget) {
    return { eligible: false, reason: "PAID_BUDGET_MISSING" };
  }
  if (!candidate.budget_enforcement?.hard_limit) {
    return { eligible: false, reason: "PAID_HARD_LIMIT_UNAVAILABLE" };
  }
  return {
    eligible: true,
    safety: null,
    paid_authority_digest: digest({
      paid_execution: policy.paid_execution,
      candidate_budget_enforcement: candidate.budget_enforcement
    })
  };
}

function capacityForCandidate({
  candidate,
  candidateId,
  capacityObservations,
  observedAt
}) {
  const mode = candidate.capacity?.observation_mode ?? "NONE";
  if (mode === "NONE") {
    return {
      runner_candidate_id: candidateId,
      status: "AVAILABLE",
      observed_at: observedAt,
      source: { kind: "ADAPTER_PREFLIGHT", trust: "ADAPTER_OBSERVED" },
      evidence_digest: digest({
        synthetic: "NO_CAPACITY_OBSERVATION_REQUIRED",
        runner_candidate_id: candidateId
      }),
      synthetic: true
    };
  }
  const current = latestObservation(
    capacityObservations,
    candidateId,
    observedAt,
    validateCapacityObservation
  );
  if (current) return current;
  return {
    runner_candidate_id: candidateId,
    status: "UNKNOWN",
    observed_at: observedAt,
    source: { kind: "ADAPTER_PREFLIGHT", trust: "ADAPTER_OBSERVED" },
    evidence_digest: null,
    synthetic: true
  };
}

function capabilityMatches(candidate, capabilityProfile) {
  return (candidate.capability_profiles ?? []).includes(capabilityProfile);
}

function candidateAttempt(candidateId, status, observation, reason = null) {
  return {
    candidate_id: candidateId,
    capacity_status: status,
    observation_digest: observation?.evidence_digest ?? null,
    ineligible_reason: reason
  };
}

function earliestRetryAt(attempts, observations, observedAt, policy) {
  const candidateIds = new Set(
    attempts
      .filter((item) => ["TEMPORARILY_EXHAUSTED", "RATE_LIMITED"].includes(item.capacity_status))
      .map((item) => item.candidate_id)
  );
  const retries = (observations ?? [])
    .filter((item) => candidateIds.has(item.runner_candidate_id))
    .map((item) => parsedTime(item.retry_at))
    .filter((value) => value !== null && value > nowMs(observedAt))
    .sort((a, b) => a - b);
  if (retries.length) return new Date(retries[0]).toISOString();
  const delay = Math.max(60, policy.wait_policy?.minimum_reconcile_seconds ?? 900);
  return new Date(nowMs(observedAt) + delay * 1000).toISOString();
}

function maxWaitDeadline(observedAt, policy, existingDeadline = null) {
  if (existingDeadline && parsedTime(existingDeadline) !== null) return existingDeadline;
  const seconds = policy.wait_policy?.max_wait_seconds;
  if (!Number.isInteger(seconds) || seconds < 0) return null;
  return new Date(nowMs(observedAt) + seconds * 1000).toISOString();
}

export function selectRunnerCandidate({
  profile,
  role,
  purpose,
  capability_profile = ROLE_CAPABILITIES[role],
  semantic_work_digest,
  capacity_observations = [],
  billing_safety_observations = [],
  routing_attempt_generation = 0,
  observed_at,
  existing_wait_deadline = null
}) {
  const policy = resolveRoutingPolicy(profile, role, purpose);
  if (!policy) return { kind: "LEGACY" };
  const routing = profile.execution_routing;
  const policyDigest = digest(policy);
  const attempted = [];

  for (const candidateId of policy.candidates ?? []) {
    const candidate = routing.runner_catalog?.[candidateId];
    if (!candidate) {
      attempted.push(candidateAttempt(candidateId, "UNAVAILABLE", null, "UNKNOWN_RUNNER_CANDIDATE"));
      continue;
    }
    if (!capabilityMatches(candidate, capability_profile)) {
      attempted.push(candidateAttempt(candidateId, "UNAVAILABLE", null, "CAPABILITY_MISMATCH"));
      continue;
    }

    const billing = billingEligibility({
      candidate,
      candidateId,
      policy,
      billingSafetyObservations: billing_safety_observations,
      observedAt: observed_at
    });
    if (!billing.eligible) {
      attempted.push(candidateAttempt(candidateId, "UNAVAILABLE", null, billing.reason));
      continue;
    }

    const capacity = capacityForCandidate({
      candidate,
      candidateId,
      capacityObservations: capacity_observations,
      observedAt: observed_at
    });
    attempted.push(candidateAttempt(candidateId, capacity.status, capacity));

    if (capacity.status === "UNAVAILABLE") continue;
    if (["TEMPORARILY_EXHAUSTED", "RATE_LIMITED"].includes(capacity.status)) continue;

    if (
      capacity.status === "UNKNOWN" &&
      candidate.billing?.mode === "INCLUDED_ALLOWANCE" &&
      policy.paid_execution?.mode === "FORBIDDEN" &&
      candidate.billing_safety?.mode !== "TECHNICALLY_ISOLATED" &&
      !billing.safety
    ) {
      attempted[attempted.length - 1].ineligible_reason = "BILLING_SAFETY_UNKNOWN";
      continue;
    }

    const executionRoute = {
      policy_digest: policyDigest,
      runner_candidate_id: candidateId,
      adapter_id: candidate.adapter_id,
      adapter_version: candidate.adapter_version,
      provider_ref: candidate.provider_ref,
      billing_mode: candidate.billing.mode,
      paid_authority_digest: billing.paid_authority_digest,
      capacity_observation_digest: capacity.synthetic
        ? null
        : capacity.evidence_digest,
      billing_safety_digest: billing.safety?.evidence_digest ?? null,
      routing_attempt_generation
    };

    return {
      kind: "SELECTED",
      policy,
      policy_digest: policyDigest,
      semantic_work_digest,
      execution_route: executionRoute,
      attempted_candidates: attempted
    };
  }

  const statuses = new Set(attempted.map((item) => item.capacity_status));
  const reason = statuses.has("TEMPORARILY_EXHAUSTED")
    ? "TEMPORARILY_EXHAUSTED"
    : statuses.has("RATE_LIMITED")
      ? "RATE_LIMITED"
      : "NO_AUTHORIZED_CAPACITY";

  return {
    kind: "WAIT",
    policy,
    policy_digest: policyDigest,
    semantic_work_digest,
    routing_attempt_generation,
    attempted_candidates: attempted,
    wait: {
      status: "WAITING_CAPACITY",
      reason,
      candidate_id: attempted.find((item) =>
        ["TEMPORARILY_EXHAUSTED", "RATE_LIMITED"].includes(item.capacity_status)
      )?.candidate_id ?? null,
      not_before: earliestRetryAt(
        attempted,
        capacity_observations,
        observed_at,
        policy
      ),
      max_wait_deadline: maxWaitDeadline(
        observed_at,
        policy,
        existing_wait_deadline
      )
    }
  };
}

export function routingProjection({
  selection,
  role,
  purpose,
  source_transition_id,
  resume_lifecycle
}) {
  return {
    policy_digest: selection.policy_digest,
    pending: selection.kind === "WAIT"
      ? {
          role,
          purpose,
          semantic_work_digest: selection.semantic_work_digest,
          source_transition_id,
          resume_lifecycle
        }
      : null,
    selected_runner_candidate_id:
      selection.kind === "SELECTED"
        ? selection.execution_route.runner_candidate_id
        : null,
    routing_attempt_generation:
      selection.kind === "SELECTED"
        ? selection.execution_route.routing_attempt_generation
        : selection.routing_attempt_generation,
    attempted_candidates: selection.attempted_candidates ?? [],
    wait: selection.kind === "WAIT"
      ? selection.wait
      : {
          status: "NONE",
          reason: null,
          candidate_id: null,
          not_before: null,
          max_wait_deadline: null
        }
  };
}

export function routingWaitDue(executionRouting, observedAt) {
  const wait = executionRouting?.wait;
  if (!wait || wait.status !== "WAITING_CAPACITY") return false;
  const due = parsedTime(wait.not_before);
  return due !== null && due <= nowMs(observedAt);
}

export function validateRoutingConfiguration(profile) {
  const errors = [];
  const routing = profile?.execution_routing;
  if (!routing) return errors;

  const catalog = routing.runner_catalog ?? {};
  const policies = routing.policies ?? [];

  for (const [candidateId, candidate] of Object.entries(catalog)) {
    if (!candidate.adapter_id || !candidate.adapter_version) {
      errors.push("runner_catalog." + candidateId + " requires adapter_id and adapter_version");
    }
    if (!BILLING_MODES.includes(candidate.billing?.mode)) {
      errors.push("runner_catalog." + candidateId + " has invalid billing mode");
    }
    if (!(candidate.capability_profiles?.length > 0)) {
      errors.push("runner_catalog." + candidateId + " requires capability_profiles");
    }
    if (
      candidate.capability_profiles?.includes("R_READ_REVIEW") &&
      !candidate.independence_mechanism
    ) {
      errors.push("runner_catalog." + candidateId + " serving R requires independence_mechanism");
    }
    if (
      candidate.independence_mechanism &&
      !profile.independent_r_enforcement?.mechanisms?.[candidate.independence_mechanism]
    ) {
      errors.push("runner_catalog." + candidateId + " references unknown independence_mechanism");
    }
  }

  for (let i = 0; i < policies.length; i += 1) {
    const policy = policies[i];
    for (const candidateId of policy.candidates ?? []) {
      if (!catalog[candidateId]) {
        errors.push("policy " + policy.policy_id + " references unknown candidate " + candidateId);
        continue;
      }
      const candidate = catalog[candidateId];
      for (const role of policy.match?.roles ?? []) {
        const expected = ROLE_CAPABILITIES[role];
        if (expected && !candidate.capability_profiles?.includes(expected)) {
          errors.push(
            "policy " + policy.policy_id + " candidate " + candidateId +
            " cannot satisfy " + role + "/" + expected
          );
        }
        if (
          role === "P" &&
          (
            candidate.execution_kind !== "DETERMINISTIC" ||
            candidate.billing?.mode !== "NONE"
          )
        ) {
          errors.push(
            "policy " + policy.policy_id +
            " maps P to non-deterministic or billed candidate " + candidateId
          );
        }
      }

      if (
        candidate.billing?.mode === "INCLUDED_ALLOWANCE" &&
        policy.paid_execution?.mode === "FORBIDDEN" &&
        !candidate.billing_safety
      ) {
        errors.push(
          "policy " + policy.policy_id + " strict included candidate " +
          candidateId + " requires billing_safety configuration"
        );
      }
      if (
        ["PREPAID_CREDIT", "METERED"].includes(candidate.billing?.mode) &&
        policy.paid_execution?.mode === "FORBIDDEN"
      ) {
        errors.push(
          "policy " + policy.policy_id + " makes paid candidate " +
          candidateId + " reachable while paid execution is FORBIDDEN"
        );
      }
      if (
        ["PREPAID_CREDIT", "METERED"].includes(candidate.billing?.mode) &&
        policy.paid_execution?.mode === "ALLOWED_WITH_BUDGET" &&
        (!policy.paid_execution?.budget || !candidate.budget_enforcement?.hard_limit)
      ) {
        errors.push(
          "policy " + policy.policy_id + " paid candidate " +
          candidateId + " lacks enforceable hard budget"
        );
      }
    }

    for (let j = i + 1; j < policies.length; j += 1) {
      const other = policies[j];
      const rolesOverlap = (policy.match?.roles ?? []).some((role) =>
        (other.match?.roles ?? []).includes(role)
      );
      const purposesA = policy.match?.purposes ?? [];
      const purposesB = other.match?.purposes ?? [];
      const purposeOverlap =
        purposesA.includes("*") ||
        purposesB.includes("*") ||
        purposesA.some((purpose) => purposesB.includes(purpose));
      if (rolesOverlap && purposeOverlap) {
        errors.push(
          "ambiguous overlapping routing policies " +
          policy.policy_id + " and " + other.policy_id
        );
      }
    }
  }

  return errors;
}
