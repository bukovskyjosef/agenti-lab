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

  // SQLite is only an operational in-flight/cache guard. A durable GitHub run
  // claim in workflow state is the authority for restart dedup.
  if (existing?.status === "started") {
    return {
      dispatched: false,
      duplicate: true,
      operational_only: true,
      workflow_run_id: null,
      run_attempt: null,
      target
    };
  }

  if (existing?.status !== "done") {
    const started = store.beginEffect({ effectKey, kind: "workflow_dispatch" });
    if (!started && store.getEffect(effectKey)?.status === "started") {
      return {
        dispatched: false,
        duplicate: true,
        operational_only: true,
        workflow_run_id: null,
        run_attempt: null,
        target
      };
    }
  }

  try {
    const response = await gh.workflowDispatch(target.repository, target.workflow, ref, {
      assignment_json: JSON.stringify(assignment),
      assignment_id: assignment.assignment_id,
      role: assignment.role
    });
    const workflowRunId = response?.workflow_run_id ?? response?.id ?? null;
    if (workflowRunId === null || workflowRunId === undefined) {
      throw new Error("WORKFLOW_DISPATCH_RUN_DETAILS_MISSING");
    }
    store.completeEffect(effectKey);
    return {
      dispatched: true,
      duplicate: false,
      operational_only: false,
      workflow_run_id: workflowRunId,
      run_attempt: 1,
      run_url: response?.run_url ?? null,
      html_url: response?.html_url ?? null,
      target
    };
  } catch (error) {
    store.failEffect(effectKey, error.name || "DispatchError");
    throw error;
  }
}
