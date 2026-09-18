import { readFile } from "node:fs/promises";
import {
  acceptMutableEvidence,
  applyRoleResult,
  digest,
  evaluate,
  generateAssignment,
  projectAction,
  terminalizeClaim,
  verifyRoleResultClaim,
  validateSchema
} from "../core/index.mjs";
import { githubClientFromEnv } from "./github.mjs";
import {
  ASSIGNMENT_MARKER,
  HUMAN_REQUEST_MARKER,
  RELEASE_REQUEST_MARKER,
  ROLE_RESULT_MARKER,
  findAssignmentAudit,
  findRoleResult,
  loadState,
  parseMachinePayload,
  renderMachineComment,
  saveStateCAS
} from "./state.mjs";
import { assignmentFromState, loadRuntime } from "./runner.mjs";
import { definitionOfReady } from "./contract.mjs";
import { routingEvidenceSnapshot } from "./routing-evidence.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assignmentProjection(assignment, issuedFromStateVersion) {
  if (!assignment) return null;
  return {
    assignment_id: assignment.assignment_id,
    role: assignment.role,
    purpose: assignment.purpose,
    issued_from_state_version: issuedFromStateVersion,
    bound_state_version: assignment.state.version,
    fingerprint: assignment.state.fingerprint,
    ...(assignment.semantic_work_digest
      ? {
          semantic_work_digest: assignment.semantic_work_digest,
          execution_route: assignment.execution_route
        }
      : {}),
    capability_profile: assignment.capability_profile,
    dispatch_status: "pending",
    workflow_run_id: null,
    must_differ_from_execution_instances:
      assignment.independence.must_differ_from_execution_instances ?? []
  };
}

function initialProjection(action, runtimeVersion) {
  const version = action.initialize.state_version;
  return {
    schema_version: 1,
    runtime_version: runtimeVersion,
    work_item: action.initialize.work_item,
    state_version: version,
    lifecycle: action.initialize.lifecycle,
    contract: action.initialize.contract,
    assignment: assignmentProjection(action.assignment, Math.max(0, version - 1)),
    ...(action.execution_routing
      ? { execution_routing: structuredClone(action.execution_routing) }
      : {}),
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
    claim_control: {
      claim_version: 0,
      active_claim: null,
      last_terminal: null
    },
    material_operation: null,
    failure: {
      active_ref: null,
      retry_reason: null,
      non_convergent: false
    },
    stop: {
      record_ref: null
    },
    updated_by: {
      o_run_id: process.env.GITHUB_RUN_ID ?? "local-o",
      transition_id: "T01",
      idempotence_key: action.idempotence_key
    }
  };
}

function commandFromComment(comment) {
  const body = (comment.body ?? "").trim();
  let match = body.match(/^\/agenti\s+resolve\s+(\S+)(?:\s*\n([\s\S]*))?$/i);
  if (match) return { kind: "resolve", id: match[1], answer: (match[2] ?? "").trim() };

  match = body.match(/^\/agenti\s+release\s+(grant|reject)\s+(\S+)(?:\s*\n([\s\S]*))?$/i);
  if (match) return {
    kind: "release",
    decision: match[1].toLowerCase(),
    id: match[2],
    reason: (match[3] ?? "").trim()
  };

  match = body.match(/^\/agenti\s+stop(?:\s+([\s\S]*))?$/i);
  if (match) return { kind: "stop", reason: (match[1] ?? "").trim() };

  match = body.match(/^\/agenti\s+reopen(?:\s+([\s\S]*))?$/i);
  if (match) return { kind: "reopen", reason: (match[1] ?? "").trim() };

  if (/^\/agenti\s+reconcile\s*$/i.test(body)) return { kind: "reconcile" };
  return null;
}

function humanComments(comments, profile) {
  const ids = new Set(profile.human.principals.map((principal) => principal.actor_id));
  return comments
    .filter((comment) => ids.has(comment.user?.id))
    .map((comment) => ({ comment, command: commandFromComment(comment) }))
    .filter((entry) => entry.command);
}

function latestMatching(entries, predicate) {
  return [...entries].reverse().find((entry) => predicate(entry.command)) ?? null;
}

