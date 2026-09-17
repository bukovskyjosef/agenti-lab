# Issue #16 — exact P1–P3 publication target

## Fixed baseline

`bukovskyjosef/agenti@96588365468bd86d992aca0dbfca5a31007d4b44`

This proposal is intentionally bound to that immutable baseline. It does not retarget a later `agenti/main`.

## Human-approved package

This exact target implements only the P1–P3 package approved in Issue #16:

- **P1 — product truth / semantic authority hierarchy-map**, including fact-domain-scoped authority, binding/currentness/conflict semantics and implementation fidelity / implementation-ready guard;
- **P2 — declared/design state vs effective state**, with task-relevant effective-state evidence and explicit unverified boundaries;
- **P3 — lossless consolidation / supersession**, preserving or explicitly dispositioning still-authorized obligations before source work can be superseded.

## Exact publication surface

Future publication, if independently reviewed and later Human-authorized, replaces exactly these five files with the complete snapshots under `target/`:

- `docs/principles.md`
- `docs/adoption.md`
- `docs/review.md`
- `docs/work-item.md`
- `docs/delivery-cycle.md`

All other published files remain exactly as in the fixed baseline.

## Scope discipline

This target does **not** add a new role, lifecycle state, event family, backlog/ERP/provenance database, fixed artifact taxonomy, directory tree, local authority header, metadata registry, provider-specific runtime requirement, mandatory master Issue/Epic, or Kvazi-specific structure.

`delivery-cycle.md` changes only where required to keep its existing `SUPERSEDED_OR_OBSOLETE` summary consistent with the new lossless-supersession precondition and to keep Analysis→Ready semantics consistent with implementation fidelity.

Nothing in this branch publishes to `agenti/main`.