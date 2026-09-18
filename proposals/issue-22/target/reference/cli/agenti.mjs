#!/usr/bin/env node
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const SELF = fileURLToPath(import.meta.url);
const REFERENCE_ROOT = resolve(dirname(SELF), "..");
const PROFILE_ID = "single-repo-actions";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["dry-run", "force-generated", "no-github", "github"].includes(key)) {
      out[key] = true;
      continue;
    }
    out[key] = argv[++i];
  }
  return out;
}

async function exists(path) {
  try { await stat(path); return true; }
  catch { return false; }
}

function sha256(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

async function listFiles(root) {
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await walk(root);
  return output;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function replacePlaceholders(text, config) {
  return text
    .replaceAll("__OWNER__/__REPOSITORY__", config.repository ?? "__OWNER__/__REPOSITORY__")
    .replaceAll("__HUMAN_LOGIN__", config.humanLogin ?? "__HUMAN_LOGIN__")
    .replaceAll('"actor_id": 1', '"actor_id": ' + (config.humanActorId ?? 1))
    .replaceAll("__DEFAULT_BRANCH__", config.defaultBranch ?? "__DEFAULT_BRANCH__");
}

async function sourcePlan(config) {
  const profileRoot = join(REFERENCE_ROOT, "profiles", PROFILE_ID);
  const targetTemplate = join(profileRoot, "target");
  const plan = [];

  for (const source of await listFiles(targetTemplate)) {
    const rel = relative(targetTemplate, source);
    const raw = await readFile(source);
    const text = raw.toString("utf8");
    const content = Buffer.from(replacePlaceholders(text, config));
    plan.push({ source, targetRel: rel, content, kind: "generated-profile" });
  }

  const copies = [
    [join(profileRoot, "runtime"), ".agenti-runtime/runtime"],
    [join(REFERENCE_ROOT, "core"), ".agenti-runtime/core"],
    [join(REFERENCE_ROOT, "schemas"), ".agenti-runtime/schemas"],
    [join(REFERENCE_ROOT, "adapters", "codex-action"), ".agenti-runtime/adapters/codex-action"],
    [join(REFERENCE_ROOT, "conformance", "single-repo-actions"), ".agenti-runtime/conformance/single-repo-actions"]
  ];
  for (const [root, prefix] of copies) {
    if (!(await exists(root))) {
      throw new Error("Required integrated dependency is missing: " + root + ". Child #22 must be assembled with R-approved Child #21 core.");
    }
    for (const source of await listFiles(root)) {
      plan.push({
        source,
        targetRel: join(prefix, relative(root, source)),
        content: await readFile(source),
        kind: "generated-runtime"
      });
    }
  }

  plan.push({
    source: SELF,
    targetRel: ".agenti-runtime/agenti.mjs",
    content: await readFile(SELF),
    kind: "generated-runtime"
  });
  return plan;
}

async function previousManifest(targetRoot) {
  const path = join(targetRoot, ".agenti", "installed-manifest.json");
  if (!(await exists(path))) return null;
  return readJson(path);
}

async function install(args) {
  const targetRoot = resolve(args.target ?? process.cwd());
  const config = {
    repository: args.repository,
    humanLogin: args["human-login"],
    humanActorId: args["human-actor-id"] ? Number(args["human-actor-id"]) : undefined,
    defaultBranch: args["default-branch"]
  };
  const plan = await sourcePlan(config);
  const prior = await previousManifest(targetRoot);
  const priorMap = new Map((prior?.files ?? []).map((file) => [file.path, file.sha256]));
  const conflicts = [];
  const writes = [];

  for (const item of plan) {
    const target = join(targetRoot, item.targetRel);
    const newHash = sha256(item.content);
    if (await exists(target)) {
      const currentHash = await sha256File(target);
      const installedHash = priorMap.get(item.targetRel);
      const userModified = installedHash ? currentHash !== installedHash : true;
      if (userModified && currentHash !== newHash && !args["force-generated"]) {
        conflicts.push(item.targetRel);
        continue;
      }
      if (currentHash === newHash) continue;
    }
    writes.push({ ...item, target, sha256: newHash });
  }

  if (conflicts.length) {
    throw new Error(
      "Install/update refused to overwrite locally modified or unowned generated files:\n- " +
      conflicts.join("\n- ") +
      "\nUse --force-generated only after reviewing these conflicts."
    );
  }

  const sourceVersion = args["source-version"] ??
    process.env.AGENTI_SOURCE_VERSION ??
    "unpublished-development-target";

  const manifest = {
    schema_version: 1,
    profile: PROFILE_ID,
    source_version: sourceVersion,
    installed_at: new Date().toISOString(),
    core_dependency: {
      issue: 21,
      pull_request: 25,
      exact_head: "7b155f8abd09f84c0065d64063eee3b2c3dce615"
    },
    files: []
  };

  for (const item of plan) {
    const target = join(targetRoot, item.targetRel);
    const hash = item.sha256 ?? sha256(item.content);
    manifest.files.push({ path: item.targetRel, sha256: hash, kind: item.kind });
    if (args["dry-run"]) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, item.content);
  }

  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  if (!args["dry-run"]) {
    const manifestPath = join(targetRoot, ".agenti", "installed-manifest.json");
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }

  console.log(JSON.stringify({
    profile: PROFILE_ID,
    target: targetRoot,
    dry_run: Boolean(args["dry-run"]),
    write_count: writes.length,
    file_count: manifest.files.length,
    source_version: sourceVersion
  }, null, 2));

  if (!args["no-github"] && !args["dry-run"]) {
    console.log("Next: commit generated files, configure the provider secret, then run: node .agenti-runtime/agenti.mjs setup-github --target .");
  }
}

async function loadInstalled(targetRoot) {
  const profilePath = join(targetRoot, ".agenti", "project-profile.json");
  const runtimePath = join(targetRoot, ".agenti", "single-repo-actions.json");
  const manifestPath = join(targetRoot, ".agenti", "installed-manifest.json");
  if (!(await exists(profilePath)) || !(await exists(runtimePath)) || !(await exists(manifestPath))) {
    throw new Error("Target is not a complete installed single-repo-actions profile");
  }
  return {
    profilePath,
    runtimePath,
    manifestPath,
    profile: await readJson(profilePath),
    runtime: await readJson(runtimePath),
    manifest: await readJson(manifestPath)
  };
}

async function localDoctor(targetRoot) {
  const installed = await loadInstalled(targetRoot);
  const coreUrl = pathToFileURL(join(targetRoot, ".agenti-runtime", "core", "index.mjs")).href;
  const core = await import(coreUrl);
  const schemas = {
    projectProfile: await readJson(join(targetRoot, ".agenti-runtime", "schemas", "project-profile.schema.json")),
    workflowState: await readJson(join(targetRoot, ".agenti-runtime", "schemas", "workflow-state.schema.json")),
    assignment: await readJson(join(targetRoot, ".agenti-runtime", "schemas", "assignment.schema.json")),
    roleResult: await readJson(join(targetRoot, ".agenti-runtime", "schemas", "role-result.schema.json"))
  };
  const transitions = await readJson(join(targetRoot, ".agenti-runtime", "core", "transitions.json"));
  const result = core.doctor({
    projectProfile: installed.profile,
    projectProfileSchema: schemas.projectProfile,
    schemas,
    transitionTable: transitions
  });
  const errors = [...result.errors];

  if (installed.profile.control_repository.includes("__")) errors.push("control_repository placeholder is not configured");
  if (installed.profile.human.principals.some((p) => p.login.includes("__") || p.actor_id === 1)) errors.push("Human principal placeholder is not configured");
  if (installed.runtime.default_branch.includes("__")) errors.push("default_branch placeholder is not configured");
  if (installed.runtime.runner.codex_action_ref !== "86365089eb2b84e0a8fb0717b304f8bdcb13b20e") errors.push("Codex Action ref differs from the reviewed adapter pin");

  const manifestMap = new Map(installed.manifest.files.map((file) => [file.path, file.sha256]));
  for (const [rel, expected] of manifestMap) {
    const path = join(targetRoot, rel);
    if (!(await exists(path))) {
      errors.push("installed file missing: " + rel);
      continue;
    }
    const current = await sha256File(path);
    if (current !== expected && ![".agenti/project-profile.json", ".agenti/single-repo-actions.json"].includes(rel)) {
      errors.push("generated runtime drift: " + rel);
    }
  }

  for (const workflow of Object.values(installed.runtime.workflows ?? {
    orchestrate: "agenti-orchestrate.yml",
    reconcile: "agenti-reconcile.yml",
    A: "agenti-role-a.yml",
    D: "agenti-role-d.yml",
    R: "agenti-role-r.yml",
    P: "agenti-publish.yml"
  })) {
    if (!(await exists(join(targetRoot, ".github", "workflows", workflow)))) errors.push("workflow missing: " + workflow);
  }

  return { ok: errors.length === 0, errors, installed };
}

function gh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "inherit"] }).trim();
}

