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

## Environment-bound hard gates

No publication or R handoff is allowed until this record is updated with exact successful evidence for:

1. real GitHub final-profile E2E;
2. candidate-control-surface regression;
3. stale default-branch/assignment fail-closed regression;
4. real-provider smoke for every adapter still advertised as runnable/supported.

Temporary lab validation workflow/metadata is excluded from `target/`.
