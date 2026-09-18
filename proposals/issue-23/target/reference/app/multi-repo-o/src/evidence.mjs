export const ROLE_RESULT_JSON_START = "<!-- agenti-role-result-json:start -->";
export const ROLE_RESULT_JSON_END = "<!-- agenti-role-result-json:end -->";

export function parseRoleResultComment(body, core) {
  if (!body?.includes(core.ROLE_RESULT_MARKER)) return null;
  const start = body.indexOf(ROLE_RESULT_JSON_START);
  const end = body.indexOf(ROLE_RESULT_JSON_END);
  if (start < 0 || end < 0 || end <= start) return null;
  const parsed = JSON.parse(body.slice(start + ROLE_RESULT_JSON_START.length, end).trim());
  const { result_digest, ...withoutDigest } = parsed;
  if (result_digest !== core.digest(withoutDigest)) throw new Error("role-result digest mismatch");
  return parsed;
}

export function findStateComment(comments, core) {
  return comments.find((comment) => comment.body?.includes(core.STATE_MARKER)) ?? null;
}

export function commentCurrentObject({ comment, repository, evidenceKind, normalizedPayload, normalizedOutcome }) {
  return {
    evidence_kind: evidenceKind,
    repository,
    object_id: comment.id,
    actor_id: comment.user?.id,
    updated_at: comment.updated_at ?? comment.created_at,
    normalized_payload: normalizedPayload,
    normalized_outcome: normalizedOutcome
  };
}

export function roleEvidenceContext({ state, role, candidate, core }) {
  return core.digest({
    role,
    contract_digest: state?.contract?.digest ?? null,
    candidate_digest: candidate?.digest ?? state?.candidate?.digest ?? null
  });
}

export function roleOutcome(result) {
  if (result.role === "R") return result.payload?.outcome ?? result.status;
  if (result.role === "P") return result.payload?.publication_status ?? result.status;
  if (result.role === "A") return result.payload?.disposition ?? result.status;
  return result.status;
}

function currentRoleEvidence({ binding, comment, state, candidate, core }) {
  let result = null;
  try { result = parseRoleResultComment(comment.body, core); } catch {}
  const current = result ? commentCurrentObject({
    comment,
    repository: state.work_item.control_repository,
    evidenceKind: binding.evidence_kind,
    normalizedPayload: result,
    normalizedOutcome: roleOutcome(result)
  }) : null;
  const expectedContext = result
    ? roleEvidenceContext({ state, role: result.role, candidate, core })
    : binding.context_binding;
  return { binding, current, expected_context_binding: expectedContext };
}

export function acceptedEvidenceSnapshot({ state, comments, candidate, core, currentHumanEvidence }) {
  if (!state) return [];
  const bindings = [];
  if (state.review?.evidence_ref) bindings.push(state.review.evidence_ref);
  if (state.release_authorization?.response_ref) bindings.push(state.release_authorization.response_ref);
  for (const ref of state.publication?.evidence_refs ?? []) {
    if (ref && "object_id" in ref) bindings.push(ref);
  }
  const stopRef = state.stop?.record_ref;
  if (stopRef && "object_id" in stopRef) bindings.push(stopRef);

  return bindings.map((binding) => {
    if (!("object_id" in binding)) return null;
    const comment = comments.find((item) => String(item.id) === String(binding.object_id));
    if (!comment) return { binding, current: null, expected_context_binding: binding.context_binding };
    if (["role_result_comment", "publication_comment"].includes(binding.evidence_kind)) {
      return currentRoleEvidence({ binding, comment, state, candidate, core });
    }
    if (binding.evidence_kind === "issue_comment") {
      return currentHumanEvidence({ binding, comment, state, core });
    }
    return null;
  }).filter(Boolean);
}
