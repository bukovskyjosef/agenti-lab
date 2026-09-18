import { readFileSync } from "node:fs";

function assignmentJson() {
  if (process.env.AGENTI_ASSIGNMENT_JSON) return process.env.AGENTI_ASSIGNMENT_JSON;
  return readFileSync(0, "utf8");
}

const baseUrl = process.env.AGENTI_O_VERIFY_URL;
const secret = process.env.AGENTI_RECEIVER_VERIFY_SECRET;
if (!baseUrl || !secret) {
  throw new Error("AGENTI_O_VERIFY_URL and AGENTI_RECEIVER_VERIFY_SECRET are required");
}

const assignment = JSON.parse(assignmentJson());
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/assignment/verify`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
    "X-Agenti-Runner-Repository": process.env.GITHUB_REPOSITORY ?? "",
    "X-Agenti-Workflow-Run-Id": process.env.GITHUB_RUN_ID ?? "",
    "X-Agenti-Workflow-Run-Attempt": process.env.GITHUB_RUN_ATTEMPT ?? ""
  },
  body: JSON.stringify(assignment)
});
const result = await response.json();
process.stdout.write(JSON.stringify(result) + "\n");
if (result.valid && process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  const lines = [
    result.claim_id ? "claim_id=" + result.claim_id : null,
    result.claim_generation !== undefined
      ? "claim_generation=" + String(result.claim_generation)
      : null,
    result.execution_instance_id
      ? "execution_instance_id=" + result.execution_instance_id
      : null
  ].filter(Boolean);
  if (lines.length) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  }
}
if (!result.valid) process.exit(78);
