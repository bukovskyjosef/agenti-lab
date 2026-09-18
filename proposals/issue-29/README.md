# Issue #29 — Child 5 exact implementation target

Status: **READY FOR INDEPENDENT R after durable E handoff**

Authority:
- Parent Intent #20
- Amendment #26
- canonical A report: comment `5729622260`
- Human vocabulary decision `I = Interface`: comment `5729982392`
- independent R approval of amendment contract: comment `5730208048`
- Human live-proof decision: comment `5730366042`

Exact stable dependencies:
- Child #21 / PR #25: `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- Child #22 / PR #27: `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- Child #23 / PR #28: `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`

## Exact target

Child 5 is an additive overlay:

`proposals/issue-29/target/reference/`

The executable assembly proof is:

`proposals/issue-29/assemble-and-validate.mjs`

It byte-materializes the three immutable approved dependency trees above, applies them in Child 1 → Child 2 → Child 3 order, then applies the Child 5 overlay.

## Implemented amendment

### Provider-neutral deterministic routing
- Project Profile runner catalog and ordered role/purpose routing policy;
- capability, billing, cost authority and wait guards;
- provider-neutral capacity and billing-safety evidence;
- exact assignment `execution_route` binding;
- separate `semantic_work_digest` while preserving the stricter existing freshness fingerprint;
- route/attempt-bound assignment identity and stale-result rejection;
- completed-semantic-run suppression independent of later capacity changes.

### Corrected T14 execution retry
T14 remains T14 and never creates role authority.

For a trusted current execution/capacity failure it:
- marks the failed assignment `FAILED_BEFORE_RESULT`;
- increments routing attempt generation exactly once;
- emits a fresh assignment for the **same role/purpose** when an eligible route exists;
- otherwise projects bounded durable capacity wait;
- rejects late results from the failed assignment;
- preserves R must-differ constraints through same/different-provider reroute.

No new lifecycle state exists. Existing `BLOCKED` is reused only when no independent authorized work can proceed.

### Billing safety
Credential availability never creates spend authority.

For `INCLUDED_ALLOWANCE + FORBIDDEN`:
- technical isolation or trusted current `VERIFIED_NO_PAID_SPILLOVER` evidence is required;
- `UNKNOWN`/possible spillover is ineligible;
- OAuth token presence and API-key absence alone are insufficient.

Paid/prepaid candidates require explicit `ALLOWED_WITH_BUDGET` and enforceable hard budget.

### Single-repo Actions profile
- cost-min routed A/D/R selection;
- Claude subscription OAuth adapter pinned by exact commit;
- Codex retained as optional candidate but unreachable by the default strict paid-forbidden policy;
- provider secret only in model job;
- deterministic finalizer/candidate writer remain separate;
- deterministic capacity-failure evidence + O callback;
- fail closed if `ANTHROPIC_API_KEY` is injected into the Claude subscription process;
- current routing wait is reconstructed by O and pre-due wakes are cheap.

### Multi-repo GitHub App profile
- same amended core;
- explicit candidate-specific repository/workflow dispatch;
- exact route included in assignment envelope;
- trusted O-App capacity/billing/failure evidence;
- authenticated current owning-run failure callback;
- T14 handled by O only after fresh reconstruction;
- durable `not_before` suppresses periodic queue wake until due;
- existing receiver-run ownership/CAS and D≠R protections remain intact.

### I = Interface
Canonical authority roles remain exactly `H/A/D/R/P`.

System functions are:
- `I = Interface`
- `O = Orchestrator`

I is presentation/transport only. It is not assignable, never appears in role enums or role-result discriminators and cannot choose transitions/roles.

## Scope guard

This Child 5 does not:
- reopen historical #21;
- rewrite approved #22/#23 histories;
- introduce a provider as normative;
- create automatic spending authority;
- add a lifecycle state;
- make provider diversity a condition for R independence;
- absorb the separate later exclusive-claim/CAS amendment;
- publish anything to `agenti/main`.

See `VALIDATION.md` and `REVIEW_CHECKLIST.md`.
