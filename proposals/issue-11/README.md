# Issue #11 — exact publication target

This proposal implements the Human-approved decision in lab Issue #11 against published baseline:

`bukovskyjosef/agenti@15ba9db32c9766e625b9a16e7876769453213609`

## Publication contract

A future Publisher may replace only the corresponding files in `agenti` with the snapshots under `target/` after independent review and explicit publication authorization. All other published files remain unchanged.

## Exact target files

- `docs/work-item.md`
- `docs/roles.md`
- `docs/delivery-cycle.md`
- `docs/automation.md`

## Implemented decision

- Human intent is shaped inside normal `Analysis`; no new lifecycle phase, score, mandatory planning gate, Project Profile field or planning database is introduced.
- One bounded executable/reviewable contract stays in the same Issue and can proceed to normal `Ready`.
- Missing Human-owned input uses the existing Human Input Request / Decision mechanism and then the same shaping rule is re-evaluated.
- Decomposition is conditional on delivery/authorization coherence, not technical size or the number of describable sub-outcomes.
- Decomposition only partitions already-authorized scope; it cannot create new product scope.
- When decomposition is required, the original Issue becomes a non-executable `Parent Intent`; executable children independently satisfy normal Definition of Ready.
- Children durably bind to the inherited parent authorization inputs on which they depend without duplicating the parent specification.
- Native GitHub parent/sub-issue relationships are preferred; explicit durable bidirectional parent↔child Issue links are the fallback. Dependency/blocking relationships remain semantically separate.
- Parent authority changes selectively re-evaluate only affected children from the earliest affected point using the existing dependency/Human-input/exact-candidate staleness model.
- In multi-repo mode Parent Intent and authoritative child Issues remain in the control/governance repository; implementation evidence remains repository-local.
- Automated child creation and execution reconstruct authoritative parent+child state and are idempotent/deduplicated.

## Intentionally unchanged

- `AGENTS.md`
- `docs/principles.md`
- `docs/review.md`
- `docs/adoption.md`
- Project Profile fields and event vocabulary

Canonical published terminology uses **Parent Intent**; the alias `Initiative` is intentionally omitted.
