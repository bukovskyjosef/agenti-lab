# Agenti reference core — Child 1

This directory is the bounded provider/platform-neutral foundation approved by Parent Intent #20 and implemented by Child #21.

It intentionally contains **no GitHub Actions starter, no provider invocation, no Asistentka workflow, no GitHub App service and no publication/bootstrap package**. Those are later children.

## Contract

The core provides:

- JSON Schemas for Project Profile, bounded O workflow state, explicit assignments and the discriminated A/D/R/P role-result union;
- the canonical T01–T19 transition table;
- a pure deterministic O engine;
- accepted-evidence integrity helpers for mutable GitHub evidence;
- trusted execution-attestation and D≠R independence checks;
- exact-candidate/fingerprint/CAS/idempotence helpers;
- one bounded `agenti-state:v1` parser/renderer;
- deterministic role-result normalization/application guards;
- local doctor checks for schema/profile/transition/privilege/independence coherence;
- deterministic conformance fixtures and `node:test` tests.

The core never grants authority from model output. Provider output is proposal data; a deterministic wrapper supplies trusted assignment/execution/current-state facts, validates allowlisted role payloads and wakes O. O then fresh-reads authoritative state and chooses the transition.

## Runtime

Node.js 20+ only. Child 1 has no runtime dependencies and performs no network/provider calls.

```bash
npm test
npm run doctor -- ./conformance/fixtures/project-profile.valid.json
```

The doctor accepts JSON. A later profile adapter may parse YAML before passing the same object to the core; YAML support is intentionally not introduced here.

## Durable-state boundary

The workflow-state record is a bounded O-owned **projection**. It stores current lifecycle/bindings/digests/pointers; it does not duplicate Goal/Scope/AC/findings or create a second semantic authority store.

Mutable accepted evidence is never trusted by object ID alone. The accepted binding includes object identity, immutable actor ID, accepted revision, normalized payload digest, normalized outcome and context/candidate/state binding. Every dependent transition must re-fetch and verify that binding.

Immutable-native facts such as commit SHAs may be referenced directly.

## Privilege boundary

Project Profile separates O and P capability identities. The core doctor rejects an O profile that requires publication-capable Contents write merely for dispatch and requires the reference O dispatch mechanism to be compatible with `workflow_dispatch` / Actions write.

P remains a separate capability profile.

## Independence

Independent R evidence is accepted only when the deterministic wrapper's execution attestation satisfies the assignment's `must_differ_from_execution_instances`. A model/self-reported logical ID is never used as proof.
