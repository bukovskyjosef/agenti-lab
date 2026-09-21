import { readFileSync } from "node:fs";

function inputJson() {
  if (process.env.AGENTI_MATERIAL_OPERATION_JSON) {
    return process.env.AGENTI_MATERIAL_OPERATION_JSON;
  }
  return readFileSync(0, "utf8");
}

const command = process.argv[2];
if (!["prepare", "resolve"].includes(command)) {
  throw new Error("Usage: material-operation.mjs prepare|resolve");
}

const baseUrl = process.env.AGENTI_O_VERIFY_URL;
const secret = process.env.AGENTI_RECEIVER_VERIFY_SECRET;
if (!baseUrl || !secret) {
  throw new Error(
    "AGENTI_O_VERIFY_URL and AGENTI_RECEIVER_VERIFY_SECRET are required"
  );
}

const payload = JSON.parse(inputJson());
const response = await fetch(
  baseUrl.replace(/\/$/, "") + "/material/" + command,
  {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/json",
      "X-Agenti-Runner-Repository": process.env.GITHUB_REPOSITORY ?? "",
      "X-Agenti-Workflow-Run-Id": process.env.GITHUB_RUN_ID ?? "",
      "X-Agenti-Workflow-Run-Attempt": process.env.GITHUB_RUN_ATTEMPT ?? ""
    },
    body: JSON.stringify(payload)
  }
);
const result = await response.json();
process.stdout.write(JSON.stringify(result) + "\n");

if (process.env.GITHUB_OUTPUT) {
  const lines = [];
  if (result.material_operation?.material_operation_id) {
    lines.push(
      "material_operation_id=" +
      result.material_operation.material_operation_id
    );
  }
  if (result.claim_version !== undefined) {
    lines.push("claim_version=" + String(result.claim_version));
  }
  if (lines.length) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  }
}

if (!result.valid) process.exit(78);
