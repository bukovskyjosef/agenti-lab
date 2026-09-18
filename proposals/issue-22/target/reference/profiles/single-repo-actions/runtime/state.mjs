import {
  STATE_MARKER,
  parseStateComment,
  reconstructState,
  renderStateComment,
  validateSchema
} from "../core/index.mjs";

export const ASSIGNMENT_MARKER = "agenti-assignment:v1";
export const ROLE_RESULT_MARKER = "agenti-role-result:v1";
export const HUMAN_REQUEST_MARKER = "agenti-human-request:v1";
export const RELEASE_REQUEST_MARKER = "agenti-release-request:v1";
export const JSON_START = "<!-- agenti-machine-json:start -->";
export const JSON_END = "<!-- agenti-machine-json:end -->";

export function isTrustedActionsActor(comment) {
  return comment?.user?.login === "github-actions[bot]" && comment?.user?.type === "Bot";
}

export function renderMachineComment(marker, summary, payload) {
  return [marker, "", summary, "", JSON_START, JSON.stringify(payload, null, 2), JSON_END, ""].join("\n");
}

export function parseMachinePayload(body, expectedMarker = null) {
  if (typeof body !== "string") return null;
  if (expectedMarker && !body.includes(expectedMarker)) return null;
  const start = body.indexOf(JSON_START);
  const end = body.indexOf(JSON_END);
  if (start < 0 || end <= start) return null;
  return JSON.parse(body.slice(start + JSON_START.length, end).trim());
}

export async function loadState(github, issueNumber, workflowStateSchema) {
  const comments = await github.listIssueComments(issueNumber);
  const markerComments = comments.filter((comment) => comment.body?.includes(STATE_MARKER));
  const untrusted = markerComments.filter((comment) => !isTrustedActionsActor(comment));
  if (untrusted.length) throw new Error("Untrusted actor attempted agenti-state:v1 machine comment");
  const matches = markerComments.filter(isTrustedActionsActor);
  if (matches.length > 1) throw new Error("More than one agenti-state:v1 comment exists");
  if (matches.length === 0) return { state: null, comment: null, comments };
  return { state: reconstructState(matches[0].body, workflowStateSchema), comment: matches[0], comments };
}

export async function saveStateCAS(github, issueNumber, state, workflowStateSchema, currentComment, expectedStateVersion) {
  const errors = validateSchema(state, workflowStateSchema);
  if (errors.length) throw new Error("Refusing invalid state projection: " + errors.join("; "));

  if (!currentComment) {
    if (expectedStateVersion !== null) throw new Error("Initial state expected version must be null");
    return github.createIssueComment(issueNumber, renderStateComment(state));
  }

  const fresh = await github.getIssueComment(currentComment.id);
  const current = parseStateComment(fresh.body);
  if (current.state_version !== expectedStateVersion) {
    throw new Error("CAS_MISMATCH expected " + expectedStateVersion + " got " + current.state_version);
  }
  return github.updateIssueComment(fresh.id, renderStateComment(state));
}

export function findAssignmentAudit(comments, assignmentId) {
  return comments.find((comment) => {
    if (!isTrustedActionsActor(comment)) return false;
    if (!comment.body?.includes(ASSIGNMENT_MARKER)) return false;
    return parseMachinePayload(comment.body, ASSIGNMENT_MARKER)?.assignment_id === assignmentId;
  }) ?? null;
}

export function findRoleResult(comments, assignmentId) {
  const matches = comments.filter((comment) => {
    if (!isTrustedActionsActor(comment)) return false;
    if (!comment.body?.includes(ROLE_RESULT_MARKER)) return false;
    return parseMachinePayload(comment.body, ROLE_RESULT_MARKER)?.trusted?.assignment_id === assignmentId;
  });
  return matches.at(-1) ?? null;
}

export function findRunClaim(comments, assignmentId) {
  const marker = "agenti-run-claim:" + assignmentId;
  return comments.find((comment) => isTrustedActionsActor(comment) && comment.body?.includes(marker)) ?? null;
}
