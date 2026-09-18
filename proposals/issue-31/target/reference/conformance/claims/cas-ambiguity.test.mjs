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

function claimRequest(s, execution = "exec-race") {
  return {
    schema_version: 1,
    work_item: s.work_item,
    assignment_id: s.assignment.assignment_id,
    role: s.assignment.role,
    purpose: s.assignment.purpose,
    expected: {
      workflow_state_version: s.state_version,
      claim_version: s.claim_control.claim_version,
      assignment_freshness_fingerprint: s.assignment.fingerprint,
      semantic_work_digest: s.assignment.semantic_work_digest ?? null,
      candidate_digest: s.candidate?.digest ?? null,
      target_digest: null,
      active_claim: "ABSENT"
    },
    claimant: {
      execution_attestation: {
        adapter_id: "race-test",
        adapter_version: "1",
        execution_instance_id: execution,
        platform_run: {
          provider: "github-actions",
          run_id: "991",
          run_attempt: 1,
          job_or_worker_id: "race"
        },
        provider_session: { mode: "fresh", provider_session_id: null },
        issued_for_assignment: s.assignment.assignment_id,
        attested_by: "deterministic-wrapper"
      }
    },
    lease: { mode: "PLATFORM_RUN" },
    requested_at: "2026-09-18T20:00:00Z",
    request_id: "race-" + execution
  };
}

function mutationMock(initial) {
  let durable = comment(initial);
  let updates = 0;
  return {
    github: {
      getIssueComment: async () => durable,
      updateIssueComment: async (_id, body) => {
        updates += 1;
        durable = { ...durable, body };
        return durable;
      }
    },
    state: () => core.parseStateComment(durable.body),
    updates: () => updates
  };
}

test("claim acquire vs Stop has one legal order and no surviving claim after Stop", async () =>
  withInstalledStateRuntime(async (saveStateCAS) => {
    const initial = structuredClone(base);
    const acquired = core.acquireClaimCAS({
      state: initial,
      request: claimRequest(initial),
      acquiredAt: "2026-09-18T20:00:00Z"
    });
    assert.equal(acquired.acquired, true);

    const staleStop = structuredClone(initial);
    staleStop.state_version += 1;
    staleStop.lifecycle = "STOPPED";
    staleStop.assignment = null;
    staleStop.updated_by = {
      o_run_id: "stop",
      transition_id: "T16",
      idempotence_key: "stop-race"
    };

    const mock = mutationMock(initial);
    await saveStateCAS(
      mock.github,
      42,
      acquired.state,
      schema,
      comment(initial),
      initial.state_version,
      initial.claim_control.claim_version
    );

    await assert.rejects(
      saveStateCAS(
        mock.github,
        42,
        staleStop,
        schema,
        comment(initial),
        initial.state_version,
        initial.claim_control.claim_version
      ),
      /CAS_MISMATCH/
    );

    const afterClaim = mock.state();
    let recomputedStop = core.terminalizeClaim({
      state: afterClaim,
      terminalReason: "REVOKED_STOP",
      durableEvidenceRef: "issue-comment:stop"
    }).state;
    recomputedStop.state_version += 1;
    recomputedStop.lifecycle = "STOPPED";
    recomputedStop.assignment = null;
    recomputedStop.updated_by = {
      o_run_id: "stop",
      transition_id: "T16",
      idempotence_key: "stop-race"
    };

    await saveStateCAS(
      mock.github,
      42,
      recomputedStop,
      schema,
      comment(afterClaim),
      afterClaim.state_version,
      afterClaim.claim_control.claim_version
    );

    assert.equal(mock.state().lifecycle, "STOPPED");
    assert.equal(mock.state().claim_control.active_claim, null);
    assert.equal(
      mock.state().claim_control.last_terminal.terminal_reason,
      "REVOKED_STOP"
    );
  }));

