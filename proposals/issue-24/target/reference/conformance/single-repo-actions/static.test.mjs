import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");
const workflows = join(referenceRoot, "profiles", "single-repo-actions", "target", ".github", "workflows");
const read = (name) => readFile(join(workflows, name), "utf8");

test("O workflow has Actions write but no publication-capable Contents write", async () => {
  const body = await read("agenti-orchestrate.yml");
  const permissionBlock = body.slice(body.indexOf("permissions:"), body.indexOf("concurrency:"));
  assert.match(permissionBlock, /contents:\s+read/);
  assert.match(permissionBlock, /actions:\s+write/);
  assert.doesNotMatch(permissionBlock, /contents:\s+write/);
  assert.match(body, /^  pull_request_target:/m);
  assert.doesNotMatch(body, /^  pull_request:/m);
  assert.doesNotMatch(body, /repository_dispatch/);
  assert.match(body, /Trusted T0 bootstrap/);
  assert.match(body, /agenti-control\/reference\/profiles\/single-repo-actions\/runtime\/orchestrate\.mjs/);
});

test("P is the only default publication workflow with privileged Contents write", async () => {
  const p = await read("agenti-publish.yml");
  assert.match(p, /contents:\s+write/);
  assert.match(p, /runtime\/publish\.mjs/);

  for (const name of ["agenti-role-a.yml", "agenti-role-r.yml"]) {
    const body = await read(name);
    assert.doesNotMatch(body, /contents:\s+write/);
  }

  const d = await read("agenti-role-d.yml");
  const model = d.slice(d.indexOf("\n  model:"), d.indexOf("\n  candidate_writer:"));
  const writer = d.slice(d.indexOf("\n  candidate_writer:"));
  assert.doesNotMatch(model, /contents:\s+write/);
  assert.match(writer, /contents:\s+write/);
  assert.doesNotMatch(writer, /openai-api-key/);
});

test("A/D/R provider jobs use the reviewed exact Codex Action pin and fake path is opt-in", async () => {
  const exact = "openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e";
  for (const name of ["agenti-role-a.yml", "agenti-role-d.yml", "agenti-role-r.yml"]) {
    const body = await read(name);
    assert.match(body, new RegExp(exact.replaceAll("/", "\\/")));
    assert.match(body, /vars\.AGENTI_TEST_MODE == 'true'/);
    assert.match(body, /vars\.AGENTI_TEST_MODE != 'true'/);
    assert.match(body, /secrets\.OPENAI_API_KEY/);
  }
});

test("R is read-only provider execution and D write is deterministic separate job", async () => {
  const r = await read("agenti-role-r.yml");
  assert.match(r, /permission-profile:\s+":read-only"/);
  const rModel = r.slice(r.indexOf("\n  model:"), r.indexOf("\n  finalize:"));
  assert.doesNotMatch(rModel, /issues:\s+write/);
  assert.doesNotMatch(rModel, /contents:\s+write/);

  const d = await read("agenti-role-d.yml");
  const dModel = d.slice(d.indexOf("\n  model:"), d.indexOf("\n  candidate_writer:"));
  assert.match(dModel, /permission-profile:\s+":workspace"/);
  assert.doesNotMatch(dModel, /issues:\s+write/);
  assert.doesNotMatch(dModel, /contents:\s+write/);
});

test("installed starter owns only stable bootstrap/transport, not mutable control-plane copies", async () => {
  const targetRoot = join(referenceRoot, "profiles", "single-repo-actions", "target");
  const fs = await import("node:fs/promises");
  assert.ok(await fs.stat(join(targetRoot, "AGENTS.md")));
  assert.ok(await fs.stat(join(targetRoot, ".agenti", "bootstrap.json")));
  assert.ok(await fs.stat(join(targetRoot, ".agenti-bootstrap", "bootstrap-trust.mjs")));
  await assert.rejects(fs.stat(join(targetRoot, ".agenti", "project-profile.json")));
  await assert.rejects(fs.stat(join(targetRoot, ".agenti", "single-repo-actions.json")));
  await assert.rejects(fs.stat(join(targetRoot, ".agenti", "prompts")));
  await assert.rejects(fs.stat(join(targetRoot, ".agenti-runtime")));
  await assert.rejects(fs.stat(join(targetRoot, ".github", "pull_request_template.md")));
});