function roleResultCurrentObject(comment, normalized) {
  return {
    evidence_kind: "role_result_comment",
    repository: process.env.GITHUB_REPOSITORY,
    object_id: comment.id,
    actor_id: comment.user.id,
    updated_at: comment.updated_at,
    normalized_payload: normalized,
    normalized_outcome: normalized.role === "R"
      ? normalized.payload.outcome
      : normalized.status
  };
}

function humanResponseCurrentObject(comment, command, outcome) {
  return {
    evidence_kind: "issue_comment",
    repository: process.env.GITHUB_REPOSITORY,
    object_id: comment.id,
    actor_id: comment.user.id,
    updated_at: comment.updated_at,
    normalized_payload: command,
    normalized_outcome: outcome
  };
}

async function currentEvidenceObject(github, binding) {
  if (!binding || !("object_id" in binding)) return null;
  let comment;
  try {
    comment = await github.getIssueComment(binding.object_id);
  } catch (error) {
    if (String(error.message).includes("failed 404")) return null;
    throw error;
  }

  if (binding.evidence_kind === "role_result_comment") {
    const payload = parseMachinePayload(comment.body, ROLE_RESULT_MARKER);
    if (!payload) return null;
    return roleResultCurrentObject(comment, payload);
  }

  if (binding.evidence_kind === "issue_comment") {
    const command = commandFromComment(comment);
    if (!command) return null;
    let outcome = binding.normalized_outcome;
    if (command.kind === "release") outcome = command.decision === "grant" ? "GRANTED" : "REJECTED";
    if (command.kind === "resolve") outcome = "RESOLVED";
    return humanResponseCurrentObject(comment, command, outcome);
  }

  return null;
}

function candidateStateFromTrusted(state, trustedCandidate) {
  if (!trustedCandidate) return null;
  return {
    kind: "single",
    generation: state.candidate.digest === trustedCandidate.candidate_digest
      ? state.candidate.generation
      : state.candidate.generation + 1,
    digest: trustedCandidate.candidate_digest,
    members: [{
      repository: trustedCandidate.repository,
      pr_number: trustedCandidate.pr_number,
      head_sha: trustedCandidate.head_sha,
      base_ref_or_sha: trustedCandidate.base_ref_or_sha
    }]
  };
}

async function checkSnapshot(github, profile, candidate) {
  if (!candidate?.digest || candidate.kind !== "single") {
    return {
      checks: { status: "NOT_REQUIRED", required_set_digest: null, evidence_refs: [] },
      required_gates_current: profile.required_checks.length === 0,
      required_evidence_digest: digest([])
    };
  }

  const required = [...profile.required_checks].sort();
  const checkRuns = await github.getChecksForRef(candidate.members[0].head_sha);
  const evidence = required.map((name) => {
    const matches = checkRuns.filter((run) => run.name === name).sort((a, b) => Number(b.id) - Number(a.id));
    const run = matches[0];
    return run ? {
      name,
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      head_sha: run.head_sha
    } : { name, missing: true };
  });
  const passed = evidence.every((item) => item.status === "completed" && item.conclusion === "success");
  const evidenceDigest = digest(evidence);
  return {
    checks: {
      status: required.length === 0 ? "PASSED" : (passed ? "PASSED" : "PENDING"),
      required_set_digest: required.length === 0 ? null : digest(required),
      evidence_refs: []
    },
    required_gates_current: required.length === 0 || passed,
    required_evidence_digest: evidenceDigest
  };
}

function targetDigest(github, runtime) {
  return digest({
    repository: github.repository,
    target_branch: runtime.runtimeConfig.default_branch,
    operations: runtime.projectProfile.publication.boundary_operations
  });
}

async function acceptedEvidenceSnapshot(github, state) {
  const accepted = [];
  for (const [binding, earliest] of [
    [state.review.evidence_ref, "IN_REVIEW"],
    [state.release_authorization.response_ref, "APPROVED"]
  ]) {
    if (!binding || !("object_id" in binding)) continue;
    accepted.push({
      binding,
      current: await currentEvidenceObject(github, binding),
      expected_context_binding: binding.context_binding,
      earliest_affected_point: earliest
    });
  }
  return accepted;
}

