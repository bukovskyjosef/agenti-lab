# Issue #22 — independent R checklist

Review the exact PR head only and bind the outcome to that immutable SHA.

Authoritative inputs:
- Issue #22;
- Parent #20 canonical A report and R approval;
- stable Child #21 / PR #25 exact head `7b155f8abd09f84c0065d64063eee3b2c3dce615`;
- `proposals/issue-22/VALIDATION.md`.

Required review:

1. Child #22 is a pure overlay; no Child #21 core/schema/T01–T19 file is modified or redefined.
2. install/update is fixed-version aware, manifest/hash-bound and refuses unsafe overwrite of locally modified generated files.
3. O/reconcile fresh-read GitHub durable state and use stable Child #21 `evaluate(...)`.
4. events are wake signals only; next role comes from deterministic current state.
5. explicit `workflow_dispatch` callback exists for role completion; no reliance on GITHUB_TOKEN recursive comment events.
6. one trusted `agenti-state:v1` projection exists and machine markers require Actions-bot provenance.
7. intake and Human commands are bound to configured H principals.
8. labels remain UI projections, never authority.
9. A model job is read-only and only allowlisted contract operations are deterministically applied.
10. D model job has no GitHub write/P credential; deterministic writer owns patch application, branch/PR and observed candidate facts.
11. R is a fresh non-resumed read-only provider invocation and uses wrapper-created execution attestation.
12. D author execution instance is carried into R `must_differ_from_execution_instances`.
13. provider output cannot create trusted assignment/candidate/attestation facts.
14. O has Actions write but no Contents write.
15. P is isolated, deterministic and revalidates exact candidate, current R evidence, checks, target and H release immediately before write.
16. P never emits Done; O performs completion evaluation.
17. duplicate assignment has durable run-claim suppression.
18. reconcile can repair a current assignment that has neither claim nor result.
19. STOPPED terminal guard and latest H stop/reopen semantics are preserved.
20. stale candidate invalidates old R/H/P applicability and never allows old P to write.
21. fake runner is test-only and defaults off.
22. Actions/provider dependencies are exact-SHA pinned.
23. local assembled proof is independently reproducible via `node proposals/issue-22/assemble-and-validate.mjs`.
24. R explicitly evaluates the two environment-unavailable acceptance proofs in `VALIDATION.md`; E has not claimed them as PASS.
25. no multi-repo App, final release packaging or direct `agenti/main` publication leaked into scope.

R outcome must be exactly one of:
`APPROVED`, `CHANGES_REQUIRED`, or `DECISION_REQUIRED`.
