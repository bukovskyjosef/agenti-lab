import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(here, "..", "..");
const cli = join(referenceRoot, "cli", "agenti.mjs");

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(
      "command failed: node " + args.join(" ") + "\nstdout:\n" +
      result.stdout + "\nstderr:\n" + result.stderr
    );
  }
  return result;
}

function response(payload, status = 200) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function makeMockGitHub() {
  const store = {
    issue: {
      number: 42,
      title: "E2E intent",
      body: [
        "## Goal", "", "Deliver deterministic E2E fixture.", "",
        "## Scope", "", "Single fixture file.", "",
        "## Acceptance criteria", "", "Workflow reaches Done.", "",
        "## Context", "", "agenti-e2e-scenario: happy", ""
      ].join("\n"),
      labels: [{ name: "agenti:managed" }],
      updated_at: "2026-09-18T11:00:00Z",
      user: { id: 1001, login: "human", type: "User" }
    },
    comments: [],
    nextCommentId: 100,
    dispatches: [],
    pull: {
      number: 7,
      head: { sha: "a".repeat(40), ref: "agenti/issue-42" },
      base: { sha: "b".repeat(40), ref: "main" },
      state: "open"
    }
  };

  function addComment(body, user = { id: 999, login: "github-actions[bot]", type: "Bot" }) {
    const comment = {
      id: store.nextCommentId++,
      body,
      user,
      created_at: "2026-09-18T11:00:00Z",
      updated_at: "2026-09-18T11:00:00Z"
    };
    store.comments.push(comment);
    return comment;
  }

  async function fetchMock(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const body = init.body ? JSON.parse(init.body) : null;

    if (path === "/repos/example/product/issues/42" && method === "GET") {
      return response(store.issue);
    }
    if (path === "/repos/example/product/issues/42" && method === "PATCH") {
      Object.assign(store.issue, body);
      store.issue.updated_at = "2026-09-18T11:01:00Z";
      return response(store.issue);
    }
    if (path === "/repos/example/product/issues/42/comments" && method === "GET") {
      return response(store.comments);
    }
    if (path === "/repos/example/product/issues/42/comments" && method === "POST") {
      return response(addComment(body.body), 201);
    }
    if (/^\/repos\/example\/product\/issues\/comments\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      const comment = store.comments.find((item) => item.id === id);
      if (!comment) return response({ message: "Not Found" }, 404);
      if (method === "GET") return response(comment);
      if (method === "PATCH") {
        comment.body = body.body;
        comment.updated_at = "2026-09-18T11:02:00Z";
        return response(comment);
      }
    }
    if (path === "/repos/example/product/issues/42/labels" && method === "POST") {
      const current = new Set(store.issue.labels.map((label) => label.name));
      for (const label of body.labels ?? []) current.add(label);
      store.issue.labels = [...current].map((name) => ({ name }));
      return response(store.issue.labels);
    }
    if (path.startsWith("/repos/example/product/issues/42/labels/") && method === "DELETE") {
      const label = decodeURIComponent(path.split("/").at(-1));
      store.issue.labels = store.issue.labels.filter((item) => item.name !== label);
      return response(null, 204);
    }
    if (path.startsWith("/repos/example/product/actions/workflows/") && path.endsWith("/dispatches") && method === "POST") {
      store.dispatches.push({
        workflow: decodeURIComponent(path.split("/").at(-2)),
        body
      });
      return response(null, 204);
    }
    if (path === "/repos/example/product/pulls/7" && method === "GET") {
      return response(store.pull);
    }
    if (/^\/repos\/example\/product\/commits\/[a-f0-9]+\/check-runs$/.test(path) && method === "GET") {
      return response({ total_count: 0, check_runs: [] });
    }
    if (path.startsWith("/repos/example/product/issues?") && method === "GET") {
      return response([store.issue]);
    }

    return response({ message: "Unhandled mock endpoint", method, path }, 404);
  }

  return { store, addComment, fetchMock };
}

