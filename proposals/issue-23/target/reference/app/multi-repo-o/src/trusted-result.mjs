import { parseRoleResultComment, commentCurrentObject, roleEvidenceContext, roleOutcome } from "./evidence.mjs";
import { runnerTarget } from "./dispatch.mjs";

function assignmentFromState(state, profile) {
  if (!state?.assignment) return null;
  const a = state.assignment;
  return {
    schema_version: 1,
    assignment_id: a.assignment_id,
    issued_at: state.contract.accepted_revision,
    role: a.role,
    purpose: a.purpose,
    work_item: {
      control_repository: state.work_item.control_repository,
      issue_number: state.work_item.issue_number
    },
    execution_repository: null,
    state: {
      version: a.bound_state_version,
      fingerprint: a.fingerprint,
      contract_digest: state.contract.digest
    },
    candidate: {
      kind: state.candidate?.kind ?? "none",
      digest: state.candidate?.digest ?? null,
      members: state.candidate?.members ?? []
    },
    context_entrypoints: [{ kind: "work_item", ref: `${state.work_item.control_repository}#${state.work_item.issue_number}` }],
    capability_profile: a.capability_profile,
    independence: {
      required: a.role === "R",
      must_differ_from_execution_instances: a.must_differ_from_execution_instances ?? [],
      enforcement_mechanism: a.role === "R" ? profile.role_runners.R.independence_mechanism : "none"
    },
    completion: {
      result_schema_version: 1,
      result_marker: "agenti-role-result:v1",
      callback_event: "agenti.role-result"
    }
  };
}

async function verifyPlatformAttestation({ gh, profile, result }) {
  const attestation = result.trusted?.execution_attestation;
  if (!attestation || attestation.attested_by !== "deterministic-wrapper") return null;
  if (attestation.platform_run?.provider !== "github-actions") return null;
  const target = runnerTarget(profile, result.role);
  const runId = attestation.platform_run.run_id;
  const runAttempt = attestation.platform_run.run_attempt;
  const [workflow, run] = await Promise.all([
    gh.getWorkflow(target.repository, target.workflow),
    gh.getWorkflowRun(target.repository, runId)
  ]);
  const runRepo = run.repository?.full_name ?? run.head_repository?.full_name;
  if (runRepo !== target.repository) return null;
  if (Number(run.workflow_id) !== Number(workflow.id)) return null;
  if (Number(run.run_attempt) !== Number(runAttempt)) return null;
  if (run.event !== "workflow_dispatch") return null;
  const expectedExecutionId = `github-actions:${target.repository}:${runId}:${runAttempt}`;
  if (attestation.execution_instance_id !== expectedExecutionId) return null;
  return expectedExecutionId;
}

export async function currentRoleResult({ gh, comments, state, profile, core, candidate, trustedResultActorIds }) {
  if (!state?.assignment) return null;
  const assignment = assignmentFromState(state, profile);
  for (const comment of [...comments].reverse()) {
    if (!trustedResultActorIds.has(comment.user?.id)) continue;
    let result;
    try { result = parseRoleResultComment(comment.body, core); } catch { continue; }
    if (!result || result.trusted?.assignment_id !== state.assignment.assignment_id) continue;
    if (result.role !== state.assignment.role) continue;
    const executionInstanceId = await verifyPlatformAttestation({ gh, profile, result });
    if (!executionInstanceId) continue;
    const acceptance = core.applyRoleResult({
      state,
      assignment,
      normalizedResult: result,
      projectProfile: profile
    });
    if (!acceptance.accepted) continue;
    const contextBinding = roleEvidenceContext({ state, role: result.role, candidate, core });
    const current = commentCurrentObject({
      comment,
      repository: state.work_item.control_repository,
      evidenceKind: result.role === "P" ? "publication_comment" : "role_result_comment",
      normalizedPayload: result,
      normalizedOutcome: roleOutcome(result)
    });
    const evidenceBinding = core.acceptMutableEvidence({ ...current, context_binding: contextBinding });
    return {
      ...result,
      execution_instance_id: executionInstanceId,
      evidence_binding: evidenceBinding
    };
  }
  return null;
}
