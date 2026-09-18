# Multi-repo GitHub App O adapter — Child 3

This is the bounded executable adapter from `agenti-lab` Issue #23. It consumes, rather than redefines, the exact R-approved Child #21 core and transition table. In the final integrated package it is expected under `reference/app/multi-repo-o/`; in this lab target the core is loaded from the sibling approved Child #21 target.

## Boundary

The service is only an operational adapter around the shared deterministic O core:

- GitHub remains workflow/product authority;
- SQLite stores only delivery, retry, dedup, effect receipt and lease data;
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
- `POST /assignment/verify` — receiver-side fresh assignment/current-state verification before a role/provider starts.

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

Child #21 intentionally leaves runner adapter selection as a string. Child #23 uses that existing field without extending the shared schema:

```json
{
  "adapter_id": "github-workflow://acme/service-b/agenti-role-r.yml"
}
```

The target repository must be a configured participant. The adapter sends the exact assignment envelope as `assignment_json` through `workflow_dispatch`.

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

The verification endpoint fresh-reads the control issue/state plus implementation repositories, rejects a stale fingerprint/candidate/repository mapping, and refuses the assignment if the shared core now authorizes another transition. The provider output itself never changes O state directly.

## Operational queue and recovery

`deliveries` is keyed by `X-GitHub-Delivery`. A duplicate delivery is accepted once. Workers claim due rows with a lease, use a separate per-work-item lease for serialization, and retry transient failures with bounded backoff. Effect receipts suppress duplicate expensive workflow dispatches.

The periodic reconcile path enumerates managed control work items and enqueues synthetic wakes. Therefore correctness does not depend on webhook order or on receiving every callback.

## Core binding in the lab target

Production loading defaults to the integrated `reference/core/` location. For this lab Child #23 target, tests intentionally import the exact sibling Child #21 implementation. Optional lab overrides `AGENTI_CORE_MODULE` and `AGENTI_TRANSITIONS_PATH` may point to the exact R-approved Child #21 files; they are integration-path overrides, not a second implementation.
