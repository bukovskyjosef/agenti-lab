import { readFile } from "node:fs/promises";
import {
  digest,
  normalizeRoleResult,
  verifyAcceptedEvidence
} from "../core/index.mjs";
import { githubClientFromEnv } from "./github.mjs";
import {
  ROLE_RESULT_MARKER,
  loadState,
  parseMachinePayload,
  renderMachineComment
} from "./state.mjs";
import {
  assignmentFromState,
  callback,
  loadRuntime
} from "./runner.mjs";

function releaseCommand(body) {
  const match = (body ?? "").trim().match(/^\/agenti\s+release\s+(grant|reject)\s+(\S+)(?:\s*\n([\s\S]*))?$/i);
  if (!match) return null;
  return {
    kind: "release",
    decision: match[1].toLowerCase(),
    id: match[2],
    reason: (match[3] ?? "").trim()
  };
}

async function currentMutableEvidence(github, binding) {
  if (!binding || !("object_id" in binding)) return null;
  let comment;
  try {
    comment = await github.getIssueComment(binding.object_id);
  } catch (error) {
    if (String(error.message).includes("failed 404")) return null;
    throw error;
  }

  if (binding.evidence_kind === "role_result_comment") {
    const normalized = parseMachinePayload(comment.body, ROLE_RESULT_MARKER);
    if (!normalized) return null;
    return {
      evidence_kind: "role_result_comment",
      repository: github.repository,
      object_id: comment.id,
      actor_id: comment.user.id,
      updated_at: comment.updated_at,
      normalized_payload: normalized,
      normalized_outcome: normalized.payload?.outcome ?? normalized.status
    };
  }

  if (binding.evidence_kind === "issue_comment") {
    const command = releaseCommand(comment.body);
    if (!command) return null;
    return {
      evidence_kind: "issue_comment",
      repository: github.repository,
      object_id: comment.id,
      actor_id: comment.user.id,
      updated_at: comment.updated_at,
      normalized_payload: command,
      normalized_outcome: command.decision === "grant" ? "GRANTED" : "REJECTED"
    };
  }
  return null;
}

async function checksCurrent(github, profile, candidate) {
  const required = [...profile.required_checks].sort();
  if (required.length === 0) return { ok: true, gate_digest: digest([]), evidence: [] };
  const runs = await github.getChecksForRef(candidate.members[0].head_sha);
  const evidence = required.map((name) => {
    const run = runs.filter((item) => item.name === name).sort((a, b) => Number(b.id) - Number(a.id))[0];
    return run ? {
      name,
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      head_sha: run.head_sha
    } : { name, missing: true };
  });
  return {
    ok: evidence.every((item) => item.status === "completed" && item.conclusion === "success"),
    gate_digest: digest(evidence),
    evidence
  };
}

function currentTargetDigest(github, runtime) {
  return digest({
    repository: github.repository,
    target_branch: runtime.runtimeConfig.default_branch,
    operations: runtime.projectProfile.publication.boundary_operations
  });
}

async function wakeO(github, runtime, issueNumber, assignmentId, reason) {
  await github.dispatchWorkflow(
    runtime.runtimeConfig.workflows?.orchestrate ?? "agenti-orchestrate.yml",
    {
      issue_number: String(issueNumber),
      wake_kind: reason,
      assignment_id: assignmentId,
      result_ref: ""
    },
    runtime.runtimeConfig.default_branch
  );
}