async function currentRoleResult(github, runtime, state, comments) {
  if (!state.assignment) return null;
  const comment = findRoleResult(comments, state.assignment.assignment_id);
  if (!comment) return null;

  const normalized = parseMachinePayload(comment.body, ROLE_RESULT_MARKER);
  const errors = validateSchema(normalized, runtime.roleResultSchema);
  if (errors.length) throw new Error("Durable role result invalid: " + errors.join("; "));

  const assignment = assignmentFromState(state, runtime.projectProfile);
  const claimVerification = verifyRoleResultClaim({
    state,
    normalizedResult: normalized
  });
  if (!claimVerification.valid) {
    throw new Error("Role result claim rejected: " + claimVerification.reason);
  }
  const applied = applyRoleResult({
    state,
    assignment,
    normalizedResult: normalized,
    projectProfile: runtime.projectProfile
  });
  if (!applied.accepted) throw new Error("Role result rejected: " + applied.reason);

  const contextBinding = digest({
    assignment_id: assignment.assignment_id,
    state_version: state.state_version,
    contract_digest: state.contract.digest,
    candidate_digest: state.candidate.digest
  });
  const evidenceRef = acceptMutableEvidence({
    ...roleResultCurrentObject(comment, normalized),
    context_binding: contextBinding
  });

  return { comment, normalized, applied, evidenceRef };
}

function pendingHumanRequest(state) {
  return state.human_requests.active.find((request) => request.status === "PENDING") ?? null;
}

function generateFollowupAssignment(state, runtime, role, purpose, issuedAt) {
  const assignment = generateAssignment({
    state,
    role,
    purpose,
    issued_at: issuedAt,
    context_entrypoints: [
      { kind: "work_item", ref: state.work_item.control_repository + "#" + state.work_item.issue_number },
      { kind: "project_profile", ref: ".agenti/project-profile.json" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" }
    ],
    relevant_inputs: {
      required_evidence_digest: state.checks.required_set_digest,
      target_digest: state.release_authorization.target_digest,
      role_result_digest: null
    },
    independence: {
      required: role === "R",
      must_differ_from_execution_instances: role === "R" ? state.review.author_execution_instances : [],
      enforcement_mechanism: role === "R"
        ? runtime.projectProfile.role_runners.R.independence_mechanism
        : "none"
    }
  });
  state.assignment = assignmentProjection(assignment, Math.max(0, state.state_version - 1));
  return assignment;
}

async function createHumanRequest(github, issueNumber, state, action, roleResult) {
  const requestId = "hir-" + action.idempotence_key.slice(-16);
  const proposed = action.human_request ?? {};
  const contextDigest = digest({
    request_id: requestId,
    state_version: state.state_version,
    contract_digest: state.contract.digest,
    candidate_digest: state.candidate.digest
  });
  const requestPayload = {
    request_id: requestId,
    type: proposed.type ?? "DECISION",
    status: "PENDING",
    raised_by:
      proposed.raised_by ??
      roleResult?.role ??
      (action.transition_id === "T03" ? "A" : "R"),
    context_digest: contextDigest,
    resolution_route: proposed.resolution_route ?? "ANALYST_REEVALUATE",
    question: proposed.question ?? "Human decision is required before automated delivery can continue."
  };
  const comment = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      HUMAN_REQUEST_MARKER,
      [
        "Human input required.",
        "",
        requestPayload.question,
        "",
        "Resolve with:",
        "/agenti resolve " + requestId,
        "<answer>"
      ].join("\n"),
      requestPayload
    )
  );
  const requestRef = acceptMutableEvidence({
    evidence_kind: "issue_comment",
    repository: github.repository,
    object_id: comment.id,
    actor_id: comment.user.id,
    updated_at: comment.updated_at,
    normalized_payload: requestPayload,
    normalized_outcome: "PENDING",
    context_binding: contextDigest
  });
  state.human_requests.active = [{
    request_id: requestId,
    type: requestPayload.type,
    status: "PENDING",
    raised_by: requestPayload.raised_by,
    context_digest: contextDigest,
    resolution_route: requestPayload.resolution_route,
    request_ref: requestRef,
    response_ref: null
  }];
}