test("A/D/R/P launchers are dispatch-only and perform trusted T0 before provider/material authority", async () => {
  for (const name of [
    "agenti-role-a.yml", "agenti-role-d.yml", "agenti-role-r.yml",
    "agenti-role-a-claude.yml", "agenti-role-d-claude.yml", "agenti-role-r-claude.yml",
    "agenti-publish.yml"
  ]) {
    const body = await read(name);
    assert.match(body, /^  workflow_dispatch:/m);
    assert.doesNotMatch(body, /^  pull_request(?:_target)?:/m);
    assert.match(body, /AGENTI_REQUIRE_ASSIGNMENT_TRUST:\s*"true"/);
    assert.match(body, /Trusted T0 bootstrap/);
    assert.match(body, /bootstrap-trust\.mjs/);
  }
});

test("trusted bootstrap resolver pins default-branch product and external control-plane SHAs", async () => {
  const helper = await readFile(
    join(referenceRoot, "profiles", "single-repo-actions", "target", ".agenti-bootstrap", "bootstrap-trust.mjs"),
    "utf8"
  );
  assert.match(helper, /TRUSTED_PRODUCT_SHA_DRIFT/);
  assert.match(helper, /TRUSTED_PRODUCT_REF_MISMATCH/);
  assert.match(helper, /agenti-control-plane:/);
  assert.match(helper, /control_plane_sha/);
  assert.match(helper, /projects.*registry\.yml/);
  assert.match(helper, /git.*fetch/);
});

test("runtime and schemas durably bind product/control plane to assignments", async () => {
  const runner = await readFile(
    join(referenceRoot, "profiles", "single-repo-actions", "runtime", "runner.mjs"),
    "utf8"
  );
  const assignmentSchema = JSON.parse(await readFile(join(referenceRoot, "schemas", "assignment.schema.json"), "utf8"));
  const stateSchema = JSON.parse(await readFile(join(referenceRoot, "schemas", "workflow-state.schema.json"), "utf8"));
  assert.ok(assignmentSchema.properties.trust_binding);
  assert.ok(stateSchema.properties.assignment.properties.trust_binding);
  assert.match(runner, /ASSIGNMENT_TRUST_BINDING_MISSING/);
  assert.match(runner, /ASSIGNMENT_TRUST_BINDING_STALE/);
  assert.match(runner, /CONTROL_PLANE_PROJECT_MAPPING_MISSING/);
});


test("Claude A/R output uploads preserve hidden workspace artifacts", async () => {
  for (const [name, artifactName] of [
    ["agenti-role-a-claude.yml", "agenti-claude-a-output-"],
    ["agenti-role-r-claude.yml", "agenti-claude-r-output-"]
  ]) {
    const body = await read(name);
    const start = body.indexOf("name: " + artifactName);
    assert.ok(start >= 0, name + " output artifact block missing");
    const block = body.slice(start, body.indexOf("\n\n", start));
    assert.match(block, /path:\s+\.agenti-run/);
    assert.match(block, /include-hidden-files:\s+true/);
  }
});


test("A/R finalize CLI binds run-context to the supplied proposal artifact directory", async () => {
  const runner = await readFile(
    join(referenceRoot, "profiles", "single-repo-actions", "runtime", "runner.mjs"),
    "utf8"
  );
  assert.match(runner, /contextPath:\s*join\(dirname\(arg4\),\s*"run-context\.json"\)/);
});


test("ordinary transition assignments preserve external trust binding", async () => {
  const orchestrate = await readFile(
    join(referenceRoot, "profiles", "single-repo-actions", "runtime", "orchestrate.mjs"),
    "utf8"
  );
  assert.match(
    orchestrate,
    /if \(action\.assignment\) \{[\s\S]*?assignmentProjection\([\s\S]*?action\.assignment,[\s\S]*?runtime\.trustBinding[\s\S]*?\);[\s\S]*?\}/
  );
});


test("setup/doctor require Actions PR-creation capability", async () => {
  const cli = await readFile(join(referenceRoot, "cli", "agenti.mjs"), "utf8");
  assert.match(cli, /actions\/permissions\/workflow/);
  assert.match(cli, /can_approve_pull_request_reviews/);
  assert.match(cli, /GitHub Actions cannot create\/approve pull requests/);
  assert.match(cli, /HUMAN_ADMIN_BOUNDARY/);
});


test("Human stop/reopen authority outranks pending-assignment dispatch repair", async () => {
  const orchestrate = await readFile(
    join(referenceRoot, "profiles", "single-repo-actions", "runtime", "orchestrate.mjs"),
    "utf8"
  );
  assert.match(orchestrate, /latestTerminalCommand/);
  assert.match(orchestrate, /terminalAuthorityPending/);
  assert.match(
    orchestrate,
    /if \(!roleComment && !claim && !terminalAuthorityPending\) \{[\s\S]*?DISPATCH_REPAIRED/
  );
});
