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
  assert.doesNotMatch(body, /pull_request_target/);
  assert.doesNotMatch(body, /repository_dispatch/);
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
    assert.match(body, /secrets\[vars\.AGENTI_CODEX_SECRET_NAME\]/);
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

test("installed starter does not claim ownership of AGENTS.md or PR template", async () => {
  const targetRoot = join(referenceRoot, "profiles", "single-repo-actions", "target");
  const fs = await import("node:fs/promises");
  await assert.rejects(fs.stat(join(targetRoot, "AGENTS.md")));
  await assert.rejects(fs.stat(join(targetRoot, ".github", "pull_request_template.md")));
});