export async function publishCurrent({ issueNumber, assignmentId, contextPath = ".agenti-run/run-context.json" }) {
  const github = githubClientFromEnv();
  const runtime = await loadRuntime();
  const loaded = await loadState(github, issueNumber, runtime.workflowStateSchema);
  const state = loaded.state;

  if (!state?.assignment || state.assignment.assignment_id !== assignmentId || state.assignment.role !== "P") {
    throw new Error("ASSIGNMENT_NOT_CURRENT");
  }
  if (state.assignment.bound_state_version !== state.state_version) throw new Error("STALE_ASSIGNMENT_VERSION");
  if (state.candidate.kind !== "single" || !state.candidate.members[0]?.pr_number) throw new Error("NO_EXACT_SINGLE_REPO_CANDIDATE");

  const pull = await github.getPull(state.candidate.members[0].pr_number);
  if (pull.head.sha !== state.candidate.members[0].head_sha || state.candidate.digest !== state.publication.candidate_digest && state.publication.status !== "NOT_STARTED") {
    await wakeO(github, runtime, issueNumber, assignmentId, "agenti.p-prewrite-candidate-drift");
    throw new Error("P_PREWRITE_CANDIDATE_DRIFT");
  }

  if (state.review.status !== "CURRENT" || state.review.outcome !== "APPROVED" || state.review.candidate_digest !== state.candidate.digest) {
    await wakeO(github, runtime, issueNumber, assignmentId, "agenti.p-prewrite-review-drift");
    throw new Error("P_PREWRITE_REVIEW_NOT_CURRENT");
  }

  if (state.review.evidence_ref && "object_id" in state.review.evidence_ref) {
    const current = await currentMutableEvidence(github, state.review.evidence_ref);
    const verification = verifyAcceptedEvidence(
      state.review.evidence_ref,
      current,
      state.review.evidence_ref.context_binding
    );
    if (verification.status !== "CURRENT") {
      await wakeO(github, runtime, issueNumber, assignmentId, "agenti.p-prewrite-review-evidence-drift");
      throw new Error("P_PREWRITE_REVIEW_EVIDENCE_" + verification.status);
    }
  }

  const checks = await checksCurrent(github, runtime.projectProfile, state.candidate);
  if (!checks.ok) {
    await wakeO(github, runtime, issueNumber, assignmentId, "agenti.p-prewrite-gate-drift");
    throw new Error("P_PREWRITE_GATES_NOT_CURRENT");
  }

  const targetDigest = currentTargetDigest(github, runtime);
  if (runtime.projectProfile.release_authorization.required) {
    const auth = state.release_authorization;
    if (
      auth.status !== "GRANTED" ||
      auth.candidate_digest !== state.candidate.digest ||
      auth.target_digest !== targetDigest ||
      auth.gate_digest !== checks.gate_digest ||
      !auth.response_ref
    ) {
      await wakeO(github, runtime, issueNumber, assignmentId, "agenti.p-prewrite-release-drift");
      throw new Error("P_PREWRITE_RELEASE_AUTH_NOT_CURRENT");
    }
    const current = await currentMutableEvidence(github, auth.response_ref);
    const verification = verifyAcceptedEvidence(auth.response_ref, current, auth.context_digest);
    if (verification.status !== "CURRENT") {
      await wakeO(github, runtime, issueNumber, assignmentId, "agenti.p-prewrite-human-evidence-drift");
      throw new Error("P_PREWRITE_HUMAN_EVIDENCE_" + verification.status);
    }
  }

  if (!runtime.projectProfile.publication.boundary_operations.includes("MERGE")) {
    throw new Error("Default single-repo publisher supports configured MERGE only");
  }

  const merge = await github.mergePull(pull.number, {
    sha: state.candidate.members[0].head_sha,
    merge_method: runtime.runtimeConfig.publication.merge_method,
    commit_title: "agenti: publish #" + issueNumber
  });
  if (!merge?.merged || !merge.sha) throw new Error("MERGE_FAILED: " + JSON.stringify(merge));

  const runContext = JSON.parse(await readFile(contextPath, "utf8"));
  const assignment = assignmentFromState(state, runtime.projectProfile);
  const proposal = {
    role: "P",
    status: "COMPLETED",
    result_type: "PUBLISHER",
    evidence_refs: [],
    human_request: null,
    retry_or_failure: null,
    payload: {
      consumed_candidate_digest: state.candidate.digest,
      target_digest: targetDigest,
      publication_status: "SUCCEEDED",
      operations: [{
        operation: "MERGE",
        status: "SUCCEEDED",
        immutable_result_id: merge.sha,
        target: runtime.runtimeConfig.default_branch
      }],
      actual_published_identity: {
        repository_or_artifact: github.repository,
        immutable_id: merge.sha
      },
      deterministic_verification_refs: [{
        evidence_kind: "commit",
        repository: github.repository,
        immutable_id: merge.sha
      }],
      partial_failure: null
    }
  };

  const normalized = normalizeRoleResult({
    proposal,
    trustedFacts: {
      assignment_id: assignment.assignment_id,
      observed_state_version: assignment.state.version,
      observed_fingerprint: assignment.state.fingerprint,
      execution_attestation: runContext.attestation,
      candidate: {
        repository: state.candidate.members[0].repository,
        pr_number: state.candidate.members[0].pr_number,
        head_sha: state.candidate.members[0].head_sha,
        base_ref_or_sha: state.candidate.members[0].base_ref_or_sha,
        candidate_digest: state.candidate.digest
      }
    },
    assignment,
    roleResultSchema: runtime.roleResultSchema
  });

  const resultComment = await github.createIssueComment(
    issueNumber,
    renderMachineComment(
      ROLE_RESULT_MARKER,
      "Deterministic P publication result for assignment " + assignmentId + ".",
      normalized
    )
  );
  await callback(github, runtime.runtimeConfig, issueNumber, assignmentId, resultComment.id);
  return { merge, normalized, resultComment };
}

async function main() {
  const [issueRaw, assignmentId, contextPath] = process.argv.slice(2);
  const issueNumber = Number(issueRaw);
  if (!Number.isInteger(issueNumber) || !assignmentId) {
    throw new Error("Usage: publish.mjs ISSUE ASSIGNMENT_ID [CONTEXT]");
  }
  await publishCurrent({ issueNumber, assignmentId, contextPath: contextPath || ".agenti-run/run-context.json" });
}

if (import.meta.url === "file://" + process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
