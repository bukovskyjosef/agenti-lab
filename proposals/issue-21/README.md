# Issue #21 — Child 1 exact implementation target

Status: **READY FOR R**

Parent Intent: #20  
Canonical A report: comment `5728210505`  
Independent R approval of Parent/F1–F4: comment `5728425032`  
Fixed published baseline: `bukovskyjosef/agenti@50cc7974ce9fe96237a0cf648e8a90df2f94dab0`

This proposal implements only bounded **Child 1 — Core protocol, schemas and deterministic O engine**.

## Exact target root

`proposals/issue-21/target/reference/` maps conceptually to the future published `reference/` subtree. Child #24 will later integrate independently approved child outputs into the final publication candidate; this child does not publish anything.

## Implemented surface

### Machine-readable contracts
- `schemas/project-profile.schema.json`
- `schemas/workflow-state.schema.json`
- `schemas/assignment.schema.json`
- `schemas/role-result.schema.json`

### Deterministic core
- `core/transitions.json` — canonical T01–T19 transition table + safety priority
- `core/schema.mjs` — schema validation, bounded state projection, F1 accepted evidence, doctor semantics
- `core/protocol.mjs` — fingerprint/CAS/assignment, F2 independence, F4 normalization/application
- `core/engine.mjs` — pure deterministic `evaluate(...)` + projection application
- `core/index.mjs` — stable core exports
- `core/doctor.mjs` — local validator

### Conformance
- `conformance/fixtures/project-profile.valid.json`
- `conformance/fixtures/base-state.json`
- `conformance/fixtures/core-scenarios.json`
- `test/core.test.mjs`
- `test/protocol.test.mjs`

### Package boundary
- `package.json`
- `README.md`

Node.js 20+; no runtime dependency, no network/provider call.

## Acceptance mapping

1. **Schemas** — all four required contracts are executable JSON Schemas.
2. **F1 mutable evidence integrity** — accepted mutable evidence binds kind/repo/object/immutable actor/revision/payload digest/outcome/context; every O evaluation can re-fetch/verify before transition; edit/delete/context mismatch yields DRIFTED/INVALID/STALE.
3. **F2 independence** — assignment carries `must_differ_from_execution_instances`; wrapper-created execution attestation is required; Project Profile names adapter mechanism; R collision/resume constraints are deterministic; provider cannot self-report trusted identity.
4. **T01–T19** — one machine-readable canonical transition table, consumed by the engine.
5. **Pure O** — `evaluate(projectProfile, workflowState, authoritativeSnapshot, wakeEvent, transitionTable)` performs no I/O/provider invocation.
6. **Bounded state projection** — one `agenti-state:v1` payload stores current lifecycle/bindings/digests/pointers, not duplicated Goal/Scope/AC prose.
7. **F4 role-result pipeline** — discriminated A/D/R/P union; wrapper owns trusted envelope; A only allowlisted contract operations; D change artifact/candidate facts are deterministic-wrapper/writer facts; R outcomes/routing are validated; P cannot emit Done.
8. **F3 O/P split** — Project Profile has separate O/P identities; doctor rejects O Contents write and requires workflow_dispatch-compatible Actions write; P has separate write capability.
9. **Doctor** — validates schema refs/profile completeness/T01–T19/privilege split/R mechanism.
10. **Tests/fixtures** — cover cold reconstruction, mutable-evidence drift, duplicate suppression, trusted independence rejection, Stopped/reopen, explicit T01/T02 assignments and multi-repo T19.

## Out of scope preserved

Not present in this target:
- runnable Actions single-repo profile;
- Codex or any provider invocation;
- GitHub-native Asistentka workflows;
- executable multi-repo GitHub App service;
- installation/bootstrap/migration/package release;
- publication to `agenti/main`.

Those remain Children #22–#24.

## Validation commands for R

From `proposals/issue-21/target/reference/`:

```bash
npm test
npm run doctor -- ./conformance/fixtures/project-profile.valid.json
```

The E session additionally performed isolated repository-side runtime checks of the core functions: doctor OK; T01 emits schema-valid A assignment; F1 edit → DRIFTED; duplicate fingerprint → suppressed; STOPPED → no-op until T17; F2 execution collision/resumed review → rejected; D wrapper-owned artifact overrides provider proposal.

No publication is authorized.
