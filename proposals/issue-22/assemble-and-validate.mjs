import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const issue22Dir = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const proposalsRoot = resolve(issue22Dir, "..");
const child21 = join(proposalsRoot, "issue-21", "target", "reference");
const child22 = join(proposalsRoot, "issue-22", "target", "reference");
const temp = await mkdtemp(join(tmpdir(), "agenti-child22-overlay-"));
const reference = join(temp, "reference");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) throw new Error(command + " failed with " + result.status);
}

try {
  await cp(child21, reference, { recursive: true });
  await cp(child22, reference, { recursive: true, force: true });

  run("npm", ["test"], reference);
  run("npm", ["run", "doctor", "--", "./conformance/fixtures/project-profile.valid.json"], reference);
  run(process.execPath, ["--test", "conformance/single-repo-actions/static.test.mjs"], reference);
  run(process.execPath, ["--test", "conformance/single-repo-actions/local-e2e.test.mjs"], reference);

  console.log("Child #22 overlay validation: OK");
  console.log("Child #21 exact dependency: 7b155f8abd09f84c0065d64063eee3b2c3dce615");
} finally {
  await rm(temp, { recursive: true, force: true });
}
