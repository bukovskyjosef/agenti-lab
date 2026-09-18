# Issue #31 — Child 6 exclusive work-item claim / CAS concurrency guard

This proposal is the bounded Child 6 implementation authorized by Issue #30 and materialized as Issue #31.

It is an **additive overlay** over the independently approved targets:
- #21 `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- #22 `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- #23 `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`
- #29 `3fa68aca5717e7f966f42dd976bfd11da71c6732`

The historical child targets are not mutated. `assemble-and-validate.mjs` materializes those exact inputs and overlays `target/reference/`.

## What Child 6 adds

- mandatory exclusive active claim for material A/D/R/P runs;
- `claim_version` as a fencing generation separate from semantic `state_version`;
- one authoritative `claim_control` inside the durable GitHub O projection;
- deterministic claim request/grant and material-operation contracts;
- claim-bound role results and execution failures;
- result acceptance that requires the exact current claim id/generation/owner;
- shared per-work-item mutation domain for claim writes, O transitions and fenced material writers;
- Actions `agenti-state-<repo>-<work-item>` job-level fencing without holding the lock during model compute;
- multi-repo App reuse of the same per-work-item SQLite work lease for projection/receiver/failure mutations while GitHub remains authority;
- deterministic material operation identity for query/recovery of ambiguous writes;
- recovery rules for manual-H, platform-run and heartbeat profiles;
- claim terminalization on successful result, Blocked/Failed, T14 reroute, Stop and drift invalidation;
- R independence enforcement before claim grant and again at result acceptance.

## Non-goals

This child does not add a cross-work-item scheduler, resource pool or new lifecycle authority. It does not change #29 cost/capacity routing semantics. Parent/child parallelism remains a coordination concern between distinct work items; each individual executable work item still has at most one active material claim.

See `CLAIM_AND_FENCING.md` for the runtime contract.
