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

A deployment that cannot provide one linearizable shared work-item mutation domain must fail doctor/conformance rather than silently run multi-instance with local-only locks. The bundled SQLite reference is explicitly single-instance; declared multi-instance use is rejected.

## Material-write fence

Before an A/D/R/P sink operation, the deterministic writer validates:
- exact current assignment;
- exact current claim id + generation;
- trusted execution instance ownership;
- current candidate/target binding as applicable.

D candidate writes and P publication derive deterministic `material_operation_id` values from work item + claim + assignment + operation + target.

For the single-repo Actions profile the writer job itself holds the shared `agenti-state-...` fence across the sink call.

For remote multi-repo writers, `/material/prepare` first writes one exact claim-bound `PREPARED` operation into the authoritative control projection under the shared work-item mutex. O safe-holds conflicting semantic mutations until `/material/resolve` records APPLIED / NOT_APPLIED / HUMAN_ACTION_REQUIRED. The PREPARED intent therefore fixes the legal ordering before the remote sink begins without giving O role/P credentials.

A pre-write GET without the shared/native fence or PREPARED operation intent is not sufficient.

## Recovery

- `MANUAL_H`: no automatic expiry; configured Human must durably authorize the exact claim, e.g. `/agenti claim recover <claim-id>` plus reason.
- `PLATFORM_RUN`: automatic recovery only after trusted platform run is terminal non-success, no accepted result exists, the claim is still current and no unresolved material operation exists. Role jobs are bounded by timeout.
- `EXPIRING_HEARTBEAT`: renewal requires exact claim id/generation/version/holder/token/sequence; expiry terminalizes the claim and never implies success.

Projection POST/PATCH ambiguity is resolved by durable reread under the same mutation fence. If the intended projection is already present, the operation succeeds idempotently; if the old projection is unchanged, at most one safe retry is attempted; a conflicting later projection is never overwritten.

Stopped work never auto-resumes.
