# Issue #22 — Child 2 exact implementation target

Status: **READY FOR R**

Parent Intent: #20  
Stable dependency: Child #21 / PR #25 exact head `7b155f8abd09f84c0065d64063eee3b2c3dce615`

This proposal implements only bounded **Child 2 — Runnable single-repo Actions starter + GitHub-native Asistentka + Codex A/D/R adapter**.

## Exact overlay target

`proposals/issue-22/target/reference/`

This directory is an overlay on the byte-exact R-approved Child #21 `reference/` target. Child #22 does not modify or redefine:
- `reference/core/*`;
- `reference/schemas/*`;
- T01–T19 transition semantics.

The lab helper `proposals/issue-22/assemble-and-validate.mjs` copies Child #21 first and then overlays Child #22 for validation.

## Implemented surface

- `reference/profiles/single-repo-actions/*`
  - Project Profile starter;
  - GitHub-native H interface;
  - Actions-centric O/reconcile;
  - A/D/R workflows;
  - deterministic P workflow;
  - runtime adapters/state projection;
  - deterministic D candidate writer;
  - install/update/doctor support;
  - explicit test-only fake runner.
- `reference/adapters/codex-action/*`
  - exact reviewed action pin;
  - A/D/R provider proposal schemas;
  - adapter contract documentation.
- `reference/cli/agenti.mjs`
  - fixed-version installation;
  - generated manifest/hash binding;
  - safe update/reinstall behavior;
  - GitHub setup/doctor.
- `reference/conformance/single-repo-actions/*`
  - static privilege/wiring checks;
  - local fixture E2E;
  - opt-in disposable-repository real GitHub E2E;
  - opt-in real provider smoke.

## Critical invariants

- GitHub events only wake O; they never select the next role.
- O uses the stable Child #21 engine and is the only writer of `agenti-state:v1`.
- Machine comments are accepted only from `github-actions[bot]`; Human commands only from configured H actor IDs.
- Initial managed intent requires both the intake label and a configured H issue author.
- A/D/R provider output remains proposal data.
- A/R model jobs are read-only; D model job has workspace-only filesystem permission and no GitHub write credential.
- D candidate identity is produced only by the deterministic writer after it applies the captured patch and fresh-reads the PR/head.
- independent R uses fresh wrapper-created execution attestation.
- O has Actions write for explicit `workflow_dispatch` but no Contents write.
- P is a separate deterministic privileged workflow and immediately revalidates current candidate/R/checks/target/H release evidence before merge.
- P emits publication evidence; O evaluates Done.
- test-only fake runner is gated by explicit `AGENTI_TEST_MODE=true`; setup defaults it to false.
- third-party Actions are pinned to exact commit SHAs.

## Scope guard

Not implemented here:
- multi-repo GitHub App O (#23);
- final cross-profile packaging/release integration (#24);
- publication to `agenti/main`;
- any change to stable Child #21 core semantics.

## Validation

See `VALIDATION.md`.

The strongest executed proof in this E environment is the GitHub-hosted assembled overlay run. Environment-dependent real provider/disposable-repository proofs are shipped as executable harnesses but are explicitly recorded as not executed here when required credentials/repository are unavailable.

No P/publication work is authorized.
