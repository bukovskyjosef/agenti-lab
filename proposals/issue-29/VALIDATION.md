# Issue #29 validation evidence

## Exact dependency assembly

`assemble-and-validate.mjs` materializes:
- #21 `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- #22 `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- #23 `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`

and overlays the current #29 `target/reference/`.

This avoids relying on branch ancestry to pretend the three independently approved children already form one tree.

## Executed combined proof

GitHub-hosted combined validation has been executed successfully against the complete Child #29 implementation/review target. The authoritative run ID and exact PR head are recorded durably on Issue #29 / its review PR so this file does not self-invalidate when final close-out metadata is updated:

- immutable dependency materialization: PASS
- all assembled `.mjs` syntax: PASS
- shared core + Child 5 routing tests: **40/40 PASS**
- legacy Project Profile doctor: **OK**
- routed Project Profile doctor: **OK**
- routing/billing/Interface static conformance: **4/4 PASS**
- inherited single-repo privilege/wiring static suite: **5/5 PASS**
- routed single-repo local E2E `H → O → A → D → R → H release → P → O Done`: **1/1 PASS**
- integrated multi-repo suite: **17/17 PASS**
- Child 5 combined exact-target validation: **OK**
- integrated multi-repo Docker build: **PASS**

The complete review metadata is included in the final validation pass. After that green run, the temporary branch-only validation workflow is deleted; the exact R head must differ from the tested head only by deletion of that temporary workflow.

## Conformance matrix

The executable test target covers the R-approved #26 scenarios:

1. preferred included AVAILABLE → selected;
2. included UNKNOWN is executable only with current verified no-spillover guard;
3. exhausted included candidate produces no provider invocation before due;
4. exhausted preferred candidate → second authorized included candidate;
5. all included exhausted + paid forbidden → durable wait/Blocked;
6. paid candidate configured but FORBIDDEN → filtered;
7. paid candidate + explicit budget + hard cap → eligible;
8. paid candidate without hard cap → ineligible/doctor error;
9. Claude subscription workflow with accidental `ANTHROPIC_API_KEY` → fail closed;
10. capacity recovery after retry_at → deterministic reselection/run;
11. reconcile before `not_before` → cheap no-op / App queue suppression;
12. capacity/routing bookkeeping does not change `semantic_work_digest`;
13. fallback route creates distinct route/assignment attempt while semantic digest stays stable;
14. completed semantic run suppresses later capacity duplicate;
15. same-provider D/R still requires a distinct trusted execution instance;
16. R reroute preserves D-author must-differ exclusions;
17. mid-assignment capacity failure → T14 route/wait, not semantic defect;
18. durable wait survives cold state reconstruction;
19. contract drift while waiting wins and invalidates old wait at the normal earliest affected point;
20. P remains deterministic/non-billed; a metered/non-deterministic P route is doctor-invalid.

Additional integrated App regressions prove:
- candidate-specific routed repository/workflow dispatch;
- owning workflow-run failure evidence is required;
- failure callback writes trusted durable evidence and returns to O/T14;
- App reconcile suppresses pre-due wakes and enqueues at/after due.

## Provider evidence / live gates

This E session does **not** claim a live Claude Pro/Max no-paid-spillover proof.

The stock Claude OAuth adapter deliberately records that OAuth alone is not a hard spend-safety guarantee. The strict profile remains fail-closed without independently trusted current billing-safety evidence.

Human decision comment `5730366042` already places environment-bound provider/live acceptance into #24 / pre-publication as hard gates. Therefore #29 proves:
- schema/policy correctness;
- fail-closed behavior;
- adapter/workflow wiring;
- deterministic fake/integration behavior;
- exact dependency integration.

It does not convert an unavailable external provider/account fact into PASS.

## Supply-chain pins

- Claude Code Action:
  `anthropics/claude-code-action@a4f54ef2c58884867281bd8e2f8d63352ad019a9`
- inherited Codex optional adapter:
  `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e`
- inherited GitHub Actions dependencies remain exact-SHA pinned.

## Failed validation iterations retained as engineering evidence

Earlier combined runs failed only while the Child 5 integration was incomplete:
- `35379268561` — wait drift regression fixture missing trusted drift signal;
- `35379381127` — static assertion harness defects;
- `35379534058` — vocabulary self-scan defect;
- `35379615763` — pre-amendment E2E lacked strict billing/capacity evidence.

Each was corrected before the green combined run.
