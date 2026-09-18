# Issue #22 validation / acceptance proof

## Stable dependency

Child #21 / PR #25 exact approved head:

`7b155f8abd09f84c0065d64063eee3b2c3dce615`

Child #22 was branched directly from this SHA.

## Executed PASS — assembled target on GitHub-hosted runner

Temporary lab-only validation workflow run:

- push run: `35345473174`
- parallel PR run: `35345478914`
- validated head: `b069199e6804f34dec79ca164626dd990e911dc7`

Results from the push-run job log:

- Child #21 core: **23/23 PASS**
- Child #21 doctor: **OK**
- Child #22 static workflow/privilege tests: **5/5 PASS**
- Child #22 local fixture E2E:
  - `H intent → O → A → D → independent R → exact H release → P → O Done`
  - **1/1 PASS**
  - no Human role relay
- assembled overlay helper: **Child #22 overlay validation: OK**

The validation workflow had only `contents: read` and no secrets for this suite.

## Defects found and corrected during E validation

1. reconstructed assignment emitted invalid `execution_repository.ref: null`; fixed by omitting the optional field;
2. overlay helper resolved `proposals/` from the wrong directory; fixed;
3. candidate with an empty required-check set was reported `NOT_REQUIRED`, while stable T04 requires a passed gate; adapter now treats the empty set as `PASSED`;
4. exact H release snapshot used an undefined `response_binding` variable; fixed to the actual accepted evidence binding;
5. machine state/result/claim markers originally trusted marker text alone; adapter now requires Actions bot provenance;
6. initial intake now requires a configured Human issue author in addition to the managed label;
7. provider secret wiring was simplified to the fixed reviewed `OPENAI_API_KEY` secret, eliminating dynamic secret-name expression ambiguity;
8. stop/reopen handling uses the latest durable H command so an old stop cannot reassert after a valid reopen.

All corrections are Child #22 adapter/profile changes only.

## Provider smoke — ENVIRONMENT UNAVAILABLE, harness ready

A temporary branch-only validation run attempted availability-gated real Codex A/D/R smoke:

- run: `35345696373`
- validation job: PASS
- provider A job: workflow PASS, actual Codex step **SKIPPED**
- provider D job: workflow PASS, actual Codex step **SKIPPED**
- provider R job: workflow PASS, actual Codex step **SKIPPED**

Reason: repository secret `OPENAI_API_KEY` is not available in `agenti-lab`.

Therefore **real provider smoke is NOT claimed as passed** in this environment.

The exact executable provider-smoke path is shipped in:
`reference/conformance/single-repo-actions/github-e2e.mjs --scenario provider-smoke`

and the reviewed runtime workflows invoke the pinned:
`openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e`.

## Real disposable-repository E2E — ENVIRONMENT UNAVAILABLE, harness ready

The connected GitHub account exposes no repository identified as disposable for this test. Running the scenario against `agenti`, `agenti-lab`, FamilyHelper, Kvazi or another real project would create/merge candidate branches and is not a safe acceptance-test substitute.

Therefore **real GitHub E2E is NOT claimed as executed** in this environment.

The shipped harness requires an explicit disposable-repository acknowledgement:

```bash
node .agenti-runtime/conformance/single-repo-actions/github-e2e.mjs \
  --repo owner/disposable-repo \
  --scenario happy \
  --confirm-disposable yes
```

It supports:
- happy;
- defect loop;
- Human interrupt;
- stale candidate;
- Stopped;
- real provider smoke.

The harness resets `AGENTI_TEST_MODE=false` on cleanup.

## Supply-chain/platform verification

The target pins:
- `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e`
- `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02`
- `actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0`

Current GitHub documentation was checked for the used `queue: max` concurrency semantics.

## R interpretation

R should distinguish:
- **implementation/conformance proof that executed and passed**, from
- **environment-bound proofs for which the executable harness exists but the E environment lacks the required secret/disposable repo**.

E does not self-convert either unavailable proof into PASS.
