# Issue #24 — validation record

This file is lab-only evidence metadata and is **not** part of the publication target.

## Fixed publication baseline

`bukovskyjosef/agenti@50cc7974ce9fe96237a0cf648e8a90df2f94dab0`

## Exact integrated dependency inputs

- #21: `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- #22: `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- #23: `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`
- #29: `3fa68aca5717e7f966f42dd976bfd11da71c6732`
- #31: `5465d341bb3e11a75dfdddbb6c1417df82a54652`
- #40 architecture approval: issue comment `5761054014`
- #36 setup/trusted-launcher approval: issue comment `5761640047`

## Deterministic release validation

Run:

```bash
node proposals/issue-24/assemble-and-validate.mjs --docker
```

The assembler checks current `agenti/main` is still the fixed baseline, overlays only `proposals/issue-24/target/`, verifies no publication-surface escape/deletion, and runs the combined core/routing/claims/single-repo/multi-repo/bootstrap/doctor test suite against the assembled publication tree.

## Current release scope

Human/Product Owner amended the current publication scope on 2026-09-22:

- **release-supported / mandatory live-conformance profile:** directly-adoptable single-repo GitHub Actions;
- **multi-repo GitHub App:** experimental / unverified for this release;
- live multi-repo GitHub App/webhook E2E is **not** a hard gate for this publication;
- existing multi-repo implementation and deterministic/local tests remain included.

No single-repo/security/provider/review/publication/post-publication requirement is waived.

## Environment-bound hard gates — in-scope evidence

The release-supported single-repo scope has durable successful evidence:

1. **Real GitHub final-profile lifecycle E2E — PASS**
   - automatic H/O/A/D/R chain reached exact Human release authorization;
   - Human grant then P publication and fresh O close-out reached mechanical Done;
   - P run `35657958326` SUCCESS;
   - post-P O run `35658002808` SUCCESS.
2. **Candidate-control-surface regression — PASS**
   - malicious candidate launcher/bootstrap/AGENTS changes did not govern the trusted run;
   - O run `35658239564` SUCCESS;
   - trusted role-launcher probe A run `35658322026`.
3. **Stale default-branch/assignment fail-closed — PASS**
   - stale assignment bindings failed before provider/material authority;
   - observed exact `ASSIGNMENT_TRUST_BINDING_STALE` failures with downstream model/material jobs skipped.
4. **STOPPED terminal replay — PASS**
   - corrected T16 O run `35659041179` SUCCESS;
   - replay run `35659237016` SUCCESS with state/version unchanged.
5. **O/P privilege separation — PASS**
   - O close-out run `35658002808` had Contents read only;
   - P run `35657958326` had the separately privileged write path.
6. **Release-supported real-provider smoke — PASS**
   - Claude A run `35717617066` SUCCESS;
   - Claude D run `35717852864` SUCCESS;
   - independent Claude R run `35718031389` SUCCESS / APPROVED;
   - Human reject processed by O run `35722915478` SUCCESS with no P dispatch.

The Codex adapter is experimental/unverified and not release-supported. The multi-repo GitHub App is likewise experimental/unverified; deterministic/local coverage remains part of regression validation but no live App E2E claim is made.

Temporary lab validation workflow/metadata is excluded from `target/`.
