const SECTION_HEADINGS = Object.freeze({
  GOAL: "Goal",
  CONTEXT: "Context",
  SCOPE: "Scope",
  OUT_OF_SCOPE: "Out of scope",
  REQUIREMENTS: "Requirements",
  ACCEPTANCE_CRITERIA: "Acceptance criteria",
  CONSTRAINTS: "Constraints",
  DEPENDENCIES: "Dependencies",
  CANONICAL_REFERENCES: "Canonical references",
  REQUIRED_CONTROL_GATES: "Required control gates",
  VALIDATION: "Validation",
  DOCUMENTATION_IMPACT: "Documentation impact",
  CONCURRENCY_CLASS: "Concurrency class",
  SHARED_SURFACES: "Shared surfaces",
  DECISION_GATES: "Decision gates",
  RELEASE_POLICY: "Release policy"
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

function stringifyValue(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => "- " + (typeof item === "string" ? item : JSON.stringify(item))).join("\n");
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

export function sectionContent(body, heading) {
  const re = new RegExp("^##\\s+" + escapeRegExp(heading) + "\\s*$([\\s\\S]*?)(?=^##\\s+|$)", "mi");
  const match = body.match(re);
  return match ? match[1].trim() : "";
}

export function setSection(body, heading, value) {
  const text = stringifyValue(value);
  const re = new RegExp("(^##\\s+" + escapeRegExp(heading) + "\\s*$)[\\s\\S]*?(?=^##\\s+|$)", "mi");
  const replacement = "## " + heading + "\n\n" + text + "\n\n";
  if (re.test(body)) return body.replace(re, replacement);
  return body.trimEnd() + "\n\n" + replacement;
}

export function applyContractOperations(body, operations, expectedDigest, actualDigest) {
  if (expectedDigest !== actualDigest) throw new Error("Contract precondition digest mismatch");
  let next = body;
  for (const operation of operations ?? []) {
    if (operation.op !== "SET_SECTION") throw new Error("Unsupported contract operation " + operation.op);
    const heading = SECTION_HEADINGS[operation.section];
    if (!heading) throw new Error("Unsupported contract section " + operation.section);
    if (operation.precondition_contract_digest !== actualDigest) throw new Error("Per-operation contract digest mismatch");
    next = setSection(next, heading, operation.value);
  }
  return next;
}

export function definitionOfReady(body) {
  const missing = [];
  for (const heading of ["Goal", "Scope", "Acceptance criteria"]) {
    if (!sectionContent(body, heading)) missing.push(heading);
  }
  return { ready: missing.length === 0, missing };
}
