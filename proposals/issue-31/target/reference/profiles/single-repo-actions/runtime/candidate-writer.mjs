import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  candidateDigest,
  normalizeRoleResult,
  validateSchema
} from "../core/index.mjs";
import { githubClientFromEnv } from "./github.mjs";
import {
  ROLE_RESULT_MARKER,
  loadState,
  renderMachineComment
} from "./state.mjs";
import {
  assignmentFromState,
  callback,
  loadRuntime,
  sanitizeProposal
} from "./runner.mjs";

function sh(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    ...options
  });
}

function sha256File(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function deterministicBranch(issueNumber) {
  return "agenti/issue-" + Number(issueNumber);
}

export async function writeCandidate({
  issueNumber,
  assignmentId,
  proposalPath,
  contextPath,
  patchPath
}) {
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const loaded = await loadState(github, issueNumber, runtime.workflowStateSchema);
  const state = loaded.state;

  if (!state?.assignment || state.assignment.assignment_id !== assignmentId || state.assignment.role !== "D") {
    throw new Error("ASSIGNMENT_NOT_CURRENT");
  }
  if (state.assignment.bound_state_version !== state.state_version) throw new Error("STALE_ASSIGNMENT_VERSION");

  const assignment = assignmentFromState(state, runtime.projectProfile);
  const schemaAdapter =
    state.assignment.execution_route?.adapter_id === "claude-code-action"
      ? "claude-code-action"
      : "codex-action";
  const proposalSchema = await (async () => JSON.parse(await readFile(
    ".agenti-runtime/adapters/" + schemaAdapter + "/schemas/developer-proposal.schema.json",
    "utf8"
  )))();
  const rawProposal = JSON.parse(await readFile(proposalPath, "utf8"));
  const proposalErrors = validateSchema(rawProposal, proposalSchema);
  if (proposalErrors.length) throw new Error("Provider proposal invalid: " + proposalErrors.join("; "));

  const proposal = sanitizeProposal("D", rawProposal);
  proposal.payload.requested_branch_key = deterministicBranch(issueNumber);

  const runContext = JSON.parse(await readFile(contextPath, "utf8"));
  const patchBytes = await readFile(patchPath);
  if (patchBytes.length === 0) throw new Error("D produced no change artifact");

  const branch = deterministicBranch(issueNumber);
  const baseRef = assignment.candidate.kind === "single" && assignment.candidate.members[0]?.head_sha
    ? assignment.candidate.members[0].head_sha
    : runtime.runtimeConfig.default_branch;

  sh("git", ["fetch", "--no-tags", "origin", baseRef]);
  sh("git", ["checkout", "-B", branch, baseRef]);
  sh("git", ["apply", "--index", patchPath]);
  sh("git", ["config", "user.name", "agenti-deterministic-writer"]);
  sh("git", ["config", "user.email", "agenti-writer@users.noreply.github.com"]);
  sh("git", ["commit", "-m", "agenti: implement issue #" + issueNumber]);
  sh("git", ["push", "--force-with-lease", "origin", "HEAD:refs/heads/" + branch]);

  let pull = await github.findPullByHead(branch);
  if (!pull) {
    pull = await github.createPull({
      title: "Agenti candidate for #" + issueNumber,
      head: branch,
      base: runtime.runtimeConfig.default_branch,
      body: [
        "agenti-work-item:" + issueNumber,
        "",
        "Deterministic candidate written from the current D assignment.",
        "Do not treat this PR body as orchestration authority."
      ].join("\n")
    });
  } else {
    pull = await github.getPull(pull.number);
  }

  const member = {
    repository: github.repository,
    pr_number: pull.number,
    head_sha: pull.head.sha,
    base_ref_or_sha: pull.base.sha || pull.base.ref
  };
  const candidate = {
    kind: "single",
    generation: state.candidate.generation + 1,
    members: [member]
  };
  candidate.digest = candidateDigest(candidate);

  const trustedCandidate = {
    ...member,
    candidate_digest: candidate.digest
  };

  const trustedArtifact = {
    format: "unified-diff",
    artifact_ref: "github-actions-artifact:assignment-" + assignmentId,
    sha256: sha256File(patchBytes)
  };

  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: {
      assignment_id: assignment.assignment_id,
      observed_state_version: assignment.state.version,
      observed_fingerprint: assignment.state.fingerprint,
      execution_attestation: runContext.attestation,
      candidate: trustedCandidate,
      change_artifact: trustedArtifact,
      author_validation_refs: [],
      actual_billing_mode:
        assignment.execution_route?.billing_mode ?? null
    },
    assignment,
    roleResultSchema: runtime.roleResultSchema
  });

  const resultComment = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      ROLE_RESULT_MARKER,
      "D normalized result and deterministic candidate for assignment " + assignmentId + ".",
      normalized
    )
  );
  await callback(github, runtime.runtimeConfig, issueNumber, assignmentId, resultComment.id);

  return { pull, candidate, normalized, resultComment };
}

async function main() {
  const [issueRaw, assignmentId, proposalPath, contextPath, patchPath] = process.argv.slice(2);
  const issueNumber = Number(issueRaw);
  if (!Number.isInteger(issueNumber) || !assignmentId || !proposalPath || !contextPath || !patchPath) {
    throw new Error("Usage: candidate-writer.mjs ISSUE ASSIGNMENT_ID PROPOSAL CONTEXT PATCH");
  }
  await writeCandidate({ issueNumber, assignmentId, proposalPath, contextPath, patchPath });
}

if (import.meta.url === "file://" + process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
