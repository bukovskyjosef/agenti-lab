# Issue #21 — independent R checklist

Review exact PR head only. Bind the R outcome to that immutable head.

Authoritative inputs:
- Issue #21
- Parent #20
- canonical A report `5728210505`
- R-approved corrective report `5728425032`
- fixed baseline `agenti@50cc7974ce9fe96237a0cf648e8a90df2f94dab0`

Required checks:

1. The target stays inside Child 1; no Actions/provider/Asistentka/App/bootstrap implementation leaked in.
2. Project Profile, workflow state, assignment and role-result schemas are machine-readable and mutually coherent.
3. F1 accepted mutable evidence cannot be trusted by object ID alone; actor/revision/payload/outcome/context are bound and reverified before dependent transitions.
4. Immutable-native facts such as commit SHA remain direct evidence.
5. F2 independence uses deterministic wrapper/platform attestation created before provider invocation; model/self-reported logical ID cannot satisfy D≠R.
6. R assignment exposes `must_differ_from_execution_instances` and Project Profile selects an enforcement mechanism.
7. F3 O identity can dispatch through Actions write / workflow_dispatch without Contents write; P is a separate privilege identity/capability.
8. T01–T19 are all present once, preserve Parent #20 semantics and do not create a new authority transition family.
9. The engine is pure/deterministic and never uses model output as authority.
10. T01 creates explicit A assignment; A Ready creates D; D candidate/checks create independent R; R routing/release/P/post-R/Done paths remain mechanically guarded.
11. Candidate/contract/evidence drift returns to earliest affected point and stale evidence cannot advance P.
12. Fingerprint/run eligibility and CAS/idempotence keys suppress duplicate/no-op work without suppressing first authorized execution.
13. `agenti-state:v1` remains a bounded O projection and does not duplicate the semantic work contract.
14. F4 A payload cannot set lifecycle or arbitrary contract paths.
15. F4 D provider proposal cannot authoritatively provide candidate facts and its change artifact is wrapper-owned before deterministic candidate writing.
16. F4 R canonical outcomes/findings/correction owner are validated and remain routing proposals, not authority.
17. F4 P result cannot emit Done.
18. Doctor detects malformed refs/profile, missing R mechanism, O/P privilege collision/incompatible permissions and transition-table defects.
19. Tests/fixtures materially cover stale evidence, duplicate/idempotence, independence rejection, Stopped/reopen and cold reconstruction.
20. H/A/D/R/P + Asistentka/O boundaries, no Tester/Integrator, exact-candidate, Blocked/Stopped, Parent Intent and provider neutrality remain unchanged.

Recommended execution:

```bash
cd proposals/issue-21/target/reference
npm test
npm run doctor -- ./conformance/fixtures/project-profile.valid.json
```

R must record exactly one outcome against the exact head: `APPROVED`, `CHANGES_REQUIRED`, or `DECISION_REQUIRED`.
