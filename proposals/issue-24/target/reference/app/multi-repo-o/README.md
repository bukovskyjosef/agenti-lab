# Multi-repo GitHub App O adapter — Child 3

> **Release status: EXPERIMENTAL / UNVERIFIED.** This implementation is retained in the current publication candidate, but it is **not release-supported** and this release makes **no claim of successful live GitHub App/webhook E2E conformance**. Deterministic/local regression coverage remains valuable, but adopters must not treat it as a live deployment proof. The release-supported directly-adoptable profile is `reference/profiles/single-repo-actions/`.

This is the bounded executable adapter from `agenti-lab` Issue #23. It consumes, rather than redefines, the exact R-approved Child #21 core and transition table. In the final integrated package it is expected under `reference/app/multi-repo-o/`; in this lab target the core is loaded from the sibling approved Child #21 target.

## Boundary

The service is only an operational adapter around the shared deterministic O core:

- GitHub remains workflow/product authority;
- SQLite stores only delivery, retry, in-flight effect/cache and lease data; it is never the authoritative receipt for an applicable role run;
- every authoritative O decision comes from a fresh GitHub reconstruction followed by `core.evaluate(...)`;
- the adapter never defines a second transition table;
- webhook payloads only wake/reconcile O and are not transition authority;
- the O GitHub App must have `Contents: read`, never publication-capable `Contents: write`;
- role starts use `workflow_dispatch` with `Actions: write`;
- P remains a separately privileged identity/workflow.

## Runtime

Node.js 22.13+ is required because the reference operational store uses built-in `node:sqlite`.

```bash
cp example.env .env
cp config/project-profile.example.json config/project-profile.json
npm test
npm run render-manifest > github-app-manifest.json
npm start
```

The service exposes:

- `POST /webhook` — signature-verified GitHub webhook intake; durable enqueue precedes `202`;
- `GET /healthz` — process liveness;
- `GET /readyz` — configuration/store readiness;
- `POST /assignment/verify` — receiver-side fresh assignment/current-state verification and authoritative claim acquisition before provider work;
- `POST /material/prepare` — claim-bound durable PREPARED material-operation fence before an authoritative sink write;
- `POST /material/resolve` — idempotent APPLIED / NOT_APPLIED / HUMAN_ACTION_REQUIRED resolution for that exact operation;
- `POST /execution/failure` — authenticated deterministic capacity/rate-limit failure callback bound to the current routed assignment/owning workflow run.

`compose.yml` is a single-node example with a persistent `/data` SQLite volume. In the lab it builds from the repository root so the container copies the exact R-approved Child #21 core; final integration in Child #24 may collapse that path to the published sibling `reference/core/` layout. The service can be restarted or its operational database can be lost without losing workflow authority; reconcile reconstructs from GitHub.

## GitHub App setup

1. Set `AGENTI_PUBLIC_BASE_URL` and `AGENTI_WEBHOOK_SECRET`.
2. Run `npm run render-manifest` and use the rendered manifest to create the GitHub App.
3. Store the App ID and private key as `AGENTI_APP_ID` and `AGENTI_PRIVATE_KEY_PATH`.
4. Install the App only in the configured control and implementation repositories.
5. Set `AGENTI_INSTALLATIONS_JSON` to the repository → installation-id map. Token acquisition is repository-scoped even when one installation spans several repositories.
6. Set `AGENTI_TRUSTED_RESULT_ACTOR_IDS` to the immutable numeric GitHub actor IDs used by deterministic role-result wrappers.
7. Keep P credentials outside this service. The manifest intentionally lacks `Contents: write`.
8. State projection comments are trusted only when GitHub reports `performed_via_github_app.id` equal to this configured O App ID; a user-authored marker is never workflow authority.

Subscribed events are limited to wake/reconcile inputs used by the adapter: `issues`, `issue_comment`, `pull_request`, `pull_request_review`, `check_run`, `workflow_run`, and `deployment_status`.

## Cross-repository binding

Each participating implementation PR must contain a durable reverse link in its body:

```text
<!-- agenti-control: acme/control#42 -->
```

The adapter scans only repositories listed in `implementation_repositories`, reconstructs the repo-qualified immutable candidate membership, sorts it deterministically, and computes the digest with the shared Child #21 `candidateDigest(...)` helper. A membership/head change is fed back to the same core as the T19 composite-rebind condition. The adapter then invalidates only dependent R/release/P projections required by that core transition.

## Role dispatch contract

Child #5 adds provider-neutral `execution_route` selection after T01–T19 has already authorized a role. Routed assignments use the selected candidate's explicit GitHub workflow dispatch target; legacy profiles still fall back to the Child #23 `role_runners` adapter string:

```json
{
  "adapter_id": "github-workflow://acme/service-b/agenti-role-r.yml"
}
```

The target repository must be a configured participant. Routed candidate dispatch repositories are doctor/config validated against the installed App repositories. The adapter sends the exact route-bound assignment envelope as `assignment_json` through `workflow_dispatch`.

A receiving workflow MUST verify the assignment before provider work. A minimal deterministic preflight is:

```yaml
on:
  workflow_dispatch:
    inputs:
      assignment_json:
        required: true
        type: string

jobs:
  role:
    concurrency:
      group: agenti-${{ fromJSON(inputs.assignment_json).assignment_id }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - name: Verify current assignment
        env:
          AGENTI_ASSIGNMENT_JSON: ${{ inputs.assignment_json }}
          AGENTI_O_VERIFY_URL: ${{ secrets.AGENTI_O_VERIFY_URL }}
          AGENTI_RECEIVER_VERIFY_SECRET: ${{ secrets.AGENTI_RECEIVER_VERIFY_SECRET }}
        run: node path/to/multi-repo-o/bin/verify-assignment.mjs
      - name: Run configured role adapter
        run: ./your-provider-wrapper
```

