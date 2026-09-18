# Issue #23 — bounded Child 3 target

This proposal contains only the executable robust multi-repo GitHub App/webhook O adapter authorized by Parent Intent #20.

It is based on and must be reviewed against the stable R-approved Child #21 / PR #25 head:

`7b155f8abd09f84c0065d64063eee3b2c3dce615`

Exact target root:

`proposals/issue-23/target/reference/app/multi-repo-o/`

No Child #22 assets or shared-core redefinition are included.

## F1/F2 corrective loop

Independent review `5247917293` / Issue comment `5730196459` returned exactly two blocking implementation defects against rejected head `543919320d9a86cfcee1a2c9584642461d161ad7`.

Corrective scope is limited to:
- F1 — GitHub-authoritative assignment/run ownership that survives complete operational SQLite loss;
- F2 — deterministic CAS projection of shared-core `INVALIDATE` to its earliest affected point.

Regression suite adds:
- DB-loss-after-dispatch recovery and duplicate receiver rejection;
- contract drift → ANALYSIS/A convergence;
- mutable review evidence drift → IN_REVIEW/R convergence;
- mutable H release evidence drift → APPROVED release-boundary convergence.

Corrective self-test run `35347834074`: bounded delta PASS, syntax PASS, `npm test` **13/13 PASS**, Docker build PASS.

No Child #21 core/schema/transition file is changed.

