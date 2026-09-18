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
- [ ] SQLite contains operational delivery/retry/effect/lease facts only, never product/workflow authority.
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
- [ ] Duplicate dispatch effect is suppressed.
- [ ] Receiver preflight fresh-reconstructs authority and rejects stale/out-of-role/wrong-repository assignment before provider work.

## Packaging / tests

- [ ] Dockerfile + compose + env + manifest rendering + health/readiness form a runnable single-node setup.
- [ ] Tests cover signature verification, delivery dedup, out-of-order queue behavior, lease, reverse mapping, dispatch dedup, two implementation repositories, T19 composite rebind, operational-store-loss restart reconstruction, O/P privilege separation.
- [ ] E2E imports exact Child #21 core; it does not use a test-only transition implementation.