async function createReleaseRequest(github, issueNumber, state) {
  const auth = state.release_authorization;
  const payload = {
    authorization_id: auth.authorization_id,
    candidate_digest: auth.candidate_digest,
    target_digest: auth.target_digest,
    gate_digest: auth.gate_digest,
    context_digest: auth.context_digest
  };
  const comment = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      RELEASE_REQUEST_MARKER,
      [
        "Exact-bound Human release authorization required.",
        "",
        "Grant:",
        "/agenti release grant " + auth.authorization_id,
        "",
        "Reject:",
        "/agenti release reject " + auth.authorization_id,
        "<reason>"
      ].join("\n"),
      payload
    )
  );
  auth.request_ref = acceptMutableEvidence({
    evidence_kind: "issue_comment",
    repository: github.repository,
    object_id: comment.id,
    actor_id: comment.user.id,
    updated_at: comment.updated_at,
    normalized_payload: payload,
    normalized_outcome: "PENDING",
    context_binding: auth.context_digest
  });
}

async function ensureAssignmentDispatch(github, runtime, state, comments, issueNumber) {
  if (!state.assignment) return false;
  const assignmentId = state.assignment.assignment_id;
  const result = findRoleResult(comments, assignmentId);
  if (result) return false;
  const claim = findRunClaim(comments, assignmentId);
  if (claim) return false;

  const assignment = assignmentFromState(state, runtime.projectProfile);
  if (!findAssignmentAudit(comments, assignmentId)) {
    await github.createIssueComment(
      issueNumber,
      renderMachineComment(
        ASSIGNMENT_MARKER,
        "Explicit " + assignment.role + " assignment " + assignmentId + ".",
        assignment
      )
    );
  }

  const candidateId =
    assignment.execution_route?.runner_candidate_id ?? null;
  const workflow =
    (
      candidateId
        ? runtime.runtimeConfig.runner?.candidate_workflows?.[candidateId]?.[
            assignment.role
          ]
        : null
    ) ??
    runtime.runtimeConfig.workflows?.[assignment.role] ??
    ({ A: "agenti-role-a.yml", D: "agenti-role-d.yml", R: "agenti-role-r.yml", P: "agenti-publish.yml" })[assignment.role];
  await github.dispatchWorkflow(
    workflow,
    {
      issue_number: String(issueNumber),
      assignment_id: assignmentId
    },
    runtime.runtimeConfig.default_branch
  );
  return true;
}

function invalidateProjection(state, invalidation, runId) {
  const next = structuredClone(state);
  next.state_version += 1;
  next.assignment = null;
  if (invalidation.earliest_affected_point === "ANALYSIS") next.lifecycle = "ANALYSIS";
  if (invalidation.earliest_affected_point === "IN_REVIEW") next.lifecycle = "IN_REVIEW";
  if (invalidation.earliest_affected_point === "APPROVED") next.lifecycle = "APPROVED";
  if (invalidation.stale?.includes("review")) next.review.status = "STALE";
  if (invalidation.stale?.includes("release_authorization")) next.release_authorization.status = "STALE";
  if (invalidation.stale?.includes("publication") && next.publication.status !== "NOT_STARTED") next.publication.status = "STALE";
  next.updated_by = {
    o_run_id: runId,
    transition_id: state.updated_by.transition_id,
    idempotence_key: "projection-invalidation:" + digest({
      prior: state.state_version,
      reason: invalidation.reason,
      earliest: invalidation.earliest_affected_point
    }).slice(7, 39)
  };
  return next;
}

