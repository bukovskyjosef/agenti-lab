import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as core from "../../core/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");

const schema = JSON.parse(await readFile(
  new URL("../../schemas/workflow-state.schema.json", import.meta.url),
  "utf8"
));
const base = JSON.parse(await readFile(
  new URL("../fixtures/base-state.json", import.meta.url),
  "utf8"
));

function desiredFrom(current) {
  const next = structuredClone(current);
  next.claim_control.claim_version += 1;
  next.updated_by = {
    o_run_id: "cas-test",
    transition_id: next.updated_by.transition_id,
    idempotence_key: "cas-ambiguity-test"
  };
  return next;
}

function comment(state) {
  return {
    id: 77,
    body: core.renderStateComment(state),
    user: { login: "github-actions[bot]", type: "Bot" }
  };
}

async function withInstalledStateRuntime(fn) {
  const temp = await mkdtemp(join(tmpdir(), "agenti-cas-test-"));
  try {
    await cp(join(referenceRoot, "core"), join(temp, "core"), {
      recursive: true
    });
    await mkdir(join(temp, "runtime"), { recursive: true });
    await cp(
      join(
        referenceRoot,
        "profiles",
        "single-repo-actions",
        "runtime",
        "state.mjs"
      ),
      join(temp, "runtime", "state.mjs")
    );
    const runtime = await import(
      pathToFileURL(join(temp, "runtime", "state.mjs")).href
    );
    return await fn(runtime.saveStateCAS);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test("ambiguous PATCH that already applied is resolved by reread without duplicate retry", async () =>
  withInstalledStateRuntime(async (saveStateCAS) => {
  const current = structuredClone(base);
  const desired = desiredFrom(current);
  let durable = comment(current);
  let updates = 0;

  const github = {
    getIssueComment: async () => durable,
    updateIssueComment: async (_id, body) => {
      updates += 1;
      durable = { ...durable, body };
      throw new Error("simulated response loss after server commit");
    }
  };

  const saved = await saveStateCAS(
    github,
    42,
    desired,
    schema,
    durable,
    current.state_version,
    current.claim_control.claim_version
  );
  assert.equal(updates, 1);
  assert.equal(
    core.digest(core.parseStateComment(saved.body)),
    core.digest(desired)
  );
}));

test("ambiguous PATCH not applied retries at most once while expected projection is unchanged", async () =>
  withInstalledStateRuntime(async (saveStateCAS) => {
  const current = structuredClone(base);
  const desired = desiredFrom(current);
  let durable = comment(current);
  let updates = 0;

  const github = {
    getIssueComment: async () => durable,
    updateIssueComment: async (_id, body) => {
      updates += 1;
      if (updates === 1) throw new Error("simulated pre-commit transport failure");
      durable = { ...durable, body };
      return durable;
    }
  };

  const saved = await saveStateCAS(
    github,
    42,
    desired,
    schema,
    durable,
    current.state_version,
    current.claim_control.claim_version
  );
  assert.equal(updates, 2);
  assert.equal(
    core.digest(core.parseStateComment(saved.body)),
    core.digest(desired)
  );
}));

test("ambiguous PATCH never overwrites a conflicting later projection", async () =>
  withInstalledStateRuntime(async (saveStateCAS) => {
  const current = structuredClone(base);
  const desired = desiredFrom(current);
  const conflict = structuredClone(current);
  conflict.state_version += 1;
  conflict.updated_by.idempotence_key = "other-writer";
  let durable = comment(current);

  const github = {
    getIssueComment: async () => durable,
    updateIssueComment: async () => {
      durable = comment(conflict);
      throw new Error("simulated ambiguous conflict");
    }
  };

  await assert.rejects(
    saveStateCAS(
      github,
      42,
      desired,
      schema,
      durable,
      current.state_version,
      current.claim_control.claim_version
    ),
    /CAS_AMBIGUOUS_CONFLICT/
  );
}));
