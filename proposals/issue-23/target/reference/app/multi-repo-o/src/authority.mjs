import { parseControlMarker } from "./mapping.mjs";
import { acceptedEvidenceSnapshot, findStateComment } from "./evidence.mjs";
import {
  currentHumanEvidence,
  humanResolution,
  humanStopReopen,
  releaseResponse
} from "./human-authority.mjs";
import { currentRoleResult } from "./trusted-result.mjs";

async function discoverLinkedPullRequests({ gh, profile, workItem }) {
  const members = [];
  for (const repository of profile.implementation_repositories ?? []) {
    for (const pr of await gh.listPullRequests(repository, "open")) {
      const marker = parseControlMarker(pr.body);
      if (
        marker?.control_repository === workItem.control_repository &&
        marker.issue_number === workItem.issue_number
      ) {
        members.push({
          repository,
          pr_number: pr.number,
          head_sha: pr.head.sha,
          base_ref_or_sha: pr.base?.sha ?? pr.base?.ref
        });
      }
    }
  }
  return members.sort((a, b) =>
    `${a.repository}#${a.pr_number}`.localeCompare(`${b.repository}#${b.pr_number}`)
  );
}

async function reconstructChecks({ gh, profile, members, core }) {
  const required = profile.required_checks ?? [];
  if (required.length === 0) {
    return {
      status: "NOT_REQUIRED",
      required_set_digest: null,
      evidence_refs: [],
      digest: core.digest([])
    };
  }
  if (members.length === 0) {
    return {
      status: "PENDING",
      required_set_digest: core.digest(required.slice().sort()),
      evidence_refs: [],
      digest: core.digest([])
    };
  }

  const evidence = [];
  let failed = false;
  let pending = false;
  for (const member of members) {
    const runs = await gh.listCheckRunsForRef(member.repository, member.head_sha);
    for (const name of required) {
      const current = runs
        .filter((run) => run.name === name)
        .sort((a, b) => Number(b.id) - Number(a.id))[0];
      if (!current || current.status !== "completed") {
        pending = true;
        continue;
      }
      if (current.conclusion !== "success") failed = true;
      evidence.push({
        evidence_kind: "check_run",
        repository: member.repository,
        immutable_id: String(current.id)
      });
    }
  }

  return {
    status: failed ? "FAILED" : pending ? "PENDING" : "PASSED",
    required_set_digest: core.digest(required.slice().sort()),
    evidence_refs: evidence,
    digest: core.digest(
      evidence.map((item) => `${item.repository}:${item.immutable_id}`).sort()
    )
  };
}

export async function reconstructAuthority({
  gh,
  profile,
  workItem,
  core,
  trustedResultActorIds = new Set()
}) {
  const issue = await gh.getIssue(workItem.control_repository, workItem.issue_number);
  const comments = await gh.listIssueComments(workItem.control_repository, workItem.issue_number);
  const stateComment = findStateComment(comments, core);
  const state = stateComment ? core.parseStateComment(stateComment.body) : null;

  const members = await discoverLinkedPullRequests({ gh, profile, workItem });
  const candidate = {
    kind: members.length ? "composite" : "none",
    generation: state?.candidate?.generation ?? 0,
    digest: null,
    members
  };
  candidate.digest = members.length ? core.candidateDigest(candidate) : null;
  const compositeChanged = Boolean(state && candidate.digest !== state.candidate?.digest);
  if (compositeChanged) candidate.generation = (state.candidate?.generation ?? 0) + 1;

  const checks = await reconstructChecks({ gh, profile, members, core });
  const roleResult = await currentRoleResult({
    gh,
    comments,
    state,
    profile,
    core,
    candidate,
    trustedResultActorIds
  });

  const contractDigest = core.digest({
    title: issue.title ?? "",
    body: issue.body ?? ""
  });
  const targetDigest = core.digest({
    target: profile.release_authorization?.target ?? null,
    boundary_operations: profile.publication?.boundary_operations ?? []
  });
  const labels = new Set((issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name
  ));

  const evidenceCandidate = compositeChanged ? state.candidate : candidate;
  const snapshot = {
    intake: { accepted: Boolean(state) || labels.has("agenti:managed") },
    work_item: {
      control_repository: workItem.control_repository,
      issue_number: workItem.issue_number,
      kind: state?.work_item?.kind ?? workItem.kind ?? "executable"
    },
    contract_source_ref: `issue:${workItem.issue_number}`,
    contract_revision: issue.updated_at,
    contract_digest: contractDigest,
    context_entrypoints: [
      {
        kind: "work_item",
        ref: `${workItem.control_repository}#${workItem.issue_number}`
      },
      { kind: "project_profile", ref: ".agenti/project-profile.json" },
      { kind: "agent_entrypoint", ref: "AGENTS.md" },
      ...members.map((member) => ({
        kind: "candidate",
        ref: `${member.repository}#${member.pr_number}@${member.head_sha}`
      }))
    ],
    candidate,
    composite: state ? { changed: compositeChanged, candidate } : undefined,
    checks,
    required_evidence_digest: checks.digest,
    required_gates_current: ["PASSED", "NOT_REQUIRED"].includes(checks.status),
    dor_passes: true,
    pending_human_request:
      (state?.human_requests?.active ?? []).some((request) => request.status === "PENDING"),
    role_result: roleResult,
    target_digest: targetDigest,
    post_publication_r_required: false,
    execution_repository: null,
    cas_expected_state_version: state?.state_version,
    accepted_evidence: acceptedEvidenceSnapshot({
      state,
      comments,
      candidate: evidenceCandidate,
      core,
      currentHumanEvidence
    }),
    drift: state ? {
      contract_changed: contractDigest !== state.contract.digest,
      candidate_changed: false,
      gate_changed: false
    } : {},
    ...humanStopReopen({ comments, state, profile, core })
  };

  const release = releaseResponse({ comments, state, profile, core });
  if (release) snapshot.release_response = release;

  const resolution = humanResolution({ comments, state, profile, core });
  if (resolution) snapshot.human_resolution = resolution;

  if (roleResult?.role === "D" && roleResult.execution_instance_id) {
    snapshot.author_execution_instances = [roleResult.execution_instance_id];
  }

  if (
    state?.publication?.status === "SUCCEEDED" &&
    !snapshot.pending_human_request
  ) {
    snapshot.completion = {
      all_objective_conditions_true: true,
      digest: core.digest({
        publication: state.publication.published_identity,
        candidate: state.publication.candidate_digest
      })
    };
  }

  return { issue, comments, stateComment, state, snapshot };
}
