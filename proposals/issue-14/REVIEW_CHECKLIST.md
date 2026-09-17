# Issue #14 — independent review checklist

Review the **exact snapshots** under `proposals/issue-14/target/`, not only PR summary text.

Baseline: `bukovskyjosef/agenti@f4f826a7c03e2dca6a3ed5eb64d29b1d6512b057`.

Verify at least:

1. **F1:** `Blocked` remains recoverable while `Stopped` is durable terminal non-success; intentional abandonment authority, deterministic supersession guard and explicit reopen semantics match Issue #13.
2. **F2:** orchestration has one deterministic Parent Intent/final Done roll-up trigger+guard and does not acquire domain/product authority.
3. **F3:** Integrator owns multi-repo product-level composite binding from pre-approval aggregation onward without owning local evidence or approval authority.
4. **F4:** Asistentka is Human transport only, Analyst exclusively derives/mutates analytical executable work contracts, orchestration is the sole dispatcher.
5. **F5:** root README no longer contradicts adaptive shaping, Parent Intent or state-reconstruction routing.
6. **F6:** another corrective/retry/recovery iteration requires material semantic progress or another objectively valid reason; duplicate findings/requests are reused and persistent non-convergence escalates instead of ping-ponging.
7. **F7:** pre-dispatch semantic fingerprint suppresses no-op expensive runs while preserving write-level CAS/idempotence and required reruns after material input change.
8. **F8:** roles are authority contexts; exactly one role is explicitly active per role-bound session/run; no self-switching; safe sequential consolidation remains allowed; mandatory independence overrides consolidation.
9. No new role family, arbitrary retry count, planning bureaucracy, second dispatcher or competing stale/termination system was introduced.
10. `AGENTS.md`, README summary, canonical docs and adoption/Project Profile requirements are mutually consistent and cold-startable.

Review outcome must be recorded durably as `APPROVED`, `CHANGES_REQUIRED`, or `DECISION_REQUIRED`. No publication to `agenti/main` is authorized by this proposal.