test("local fixture E2E reaches Done through O/A/D/R/H/P without role relay", async () => {
  const temp = await mkdtemp(join(tmpdir(), "agenti-child22-"));
  const project = join(temp, "project");
  const previousCwd = process.cwd();
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_DEFAULT_BRANCH: process.env.GITHUB_DEFAULT_BRANCH,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
    GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT,
    GITHUB_JOB: process.env.GITHUB_JOB
  };

  try {
    runNode([
      cli, "install",
      "--target", project,
      "--repository", "example/product",
      "--human-login", "human",
      "--human-actor-id", "1001",
      "--default-branch", "main",
      "--source-version", "child22-local-e2e",
      "--no-github"
    ], { cwd: referenceRoot });

    runNode([
      join(project, ".agenti-runtime", "agenti.mjs"),
      "doctor", "--target", project
    ], { cwd: project });

    process.chdir(project);
    process.env.GITHUB_TOKEN = "test-token";
    process.env.GITHUB_REPOSITORY = "example/product";
    process.env.GITHUB_DEFAULT_BRANCH = "main";
    process.env.GITHUB_RUN_ID = "500";
    process.env.GITHUB_RUN_ATTEMPT = "1";
    process.env.GITHUB_JOB = "local-e2e";

    const mock = makeMockGitHub();
    globalThis.fetch = mock.fetchMock;

    const core = await import(pathToFileURL(join(project, ".agenti-runtime", "core", "index.mjs")).href);
    const stateRuntime = await import(pathToFileURL(join(project, ".agenti-runtime", "runtime", "state.mjs")).href);
    const routingRuntime = await import(pathToFileURL(join(project, ".agenti-runtime", "runtime", "routing-evidence.mjs")).href);
    const runner = await import(pathToFileURL(join(project, ".agenti-runtime", "runtime", "runner.mjs")).href);
    const orchestrator = await import(pathToFileURL(join(project, ".agenti-runtime", "runtime", "orchestrate.mjs")).href);
    const profile = JSON.parse(await readFile(join(project, ".agenti", "project-profile.json"), "utf8"));

    const stateNow = () => {
      const stateComment = mock.store.comments.find((comment) => comment.body.includes("agenti-state:v1"));
      assert.ok(stateComment, "state comment must exist");
      return core.parseStateComment(stateComment.body);
    };

    const attestation = (
      assignment,
      executionId,
      adapter = assignment.execution_route?.adapter_id ?? "codex-action"
    ) => ({
      adapter_id: adapter,
      adapter_version: assignment.execution_route?.adapter_version ?? "1",
      execution_instance_id: executionId,
      platform_run: {
        provider: "github-actions",
        run_id: "500",
        run_attempt: 1,
        job_or_worker_id: "local-e2e"
      },
      provider_session: { mode: "fresh", provider_session_id: null },
      issued_for_assignment: assignment.assignment_id,
      attested_by: "deterministic-wrapper"
    });

    const addNormalized = (normalized) => mock.addComment(
      stateRuntime.renderMachineComment(
        stateRuntime.ROLE_RESULT_MARKER,
        "Local E2E normalized result.",
        normalized
      )
    );

    const billingSource = {
      kind: "ADMIN_POLICY_ATTESTATION",
      trust: "EXTERNAL_CURRENT_EVIDENCE"
    };
    const billingBase = {
      runner_candidate_id: "claude-subscription",
      status: "VERIFIED_NO_PAID_SPILLOVER",
      observed_at: "2026-09-18T18:00:00Z",
      valid_until: "2026-09-19T00:00:00Z",
      source: billingSource
    };
    const billingSafety = {
      ...billingBase,
      evidence_digest: core.digest(billingBase)
    };
    const capacitySource = {
      kind: "ADAPTER_PREFLIGHT",
      trust: "ADAPTER_OBSERVED"
    };
    const capacityBase = {
      runner_candidate_id: "claude-subscription",
      status: "AVAILABLE",
      observed_at: "2026-09-18T18:00:00Z",
      valid_until: "2026-09-19T00:00:00Z",
      retry_at: null,
      retry_after_seconds: null,
      remaining: null,
      source: capacitySource
    };
    const capacity = {
      ...capacityBase,
      evidence_digest: core.digest(capacityBase)
    };
    mock.addComment(
      stateRuntime.renderMachineComment(
        routingRuntime.BILLING_SAFETY_MARKER,
        "Local E2E trusted billing safety.",
        billingSafety
      )
    );
    mock.addComment(
      stateRuntime.renderMachineComment(
        routingRuntime.CAPACITY_MARKER,
        "Local E2E trusted capacity.",
        capacity
      )
    );

    // Intake -> A
    let result = await orchestrator.processIssue(42);
    assert.equal(result.status, "ASSIGNED");
    assert.equal(stateNow().assignment.role, "A");

    // A Ready -> D
    let state = stateNow();
    let assignment = runner.assignmentFromState(state, profile);
    addNormalized(core.normalizeRoleResult({
      proposal: {
        role: "A",
        status: "COMPLETED",
        result_type: "ANALYST",
        evidence_refs: [],
        human_request: null,
        retry_or_failure: null,
        payload: {
          base_contract_digest: state.contract.digest,
          disposition: "READY",
          contract_operations: [],
          decomposition: null,
          blockers: []
        }
      },
      trustedFacts: {
        assignment_id: assignment.assignment_id,
        observed_state_version: assignment.state.version,
        observed_fingerprint: assignment.state.fingerprint,
        execution_attestation: attestation(assignment, "exec-a-local"),
        actual_billing_mode: assignment.execution_route?.billing_mode ?? null,
        candidate: null
      },
      assignment,
      roleResultSchema: JSON.parse(await readFile(join(project, ".agenti-runtime", "schemas", "role-result.schema.json"), "utf8"))
    }));
    result = await orchestrator.processIssue(42);
    assert.equal(result.status, "ASSIGNED");
    assert.equal(stateNow().assignment.role, "D");

    // D trusted candidate -> independent R
    state = stateNow();
    assignment = runner.assignmentFromState(state, profile);
    const member = {
      repository: "example/product",
      pr_number: 7,
      head_sha: mock.store.pull.head.sha,
      base_ref_or_sha: mock.store.pull.base.sha
    };
    const candidate = { kind: "single", generation: 1, members: [member] };
    candidate.digest = core.candidateDigest(candidate);
    addNormalized(core.normalizeRoleResult({
      proposal: {
        role: "D",
        status: "COMPLETED",
        result_type: "DEVELOPER",
        evidence_refs: [],
        human_request: null,
        retry_or_failure: null,
        payload: {
          work_contract_digest: state.contract.digest,
          base: { repository: "example/product", ref_or_sha: "main" },
          requested_branch_key: "agenti/issue-42",
          author_validation: { refs: [], summary: "local E2E" },
          blockers: []
        }
      },
      trustedFacts: {
        assignment_id: assignment.assignment_id,
        observed_state_version: assignment.state.version,
        observed_fingerprint: assignment.state.fingerprint,
        execution_attestation: attestation(assignment, "exec-d-local"),
        actual_billing_mode: assignment.execution_route?.billing_mode ?? null,
        candidate: { ...member, candidate_digest: candidate.digest },
        change_artifact: {
          format: "unified-diff",
          artifact_ref: "local-e2e:patch",
          sha256: core.digest({ patch: "fixture" })
        },
        author_validation_refs: []
      },
      assignment,
      roleResultSchema: JSON.parse(await readFile(join(project, ".agenti-runtime", "schemas", "role-result.schema.json"), "utf8"))
    }));
    result = await orchestrator.processIssue(42);
    assert.equal(result.status, "ASSIGNED");
    assert.equal(stateNow().assignment.role, "R");
    assert.deepEqual(stateNow().assignment.must_differ_from_execution_instances, ["exec-d-local"]);

    // R approved -> exact H release gate
    state = stateNow();
    assignment = runner.assignmentFromState(state, profile);
    addNormalized(core.normalizeRoleResult({
      proposal: {
        role: "R",
        status: "COMPLETED",
        result_type: "REVIEWER",
        evidence_refs: [],
        human_request: null,
        retry_or_failure: null,
        payload: {
          reviewed_candidate_digest: state.candidate.digest,
          reviewed_contract_digest: state.contract.digest,
          outcome: "APPROVED",
          findings: [],
          correction_owner: "NONE"
        }
      },
      trustedFacts: {
        assignment_id: assignment.assignment_id,
        observed_state_version: assignment.state.version,
        observed_fingerprint: assignment.state.fingerprint,
        execution_attestation: attestation(assignment, "exec-r-local"),
        actual_billing_mode: assignment.execution_route?.billing_mode ?? null,
        candidate: null
      },
      assignment,
      roleResultSchema: JSON.parse(await readFile(join(project, ".agenti-runtime", "schemas", "role-result.schema.json"), "utf8"))
    }));
    result = await orchestrator.processIssue(42);
    assert.equal(result.status, "HUMAN_BOUNDARY");
    state = stateNow();
    assert.equal(state.release_authorization.status, "PENDING");

    // Exact configured H grant -> P. This is Human authority, not role relay.
    mock.addComment(
      "/agenti release grant " + state.release_authorization.authorization_id,
      { id: 1001, login: "human", type: "User" }
    );
    result = await orchestrator.processIssue(42);
    assert.equal(result.status, "ASSIGNED");
    assert.equal(stateNow().assignment.role, "P");

    // Deterministic P result -> O mechanical Done.
    state = stateNow();
    assignment = runner.assignmentFromState(state, profile);
    addNormalized(core.normalizeRoleResult({
      proposal: {
        role: "P",
        status: "COMPLETED",
        result_type: "PUBLISHER",
        evidence_refs: [],
        human_request: null,
        retry_or_failure: null,
        payload: {
          consumed_candidate_digest: state.candidate.digest,
          target_digest: state.release_authorization.target_digest,
          publication_status: "SUCCEEDED",
          operations: [{
            operation: "MERGE",
            status: "SUCCEEDED",
            immutable_result_id: "c".repeat(40),
            target: "main"
          }],
          actual_published_identity: {
            repository_or_artifact: "example/product",
            immutable_id: "c".repeat(40)
          },
          deterministic_verification_refs: [{
            evidence_kind: "commit",
            repository: "example/product",
            immutable_id: "c".repeat(40)
          }],
          partial_failure: null
        }
      },
      trustedFacts: {
        assignment_id: assignment.assignment_id,
        observed_state_version: assignment.state.version,
        observed_fingerprint: assignment.state.fingerprint,
        execution_attestation: attestation(assignment, "exec-p-local"),
        actual_billing_mode: assignment.execution_route?.billing_mode ?? null,
        candidate: {
          ...state.candidate.members[0],
          candidate_digest: state.candidate.digest
        }
      },
      assignment,
      roleResultSchema: JSON.parse(await readFile(join(project, ".agenti-runtime", "schemas", "role-result.schema.json"), "utf8"))
    }));
    result = await orchestrator.processIssue(42);
    assert.equal(result.status, "DONE");
    assert.equal(stateNow().lifecycle, "DONE");

    const workflows = mock.store.dispatches.map((item) => item.workflow);
    assert.deepEqual(workflows, [
      "agenti-role-a-claude.yml",
      "agenti-role-d-claude.yml",
      "agenti-role-r-claude.yml",
      "agenti-publish.yml"
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temp, { recursive: true, force: true });
  }
});
