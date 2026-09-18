import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  digest,
  normalizeRoleResult,
  validateSchema
} from "../core/index.mjs";
import { githubClientFromEnv } from "./github.mjs";
import {
  findRunClaim,
  loadState,
  renderMachineComment,
  ROLE_RESULT_MARKER
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
  return {
    projectProfile: await readJson(".agenti/project-profile.json"),
    runtimeConfig: await readJson(".agenti/single-repo-actions.json"),
    workflowStateSchema: await readJson(".agenti-runtime/schemas/workflow-state.schema.json"),
    assignmentSchema: await readJson(".agenti-runtime/schemas/assignment.schema.json"),
    roleResultSchema: await readJson(".agenti-runtime/schemas/role-result.schema.json")
  };
}

export function assignmentFromState(state, profile) {
  if (!state.assignment) throw new Error("No current assignment");
  const a = state.assignment;
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
      { kind: "project_profile", ref: ".agenti/project-profile.json" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" }
    ],
    capability_profile: a.capability_profile,
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

  const existingClaim = findRunClaim(loaded.comments, assignmentId);
  if (existingClaim) {
    await writeOutput("skip", "true");
    await writeOutput("claim_comment_id", existingClaim.id);
    return { skip: true, existingClaim };
  }

  const assignment = assignmentFromState(state, runtime.projectProfile);
  const assignmentErrors = validateSchema(assignment, runtime.assignmentSchema);
  if (assignmentErrors.length) throw new Error("Assignment schema invalid: " + assignmentErrors.join("; "));

  const executionInstanceId = "exec-" + randomUUID();
  if (role === "R" && assignment.independence.must_differ_from_execution_instances.includes(executionInstanceId)) {
    throw new Error("INDEPENDENCE_COLLISION");
  }

  const attestation = {
    adapter_id:
      assignment.execution_route?.adapter_id ??
      (role === "P" ? "deterministic-actions-publisher" : "codex-action"),
    adapter_version:
      assignment.execution_route?.adapter_version ?? "1",
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

  const claim = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      "agenti-run-claim:" + assignmentId,
      "Deterministic run claim created before provider invocation.",
      {
        assignment_id: assignmentId,
        role,
        execution_attestation: attestation,
        workflow_run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
          ? process.env.GITHUB_SERVER_URL + "/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + process.env.GITHUB_RUN_ID
          : null
      }
    )
  );

  const issue = await github.getIssue(issueNumber);
  await mkdir(outDir, { recursive: true });
  await writeFile(outDir + "/assignment.json", JSON.stringify(assignment, null, 2));
  await writeFile(outDir + "/run-context.json", JSON.stringify({ attestation, claim_comment_id: claim.id }, null, 2));
  await writeFile(outDir + "/work-item.md", issue.body ?? "");
  await writeFile(outDir + "/comments.json", JSON.stringify(loaded.comments, null, 2));

  await writeOutput("skip", "false");
  await writeOutput("claim_comment_id", claim.id);
  await writeOutput("execution_instance_id", executionInstanceId);
  await writeOutput("candidate_ref", assignment.candidate.members?.[0]?.head_sha ?? runtime.runtimeConfig.default_branch);
  return { skip: false, assignment, attestation, claim };
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
    ".agenti-runtime/adapters/" + schemaAdapter + "/schemas/" + ROLE_SCHEMA[role]
  );
  const proposalErrors = validateSchema(rawProposal, proposalSchema);
  if (proposalErrors.length) throw new Error("Provider proposal invalid: " + proposalErrors.join("; "));
  const proposal = sanitizeProposal(role, rawProposal);
  const runContext = await readJson(contextPath);

  const trustedFacts = {
    assignment_id: assignment.assignment_id,
    observed_state_version: assignment.state.version,
    observed_fingerprint: assignment.state.fingerprint,
    execution_attestation: runContext.attestation,
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
    await finalizeRun({ role, issueNumber, assignmentId, proposalPath: arg4 });
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