A normalized GitHub Actions result is accepted only from a configured trusted wrapper actor and only when its `run_id`/`run_attempt` resolve to the configured runner repository. Its execution instance ID must be `github-actions:<repository>:<run_id>:<run_attempt>`; self-reported logical IDs are rejected.

Before dispatch, O derives a role-specific immutable claim target and embeds its `target_binding` + `target_digest` in the assignment envelope. For an initial D assignment this includes the implementation repository default branch and its exact current SHA. The receiver verification endpoint fresh-reads the control issue/state and re-derives that target before claim acquisition; target drift yields no provider-work authority. It repeats the target check immediately after claim grant before returning success.

The preflight also sends `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`; O verifies that run against the configured workflow/repository and CAS-binds the owning run plus exact target digest into the current GitHub claim before provider work. A different run or stale target for the same assignment is rejected. The provider output itself never changes O state directly.

## Operational queue and recovery

`deliveries` is keyed by `X-GitHub-Delivery`. A duplicate delivery is accepted once. Workers claim due rows with expiring SQLite leases and retry transient failures with bounded backoff. Those leases are operational scheduling aids only. Authoritative projection mutation is serialized by the non-expiring work-item fence owned by the shared single-instance orchestrator. SQLite `effects` suppress only concurrent/in-flight duplicate dispatch attempts; a completed SQLite effect is not workflow authority.

For an explicit role assignment, O requests workflow-run details from `workflow_dispatch` and CAS-binds the returned run ID into `workflow-state.assignment.workflow_run_id`, with a matching execution identity in `run_receipts`. Reconcile first consults this GitHub projection, so total SQLite loss cannot cause another dispatch for an already claimed current assignment.

Receiver claim acquisition is executable, not documentary. The bundled single-instance reference uses one non-expiring in-process FIFO work-item fence keyed only by the authoritative control work item across ordinary O processing, receiver claim acquisition, recovery/failure handling and material-operation prepare/resolve. GitHub `claim_control` remains the durable ownership authority. The SQLite `work_leases` and delivery/effect tables are operational queue/retry aids only; their expiry is never the linearization primitive.

Because the authoritative mutation fence is process-local, the bundled reference is conforming only for `AGENTI_INSTANCE_COUNT=1`. A declared multi-instance deployment with this domain is rejected. A production multi-instance deployment must replace the process fence with one genuinely shared linearizable/fenced backend while preserving the same control-work-item key. Recreating an empty SQLite database does not make an already claimed GitHub work item free.

When the shared core returns `INVALIDATE`, the adapter no longer safe-holds unchanged state. It consumes only the core-provided reason and `earliest_affected_point`, projects the dependent state under the same state-comment CAS, and uses the exact existing T01/T04/T08 assignment metadata from the Child #21 transition table when an assignment is required. Contract drift therefore converges to ANALYSIS/A, review evidence drift to IN_REVIEW/R, and release evidence drift to the APPROVED release boundary rather than repeating INVALIDATE forever.

The periodic reconcile path enumerates managed control work items and enqueues synthetic wakes. For a durable capacity wait it first reconstructs `execution_routing.wait.not_before`; before due it does not enqueue the wake, and at/after due it returns to the same amended core for deterministic reselection. Therefore correctness does not depend on webhook order or on receiving every callback, while operational polling does not create repeated provider work.

## Core binding in the lab target

Production loading defaults to the integrated `reference/core/` location. For this lab Child #23 target, tests intentionally import the exact sibling Child #21 implementation. Optional lab overrides `AGENTI_CORE_MODULE` and `AGENTI_TRANSITIONS_PATH` may point to the exact R-approved Child #21 files; they are integration-path overrides, not a second implementation.


## Cost/capacity routing amendment

The multi-repo App uses the same Child #5 provider-neutral routing contract as the single-repo profile.

- route selection happens only after the core has authorized A/D/R/P;
- strict included-allowance routes require current no-paid-spillover evidence;
- trusted routing evidence is accepted only from this configured O GitHub App;
- receiver/provider failure prose is not authority;
- an authenticated failure callback is accepted only from the current assignment's owning workflow run;
- the App writes provider-neutral execution-failure/capacity evidence into the control Issue and then invokes the same core T14;
- T14 either emits a replacement assignment for the same role/purpose or durable bounded wait.

The control Issue is also the reference **I = Interface** durable Human surface. I remains presentation/transport only; authority roles remain H/A/D/R/P.


## Material-write fence

A successful `/assignment/verify` is necessary but not sufficient for a durable A/D/R/P sink write.

Before one authoritative sink operation, the runner must call `/material/prepare` with the exact assignment, claim ID/generation, operation kind and immutable target binding. O acquires the same control-work-item mutation domain, reconstructs GitHub authority, re-verifies the owning workflow execution and writes one bounded `material_operation: PREPARED` intent to the authoritative projection.

Only after that response may the deterministic writer perform the sink. While PREPARED is unresolved, O safe-holds semantic Stop/drift/T-transition processing behind that already-linearized operation. The runner then calls `/material/resolve` as `APPLIED`, `NOT_APPLIED` or `HUMAN_ACTION_REQUIRED` with durable evidence. Duplicate resolve calls are idempotent by `material_operation_id`.

This PREPARED intent is what closes the remote precheck→revoke→write gap without giving O publication credentials. Provider/model computation still runs outside the mutation domain. P/D credentials remain in the role-scoped writer.

The bundled helper is:

```bash
node bin/material-operation.mjs prepare
node bin/material-operation.mjs resolve
```

It reads JSON from stdin (or `AGENTI_MATERIAL_OPERATION_JSON`) and uses the same verified workflow-run headers as `bin/verify-assignment.mjs`.
