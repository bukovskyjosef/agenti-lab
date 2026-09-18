# Issue #31 validation evidence

## Exact dependency assembly

`assemble-and-validate.mjs` materializes:
- #21 `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- #22 `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- #23 `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`
- #29 `3fa68aca5717e7f966f42dd976bfd11da71c6732`

and overlays the current #31 `target/reference/`.

## Corrective validation history

Initial combined run `35392164216` reached the inherited core/protocol suite and produced:
- 47/52 PASS;
- all then-current claim-core tests PASS;
- five inherited protocol fixtures rejected because their trusted deterministic envelope predated the now-mandatory `claim_id` / `claim_generation` fields.

Those fixtures were corrected in the #31 overlay; the production contract was not relaxed.

Subsequent runs exposed and corrected additional concrete gaps in:
- local E2E claim binding;
- App receiver/failure mutation-domain wiring;
- PLATFORM_RUN recovery;
- ambiguous projection CAS;
- pre-provider currentness;
- multi-repo PREPARED/RESOLVE material-write fencing;
- immutable D/P target binding;
- Human Stop and shared-domain race fencing.

## Final exact implementation validation

Combined run `35395573348` on implementation head
`498e43d579c9eba851a455f61f5d1271f1199fc3` completed **SUCCESS**.

Observed proof:
- all assembled `.mjs` syntax: PASS;
- inherited core + routing + Child 6 claim suite: **56/56 PASS**;
- legacy Project Profile doctor: PASS;
- routed Project Profile doctor: PASS;
- Child #5 routing static conformance: **4/4 PASS**;
- Child #6 claim/fencing static conformance: **8/8 PASS**;
- PLATFORM_RUN / exact Human recovery conformance: **4/4 PASS**;
- ambiguous CAS + claim/Stop + heartbeat/drift race conformance: **6/6 PASS**;
- fresh pre-claim/current-target/H-Stop conformance: **5/5 PASS**;
- single-repo Actions static conformance: **5/5 PASS**;
- single-repo local lifecycle E2E: PASS;
- multi-repo App suite: **21/21 PASS**, including DB-loss recovery and durable PREPARED material-write fencing;
- multi-repo Docker build: PASS;
- assembler terminal result: `Child #31 combined exact-target validation: OK`.

## Final cleanup rule

The temporary PR-only workflow
`.github/workflows/issue-31-validation.yml`
exists only to obtain CI evidence. It is not part of the Child 6 implementation contract and must be removed before independent R handoff.

After this validation record is committed, one final green combined run is required on that commit. The final R review head may differ from that tested head only by deletion of the temporary validation workflow; no implementation, schema, conformance or normative documentation content may change after the final green run.
