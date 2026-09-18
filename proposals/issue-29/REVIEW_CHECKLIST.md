# Issue #29 — independent R checklist

Bind the review to the exact PR head. Any head change invalidates the review.

## Dependency / scope
- [ ] exact approved #21/#22/#23 heads match Issue #29;
- [ ] `assemble-and-validate.mjs` truly materializes those immutable trees;
- [ ] final PR delta outside the temporary validation workflow is only `proposals/issue-29/**`;
- [ ] no unrelated exclusive-claim/CAS amendment was absorbed;
- [ ] no publication occurred.

## Authority / routing
- [ ] T01–T19 remain the role/lifecycle authority;
- [ ] routing happens only after a role/purpose is already authorized;
- [ ] no provider is normative;
- [ ] ordered selection is deterministic and policy/profile bound;
- [ ] capability mismatch is rejected;
- [ ] route choice is bound into the assignment and role-result acceptance;
- [ ] provider output cannot create trusted route/capacity/billing facts.

## Dual identity
- [ ] original freshness fingerprint remains state/version bound for stale safety;
- [ ] `semantic_work_digest` excludes capacity/routing bookkeeping;
- [ ] route/fallback changes assignment freshness/identity while preserving unchanged semantic work;
- [ ] completed semantic work suppresses later duplicate capacity-triggered execution.

## Billing
- [ ] credential presence does not grant spend authority;
- [ ] strict `INCLUDED_ALLOWANCE + FORBIDDEN` fails closed on unknown/possible paid spillover;
- [ ] OAuth/API-key absence alone is not treated as hard no-spend proof;
- [ ] Claude workflow references only OAuth credential and explicitly fails on injected `ANTHROPIC_API_KEY`;
- [ ] metered/prepaid route requires explicit budget authority + enforceable hard cap;
- [ ] default Codex candidate is retained but unreachable as implicit paid fallback;
- [ ] P remains deterministic/non-billed in the reference profile.

## Capacity / wait / T14
- [ ] capacity observation taxonomy and evidence digest/freshness are provider-neutral;
- [ ] no new lifecycle state was added;
- [ ] pre-dispatch all-exhausted case creates bounded routing wait and no provider invocation;
- [ ] pre-due reconcile is cheap/suppressed;
- [ ] due reconcile fresh-reads and reselects;
- [ ] current execution failure is wrapper/O evidence, not provider prose authority;
- [ ] T14 keeps the same role/purpose authority;
- [ ] failed assignment is marked failed-before-result;
- [ ] routing generation increments once;
- [ ] eligible fallback emits a new exact assignment;
- [ ] no eligible fallback writes durable wait;
- [ ] late result from failed assignment is rejected;
- [ ] contract/candidate/gate/H drift while waiting wins at the normal earliest affected point.

## R independence
- [ ] same-provider D/R is allowed only with distinct trusted execution instance;
- [ ] T14 reroute preserves all D-author must-differ exclusions;
- [ ] provider diversity is not used as a substitute for execution independence.

## Single-repo
- [ ] selected candidate determines the workflow;
- [ ] provider secret exists only in provider job;
- [ ] deterministic finalizer/candidate writer remains secret-free;
- [ ] routing evidence comments require trusted Actions-bot provenance;
- [ ] strict profile is blocked without valid billing-safety evidence;
- [ ] local routed E2E reaches Done with explicit trusted test evidence.

## Multi-repo
- [ ] selected candidate has explicit configured participant repo/workflow;
- [ ] O App remains Contents-read / Actions-write; P remains separate;
- [ ] exact routed assignment is verified by receiver;
- [ ] current owning workflow run is required for failure callback;
- [ ] O App writes trusted routing evidence then re-enters the same amended core;
- [ ] due-at scheduling uses GitHub state authority, not SQLite authority;
- [ ] existing #23 receiver-claim/dedup/CAS behavior remains green.

## I = Interface
- [ ] canonical authority roles remain exactly H/A/D/R/P;
- [ ] I is presentation/transport only;
- [ ] I never enters assignment/result role enums;
- [ ] I never selects role/transition or creates authority;
- [ ] assembled reference uses I as canonical system-function vocabulary.

## Validation
- [ ] reproduce `node proposals/issue-29/assemble-and-validate.mjs --docker`;
- [ ] verify all reported test counts/doctor/Docker outcomes;
- [ ] distinguish executed mechanical proof from #24/pre-publication external live-provider gates.

R must return exactly one outcome:
`APPROVED`, `CHANGES_REQUIRED`, or `DECISION_REQUIRED`.
