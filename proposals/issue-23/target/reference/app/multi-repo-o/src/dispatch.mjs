const ADAPTER_RE = /^github-workflow:\/\/([^/]+\/[^/]+)\/(.+)$/;

export function parseWorkflowAdapterId(adapterId) {
  const match = ADAPTER_RE.exec(adapterId ?? "");
  if (!match) throw new Error("multi-repo-o runner adapter_id must use github-workflow://owner/repo/workflow-file");
  return { repository: match[1], workflow: match[2] };
}

export function runnerTarget(profile, role) {
  const runner = profile.role_runners?.[role];
  if (!runner) throw new Error(`No role runner configured for ${role}`);
  return { ...parseWorkflowAdapterId(runner.adapter_id), adapter_version: runner.adapter_version };
}

export async function dispatchAssignment({ gh, profile, assignment, store, ref = "main" }) {
  const target = runnerTarget(profile, assignment.role);
  const effectKey = `dispatch:${assignment.assignment_id}`;
  const existing = store.getEffect(effectKey);
  if (existing?.status === "done") return { dispatched: false, duplicate: true, target };
  const started = store.beginEffect({ effectKey, kind: "workflow_dispatch" });
  if (!started && existing?.status === "started") return { dispatched: false, duplicate: true, target };
  try {
    await gh.workflowDispatch(target.repository, target.workflow, ref, {
      assignment_json: JSON.stringify(assignment),
      assignment_id: assignment.assignment_id,
      role: assignment.role
    });
    store.completeEffect(effectKey);
    return { dispatched: true, duplicate: false, target };
  } catch (error) {
    store.failEffect(effectKey, error.name || "DispatchError");
    throw error;
  }
}
