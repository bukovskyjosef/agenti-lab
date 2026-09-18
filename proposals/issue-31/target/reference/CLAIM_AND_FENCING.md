# Exclusive claim and material-write fencing contract

## Authority

The durable GitHub workflow-state projection is the sole claim authority. Operational locks, Actions concurrency groups and SQLite leases serialize mutations but do not themselves grant semantic authority.

`workflow_state.claim_control` contains:
- `claim_version` — monotonic fencing/CAS version, separate from semantic `state_version`;
- `active_claim` — at most one current A/D/R/P material run;
- `last_terminal` — bounded recovery/audit pointer for the last terminalized claim.

Claim bookkeeping must not alter semantic fingerprint or `semantic_work_digest`.

## Claim lifecycle

A run may invoke a provider only after a successful claim grant bound to:
- current assignment id, role and purpose;
- current semantic state version/freshness fingerprint;
- semantic work digest and current candidate/target binding where applicable;
- one trusted execution instance;
- the current `claim_version`.

A second contender must lose through the same per-work-item mutation domain. R independence is checked before grant.

Claims are terminalized through the same mutation domain on:
- accepted role result;
- Blocked/Failed result;
- T14 routing failure/reroute;
- Stop;
- drift/invalidation;
- reassignment/recovery.

T14 preserves #29 semantics: routing generation changes exactly once; semantic work digest stays stable; the failed claim becomes terminal before replacement assignment or wait.

## Actions profile

Every authoritative mutation job uses the same group:

`agenti-state-${{ github.repository_id }}-${{ inputs.issue_number }}`

This includes O, claim acquisition, result finalization, D candidate writer, P publisher and routed capacity-failure writers.

Provider/model compute deliberately runs outside this state fence. Global reconcile performs only issue-specific dispatches; it does not mutate multiple work-item projections while holding a global lock.

## Multi-repo App profile

The control repository owns exactly one claim projection for the logical work item. Implementation repositories do not create independent claims.

The App's SQLite `work_leases` table is an operational single-node/shared-database mutation mutex. O processing, receiver claim binding and execution-failure/T14 writes use the same `workItemKey` domain. GitHub `claim_control` remains reconstructable authority after operational DB loss.

A deployment that cannot provide one linearizable shared work-item mutation domain must fail doctor/conformance rather than silently run multi-instance with local-only locks.

## Material-write fence

Before an A/D/R/P sink operation, the deterministic writer validates:
- exact current assignment;
- exact current claim id + generation;
- trusted execution instance ownership;
- current candidate/target binding as applicable.

D candidate writes and P publication derive deterministic `material_operation_id` values from work item + claim + assignment + operation + target. Sink-specific native idempotence/query semantics remain required for ambiguous outcomes.

A pre-write GET without holding the shared fence is not sufficient.

## Recovery

- `MANUAL_H`: no automatic expiry; Human must authorize exact-claim recovery.
- `PLATFORM_RUN`: automatic recovery only after trusted platform run is terminal non-success, no accepted result exists and the claim is still current.
- `EXPIRING_HEARTBEAT`: renewal requires exact claim id/generation/version/holder/token/sequence; expiry terminalizes the claim and never implies success.

Stopped work never auto-resumes.
