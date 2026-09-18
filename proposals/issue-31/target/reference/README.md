# Agenti reference — routing, Interface and exclusive execution ownership

This is the additive Child #5 overlay authorized by `agenti-lab#26` and implemented by Issue #29.

It is assembled on the independently approved targets:

- Child #21 core: `7b155f8abd09f84c0065d64063eee3b2c3dce615`;
- Child #22 single-repo profile: `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`;
- Child #23 multi-repo profile: `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`.

## Canonical authority vocabulary

Authority roles remain exactly:

`H / A / D / R / P`

System functions are:

- `I = Interface` — Human↔system presentation/transport boundary;
- `O = Orchestrator` — deterministic control plane.

`I` is **not** an assignable role, never appears in assignment/role-result role enums, never selects the next role and never gains workflow authority. It presents current Human requests/decisions and transports configured Human input to O.

## Provider-neutral routing

Routing is an O-owned deterministic selection step after a role is already authorized by T01–T19. It never creates role authority.

A routed Project Profile declares:

- a runner catalog;
- role/purpose routing policies;
- ordered candidates;
- billing class;
- paid-execution authority;
- wait policy;
- capacity observation mechanism.

Assignments may additionally bind:

- `semantic_work_digest`;
- exact `execution_route`.

The existing freshness fingerprint remains state/version/route bound for stale-result rejection. `semantic_work_digest` is separate and excludes routing/capacity bookkeeping so retry/fallback cannot masquerade as semantic progress.

## Cost safety

The default cost-min profile prefers subscription/included allowance.

For any `INCLUDED_ALLOWANCE` route, unattended execution is eligible only when either:

1. paid spillover is technically impossible, or
2. trusted current billing-safety evidence is `VERIFIED_NO_PAID_SPILLOVER`.

`INCLUDED_ALLOWANCE` cannot declare incremental paid usage. A policy change to `ALLOWED_WITH_BUDGET` does not convert the included route into paid authority or bypass its no-spillover gate. Paid overflow must be a separate PREPAID/METERED candidate.

OAuth token presence and API-key absence are never treated as spend-safety proof.

Any `ALLOWED_WITH_BUDGET` policy requires an explicit budget/enforcement declaration. Metered/prepaid candidates additionally require a candidate hard-limit mechanism.

## Capacity and T14

Capacity evidence is provider-neutral:

`AVAILABLE | TEMPORARILY_EXHAUSTED | RATE_LIMITED | UNAVAILABLE | UNKNOWN`.

A current routed execution failure may trigger existing T14 only when deterministic wrapper evidence binds the failed current assignment/execution/semantic work. Accepted routing-recoverable `UNAVAILABLE` evidence is included in this path rather than being stranded outside T14.

T14 then:

- marks the failed assignment failed-before-result;
- increments routing generation exactly once;
- emits a replacement assignment for the same authorized role/purpose when another eligible route exists; or
- projects durable bounded wait and relies on reconcile at/after `not_before`.

Late results from the failed assignment remain stale and are rejected. No new lifecycle state is introduced; `BLOCKED` is reused only when no independent authorized work can proceed.

A routing wait is bounded. At the configured `max_wait_deadline`, the supported `on_max_wait: HUMAN` behavior uses existing T15 + generic Human-resolution semantics and clears the wait so polling cannot continue indefinitely.

## Profiles

- `profiles/single-repo-actions/` — Actions-centric starter with routed A/D/R execution, deterministic P and GitHub-native I.
- `app/multi-repo-o/` — GitHub App O adapter using the same amended core, routed dispatch, trusted failure callback and due-at reconcile.
- `adapters/claude-code-action/` — optional Claude subscription OAuth adapter with fail-closed billing safety.
- `adapters/codex-action/` — retained optional Codex adapter.

No provider is normative.


## Exclusive execution ownership — Child #6

An explicit A/D/R/P assignment is necessary but not sufficient for material execution.

Child #6 adds:
- one bounded authoritative `claim_control` in the GitHub O projection;
- separate monotonic `claim_version`;
- exactly one active material role claim per executable work item;
- one shared per-work-item mutation/fencing domain;
- claim-bound results and routing failures;
- deterministic material-operation identity and ambiguous-write recovery;
- Actions PLATFORM_RUN recovery, exact Human recovery for NONE claims and optional heartbeat semantics;
- multi-repo PREPARED/RESOLVE fencing for remote material writers.

No new authority role or lifecycle state is introduced. H/A/D/R/P remain authority roles; I/O remain system functions.

See:
- `CLAIM_AND_FENCING.md`;
- `docs/principles.md`;
- `docs/roles.md`;
- `docs/delivery-cycle.md`;
- `docs/automation.md`;
- `docs/adoption.md`;
- `docs/work-item.md`.
