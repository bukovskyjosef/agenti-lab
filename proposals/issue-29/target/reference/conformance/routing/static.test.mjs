import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");
const workflows = join(
  referenceRoot,
  "profiles",
  "single-repo-actions",
  "target",
  ".github",
  "workflows"
);

async function text(path) {
  return readFile(path, "utf8");
}

async function files(root) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out.push(path);
    }
  }
  await walk(root);
  return out;
}

test("Claude subscription workflows are exact-pinned and fail closed on paid Anthropic API environment", async () => {
  const exact =
    "anthropics/claude-code-action@a4f54ef2c58884867281bd8e2f8d63352ad019a9";
  for (const name of [
    "agenti-role-a-claude.yml",
    "agenti-role-d-claude.yml",
    "agenti-role-r-claude.yml"
  ]) {
    const body = await text(join(workflows, name));
    assert.match(body, new RegExp(exact.replaceAll("/", "\\/")));
    assert.match(body, /secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
    assert.doesNotMatch(body, /secrets\.ANTHROPIC_API_KEY/);
    assert.doesNotMatch(body, /^\s*anthropic_api_key\s*:/im);
    assert.match(
      body,
      /ANTHROPIC_API_KEY is forbidden for claude-subscription route/
    );
  }
});

test("default cost-min profile keeps Codex optional but unreachable as paid fallback", async () => {
  const profile = JSON.parse(await text(join(
    referenceRoot,
    "profiles",
    "single-repo-actions",
    "target",
    ".agenti",
    "project-profile.json"
  )));
  const adr = profile.execution_routing.policies.find(
    (policy) => policy.policy_id === "cost-min-adr"
  );
  assert.deepEqual(adr.candidates, ["claude-subscription"]);
  assert.equal(adr.paid_execution.mode, "FORBIDDEN");
  assert.ok(profile.execution_routing.runner_catalog["codex-api-optional"]);
  assert.equal(
    profile.execution_routing.runner_catalog["codex-api-optional"]
      .billing.mode,
    "METERED"
  );
});

test("I remains a system function, not an assignment/result role", async () => {
  const assignment = JSON.parse(await text(join(
    referenceRoot, "schemas", "assignment.schema.json"
  )));
  const result = JSON.parse(await text(join(
    referenceRoot, "schemas", "role-result.schema.json"
  )));
  const assignmentRoles = assignment.properties.role.enum;
  const resultRoles = result.$defs.common.properties.role.enum;
  assert.deepEqual(assignmentRoles, ["A", "D", "R", "P"]);
  assert.deepEqual(resultRoles, ["A", "D", "R", "P"]);
  assert.ok(!assignmentRoles.includes("I"));
  assert.ok(!resultRoles.includes("I"));
});

test("assembled canonical reference no longer names Asistentka as a system function", async () => {
  const offenders = [];
  const self = resolve(fileURLToPath(import.meta.url));
  for (const path of await files(referenceRoot)) {
    if (resolve(path) === self) continue;
    if (!/\.(md|mjs|json|yml|yaml)$/.test(path)) continue;
    const body = await text(path);
    const deprecatedName = "Asis" + "tentka";
    if (body.includes(deprecatedName)) {
      offenders.push(path.slice(referenceRoot.length + 1));
    }
  }
  assert.deepEqual(offenders, []);
});
