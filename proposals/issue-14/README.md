# Issue #14 — exact corrective publication target

## Baseline

Exact source baseline: `bukovskyjosef/agenti@f4f826a7c03e2dca6a3ed5eb64d29b1d6512b057`.

This proposal implements only the Human decisions and corrective findings F1–F8 from completed audit Issue #13. It does not publish anything to `agenti`.

## Publication contract

A future Publisher may replace only the corresponding `agenti` files represented under `target/` after independent review and explicit publication authorization. All other published files remain unchanged.

Exact target files:

- `AGENTS.md`
- `README.md`
- `docs/principles.md`
- `docs/roles.md`
- `docs/work-item.md`
- `docs/delivery-cycle.md`
- `docs/review.md`
- `docs/automation.md`
- `docs/adoption.md`

`docs/README.md` is intentionally unchanged because its canonical ownership map remains correct.

## Finding coverage

- **F1 — non-success terminal semantics:** adds durable `Stopped`, distinct from recoverable `Blocked`; defines stop authority, evidence/reason requirements, supersession guard, explicit reopen and automation suppression.
- **F2 — Parent Intent / Done roll-up:** orchestration is the canonical mechanical re-evaluator/transition owner when declared completion conditions become satisfied; it may not invent missing domain judgment.
- **F3 — multi-repo composite candidate ownership:** Integrator owns product-level composite-candidate control-plane aggregation/binding from the first point multiple repo-local candidates form one product candidate, including pre-approval.
- **F4 — Asistentka / Analyst / orchestration boundary:** Asistentka transports Human state only; Analyst exclusively derives/mutates analytical work contracts; orchestration is the sole canonical dispatcher.
- **F5 — stale root README:** refreshes the summary flow for adaptive shaping, Parent Intent, state reconstruction, early multi-repo Integrator binding and `Stopped`.
- **F6 — objective progress / non-convergence:** another corrective/retry/recovery iteration requires material semantic progress or another objectively valid reason; duplicate findings/requests are reused; persistent non-convergence escalates durably and may terminate through F1.
- **F7 — pre-dispatch run eligibility:** orchestration suppresses expensive role runs when the relevant semantic state fingerprint has not materially changed since the last applicable completed run; write-level CAS/idempotence remains separately required.
- **F8 — role/function vs logical instance:** roles are authority contexts, not automatic sessions; exactly one role is explicitly active per session; no inference/self-promotion; compatible sequential role reuse is allowed only through explicit reassignment and never across mandatory independence boundaries.

## Scope guard

No new role family, planning layer, complexity score, arbitrary retry count, second dispatcher, second staleness/termination system or provider-specific implementation is introduced. Human authority and independent-review requirements remain unchanged except for the explicitly approved F1/F3/F4/F8 clarifications.

## Review requirement

A different logical Reviewer must review the complete exact target against Issue #14 acceptance criteria and the authoritative Issue #13 decisions before any Publisher action.