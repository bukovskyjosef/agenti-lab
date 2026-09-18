import { findStateComment } from "./evidence.mjs";

function routingWaitNotDue(state, now) {
  const wait = state?.execution_routing?.wait;
  if (!wait || wait.status !== "WAITING_CAPACITY" || !wait.not_before) {
    return false;
  }
  const due = Date.parse(wait.not_before);
  return Number.isFinite(due) && due > now;
}

export async function enqueueReconcile({
  gh,
  profile,
  store,
  core,
  trustedStateAppId = null,
  now = Date.now()
}) {
  const issues = await gh.listManagedIssues(profile.control_repository);
  const bucket = Math.floor(now / 60000);
  let inserted = 0;

  for (const issue of issues) {
    if (issue.pull_request) continue;

    if (core) {
      const comments = await gh.listIssueComments(
        profile.control_repository,
        issue.number
      );
      const stateComment = findStateComment(
        comments,
        core,
        trustedStateAppId
      );
      const state = stateComment
        ? core.parseStateComment(stateComment.body)
        : null;
      if (routingWaitNotDue(state, now)) continue;
    }

    const deliveryId =
      `reconcile:${profile.control_repository}#${issue.number}:${bucket}`;
    const result = store.enqueue({
      deliveryId,
      eventName: "reconcile",
      repository: profile.control_repository,
      payload: {
        work_item: {
          control_repository: profile.control_repository,
          issue_number: issue.number,
          kind: "executable"
        }
      },
      now
    });
    if (result.inserted) inserted += 1;
  }
  return inserted;
}
