import { createHash } from "node:crypto";

export const STATE_MARKER = "agenti-state:v1";
export const STATE_JSON_START = "<!-- agenti-state-json:start -->";
export const STATE_JSON_END = "<!-- agenti-state-json:end -->";
export const ROLES = Object.freeze(["A", "D", "R", "P"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digest(value) {
  return "sha256:" + createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function makeIdempotenceKey(...parts) {
  return "agenti:" + digest(parts).slice("sha256:".length);
}

function pointerGet(root, pointer) {
  if (!pointer.startsWith("#/")) throw new Error("Only local JSON Schema refs are supported: " + pointer);
  const parts = pointer.slice(2).split("/").map((p) => p.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = root;
  for (const part of parts) current = current?.[part];
  if (current === undefined) throw new Error("Unresolvable schema ref: " + pointer);
  return current;
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

export function validateSchema(instance, schema) {
  const errors = [];

  function branchValid(value, branch, root) {
    const before = errors.length;
    visit(value, branch, "$branch", root);
    const branchErrors = errors.splice(before);
    return branchErrors.length === 0;
  }

  function visit(value, node, path, root) {
    if (!isPlainObject(node)) return;

    if (node.$ref) {
      visit(value, pointerGet(root, node.$ref), path, root);
      return;
    }

    if (node.allOf) {
      for (const child of node.allOf) visit(value, child, path, root);
    }

    if (node.anyOf) {
      const count = node.anyOf.filter((child) => branchValid(value, child, root)).length;
      if (count < 1) errors.push(path + ": must match at least one anyOf branch");
      return;
    }

    if (node.oneOf) {
      const count = node.oneOf.filter((child) => branchValid(value, child, root)).length;
      if (count !== 1) errors.push(path + ": must match exactly one oneOf branch (matched " + count + ")");
      return;
    }

    if (node.const !== undefined && canonicalJson(value) !== canonicalJson(node.const)) {
      errors.push(path + ": must equal const " + JSON.stringify(node.const));
    }

    if (node.enum && !node.enum.some((candidate) => canonicalJson(candidate) === canonicalJson(value))) {
      errors.push(path + ": value is not in enum");
    }

    if (node.type !== undefined) {
      const allowed = Array.isArray(node.type) ? node.type : [node.type];
      if (!allowed.some((type) => typeMatches(value, type))) {
        errors.push(path + ": expected type " + allowed.join("|"));
        return;
      }
    }

    if (typeof value === "string") {
      if (node.minLength !== undefined && value.length < node.minLength) errors.push(path + ": string shorter than minLength");
      if (node.pattern && !(new RegExp(node.pattern).test(value))) errors.push(path + ": string does not match pattern " + node.pattern);
      if (node.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(path + ": invalid date-time");
    }

    if (typeof value === "number" && node.minimum !== undefined && value < node.minimum) {
      errors.push(path + ": number below minimum");
    }

    if (Array.isArray(value)) {
      if (node.minItems !== undefined && value.length < node.minItems) errors.push(path + ": fewer than minItems");
      if (node.uniqueItems) {
        const keys = value.map(canonicalJson);
        if (new Set(keys).size !== keys.length) errors.push(path + ": items must be unique");
      }
      if (node.items) value.forEach((item, index) => visit(item, node.items, path + "[" + index + "]", root));
    }

    if (isPlainObject(value)) {
      for (const required of node.required ?? []) {
        if (!(required in value)) errors.push(path + ": missing required property " + required);
      }
      const properties = node.properties ?? {};
      for (const [key, child] of Object.entries(properties)) {
        if (key in value) visit(value[key], child, path + "." + key, root);
      }
      for (const [key, childValue] of Object.entries(value)) {
        if (key in properties) continue;
        if (node.additionalProperties === false) errors.push(path + ": unexpected property " + key);
        else if (isPlainObject(node.additionalProperties)) visit(childValue, node.additionalProperties, path + "." + key, root);
      }
    }
  }

  visit(instance, schema, "$", schema);
  return errors;
}

export function validateSchemaDefinition(schema) {
  const errors = [];
  if (!isPlainObject(schema)) return ["schema must be an object"];
  if (!schema.$schema) errors.push("schema must declare $schema");
  if (!schema.$id) errors.push("schema must declare $id");

  const refs = [];
  (function collect(node) {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!isPlainObject(node)) return;
    if (typeof node.$ref === "string") refs.push(node.$ref);
    Object.values(node).forEach(collect);
  })(schema);

  for (const ref of refs) {
    try { pointerGet(schema, ref); }
    catch (error) { errors.push(error.message); }
  }
  return errors;
}

export function renderStateComment(state) {
  const assignment = state.assignment ? state.assignment.role + "/" + state.assignment.purpose : "none";
  return [
    STATE_MARKER,
    "",
    "Lifecycle: **" + state.lifecycle + "**  ",
    "State version: **" + state.state_version + "**  ",
    "Assignment: **" + assignment + "**",
    "",
    STATE_JSON_START,
    JSON.stringify(canonicalize(state), null, 2),
    STATE_JSON_END,
    ""
  ].join("\n");
}

export function parseStateComment(markdown) {
  if (typeof markdown !== "string" || !markdown.includes(STATE_MARKER)) throw new Error("Missing " + STATE_MARKER + " marker");
  const start = markdown.indexOf(STATE_JSON_START);
  const end = markdown.indexOf(STATE_JSON_END);
  if (start < 0 || end <= start) throw new Error("Missing bounded machine-state payload");
  return JSON.parse(markdown.slice(start + STATE_JSON_START.length, end).trim());
}

export function reconstructState(markdown, workflowStateSchema) {
  const state = parseStateComment(markdown);
  const errors = validateSchema(state, workflowStateSchema);
  if (errors.length) throw new Error("Invalid workflow-state projection: " + errors.join("; "));
  return state;
}

export function acceptMutableEvidence(input) {
  if (!Number.isInteger(input.actor_id) || input.actor_id < 1) throw new Error("Mutable evidence requires immutable numeric actor_id");
  return {
    evidence_kind: input.evidence_kind,
    repository: input.repository,
    object_id: input.object_id,
    actor_id: input.actor_id,
    accepted_revision: input.updated_at,
    payload_digest: digest(input.normalized_payload),
    normalized_outcome: input.normalized_outcome,
    context_binding: input.context_binding
  };
}

export function immutableEvidence(input) {
  return { evidence_kind: input.evidence_kind, repository: input.repository, immutable_id: input.immutable_id };
}

export function verifyAcceptedEvidence(binding, currentObject, expectedContextBinding = binding?.context_binding) {
  if (!binding || !currentObject) {
    return { status: "INVALID", reason: "MISSING_OR_DELETED", earliest_affected_point: "SOURCE_AUTHORITY" };
  }
  const identityMismatch =
    binding.evidence_kind !== currentObject.evidence_kind ||
    binding.repository !== currentObject.repository ||
    String(binding.object_id) !== String(currentObject.object_id) ||
    binding.actor_id !== currentObject.actor_id;

  if (identityMismatch) {
    return { status: "INVALID", reason: "OBJECT_OR_ACTOR_MISMATCH", earliest_affected_point: "SOURCE_AUTHORITY" };
  }
  if (binding.context_binding !== expectedContextBinding) {
    return { status: "STALE", reason: "CONTEXT_BINDING_CHANGED", earliest_affected_point: "EARLIEST_DEPENDENT_GATE" };
  }

  const changed =
    binding.accepted_revision !== currentObject.updated_at ||
    binding.payload_digest !== digest(currentObject.normalized_payload) ||
    binding.normalized_outcome !== currentObject.normalized_outcome;

  if (changed) {
    return { status: "DRIFTED", reason: "ACCEPTED_MUTABLE_EVIDENCE_CHANGED", earliest_affected_point: "SOURCE_AUTHORITY" };
  }
  return { status: "CURRENT", reason: null, earliest_affected_point: null };
}

export function validateProjectProfileSemantics(profile) {
  const errors = [];
  const expected = { A: "A_READ_ANALYZE", D: "D_WORKSPACE_WRITE", R: "R_READ_REVIEW", P: "P_PUBLISH" };
  for (const role of ROLES) {
    const runner = profile?.role_runners?.[role];
    if (!runner) errors.push("missing role_runners." + role);
    else if (runner.capability_profile !== expected[role]) errors.push("role_runners." + role + ".capability_profile must be " + expected[role]);
  }

  const o = profile?.identities?.O;
  const p = profile?.identities?.P;
  if (!o || o.capability_profile !== "O_CONTROL_PLANE") errors.push("identities.O must use O_CONTROL_PLANE");
  if (!p || p.capability_profile !== "P_PUBLISH") errors.push("identities.P must use P_PUBLISH");
  if (o && p && o.identity_id === p.identity_id) errors.push("O and P identities must be distinct");
  if (o?.dispatch_mechanism !== "workflow_dispatch") errors.push("reference O dispatch must use workflow_dispatch");
  if (o?.permissions?.actions !== "write") errors.push("O workflow_dispatch requires Actions write");
  if (o?.permissions?.contents === "write") errors.push("O must not receive publication-capable Contents write");
  if (p && !Object.values(p.permissions ?? {}).includes("write")) errors.push("P must expose at least one explicit write capability");

  const mechanismKey = profile?.role_runners?.R?.independence_mechanism;
  const mechanism = profile?.independent_r_enforcement?.mechanisms?.[mechanismKey];
  if (!mechanismKey || !mechanism) errors.push("R runner must reference a configured independence mechanism");
  else if (mechanism.attestation_source !== "deterministic-wrapper") errors.push("R independence must use deterministic-wrapper attestation");

  if (profile?.repository_topology === "multi-repo" && !(profile.implementation_repositories?.length > 0)) {
    errors.push("multi-repo profile requires implementation_repositories");
  }
  return errors;
}

export function validateTransitionTable(table) {
  const errors = [];
  const expectedIds = Array.from({ length: 19 }, (_, index) => "T" + String(index + 1).padStart(2, "0"));
  if (table?.schema_version !== 1) errors.push("transition table schema_version must be 1");
  const transitions = table?.transitions ?? [];
  const ids = transitions.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push("transition IDs must be unique");
  for (const id of expectedIds) if (!ids.includes(id)) errors.push("missing transition " + id);
  for (const id of ids) if (!expectedIds.includes(id)) errors.push("unexpected transition " + id);
  for (const transition of transitions) {
    const role = transition.assignment?.role;
    if (role && !ROLES.includes(role)) errors.push(transition.id + ": invalid assignment role " + role);
    if (["T13", "T16", "T18", "T19"].includes(transition.id) && transition.assignment) {
      errors.push(transition.id + ": mechanical transition must not require role assignment");
    }
  }
  if (!Array.isArray(table?.priority) || table.priority[0] !== "schema_config_validity" || !table.priority.includes("stopped_terminal_guard")) {
    errors.push("transition priority must begin with schema/config validity and include Stopped guard");
  }
  return errors;
}

export function doctor({ projectProfile, projectProfileSchema, schemas, transitionTable }) {
  const errors = [];
  for (const [name, schema] of Object.entries(schemas)) {
    for (const error of validateSchemaDefinition(schema)) errors.push(name + ": " + error);
  }
  for (const error of validateSchema(projectProfile, projectProfileSchema)) errors.push("project-profile: " + error);
  errors.push(...validateProjectProfileSemantics(projectProfile).map((error) => "project-profile semantics: " + error));
  errors.push(...validateTransitionTable(transitionTable).map((error) => "transitions: " + error));
  return { ok: errors.length === 0, errors };
}
