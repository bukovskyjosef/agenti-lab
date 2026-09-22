# Claude subscription OAuth adapter

This is the **default release-candidate A/D/R adapter** for the provider-neutral routing contract. It is represented as release-supported only when the exact Issue #24 validation record contains a successful real-provider smoke for the final integrated profile.

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

## Release support status

`SUPPORTED_ONLY_WITH_ISSUE_24_LIVE_SMOKE_EVIDENCE`

A publication without that exact live-smoke evidence must remain blocked; static/local tests are not a substitute.