async function setupGithub(targetRoot) {
  const local = await localDoctor(targetRoot);
  const installed = local.installed;

  const repoInfo = JSON.parse(gh(["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]));
  const user = JSON.parse(gh(["api", "user"]));
  const profile = installed.profile;
  const runtime = installed.runtime;

  let changed = false;
  if (profile.control_repository.includes("__")) {
    profile.control_repository = repoInfo.nameWithOwner;
    changed = true;
  }
  if (profile.human.principals.some((p) => p.login.includes("__") || p.actor_id === 1)) {
    profile.human.principals = [{ actor_id: user.id, login: user.login }];
    changed = true;
  }
  if (runtime.default_branch.includes("__")) {
    runtime.default_branch = repoInfo.defaultBranchRef.name;
    changed = true;
  }
  if (changed) {
    await writeFile(installed.profilePath, JSON.stringify(profile, null, 2) + "\n");
    await writeFile(installed.runtimePath, JSON.stringify(runtime, null, 2) + "\n");
  }

  const actions = JSON.parse(gh(["api", "repos/" + repoInfo.nameWithOwner + "/actions/permissions"]));
  if (!actions.enabled) throw new Error("GitHub Actions are disabled for " + repoInfo.nameWithOwner);

  const labelColors = {
    "agenti:managed": "1d76db",
    "agenti:waiting-human": "fbca04",
    "agenti:release-approval": "d93f0b",
    "agenti:blocked": "b60205",
    "agenti:stopped": "5319e7",
    "agenti:done": "0e8a16"
  };
  for (const label of [
    "agenti:managed",
    "agenti:waiting-human",
    "agenti:release-approval",
    "agenti:blocked",
    "agenti:stopped",
    "agenti:done"
  ]) {
    gh(["label", "create", label, "--force", "--color", labelColors[label], "--description", "Agenti runtime projection label"]);
  }

  const requiredSecret = runtime.runner.secret_name;
  gh(["variable", "set", "AGENTI_CODEX_SECRET_NAME", "--body", requiredSecret]);
  gh(["variable", "set", "AGENTI_TEST_MODE", "--body", "false"]);

  const secrets = gh(["secret", "list", "--json", "name"]);
  const secretNames = new Set(JSON.parse(secrets).map((item) => item.name));
  if (!secretNames.has(requiredSecret)) {
    throw new Error("Required provider secret metadata is missing: " + requiredSecret + ". Configure it with gh secret set " + requiredSecret);
  }

  for (const workflow of [
    "agenti-orchestrate.yml",
    "agenti-reconcile.yml",
    "agenti-role-a.yml",
    "agenti-role-d.yml",
    "agenti-role-r.yml",
    "agenti-publish.yml"
  ]) {
    gh(["api", "repos/" + repoInfo.nameWithOwner + "/contents/.github/workflows/" + workflow + "?ref=" + runtime.default_branch]);
  }

  console.log("setup-github: OK");
  console.log("- repository: " + repoInfo.nameWithOwner);
  console.log("- default branch: " + runtime.default_branch);
  console.log("- H principal: " + profile.human.principals[0].login + " (" + profile.human.principals[0].actor_id + ")");
  console.log("- provider secret metadata present: " + requiredSecret);
  console.log("- repository variables AGENTI_CODEX_SECRET_NAME and AGENTI_TEST_MODE=false configured");
  console.log("- labels/workflows verified");
}

async function doctorCommand(targetRoot, githubAware) {
  const result = await localDoctor(targetRoot);
  const errors = [...result.errors];

  if (githubAware) {
    try {
      const repoInfo = JSON.parse(gh(["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]));
      if (repoInfo.nameWithOwner !== result.installed.profile.control_repository) {
        errors.push("GitHub repository differs from configured control_repository");
      }
      const actions = JSON.parse(gh(["api", "repos/" + repoInfo.nameWithOwner + "/actions/permissions"]));
      if (!actions.enabled) errors.push("GitHub Actions disabled");
      const secretNames = new Set(JSON.parse(gh(["secret", "list", "--json", "name"])).map((item) => item.name));
      if (!secretNames.has(result.installed.runtime.runner.secret_name)) errors.push("provider secret metadata missing");
    } catch (error) {
      errors.push("GitHub-aware doctor failed: " + error.message);
    }
  }

  if (errors.length) {
    console.error("agenti single-repo doctor: FAILED");
    for (const error of errors) console.error("- " + error);
    process.exitCode = 1;
    return;
  }
  console.log("agenti single-repo doctor: OK");
  console.log("- shared core/schema/transition contract: valid");
  console.log("- installed manifest hashes: valid");
  console.log("- O/P configuration split: valid");
  console.log("- Codex adapter pin: valid");
  if (githubAware) console.log("- GitHub repository/actions/secret metadata: valid");
}

async function main() {
  const [command = "doctor", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const target = resolve(args.target ?? process.cwd());

  if (command === "install" || command === "update") return install(args);
  if (command === "doctor") return doctorCommand(target, Boolean(args.github));
  if (command === "setup-github") return setupGithub(target);
  throw new Error("Commands: install | update | doctor [--github] | setup-github");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
