import { commentCurrentObject } from "./evidence.mjs";

function humanIds(profile) {
  return new Set((profile.human?.principals ?? []).map((principal) => principal.actor_id));
}

function command(body) {
  const first = (body ?? "").trim().split(/\r?\n/, 1)[0].trim();
  let match = /^\/agenti\s+release\s+(grant|reject)\s+(\S+)/i.exec(first);
  if (match) return { kind: "release", outcome: match[1].toUpperCase(), id: match[2] };
  match = /^\/agenti\s+(stop|reopen)\b/i.exec(first);
  if (match) return { kind: match[1].toLowerCase() };
  match = /^\/agenti\s+resolve\s+(\S+)/i.exec(first);
  if (match) return { kind: "resolve", id: match[1] };
  return null;
}

function latestHumanCommand(comments, profile, predicate) {
  const ids = humanIds(profile);
  return [...comments].reverse().find((comment) => {
    if (!ids.has(comment.user?.id)) return false;
    const parsed = command(comment.body);
    return parsed && predicate(parsed, comment);
  }) ?? null;
}

export function releaseResponse({ comments, state, profile, core }) {
  const authorization = state?.release_authorization;
  if (!authorization || authorization.status !== "PENDING" || !authorization.authorization_id) return null;
  const comment = latestHumanCommand(
    comments,
    profile,
    (parsed) => parsed.kind === "release" && parsed.id === authorization.authorization_id
  );
  if (!comment) return null;
  const parsed = command(comment.body);
  const normalizedOutcome = parsed.outcome === "GRANT" ? "GRANTED" : "REJECTED";
  const normalizedPayload = {
    command: `release-${parsed.outcome.toLowerCase()}`,
    authorization_id: parsed.id
  };
  const current = commentCurrentObject({
    comment,
    repository: state.work_item.control_repository,
    evidenceKind: "issue_comment",
    normalizedPayload,
    normalizedOutcome
  });
  const binding = core.acceptMutableEvidence({
    ...current,
    context_binding: authorization.context_digest
  });
  return {
    status: normalizedOutcome,
    authorization_id: authorization.authorization_id,
    candidate_digest: authorization.candidate_digest,
    target_digest: authorization.target_digest,
    gate_digest: authorization.gate_digest,
    context_digest: authorization.context_digest,
    response_binding: binding,
    current_response: current
  };
}

export function humanResolution({ comments, state, profile, core }) {
  const active = (state?.human_requests?.active ?? []).filter((item) => item.status === "PENDING");
  if (!active.length) return null;
  for (const request of active) {
    const comment = latestHumanCommand(comments, profile, (parsed) => parsed.kind === "resolve" && parsed.id === request.request_id);
    if (!comment) continue;
    const normalizedPayload = { command: "resolve", request_id: request.request_id };
    const current = commentCurrentObject({
      comment,
      repository: state.work_item.control_repository,
      evidenceKind: "issue_comment",
      normalizedPayload,
      normalizedOutcome: "RESOLVED"
    });
    const binding = core.acceptMutableEvidence({ ...current, context_binding: request.context_digest });
    const earliest = {
      ANALYST_REEVALUATE: "ANALYSIS",
      RESUME_CURRENT_AFTER_RECHECK: state.lifecycle,
      SPECIAL_RELEASE_GATE: "APPROVED",
      STOP_REOPEN: "ANALYSIS",
      ROLE_REASSIGNMENT: "ANALYSIS"
    }[request.resolution_route] ?? "ANALYSIS";
    return {
      valid: true,
      request_id: request.request_id,
      resolution_route: request.resolution_route,
      earliest_affected_point: earliest,
      response_binding: binding
    };
  }
  return null;
}

export function humanStopReopen({ comments, state, profile, core }) {
  if (!state) return {};
  const contextBinding = core.digest({
    work_item: state.work_item,
    contract_digest: state.contract.digest,
    candidate_digest: state.candidate?.digest ?? null
  });
  const makeBinding = (comment, outcome) => {
    const current = commentCurrentObject({
      comment,
      repository: state.work_item.control_repository,
      evidenceKind: "issue_comment",
      normalizedPayload: { command: outcome.toLowerCase() },
      normalizedOutcome: outcome
    });
    return core.acceptMutableEvidence({ ...current, context_binding: contextBinding });
  };

  if (state.lifecycle === "STOPPED") {
    const reopen = latestHumanCommand(comments, profile, (parsed) => parsed.kind === "reopen");
    return reopen ? {
      reopen_authority: { valid: true, binding: makeBinding(reopen, "REOPENED") },
      earliest_lifecycle: "ANALYSIS"
    } : {};
  }
  const stop = latestHumanCommand(comments, profile, (parsed) => parsed.kind === "stop");
  return stop ? { stop_authority: { valid: true, binding: makeBinding(stop, "STOPPED") } } : {};
}

export function currentHumanEvidence({ binding, comment, state, core }) {
  const parsed = command(comment.body);
  if (!parsed) return { binding, current: null, expected_context_binding: binding.context_binding };
  let normalizedPayload;
  let normalizedOutcome;
  let expectedContext = binding.context_binding;

  if (parsed.kind === "release") {
    normalizedPayload = { command: `release-${parsed.outcome.toLowerCase()}`, authorization_id: parsed.id };
    normalizedOutcome = parsed.outcome === "GRANT" ? "GRANTED" : "REJECTED";
    expectedContext = state.release_authorization?.context_digest ?? binding.context_binding;
  } else if (parsed.kind === "resolve") {
    normalizedPayload = { command: "resolve", request_id: parsed.id };
    normalizedOutcome = "RESOLVED";
    expectedContext = (state.human_requests?.active ?? []).find((item) => item.request_id === parsed.id)?.context_digest ?? binding.context_binding;
  } else {
    normalizedPayload = { command: parsed.kind };
    normalizedOutcome = parsed.kind === "stop" ? "STOPPED" : "REOPENED";
  }

  return {
    binding,
    current: commentCurrentObject({
      comment,
      repository: state.work_item.control_repository,
      evidenceKind: binding.evidence_kind,
      normalizedPayload,
      normalizedOutcome
    }),
    expected_context_binding: expectedContext
  };
}