async function buildSnapshot(github, runtime, state, issue, comments) {
  const routingEvidence = routingEvidenceSnapshot({
    comments,
    state,
    observedAt: new Date().toISOString()
  });
  const snapshot = {
    cas_expected_state_version: state?.state_version,
    capacity_observations: routingEvidence.capacity_observations,
    billing_safety_observations:
      routingEvidence.billing_safety_observations,
    ...(routingEvidence.failure
      ? { failure: routingEvidence.failure }
      : {}),
    context_entrypoints: [
      { kind: "work_item", ref: github.repository + "#" + issue.number },
      { kind: "project_profile", ref: ".agenti/project-profile.json" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" }
    ],
    accepted_evidence: state ? await acceptedEvidenceSnapshot(github, state) : [],
    target_digest: targetDigest(github, runtime)
  };

  if (!state) {
    const humanActorIds = new Set(
      runtime.projectProfile.human.principals.map((principal) => principal.actor_id)
    );
    snapshot.intake = {
      accepted:
        issue.labels.some((label) => label.name === runtime.runtimeConfig.intake_label) &&
        humanActorIds.has(issue.user?.id)
    };
    snapshot.work_item = {
      control_repository: github.repository,
      issue_number: issue.number,
      kind: "executable"
    };
    snapshot.contract_digest = digest(issue.body ?? "");
    snapshot.contract_source_ref = "issue:" + issue.number;
    snapshot.contract_revision = issue.updated_at;
    return { snapshot, workingState: null, roleResult: null };
  }

  const workingState = structuredClone(state);
  const currentResult = await currentRoleResult(github, runtime, state, comments);
  const currentContractDigest = digest(issue.body ?? "");

  if (currentContractDigest !== state.contract.digest) {
    if (currentResult?.normalized.role === "A") {
      workingState.contract.digest = currentContractDigest;
      workingState.contract.accepted_revision = issue.updated_at;
    } else {
      snapshot.drift = { ...(snapshot.drift ?? {}), contract_changed: true };
    }
  }

  if (state.candidate.kind === "single" && state.candidate.members[0]?.pr_number) {
    const pull = await github.getPull(state.candidate.members[0].pr_number);
    if (pull.head.sha !== state.candidate.members[0].head_sha) {
      snapshot.drift = { ...(snapshot.drift ?? {}), candidate_changed: true };
    }
  }

  if (currentResult) {
    snapshot.role_result = currentResult.normalized;

    if (currentResult.normalized.role === "A") {
      const dor = definitionOfReady(issue.body ?? "");
      snapshot.dor_passes = dor.ready;
      snapshot.pending_human_request = Boolean(pendingHumanRequest(state));
    }

    if (currentResult.normalized.role === "D") {
      const candidate = candidateStateFromTrusted(state, currentResult.normalized.trusted.candidate);
      snapshot.candidate = candidate;
      const checks = await checkSnapshot(github, runtime.projectProfile, candidate);
      Object.assign(snapshot, checks);
      snapshot.author_execution_instances = [
        currentResult.normalized.trusted.execution_attestation.execution_instance_id
      ];
    }

    if (currentResult.normalized.role === "R") {
      const checks = await checkSnapshot(github, runtime.projectProfile, state.candidate);
      Object.assign(snapshot, checks);
      snapshot.required_gates_current = checks.required_gates_current &&
        currentResult.normalized.payload.reviewed_candidate_digest === state.candidate.digest &&
        currentResult.normalized.payload.reviewed_contract_digest === workingState.contract.digest;
    }
  } else if (state.candidate.kind === "single") {
    const checks = await checkSnapshot(github, runtime.projectProfile, state.candidate);
    Object.assign(snapshot, checks);
    if (state.assignment?.role === "P" && !checks.required_gates_current) {
      snapshot.drift = { ...(snapshot.drift ?? {}), gate_changed: true };
    }
  }

  if (
    state.assignment?.role === "P" &&
    state.release_authorization.status === "GRANTED" &&
    state.release_authorization.target_digest !== snapshot.target_digest
  ) {
    snapshot.drift = { ...(snapshot.drift ?? {}), publication_changed: true };
  }

  const hCommands = humanComments(comments, runtime.projectProfile);
  const request = pendingHumanRequest(state);
  if (request) {
    const resolved = latestMatching(hCommands, (command) => command.kind === "resolve" && command.id === request.request_id);
    if (resolved) {
      const current = humanResponseCurrentObject(resolved.comment, resolved.command, "RESOLVED");
      const responseBinding = acceptMutableEvidence({
        ...current,
        context_binding: request.context_digest
      });
      snapshot.human_resolution = {
        valid: true,
        request_id: request.request_id,
        resolution_route: request.resolution_route,
        earliest_affected_point: request.resolution_route === "ANALYST_REEVALUATE"
          ? "ANALYSIS"
          : state.lifecycle,
        response_binding
      };
    }
  }

  if (state.release_authorization.status === "PENDING") {
    const release = latestMatching(hCommands, (command) =>
      command.kind === "release" && command.id === state.release_authorization.authorization_id
    );
    if (release?.command.decision === "grant") {
      const current = humanResponseCurrentObject(release.comment, release.command, "GRANTED");
      const responseBinding = acceptMutableEvidence({
        ...current,
        context_binding: state.release_authorization.context_digest
      });
      snapshot.release_response = {
        status: "GRANTED",
        authorization_id: state.release_authorization.authorization_id,
        candidate_digest: state.release_authorization.candidate_digest,
        target_digest: state.release_authorization.target_digest,
        gate_digest: state.release_authorization.gate_digest,
        context_digest: state.release_authorization.context_digest,
        response_binding: responseBinding,
        current_response: current
      };
      snapshot.required_gates_current = (await checkSnapshot(github, runtime.projectProfile, state.candidate)).required_gates_current;
      snapshot.required_evidence_digest = (await checkSnapshot(github, runtime.projectProfile, state.candidate)).required_evidence_digest;
    }
    if (release?.command.decision === "reject") {
      snapshot.release_rejection = {
        command: release.command,
        response_binding: acceptMutableEvidence({
          ...humanResponseCurrentObject(release.comment, release.command, "REJECTED"),
          context_binding: state.release_authorization.context_digest
        })
      };
    }
  }

  const latestStopOrReopen = [...hCommands].reverse().find(
    (entry) => entry.command.kind === "stop" || entry.command.kind === "reopen"
  ) ?? null;

  if (
    state.lifecycle !== "STOPPED" &&
    latestStopOrReopen?.command.kind === "stop"
  ) {
    snapshot.stop_authority = {
      valid: true,
      binding: acceptMutableEvidence({
        ...humanResponseCurrentObject(
          latestStopOrReopen.comment,
          latestStopOrReopen.command,
          "STOPPED"
        ),
        context_binding: digest({
          work_item: state.work_item,
          state_version: state.state_version
        })
      })
    };
  }

  if (
    state.lifecycle === "STOPPED" &&
    latestStopOrReopen?.command.kind === "reopen"
  ) {
    snapshot.reopen_authority = {
      valid: true,
      binding: acceptMutableEvidence({
        ...humanResponseCurrentObject(
          latestStopOrReopen.comment,
          latestStopOrReopen.command,
          "REOPENED"
        ),
        context_binding: digest({
          work_item: state.work_item,
          stop_ref: state.stop.record_ref
        })
      })
    };
    snapshot.earliest_lifecycle = "ANALYSIS";
  }

  if (state.publication.status === "SUCCEEDED" && !state.assignment) {
    snapshot.completion = {
      all_objective_conditions_true: true,
      digest: digest({
        candidate_digest: state.publication.candidate_digest,
        published_identity: state.publication.published_identity
      })
    };
  }

  return { snapshot, workingState, roleResult: currentResult };
}

async function applyTransitionSideEffects({
  github,
  runtime,
  issue,
  state,
  action,
  roleResult,
  snapshot
}) {
  const runId = process.env.GITHUB_RUN_ID ?? "local-o";
  let next = projectAction(state, action, runId);

  if (state.claim_control?.active_claim) {
    let terminalReason = null;
    let evidenceRef = null;
    if (roleResult) {
      terminalReason =
        roleResult.normalized.status === "COMPLETED" ? "COMPLETED" :
        roleResult.normalized.status === "BLOCKED" ? "BLOCKED" :
        "FAILED";
      evidenceRef = String(roleResult.comment?.id ?? "");
    } else if (action.transition_id === "T14") {
      terminalReason = "REROUTED";
    } else if (action.transition_id === "T16") {
      terminalReason = "REVOKED_STOP";
    }
    if (terminalReason) {
      next = terminalizeClaim({
        state: next,
        terminalReason,
        durableEvidenceRef: evidenceRef || null
      }).state;
    }
  }

  if (roleResult && state.claim_control?.active_claim) {
    const receipt = next.run_receipts?.[roleResult.normalized.trusted.assignment_id];
    if (receipt) {
      receipt.claim_id = roleResult.normalized.trusted.claim_id;
      receipt.claim_generation = roleResult.normalized.trusted.claim_generation;
    }
  }

  if (roleResult && !action.assignment) next.assignment = null;

  if (roleResult?.normalized.role === "D" && snapshot.candidate) {
    next.review.author_execution_instances = snapshot.author_execution_instances ?? [];
  }

  if (roleResult?.normalized.role === "R") {
    next.review = {
      ...next.review,
      status: "CURRENT",
      candidate_digest: roleResult.normalized.payload.reviewed_candidate_digest,
      outcome: roleResult.normalized.payload.outcome,
      evidence_ref: roleResult.evidenceRef
    };
  }

  if (action.human_request) {
    await createHumanRequest(
      github,
      issue.number,
      next,
      action,
      roleResult?.normalized
    );
    next.assignment = null;
  }

  if (action.transition_id === "T08" && next.release_authorization.status === "PENDING") {
    await createReleaseRequest(github, issue.number, next);
    next.assignment = null;
  }

  if (action.transition_id === "T10") {
    const request = pendingHumanRequest(state);
    if (request) {
      const resolved = snapshot.human_resolution.response_binding;
      next.human_requests.active = [];
      next.human_requests.recent_refs = [
        ...next.human_requests.recent_refs.slice(-9),
        resolved
      ];
      next.lifecycle = action.route === "ANALYST_REEVALUATE" ? "ANALYSIS" : next.lifecycle;
      const role = action.route === "ANALYST_REEVALUATE"
        ? "A"
        : (request.raised_by === "P" ? "A" : request.raised_by);
      generateFollowupAssignment(
        next,
        runtime,
        role,
        action.route === "ANALYST_REEVALUATE" ? "REEVALUATE_AFTER_HUMAN" : "RESUME_AFTER_HUMAN_RECHECK",
        new Date().toISOString()
      );
    }
  }

  if (action.transition_id === "T14" && state.assignment) {
    generateFollowupAssignment(
      next,
      runtime,
      state.assignment.role,
      state.assignment.purpose,
      new Date().toISOString()
    );
  }

  if (action.transition_id === "T17") {
    next.lifecycle = "ANALYSIS";
    generateFollowupAssignment(next, runtime, "A", "REOPEN_RECONSTRUCT", new Date().toISOString());
  }

  if (action.transition_id === "T11" && action.publication) {
    next.publication = {
      status: action.publication.publication_status,
      candidate_digest: action.publication.consumed_candidate_digest,
      evidence_refs: action.publication.deterministic_verification_refs ?? [],
      published_identity: action.publication.actual_published_identity ?? null
    };
    if (!action.assignment) next.assignment = null;
  }

  return next;
}

async function projectLabels(github, issueNumber, state, runtimeConfig) {
  const wanted = new Set(["agenti:managed"]);
  if (pendingHumanRequest(state)) wanted.add(runtimeConfig.human_queue_labels.input);
  if (state.release_authorization.status === "PENDING") wanted.add(runtimeConfig.human_queue_labels.release);
  if (state.lifecycle === "BLOCKED") wanted.add("agenti:blocked");
  if (state.lifecycle === "STOPPED") wanted.add("agenti:stopped");
  if (state.lifecycle === "DONE") wanted.add("agenti:done");

  const managedLabels = [
    "agenti:waiting-human",
    "agenti:release-approval",
    "agenti:blocked",
    "agenti:stopped",
    "agenti:done"
  ];
  await github.addLabels(issueNumber, [...wanted]);
  for (const label of managedLabels) {
    if (!wanted.has(label)) await github.removeLabel(issueNumber, label);
  }
}

export async function processIssue(issueNumber) {
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const transitionTable = await readJson(".agenti-runtime/core/transitions.json");

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const issue = await github.getIssue(issueNumber);
    const loaded = await loadState(github, issueNumber, runtime.workflowStateSchema);

    if (loaded.state?.assignment) {
      const roleComment = findRoleResult(loaded.comments, loaded.state.assignment.assignment_id);
      const claim =
        loaded.state.claim_control?.active_claim?.assignment_id ===
        loaded.state.assignment.assignment_id
          ? loaded.state.claim_control.active_claim
          : null;
      if (!roleComment && !claim) {
        await ensureAssignmentDispatch(github, runtime, loaded.state, loaded.comments, issueNumber);
        return { status: "DISPATCH_REPAIRED", assignment: loaded.state.assignment.assignment_id };
      }
    }

    const built = await buildSnapshot(github, runtime, loaded.state, issue, loaded.comments);
    let state = built.workingState;

    if (state && built.snapshot.release_rejection) {
      const next = structuredClone(state);
      next.state_version += 1;
      next.lifecycle = "BLOCKED";
      next.assignment = null;
      next.release_authorization.status = "REJECTED";
      next.release_authorization.response_ref = built.snapshot.release_rejection.response_binding;
      next.updated_by = {
        o_run_id: process.env.GITHUB_RUN_ID ?? "local-o",
        transition_id: state.updated_by.transition_id,
        idempotence_key: "release-rejected:" + digest(built.snapshot.release_rejection.command).slice(7, 39)
      };
      await saveStateCAS(
        github,
        issueNumber,
        next,
        runtime.workflowStateSchema,
        loaded.comment,
        state.state_version,
        state.claim_control?.claim_version ?? 0
      );
      await projectLabels(github, issueNumber, next, runtime.runtimeConfig);
      return { status: "WAITING_AFTER_RELEASE_REJECTION" };
    }

    const action = evaluate(
      runtime.projectProfile,
      state,
      built.snapshot,
      { observed_at: new Date().toISOString() },
      transitionTable
    );

    if (action.kind === "NO_OP") {
      if (state) await projectLabels(github, issueNumber, state, runtime.runtimeConfig);
      return { status: "NO_OP", reason: action.reason };
    }
    if (action.kind === "BLOCKED") return { status: "BLOCKED", reason: action.reason, errors: action.errors };
    if (action.kind === "INVALIDATE") {
      let next = invalidateProjection(state, action, process.env.GITHUB_RUN_ID ?? "local-o");
      if (state.claim_control?.active_claim) {
        next = terminalizeClaim({
          state: next,
          terminalReason: "REVOKED_DRIFT"
        }).state;
      }
      await saveStateCAS(
        github,
        issueNumber,
        next,
        runtime.workflowStateSchema,
        loaded.comment,
        state.state_version,
        state.claim_control?.claim_version ?? 0
      );
      await projectLabels(github, issueNumber, next, runtime.runtimeConfig);
      return { status: "INVALIDATED", reason: action.reason, earliest: action.earliest_affected_point };
    }

    let next;
    if (!state && action.transition_id === "T01") {
      next = initialProjection(action, runtime.projectProfile.runtime_version);
    } else {
      next = await applyTransitionSideEffects({
        github,
        runtime,
        issue,
        state,
        action,
        roleResult: built.roleResult,
        snapshot: built.snapshot
      });
    }

    const saved = await saveStateCAS(
      github,
      issueNumber,
      next,
      runtime.workflowStateSchema,
      loaded.comment,
      state ? state.state_version : null,
      state ? (state.claim_control?.claim_version ?? 0) : null
    );
    await projectLabels(github, issueNumber, next, runtime.runtimeConfig);

    if (next.assignment) {
      const comments = await github.listIssueComments(issueNumber);
      await ensureAssignmentDispatch(github, runtime, next, comments, issueNumber);
      return { status: "ASSIGNED", role: next.assignment.role, assignment_id: next.assignment.assignment_id };
    }

    if (next.lifecycle === "BLOCKED" || next.lifecycle === "STOPPED" || next.release_authorization.status === "PENDING") {
      return { status: "HUMAN_BOUNDARY", lifecycle: next.lifecycle };
    }
    if (next.lifecycle === "DONE") return { status: "DONE" };

    // T11 without post-publication R intentionally continues to T13 in the same wake.
    if (action.transition_id !== "T11") return { status: "TRANSITIONED", transition: action.transition_id, state_comment: saved.id };
  }
  throw new Error("NON_CONVERGENT_ORCHESTRATOR_LOOP");
}

export async function processAllManaged() {
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const issues = await github.listManagedIssues(runtime.runtimeConfig.intake_label);
  const results = [];
  for (const issue of issues.filter((item) => !item.pull_request)) {
    await github.dispatchWorkflow(
      runtime.runtimeConfig.workflows?.orchestrate ?? "agenti-orchestrate.yml",
      {
        issue_number: String(issue.number),
        wake_kind: "agenti.reconcile",
        assignment_id: "",
        result_ref: ""
      },
      runtime.runtimeConfig.default_branch
    );
    results.push({ issue: issue.number, dispatched: true });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--all")) {
    console.log(JSON.stringify(await processAllManaged(), null, 2));
    return;
  }
  const issueArg = args.find((arg) => /^\d+$/.test(arg));
  if (!issueArg) throw new Error("Usage: orchestrate.mjs ISSUE | --all");
  console.log(JSON.stringify(await processIssue(Number(issueArg)), null, 2));
}

if (import.meta.url === "file://" + process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