test("Stop first makes stale claim acquisition lose CAS", async () =>
  withInstalledStateRuntime(async (saveStateCAS) => {
    const initial = structuredClone(base);
    const acquired = core.acquireClaimCAS({
      state: initial,
      request: claimRequest(initial, "exec-loser"),
      acquiredAt: "2026-09-18T20:00:00Z"
    });
    const stop = structuredClone(initial);
    stop.state_version += 1;
    stop.lifecycle = "STOPPED";
    stop.assignment = null;
    stop.updated_by = {
      o_run_id: "stop-first",
      transition_id: "T16",
      idempotence_key: "stop-first"
    };

    const mock = mutationMock(initial);
    await saveStateCAS(
      mock.github,
      42,
      stop,
      schema,
      comment(initial),
      initial.state_version,
      initial.claim_control.claim_version
    );
    await assert.rejects(
      saveStateCAS(
        mock.github,
        42,
        acquired.state,
        schema,
        comment(initial),
        initial.state_version,
        initial.claim_control.claim_version
      ),
      /CAS_MISMATCH/
    );
    assert.equal(mock.state().lifecycle, "STOPPED");
    assert.equal(mock.state().claim_control.active_claim, null);
  }));

test("heartbeat vs drift cannot overwrite semantic invalidation", async () =>
  withInstalledStateRuntime(async (saveStateCAS) => {
    const initial = structuredClone(base);
    const req = claimRequest(initial, "exec-heartbeat");
    req.lease = {
      mode: "EXPIRING_HEARTBEAT",
      expires_at: "2026-09-18T20:05:00Z",
      heartbeat_sequence: 1,
      lease_token_digest: "sha256:" + "f".repeat(64)
    };
    const acquired = core.acquireClaimCAS({
      state: initial,
      request: req,
      acquiredAt: "2026-09-18T20:00:00Z"
    }).state;

    const renewed = core.renewClaimCAS({
      state: acquired,
      claimId: acquired.claim_control.active_claim.claim_id,
      claimGeneration:
        acquired.claim_control.active_claim.claim_generation,
      executionInstanceId: "exec-heartbeat",
      expectedClaimVersion: acquired.claim_control.claim_version,
      leaseTokenDigest: "sha256:" + "f".repeat(64),
      expiresAt: "2026-09-18T20:10:00Z",
      heartbeatSequence: 2
    });
    assert.equal(renewed.renewed, true);

    let staleDrift = core.terminalizeClaim({
      state: acquired,
      terminalReason: "REVOKED_DRIFT"
    }).state;
    staleDrift.state_version += 1;
    staleDrift.assignment = null;
    staleDrift.updated_by = {
      o_run_id: "drift",
      transition_id: "T04",
      idempotence_key: "drift-race"
    };

    const mock = mutationMock(acquired);
    await saveStateCAS(
      mock.github,
      42,
      renewed.state,
      schema,
      comment(acquired),
      acquired.state_version,
      acquired.claim_control.claim_version
    );
    await assert.rejects(
      saveStateCAS(
        mock.github,
        42,
        staleDrift,
        schema,
        comment(acquired),
        acquired.state_version,
        acquired.claim_control.claim_version
      ),
      /CAS_MISMATCH/
    );

    const afterRenew = mock.state();
    let drift = core.terminalizeClaim({
      state: afterRenew,
      terminalReason: "REVOKED_DRIFT"
    }).state;
    drift.state_version += 1;
    drift.assignment = null;
    drift.updated_by = {
      o_run_id: "drift",
      transition_id: "T04",
      idempotence_key: "drift-race"
    };
    await saveStateCAS(
      mock.github,
      42,
      drift,
      schema,
      comment(afterRenew),
      afterRenew.state_version,
      afterRenew.claim_control.claim_version
    );

    assert.equal(mock.state().claim_control.active_claim, null);
    assert.equal(mock.state().state_version, acquired.state_version + 1);
    assert.equal(
      mock.state().claim_control.last_terminal.terminal_reason,
      "REVOKED_DRIFT"
    );
  }));
