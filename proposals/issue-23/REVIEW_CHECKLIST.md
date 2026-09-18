# Independent R checklist — Issue #23 / Child 3

Review the exact PR head, not the branch name alone.

## Scope and dependency

- [ ] Delta is bounded to `proposals/issue-23/` and does not modify Child #21 core/schemas/transitions.
- [ ] No implementation or dependency on Child #22 is introduced.
- [ ] Runtime consumes the R-approved #21 core/transition table rather than copying or replacing it.

## App privilege and authentication

- [ ] Manifest and runtime enforce O without `Contents: write`.
- [ ] O uses `Actions: write` + `workflow_dispatch` for role starts.
- [ ] P remains a distinct capability identity and its credentials are not loaded by O.
- [ ] Installation tokens are restricted to configured participating repository and requested permissions.
- [ ] Token renewal does not rely on long-lived installation tokens.

## Webhook / operational store

- [ ] `X-Hub-Signature-256` is constant-time HMAC verified.
- [ ] `X-GitHub-Delivery` is the durable dedup key.
- [ ] Webhook is durably enqueued before fast `202` acknowledgement.
- [ ] Queue supports retry/redelivery and work-item lease serialization.
- [ ] SQLite contains operational delivery/retry/in-flight-effect/lease facts only; completed dispatch/run ownership is reconstructable from GitHub durable state and never depends on SQLite.
- [ ] Periodic reconcile makes correctness independent of webhook order/missed callback.

## GitHub authority reconstruction / multi-repo

- [ ] Implementation event maps only to a durable control work item/reverse link.
- [ ] Only configured participating repositories are inspected.
- [ ] Composite membership uses repo-qualified immutable heads and deterministic Child #21 digesting.
- [ ] T19 rebind is decided by the shared core; adapter only projects the resulting dependent invalidation.
- [ ] Restart reconstruction succeeds from control GitHub state + implementation repositories without operational DB authority.

## Dispatch / receiver safety

- [ ] Runner mapping reuses existing `role_runners.*.adapter_id` without extending the #21 schema.
- [ ] `workflow_dispatch` contains the exact assignment envelope.
- [ ] A successful dispatch/run is durably bound to the current assignment through GitHub `workflow_run_id` + `run_receipts`, so SQLite loss cannot redispatch an already claimed assignment.
- [ ] Receiver preflight verifies exact repository/workflow/run ID/run attempt and CAS-claims/confirms that run before provider work; a second run for the same assignment is rejected.
- [ ] SQLite remains only an in-flight optimization and may be lost without changing applicable-run ownership.
- [ ] Receiver preflight fresh-reconstructs authority and rejects stale/out-of-role/wrong-repository assignment before provider work.
- [ ] Core `INVALIDATE` is projected under CAS to the core-provided earliest affected point and converges instead of permanent safe-hold.
- [ ] Recovery assignment, when needed, is derived only from the exact existing Child #21 T01/T04/T08 transition assignment metadata, not webhook/adaptor role inference.

## Packaging / tests

- [ ] Dockerfile + compose + env + manifest rendering + health/readiness form a runnable single-node setup.
- [ ] Tests cover signature verification, delivery dedup, out-of-order queue behavior, lease, reverse mapping, two implementation repositories, T19 composite rebind and O/P privilege separation.
- [ ] F1 regression dispatches a role, destroys the operational DB before result visibility, reconstructs from GitHub, proves no redispatch, confirms the owning receiver run, and rejects a second run before provider work.
- [ ] F2 regressions prove contract drift → ANALYSIS/A, mutable review drift → IN_REVIEW/R, and mutable H release drift → APPROVED release boundary, with the next reconcile no longer repeating INVALIDATE.
- [ ] E2E imports exact Child #21 core; it does not use a test-only transition implementation.
