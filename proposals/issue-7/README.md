# Issue #7 — Human-input interrupt/resume exact target

This proposal implements Issue #7 from the completed Analyst contract in Issue #6.

## Baselines and composition

- Published baseline: `bukovskyjosef/agenti@789459cedc9cf708210d7fca717a4b0e9658e323`.
- Repository-topology proposal: Issue #5 / PR #9, branch `issue-5/repository-topology-target`.
- This branch is intentionally stacked on the Issue #5 branch so the Human-input contract is reviewed in the already-authorized `single-repo` + optional `one control/governance repository + N implementation repositories` model.
- `proposals/issue-7/target/` is the exact combined publication target for the files changed by Issue #7. It already includes the relevant Issue #5 topology wording where those files overlap.
- A Publisher must not publish this target until Issue #5 topology semantics and this Issue #7 change have each received the required independent review. If the Issue #5 exact target changes before publication, this proposal must be re-composed and re-reviewed where affected.

## Minimal contract implemented

- Any role may request Human input only when its next required action cannot be performed safely from current durable state and existing role authority.
- Generic Human Input Request types are `CLARIFICATION`, `DECISION`, and `HUMAN_ACTION`; configured release authorization keeps its existing specialized exact-candidate contract.
- Generic request status is `PENDING | RESOLVED | STALE`.
- The request and Human response live durably with the authoritative work item; multi-repo implementation evidence links back to that control-repository work item.
- A pending request guards only the affected transition. Existing `Blocked` remains the main lifecycle state when no authorized next step remains.
- `HUMAN_INPUT_RESOLVED` means state may permit progress. Resume always reconstructs current durable state, validates request identity/binding and restarts from the earliest affected point; hidden-session continuation is never required.
- Prior analysis/review/check/approval remains valid only while its dependent inputs and assumptions remain valid. Release authorization keeps its stricter existing `STALE` semantics.
- Duplicate, delayed and concurrent automation is guarded by Request ID, request status, context binding, candidate identities and required gate validity.
- Human remains the authority/input source, not the routine message bus.

## Exact target files

- `AGENTS.md`
- `docs/principles.md`
- `docs/work-item.md`
- `docs/delivery-cycle.md`
- `docs/roles.md`
- `docs/automation.md`
- `docs/review.md`
- `docs/adoption.md`

## Intentionally unchanged

- `README.md`
- `docs/README.md`

No new lifecycle phase, generic approval gate, second Human backlog, role-specific Human-input workflow or competing staleness framework is introduced.