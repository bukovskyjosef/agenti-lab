## Status
READY FOR R

## Waiting ownership
Waiting for: independent Reviewer (R). No Publisher action is authorized.

Implements Issue #14 as one coherent exact publication target for all F1–F8 from completed audit Issue #13.

Baseline: `bukovskyjosef/agenti@f4f826a7c03e2dca6a3ed5eb64d29b1d6512b057`.

### Exact target
Nine complete replacement snapshots under `proposals/issue-14/target/`:

- `AGENTS.md`
- `README.md`
- `docs/principles.md`
- `docs/roles.md`
- `docs/work-item.md`
- `docs/delivery-cycle.md`
- `docs/review.md`
- `docs/automation.md`
- `docs/adoption.md`

### Implemented audit decisions/findings

- F1: durable non-success terminal `Stopped`, Human abandonment authority, guarded deterministic supersession, explicit reopen, no delayed-event revival.
- F2: orchestration owns deterministic Parent Intent/final Done roll-up trigger+guard without acquiring domain authority.
- F3: Integrator owns multi-repo product-level composite binding from pre-approval aggregation onward.
- F4: Asistentka = Human intake/queue/transport; Analyst = analytical work-contract owner; orchestration = sole dispatcher.
- F5: root README summary aligned with adaptive shaping, Parent Intent and state reconstruction.
- F6: objective-progress eligibility for corrective/retry/recovery loops; durable non-convergence escalation reuses `Stopped` when Human abandons.
- F7: provider-neutral pre-dispatch semantic fingerprint suppresses no-op expensive runs before provider invocation.
- F8: roles are authority contexts; exactly one explicitly active role per session/run; no self-switching; compatible sequential consolidation allowed only by explicit reassignment and never across mandatory independence.

### Scope guard

No new role family, arbitrary retry count, planning bureaucracy, second dispatcher, second stale/termination framework or provider-specific implementation.

Reviewer must inspect the exact snapshots and `REVIEW_CHECKLIST.md`, not only this summary. Nothing in this branch publishes to `agenti/main`.