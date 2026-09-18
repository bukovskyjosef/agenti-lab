# Claude subscription OAuth adapter

Concrete optional A/D/R adapter for the provider-neutral Child #5 routing contract.

Pinned action:

`anthropics/claude-code-action@a4f54ef2c58884867281bd8e2f8d63352ad019a9`

Authentication uses only `CLAUDE_CODE_OAUTH_TOKEN`. The reference workflows do not reference `ANTHROPIC_API_KEY`.

## Billing safety

OAuth/subscription authentication is **not** treated as a hard no-spend proof. The stock route is configured as:

- billing mode: `INCLUDED_ALLOWANCE`;
- paid execution policy: `FORBIDDEN`;
- billing safety: `OBSERVATION_REQUIRED`.

Therefore unattended execution is ineligible while billing-safety evidence is `UNKNOWN`. A trusted current `VERIFIED_NO_PAID_SPILLOVER` observation must exist before O can select the route. Credential presence alone never creates spend authority.

## Capacity

There is no normative provider quota API assumption. Before a trusted execution outcome, capacity may remain `UNKNOWN`; that is safe to attempt only when the strict billing-safety gate above is already satisfied.

A provider execution may be translated into a routing failure only when the deterministic adapter wrapper can classify the failure as a capacity/rate-limit condition. The wrapper writes trusted execution-failure/capacity evidence and wakes O; provider-authored prose never drives T14 directly.

## Role isolation

- A/R: read-only filesystem/tool policy.
- D: workspace mutation only; GitHub write is performed later by the deterministic candidate writer.
- R: fresh non-resumed invocation; existing D-author exclusion semantics remain binding.
- OAuth secret exists only in the model job.
- deterministic finalize/writer jobs receive no provider secret.

Codex remains available as a separate optional adapter/candidate. It is not an automatic paid fallback in the default cost-min policy.
