# Agenti executable reference package

This directory is the version-bound executable implementation shipped with the published Agenti control plane.

It integrates the independently approved core, single-repo Actions profile, multi-repo App, provider-neutral routing/capacity handling and exclusive claim/CAS/fencing model. The final packaging layer binds those parts to the external control-plane ownership and trusted-bootstrap contract.

## Authority model

Canonical authority/delivery roles remain exactly **H / A / D / R / P**. **I = Interface** and **O = Orchestrator** are system functions.

O is the sole deterministic dispatcher. Events are wakeups only. A/D/R/P require explicit current assignments and material work requires the current exclusive claim. H-owned product/governance/release decisions remain durable boundaries. P is a privileged deterministic boundary executor, not an approval authority.

## External control-plane execution

The production adoption path does not copy mutable core/runtime/project-governance into product repositories.

A trusted product launcher:
1. resolves the product default branch exact `product_bootstrap_sha`;
2. reads the product root locator only at that SHA;
3. resolves the external Agenti default branch exact `control_plane_sha`;
4. resolves project/profile through `projects/registry.yml` at that same SHA;
5. only then reads work-item/candidate state and dispatches/executes runtime from this exact external package.

Candidate bootstrap/launcher/tool files cannot govern their own run.

## Components

- `core/`, `schemas/` — shared deterministic protocol and contracts.
- `profiles/single-repo-actions/` — stable product transport + external runtime.
- `app/multi-repo-o/` — robust GitHub App O reference.
- `adapters/` — provider adapters; no provider is normative.
- `cli/agenti.mjs` — bootstrap/update/effective doctor/enrollment UX.
- `conformance/`, `test/` — deterministic and release-level conformance assets.
- `manifest.json` — exact integrated dependency/release-proof binding.

## Cost/capacity routing

Routing is O-owned and can only choose how an already-authorized role executes. Included/subscription routes fail closed unless current trusted billing-safety evidence proves no paid spillover where required. Paid routes require explicit policy/budget authority. Capacity failure can use existing T14 reroute/wait semantics without pretending to be semantic progress.

## Exclusive execution ownership

An assignment alone is insufficient for material execution. The durable O projection carries a separate claim generation and at most one active material claim for a work item. State/claim/material writers share the same mutation/fencing domain; provider compute stays outside that lock. Results/failures/material operations are accepted only when exact assignment/claim/currentness bindings remain valid.

## Release proof

The package is not publication-ready until the Issue #24 validation record contains:
- deterministic combined suite;
- real GitHub final-profile E2E;
- malicious candidate control-surface regression;
- stale default-branch/assignment fail-closed regression;
- real-provider smoke for every adapter still claimed runnable/supported.

Adapters lacking that live proof must not be advertised as proven runnable/supported.
