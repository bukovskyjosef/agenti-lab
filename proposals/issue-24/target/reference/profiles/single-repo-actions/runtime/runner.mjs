import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  acquireClaimCAS,
  digest,
  normalizeRoleResult,
  selectRunnerCandidate,
  terminalizeClaim,
  verifyActiveClaim,
  validateSchema
} from "../core/index.mjs";
import { githubClientFromEnv } from "./github.mjs";
import {
  isTrustedActionsActor,
  loadState,
  parseMachinePayload,
  renderMachineComment,
  ROLE_RESULT_MARKER,
  saveStateCAS
} from "./state.mjs";
import { applyContractOperations } from "./contract.mjs";

const ROLE_SCHEMA = {
  A: "analyst-proposal.schema.json",
  D: "developer-proposal.schema.json",
  R: "reviewer-proposal.schema.json"
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadRuntime() {
  const controlRoot = process.env.AGENTI_CONTROL_ROOT;
  if (!controlRoot) {
    return {
      projectProfile: await readJson(".agenti/project-profile.json"),
      runtimeConfig: await readJson(".agenti/single-repo-actions.json"),
      workflowStateSchema: await readJson(".agenti-runtime/schemas/workflow-state.schema.json"),
      assignmentSchema: await readJson(".agenti-runtime/schemas/assignment.schema.json"),
      roleResultSchema: await readJson(".agenti-runtime/schemas/role-result.schema.json"),
      adapterRoot: ".agenti-runtime/adapters",
      transitionTable: await readJson(".agenti-runtime/core/transitions.json"),
      trustBinding: null,
      projectControlRef: ".agenti/project-profile.json",
      projectBillingSafetyObservations: []
    };
  }

  const repository = process.env.AGENTI_TARGET_REPOSITORY ?? process.env.GITHUB_REPOSITORY;
  const registry = await readJson(controlRoot + "/projects/registry.yml");
  const mapping = registry.projects?.[repository];
  if (!mapping) throw new Error("CONTROL_PLANE_PROJECT_MAPPING_MISSING");
  if (!["automated", "single-repo-actions"].includes(mapping.selected_profile)) {
    throw new Error("CONTROL_PLANE_PROFILE_NOT_AUTOMATED: " + mapping.selected_profile);
  }
  const project = await readJson(controlRoot + "/" + mapping.project_control);
  if (project.repository !== repository || project.project_id !== mapping.project_id) {
    throw new Error("CONTROL_PLANE_PROJECT_MAPPING_INCONSISTENT");
  }

  const projectProfile = structuredClone(
    await readJson(controlRoot + "/profiles/automated/single-repo-actions/project-profile.json")
  );
  projectProfile.control_repository = repository;
  projectProfile.human.principals = structuredClone(project.human_principals ?? []);
  projectProfile.required_checks = structuredClone(project.required_checks ?? projectProfile.required_checks ?? []);
  if (project.publication?.boundary_operations) {
    projectProfile.publication.boundary_operations = structuredClone(project.publication.boundary_operations);
  }

  const humanActorIds = new Set(
    projectProfile.human.principals.map((principal) => Number(principal.actor_id))
  );
  const projectBillingSafetyObservations = (project.runner_evidence?.billing_safety ?? []).map((entry) => {
    if (
      entry.source?.kind !== "ADMIN_POLICY_ATTESTATION" ||
      entry.source?.trust !== "EXTERNAL_CURRENT_EVIDENCE"
    ) {
      throw new Error("PROJECT_BILLING_SAFETY_SOURCE_UNSUPPORTED");
    }
    if (
      !entry.attested_by ||
      !humanActorIds.has(Number(entry.attested_by.actor_id)) ||
      typeof entry.attested_by.evidence_ref !== "string" ||
      entry.attested_by.evidence_ref.length === 0
    ) {
      throw new Error("PROJECT_BILLING_SAFETY_HUMAN_ATTESTATION_INVALID");
    }
    const body = {
      runner_candidate_id: entry.runner_candidate_id,
      status: entry.status,
      observed_at: entry.observed_at,
      valid_until: entry.valid_until ?? null,
      source: {
        kind: entry.source.kind,
        trust: entry.source.trust
      }
    };
    return { ...body, evidence_digest: digest(body) };
  });

  const runtimeConfig = structuredClone(
    await readJson(controlRoot + "/profiles/automated/single-repo-actions/runtime.json")
  );
  runtimeConfig.default_branch = process.env.AGENTI_DEFAULT_BRANCH ?? runtimeConfig.default_branch;

  const trustBinding = {
    product_bootstrap_sha: process.env.AGENTI_PRODUCT_BOOTSTRAP_SHA,
    control_plane_repository: process.env.AGENTI_CONTROL_PLANE_REPOSITORY,
    control_plane_sha: process.env.AGENTI_CONTROL_PLANE_SHA,
    project_id: mapping.project_id,
    profile_id: mapping.selected_profile
  };
  for (const [key, value] of Object.entries(trustBinding)) {
    if (!value) throw new Error("TRUST_BINDING_MISSING_" + key.toUpperCase());
  }

  return {
    projectProfile,
    runtimeConfig,
    workflowStateSchema: await readJson(controlRoot + "/reference/schemas/workflow-state.schema.json"),
    assignmentSchema: await readJson(controlRoot + "/reference/schemas/assignment.schema.json"),
    roleResultSchema: await readJson(controlRoot + "/reference/schemas/role-result.schema.json"),
    adapterRoot: controlRoot + "/reference/adapters",
    transitionTable: await readJson(controlRoot + "/reference/core/transitions.json"),
    trustBinding,
    projectControlRef: mapping.project_control,
    projectBillingSafetyObservations
  };
}

export function assignmentFromState(state, profile) {
  if (!state.assignment) throw new Error("No current assignment");
  const a = state.assignment;
  if (process.env.AGENTI_REQUIRE_ASSIGNMENT_TRUST === "true") {
    const expected = {
      product_bootstrap_sha: process.env.AGENTI_PRODUCT_BOOTSTRAP_SHA,
      control_plane_repository: process.env.AGENTI_CONTROL_PLANE_REPOSITORY,
      control_plane_sha: process.env.AGENTI_CONTROL_PLANE_SHA,
      project_id: process.env.AGENTI_PROJECT_ID,
      profile_id: process.env.AGENTI_SELECTED_PROFILE
    };
    if (!a.trust_binding) throw new Error("ASSIGNMENT_TRUST_BINDING_MISSING");
    for (const [key, value] of Object.entries(expected)) {
      if (!value || a.trust_binding[key] !== value) {
        throw new Error("ASSIGNMENT_TRUST_BINDING_STALE: " + key);
      }
    }
  }
  return {
    schema_version: 1,
    assignment_id: a.assignment_id,
    issued_at: new Date().toISOString(),
    role: a.role,
    purpose: a.purpose,
    work_item: {
      control_repository: state.work_item.control_repository,
      issue_number: state.work_item.issue_number
    },
    execution_repository: {
      repository: state.work_item.control_repository
    },
    ...(a.trust_binding ? { trust_binding: structuredClone(a.trust_binding) } : {}),
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
    ...(a.semantic_work_digest
      ? {
          semantic_work_digest: a.semantic_work_digest,
          execution_route: a.execution_route
        }
      : {}),
    context_entrypoints: [
      { kind: "work_item", ref: state.work_item.control_repository + "#" + state.work_item.issue_number },
      {
        kind: "project_profile",
        ref: a.trust_binding
          ? a.trust_binding.control_plane_repository + "@" + a.trust_binding.control_plane_sha + ":" + (process.env.AGENTI_PROJECT_ID ? "projects/" + process.env.AGENTI_PROJECT_ID + "/project.yml" : "projects/registry.yml")
          : ".agenti/project-profile.json"
      },
      { kind: "agent_entrypoint", ref: "AGENTS.md@" + (a.trust_binding?.product_bootstrap_sha ?? "local-fixture") }
    ],
    capability_profile: a.capability_profile,
    claim: { required: true },
    independence: {
      required: a.role === "R",
      must_differ_from_execution_instances: a.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: a.role === "R"
        ? profile.role_runners.R.independence_mechanism
        : "none"
    },
    completion: {
      result_schema_version: 1,
      result_marker: "agenti-role-result:v1",
      callback_event: "agenti.role-result"
    }
  };
}

function writeOutput(name, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  return import("node:fs").then(({ appendFileSync }) => {
    appendFileSync(path, name + "=" + String(value).replaceAll("\n", "%0A") + "\n");
  });
}

export function sanitizeProposal(role, proposal) {
  const copy = structuredClone(proposal);
  copy.evidence_refs = [];
  if (role === "D") {
    copy.payload.author_validation = {
      ...copy.payload.author_validation,
      refs: []
    };
  }
  if (role === "R") {
    copy.payload.findings = (copy.payload.findings ?? []).map((finding) => ({
      ...finding,
      evidence_refs: []
    }));
  }
  return copy;
}

export async function callback(github, runtimeConfig, issueNumber, assignmentId, resultRef) {
  await github.dispatchWorkflow(
    runtimeConfig.workflows?.orchestrate ?? "agenti-orchestrate.yml",
    {
      issue_number: String(issueNumber),
      wake_kind: "agenti.role-result",
      assignment_id: assignmentId,
      result_ref: String(resultRef)
    },
    runtimeConfig.default_branch
  );
}


const CAPACITY_MARKER = "agenti-capacity:v1";
const BILLING_SAFETY_MARKER = "agenti-billing-safety:v1";

function pendingHumanStop(comments, profile) {
  const humanIds = new Set(
    (profile.human?.principals ?? []).map((principal) =>
      Number(principal.actor_id)
    )
  );
  const commands = comments
    .filter((comment) => humanIds.has(Number(comment.user?.id)))
    .map((comment) => {
      const body = (comment.body ?? "").trim();
      if (/^\/agenti\s+stop(?:\s|$)/i.test(body)) {
        return { kind: "stop", comment };
      }
      if (/^\/agenti\s+reopen(?:\s|$)/i.test(body)) {
        return { kind: "reopen", comment };
      }
      return null;
    })
    .filter(Boolean);
  const latest = commands.at(-1);
  return latest?.kind === "stop" ? latest : null;
}

function trustedRoutingPayloads(comments, marker) {
  return comments
    .filter(
      (comment) =>
        isTrustedActionsActor(comment) &&
        comment.body?.includes(marker)
    )
    .map((comment) => parseMachinePayload(comment.body, marker))
    .filter(Boolean);
}

function releaseTargetDigest(github, runtime) {
  return digest({
    repository: github.repository,
    target_branch: runtime.runtimeConfig.default_branch,
    operations: runtime.projectProfile.publication.boundary_operations
  });
}

async function currentMutableEvidence(github, binding) {
  if (!binding || !("object_id" in binding)) return { current: true };
  let comment;
  try {
    comment = await github.getIssueComment(binding.object_id);
  } catch (error) {
    if (String(error.message).includes("failed 404")) {
      return { current: false, reason: "EVIDENCE_DELETED" };
    }
    throw error;
  }
  if (
    binding.actor_id !== undefined &&
    Number(comment.user?.id) !== Number(binding.actor_id)
  ) {
    return { current: false, reason: "EVIDENCE_ACTOR_CHANGED" };
  }
  if (
    binding.updated_at &&
    comment.updated_at !== binding.updated_at
  ) {
    return { current: false, reason: "EVIDENCE_CHANGED" };
  }
  return { current: true };
}

async function requiredChecksCurrent(github, profile, state) {
  const required = profile.required_checks ?? [];
  if (required.length === 0) return { current: true };
  const member = state.candidate?.members?.[0];
  if (!member?.head_sha) return { current: false, reason: "CANDIDATE_HEAD_MISSING" };
  const runs = await github.getChecksForRef(member.head_sha);
  for (const name of required) {
    const matches = runs
      .filter((run) => run.name === name)
      .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
    const latest = matches[0];
    if (
      !latest ||
      latest.status !== "completed" ||
      latest.conclusion !== "success" ||
      (latest.head_sha && latest.head_sha !== member.head_sha)
    ) {
      return { current: false, reason: "REQUIRED_CHECK_NOT_CURRENT:" + name };
    }
  }
  return { current: true };
}

export async function preClaimCurrentness({
  github,
  runtime,
  state,
  assignment,
  comments,
  observedAt = new Date().toISOString(),
  checkRouting = true
}) {
  if (!state?.assignment) return { current: false, reason: "ASSIGNMENT_MISSING" };
  if (state.lifecycle === "STOPPED") return { current: false, reason: "WORK_ITEM_STOPPED" };
  if (
    state.material_operation?.status === "PREPARED" ||
    state.material_operation?.status === "HUMAN_ACTION_REQUIRED"
  ) {
    return {
      current: false,
      reason: "MATERIAL_OPERATION_RECONCILIATION_REQUIRED"
    };
  }
  if (
    (state.human_requests?.active ?? []).some(
      (request) => request.status === "PENDING"
    )
  ) {
    return { current: false, reason: "HUMAN_INPUT_PENDING" };
  }
  const stop = pendingHumanStop(comments, runtime.projectProfile);
  if (stop) {
    return {
      current: false,
      reason: "HUMAN_STOP_PENDING",
      stop_comment_id: stop.comment.id
    };
  }

  const issue = await github.getIssue(state.work_item.issue_number);
  if (digest(issue.body ?? "") !== state.contract.digest) {
    return { current: false, reason: "CONTRACT_DRIFT_BEFORE_CLAIM", issue };
  }

  let currentPull = null;
  if (state.candidate?.kind === "single") {
    const member = state.candidate.members?.[0];
    if (!member?.pr_number || !member?.head_sha) {
      return { current: false, reason: "CANDIDATE_BINDING_INCOMPLETE", issue };
    }
    const pull = await github.getPull(member.pr_number);
    currentPull = pull;
    if (pull.head?.sha !== member.head_sha) {
      return { current: false, reason: "CANDIDATE_HEAD_DRIFT_BEFORE_CLAIM", issue, pull };
    }
    if (
      member.base_ref_or_sha &&
      member.base_ref_or_sha !== pull.base?.sha &&
      member.base_ref_or_sha !== pull.base?.ref
    ) {
      return { current: false, reason: "CANDIDATE_BASE_DRIFT_BEFORE_CLAIM", issue, pull };
    }
  }

  if (checkRouting && assignment.execution_route) {
    const capacity = trustedRoutingPayloads(comments, CAPACITY_MARKER);
    const billing = [
      ...(runtime.projectBillingSafetyObservations ?? []),
      ...trustedRoutingPayloads(comments, BILLING_SAFETY_MARKER)
    ];
    let selection;
    try {
      selection = selectRunnerCandidate({
        profile: runtime.projectProfile,
        role: assignment.role,
        purpose: assignment.purpose,
        capability_profile: assignment.capability_profile,
        semantic_work_digest: assignment.semantic_work_digest,
        capacity_observations: capacity,
        billing_safety_observations: billing,
        routing_attempt_generation:
          assignment.execution_route.routing_attempt_generation ?? 0,
        observed_at: observedAt
      });
    } catch (error) {
      return {
        current: false,
        reason: "ROUTING_CURRENTNESS_ERROR:" + String(error.message ?? error),
        issue
      };
    }
    if (selection.kind !== "SELECTED") {
      return { current: false, reason: "ROUTE_NOT_CURRENT", issue };
    }
    if (digest(selection.execution_route) !== digest(assignment.execution_route)) {
      return { current: false, reason: "ROUTE_CHANGED_BEFORE_CLAIM", issue };
    }
  }

  let targetBinding;
  if (
    assignment.role === "D" &&
    state.candidate?.kind !== "single"
  ) {
    const branch = await github.getBranch(
      runtime.runtimeConfig.default_branch
    );
    const baseSha = branch.commit?.sha;
    if (!baseSha) {
      return {
        current: false,
        reason: "DEFAULT_BRANCH_HEAD_UNAVAILABLE",
        issue
      };
    }
    targetBinding = {
      kind: "D_BASE",
      repository: github.repository,
      branch: runtime.runtimeConfig.default_branch,
      base_sha: baseSha
    };
  } else if (state.candidate?.kind === "single") {
    const member = state.candidate.members[0];
    targetBinding = {
      kind: assignment.role === "P" ? "PUBLISH_CANDIDATE" : "CANDIDATE",
      repository: member.repository,
      pr_number: member.pr_number,
      head_sha: member.head_sha,
      base_ref_or_sha: member.base_ref_or_sha,
      observed_pull_base_sha: currentPull?.base?.sha ?? null
    };
  } else {
    targetBinding = {
      kind: "CONTRACT",
      repository: github.repository,
      contract_digest: state.contract.digest
    };
  }

  if (assignment.role === "P") {
    if (
      runtime.projectProfile.release_authorization?.required &&
      state.release_authorization?.status !== "GRANTED"
    ) {
      return { current: false, reason: "RELEASE_AUTHORIZATION_NOT_CURRENT", issue };
    }
    if (
      state.release_authorization?.candidate_digest &&
      state.release_authorization.candidate_digest !== state.candidate?.digest
    ) {
      return { current: false, reason: "RELEASE_CANDIDATE_DRIFT", issue };
    }
    if (
      state.release_authorization?.target_digest &&
      state.release_authorization.target_digest !==
        releaseTargetDigest(github, runtime)
    ) {
      return { current: false, reason: "RELEASE_TARGET_DRIFT", issue };
    }
    const checks = await requiredChecksCurrent(
      github,
      runtime.projectProfile,
      state
    );
    if (!checks.current) return { ...checks, issue };

    const responseCurrent = await currentMutableEvidence(
      github,
      state.release_authorization?.response_ref
    );
    if (!responseCurrent.current) {
      return {
        current: false,
        reason: "RELEASE_EVIDENCE_" + responseCurrent.reason,
        issue
      };
    }
    targetBinding = {
      ...targetBinding,
      release_target_digest: releaseTargetDigest(github, runtime),
      release_gate_digest: state.release_authorization?.gate_digest ?? null,
      release_authorization_id:
        state.release_authorization?.authorization_id ?? null
    };
  }

  return {
    current: true,
    issue,
    target_binding: targetBinding,
    target_digest: digest(targetBinding)
  };
}

export async function prepareRun({ role, issueNumber, assignmentId, outDir = ".agenti-run" }) {
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const loaded = await loadState(github, issueNumber, runtime.workflowStateSchema);
  const state = loaded.state;
  if (!state?.assignment) throw new Error("No current assignment");
  if (state.assignment.assignment_id !== assignmentId) throw new Error("STALE_ASSIGNMENT_ID");
  if (state.assignment.role !== role) throw new Error("OUT_OF_ROLE_ASSIGNMENT");
  if (state.assignment.bound_state_version !== state.state_version) throw new Error("STALE_ASSIGNMENT_VERSION");

  const expectedCandidate = process.env.AGENTI_EXPECTED_RUNNER_CANDIDATE ?? "";
  if (
    expectedCandidate &&
    state.assignment.execution_route?.runner_candidate_id !== expectedCandidate
  ) {
    throw new Error("ROUTING_CANDIDATE_WORKFLOW_MISMATCH");
  }

  const assignment = assignmentFromState(state, runtime.projectProfile);
  const assignmentErrors = validateSchema(assignment, runtime.assignmentSchema);
  if (assignmentErrors.length) throw new Error("Assignment schema invalid: " + assignmentErrors.join("; "));

  const preCurrent = await preClaimCurrentness({
    github,
    runtime,
    state,
    assignment,
    comments: loaded.comments
  });
  if (!preCurrent.current) {
    await writeOutput("skip", "true");
    await writeOutput("claim_reason", preCurrent.reason);
    return { skip: true, reason: preCurrent.reason };
  }

  const executionInstanceId = "exec-" + randomUUID();
  if (role === "R" && assignment.independence.must_differ_from_execution_instances.includes(executionInstanceId)) {
    throw new Error("INDEPENDENCE_COLLISION");
  }

  const attestation = {
    adapter_id: state.assignment.execution_route?.adapter_id ??
      (role === "P" ? "deterministic-actions-publisher" : "codex-action"),
    adapter_version: state.assignment.execution_route?.adapter_version ?? "1",
    execution_instance_id: executionInstanceId,
    platform_run: {
      provider: "github-actions",
      run_id: process.env.GITHUB_RUN_ID ?? "local",
      run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
      job_or_worker_id: process.env.GITHUB_JOB ?? null
    },
    provider_session: {
      mode: "fresh",
      provider_session_id: null
    },
    issued_for_assignment: assignment.assignment_id,
    attested_by: "deterministic-wrapper"
  };

  const recoveryMode = runtime.projectProfile.work_item_claims?.recovery?.mode ?? "MANUAL_H";
  const leaseMode =
    recoveryMode === "PLATFORM_RUN" ? "PLATFORM_RUN" :
    recoveryMode === "EXPIRING_HEARTBEAT" ? "EXPIRING_HEARTBEAT" :
    "NONE";
  const claimRequest = {
    schema_version: 1,
    work_item: assignment.work_item,
    assignment_id: assignment.assignment_id,
    role: assignment.role,
    purpose: assignment.purpose,
    expected: {
      workflow_state_version: state.state_version,
      claim_version: state.claim_control?.claim_version ?? 0,
      assignment_freshness_fingerprint: assignment.state.fingerprint,
      semantic_work_digest: assignment.semantic_work_digest ?? null,
      candidate_digest: state.candidate?.digest ?? null,
      target_digest: preCurrent.target_digest,
      active_claim: "ABSENT"
    },
    claimant: { execution_attestation: attestation },
    lease: { mode: leaseMode },
    requested_at: new Date().toISOString(),
    request_id: "claim-request-" + randomUUID()
  };
  const acquired = acquireClaimCAS({
    state,
    request: claimRequest,
    acquiredAt: claimRequest.requested_at
  });
  if (!acquired.acquired) {
    await writeOutput("skip", "true");
    await writeOutput("claim_reason", acquired.reason);
    return { skip: true, reason: acquired.reason };
  }

  await saveStateCAS(
    github,
    issueNumber,
    acquired.state,
    runtime.workflowStateSchema,
    loaded.comment,
    state.state_version,
    state.claim_control?.claim_version ?? 0
  );
  const claimGrant = acquired.grant;

  const claimed = await loadState(
    github,
    issueNumber,
    runtime.workflowStateSchema
  );
  const claimCheck = verifyActiveClaim({
    state: claimed.state,
    assignmentId: assignment.assignment_id,
    claimId: claimGrant.claim_id,
    claimGeneration: claimGrant.claim_generation,
    executionInstanceId
  });
  if (!claimCheck.valid) {
    await writeOutput("skip", "true");
    await writeOutput("claim_reason", claimCheck.reason);
    return { skip: true, reason: claimCheck.reason };
  }

  const postAssignment = assignmentFromState(
    claimed.state,
    runtime.projectProfile
  );
  const postCurrent = await preClaimCurrentness({
    github,
    runtime,
    state: claimed.state,
    assignment: postAssignment,
    comments: claimed.comments
  });
  if (
    postCurrent.current &&
    postCurrent.target_digest !== claimGrant.binding.target_digest
  ) {
    postCurrent.current = false;
    postCurrent.reason = "TARGET_BINDING_DRIFT_AFTER_CLAIM";
  }
  if (!postCurrent.current) {
    const revoked = terminalizeClaim({
      state: claimed.state,
      terminalReason: "REVOKED_DRIFT",
      durableEvidenceRef: "pre-provider-currentness:" + postCurrent.reason
    }).state;
    await saveStateCAS(
      github,
      issueNumber,
      revoked,
      runtime.workflowStateSchema,
      claimed.comment,
      claimed.state.state_version,
      claimed.state.claim_control?.claim_version ?? 0
    );
    await writeOutput("skip", "true");
    await writeOutput("claim_reason", postCurrent.reason);
    return { skip: true, reason: postCurrent.reason };
  }

  const issue = postCurrent.issue;
  await mkdir(outDir, { recursive: true });
  await writeFile(outDir + "/assignment.json", JSON.stringify(assignment, null, 2));
  await writeFile(
    outDir + "/run-context.json",
    JSON.stringify({
      attestation,
      claim_grant: claimGrant,
      target_binding: postCurrent.target_binding
    }, null, 2)
  );
  await writeFile(outDir + "/work-item.md", issue.body ?? "");
  await writeFile(outDir + "/comments.json", JSON.stringify(loaded.comments, null, 2));

  await writeOutput("skip", "false");
  await writeOutput("claim_id", claimGrant.claim_id);
  await writeOutput("claim_generation", claimGrant.claim_generation);
  await writeOutput("execution_instance_id", executionInstanceId);
  await writeOutput(
    "candidate_ref",
    assignment.candidate.members?.[0]?.head_sha ??
      postCurrent.target_binding?.base_sha ??
      runtime.runtimeConfig.default_branch
  );
  return {
    skip: false,
    assignment,
    attestation,
    claimGrant,
    targetBinding: postCurrent.target_binding
  };
}

export async function finalizeRun({ role, issueNumber, assignmentId, proposalPath, contextPath = ".agenti-run/run-context.json" }) {
  if (!["A", "R"].includes(role)) throw new Error("finalizeRun handles only A/R; D uses candidate-writer");
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const loaded = await loadState(github, issueNumber, runtime.workflowStateSchema);
  const state = loaded.state;
  if (!state?.assignment || state.assignment.assignment_id !== assignmentId || state.assignment.role !== role) {
    throw new Error("ASSIGNMENT_NOT_CURRENT");
  }

  const assignment = assignmentFromState(state, runtime.projectProfile);
  const rawProposal = await readJson(proposalPath);
  const adapterId = assignment.execution_route?.adapter_id ?? "codex-action";
  const schemaAdapter = adapterId === "claude-code-action"
    ? "claude-code-action"
    : "codex-action";
  const proposalSchema = await readJson(
    runtime.adapterRoot + "/" + schemaAdapter + "/schemas/" + ROLE_SCHEMA[role]
  );
  const proposalErrors = validateSchema(rawProposal, proposalSchema);
  if (proposalErrors.length) throw new Error("Provider proposal invalid: " + proposalErrors.join("; "));
  const proposal = sanitizeProposal(role, rawProposal);
  const runContext = await readJson(contextPath);
  const claimGrant = runContext.claim_grant;
  const claimCheck = verifyActiveClaim({
    state,
    assignmentId: assignment.assignment_id,
    claimId: claimGrant?.claim_id,
    claimGeneration: claimGrant?.claim_generation,
    executionInstanceId: runContext.attestation?.execution_instance_id
  });
  if (!claimCheck.valid) throw new Error("CLAIM_NOT_CURRENT: " + claimCheck.reason);

  const writerCurrent = await preClaimCurrentness({
    github,
    runtime,
    state,
    assignment,
    comments: loaded.comments,
    checkRouting: false
  });
  if (!writerCurrent.current) {
    throw new Error("WRITER_CURRENTNESS_FAILED: " + writerCurrent.reason);
  }
  if (writerCurrent.target_digest !== claimGrant.binding.target_digest) {
    throw new Error("WRITER_TARGET_BINDING_DRIFT");
  }

  const trustedFacts = {
    assignment_id: assignment.assignment_id,
    claim_id: claimGrant.claim_id,
    claim_generation: claimGrant.claim_generation,
    observed_state_version: assignment.state.version,
    observed_fingerprint: assignment.state.fingerprint,
    execution_attestation: runContext.attestation,
    actual_billing_mode:
      assignment.execution_route?.billing_mode ?? null,
    candidate: role === "R" && state.candidate.kind === "single"
      ? {
          repository: state.candidate.members[0].repository,
          pr_number: state.candidate.members[0].pr_number,
          head_sha: state.candidate.members[0].head_sha,
          base_ref_or_sha: state.candidate.members[0].base_ref_or_sha,
          candidate_digest: state.candidate.digest
        }
      : null
  };

  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts,
    assignment,
    roleResultSchema: runtime.roleResultSchema
  });

  if (role === "A" && normalized.status === "COMPLETED") {
    const issue = await github.getIssue(issueNumber);
    const actualDigest = digest(issue.body ?? "");
    const nextBody = applyContractOperations(
      issue.body ?? "",
      normalized.payload.contract_operations,
      normalized.payload.base_contract_digest,
      actualDigest
    );
    if (nextBody !== issue.body) await github.updateIssue(issueNumber, { body: nextBody });
  }

  const resultComment = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      ROLE_RESULT_MARKER,
      role + " normalized result for assignment " + assignmentId + ".",
      normalized
    )
  );
  await callback(github, runtime.runtimeConfig, issueNumber, assignmentId, resultComment.id);
  return { normalized, resultComment };
}

async function main() {
  const [command, role, issueRaw, assignmentId, arg4] = process.argv.slice(2);
  const issueNumber = Number(issueRaw);
  if (!Number.isInteger(issueNumber)) throw new Error("issue number required");
  if (command === "prepare") {
    await prepareRun({ role, issueNumber, assignmentId, outDir: arg4 || ".agenti-run" });
    return;
  }
  if (command === "finalize") {
    if (!arg4) throw new Error("proposal path required");
    await finalizeRun({
      role,
      issueNumber,
      assignmentId,
      proposalPath: arg4,
      contextPath: join(dirname(arg4), "run-context.json")
    });
    return;
  }
  throw new Error("Usage: runner.mjs prepare|finalize ROLE ISSUE ASSIGNMENT_ID [path]");
}

if (import.meta.url === "file://" + process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
