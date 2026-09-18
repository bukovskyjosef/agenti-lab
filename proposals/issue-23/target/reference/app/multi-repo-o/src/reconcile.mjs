export async function enqueueReconcile({ gh, profile, store, now = Date.now() }) {
  const issues = await gh.listManagedIssues(profile.control_repository);
  const bucket = Math.floor(now / 60000);
  let inserted = 0;
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const deliveryId = `reconcile:${profile.control_repository}#${issue.number}:${bucket}`;
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
