const CONTROL_MARKER = /<!--\s*agenti-control:\s*([^\s#]+\/[^\s#]+)#(\d+)\s*-->/i;

export function parseControlMarker(text) {
  const match = CONTROL_MARKER.exec(text ?? "");
  if (!match) return null;
  return {
    control_repository: match[1],
    issue_number: Number(match[2]),
    kind: "executable"
  };
}

export function eventRepository(payload) {
  return payload?.repository?.full_name ?? null;
}

export function workItemFromWebhook({ eventName, payload, profile }) {
  const repository = eventRepository(payload);
  if (!repository) return null;

  if (repository === profile.control_repository) {
    const issueNumber = payload.issue?.number ?? payload.pull_request?.number ?? null;
    if (issueNumber && ["issues", "issue_comment"].includes(eventName)) {
      return { control_repository: repository, issue_number: issueNumber, kind: "executable" };
    }
  }

  if (!(profile.implementation_repositories ?? []).includes(repository)) return null;
  const prBody =
    payload.pull_request?.body ??
    payload.review?.pull_request?.body ??
    payload.check_run?.pull_requests?.[0]?.body ??
    "";
  return parseControlMarker(prBody);
}

export function workItemKey(workItem) {
  return `${workItem.control_repository}#${workItem.issue_number}`;
}
