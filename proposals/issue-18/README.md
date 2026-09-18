# Issue #18 — exact publication target

Status: **READY FOR R**

Fixed target baseline: `bukovskyjosef/agenti@99a0f90d3c7a558fc9fea375e20252374b4726a1`.

Authoritative inputs:
- Issue #18 Human-approved direction,
- canonical A report comment `5727352795`,
- independent R re-review approval comment `5727558241`.

This proposal contains one coherent exact publication candidate. A future Publisher may replace **only** the corresponding files in `agenti` with the complete snapshots under `target/`, and only after a new independent R approves the exact PR head and Human explicitly authorizes publication.

## Exact publication surface

1. `AGENTS.md`
2. `README.md`
3. `docs/principles.md`
4. `docs/roles.md`
5. `docs/work-item.md`
6. `docs/delivery-cycle.md`
7. `docs/review.md`
8. `docs/automation.md`
9. `docs/adoption.md`

`docs/README.md` and every other published file remain unchanged.

## Implemented contract

- canonical authority/delivery roles are exactly H/A/D/R/P,
- Asistentka is the Human-interface function and never dispatches,
- O is the single judgment-free dispatcher/control plane,
- author-side validation → D, deterministic checks → control gates, independent behavioral verification → R,
- multi-repo composite reconstruction/binding → O,
- privileged final publication/promotion/deployment → P,
- H release authorization remains distinct from R technical approval and P execution,
- final Done is a mechanical O close-out after configured publication/post-publication evidence,
- Human override changes durable authorized state; it never licenses silent protocol bypass,
- GitHub events only wake O; current-state reconstruction/CAS/fingerprint/idempotence remain authoritative,
- Actions-centric O is proportional for small single-repo; hybrid GitHub App/webhook O + Actions is the full/multi-repo reference profile,
- GitHub Agentic Workflows are optional/current-public-preview runner adapters, not normative O,
- the three platform corrections approved by R are preserved: current `GITHUB_TOKEN` PR exception, current concurrency queue semantics, webhook out-of-order handling.

## Scope guard

No change to `agenti-lab` governance. No new delivery role, second dispatcher, product authority for O, release-approval authority for P, AI-provider mandate, mandatory external infrastructure for small projects, or weakening of P1 semantic authority, implementation fidelity, exact-candidate, Blocked/Stopped, Parent Intent, lossless supersession, earliest-affected-point, dedup/idempotence or independent review.

Nothing here publishes to `agenti/main`.
