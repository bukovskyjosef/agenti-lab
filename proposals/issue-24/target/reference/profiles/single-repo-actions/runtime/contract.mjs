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

function stringifyValue(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => "- " + (typeof item === "string" ? item : JSON.stringify(item))).join("\n");
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function sectionRange(body, heading) {
  const lines = body.split("\n");
  const wanted = "## " + heading.toLowerCase();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().toLowerCase() === wanted) {
      start = index;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { lines, start, end };
}

export function sectionContent(body, heading) {
  const range = sectionRange(body, heading);
  if (!range) return "";
  return range.lines.slice(range.start + 1, range.end).join("\n").trim();
}

export function setSection(body, heading, value) {
  const text = stringifyValue(value);
  const range = sectionRange(body, heading);
  if (!range) return body.trimEnd() + "\n\n## " + heading + "\n\n" + text + "\n";
  const replacement = ["## " + heading, "", text, ""];
  return [
    ...range.lines.slice(0, range.start),
    ...replacement,
    ...range.lines.slice(range.end)
  ].join("\n");
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
