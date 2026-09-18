import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const issue31Dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(issue31Dir, "..", "..");
const overlay = join(issue31Dir, "target", "reference");

const refs = [
  {
    name: "Child #21",
    sha: "7b155f8abd09f84c0065d64063eee3b2c3dce615",
    prefix: "proposals/issue-21/target/reference/"
  },
  {
    name: "Child #22",
    sha: "666555f1ad9be4a4b3be3c1e9d78e392febcdeff",
    prefix: "proposals/issue-22/target/reference/"
  },
  {
    name: "Child #23",
    sha: "0edb4d496fdb64e8a194f97a198dac0a3777e2b1",
    prefix: "proposals/issue-23/target/reference/"
  },
  {
    name: "Child #29",
    sha: "3fa68aca5717e7f966f42dd976bfd11da71c6732",
    prefix: "proposals/issue-29/target/reference/"
  }
];

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: options.binary ? undefined : "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (!options.binary) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  if (result.status !== 0) {
    throw new Error(command + " " + args.join(" ") + " failed with " + result.status);
  }
  return result;
}

async function materializeTree(referenceRoot, { name, sha, prefix }) {
  const listed = run(
    "git",
    ["ls-tree", "-r", "--name-only", sha, "--", prefix],
    repoRoot
  ).stdout.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!listed.length) throw new Error(name + " exact target is empty at " + sha);
  for (const sourcePath of listed) {
    const rel = sourcePath.slice(prefix.length);
    if (!rel) continue;
    const target = join(referenceRoot, rel);
    await mkdir(dirname(target), { recursive: true });
    const blob = run("git", ["show", sha + ":" + sourcePath], repoRoot, { binary: true }).stdout;
    await writeFile(target, blob);
  }
  console.log(name + " materialized @ " + sha + " (" + listed.length + " files)");
}

async function listMjs(root) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".mjs")) out.push(path);
    }
  }
  await walk(root);
  return out;
}

const temp = await mkdtemp(join(tmpdir(), "agenti-child31-"));
const referenceRoot = join(temp, "reference");

try {
  await mkdir(referenceRoot, { recursive: true });
  for (const item of refs) await materializeTree(referenceRoot, item);
  await cp(overlay, referenceRoot, { recursive: true, force: true });
  console.log("Child #31 overlay applied from working tree");

  for (const file of await listMjs(referenceRoot)) {
    run(process.execPath, ["--check", file], referenceRoot);
  }
  console.log("All assembled .mjs syntax: OK");

  run("npm", ["test"], referenceRoot);
  run("npm", ["run", "doctor", "--", "./conformance/fixtures/project-profile.valid.json"], referenceRoot);
  run("npm", ["run", "doctor", "--", "./conformance/fixtures/project-profile.routing.valid.json"], referenceRoot);
  run(process.execPath, ["--test", "conformance/routing/static.test.mjs"], referenceRoot);
  run(process.execPath, ["--test", "conformance/claims/static.test.mjs"], referenceRoot);
  run(process.execPath, ["--test", "conformance/single-repo-actions/static.test.mjs"], referenceRoot);
  run(process.execPath, ["--test", "conformance/single-repo-actions/local-e2e.test.mjs"], referenceRoot);
  run("npm", ["test"], join(referenceRoot, "app", "multi-repo-o"));

  if (process.argv.includes("--docker")) {
    run("docker", ["build", "-f", join(referenceRoot, "app", "multi-repo-o", "Dockerfile"), referenceRoot], repoRoot);
  }

  console.log("Child #31 combined exact-target validation: OK");
  console.log("Dependencies: " + refs.map((x) => x.name + "@" + x.sha).join(", "));
} finally {
  await rm(temp, { recursive: true, force: true });
}
