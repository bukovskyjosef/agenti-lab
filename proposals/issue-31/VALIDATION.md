# Issue #31 validation evidence

## Exact dependency assembly

`assemble-and-validate.mjs` materializes:
- #21 `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- #22 `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- #23 `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`
- #29 `3fa68aca5717e7f966f42dd976bfd11da71c6732`

and overlays the current #31 `target/reference/`.

## Validation history

Initial combined run `35392164216` reached the inherited core/protocol suite and produced:
- 47/52 PASS;
- all 7 new claim-core tests PASS;
- five inherited protocol fixtures rejected because their trusted deterministic envelope predated the now-mandatory `claim_id` / `claim_generation` fields.

This is retained as corrective engineering evidence. The fixtures were updated in the #31 overlay; no production contract was relaxed.

The authoritative final green run and exact tested/final heads will be recorded here and on Issue #31 / PR #39 before independent R handoff.

## Required final proof

The final combined run must pass:
- syntax for all assembled `.mjs`;
- inherited core + #29 routing + #31 claim tests;
- legacy and routed Project Profile doctors;
- routing static conformance;
- #31 claim/fencing static conformance;
- inherited single-repo Actions static + local E2E;
- integrated multi-repo App tests;
- multi-repo Docker build.

The temporary validation workflow is not part of the final review target and will be removed after the final green run.
