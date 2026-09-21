# Executable reference implementation

The same published `agenti` commit carries the normative contract and its executable reference implementation under `reference/`.

## Ownership boundary

The control plane owns orchestration semantics, schemas, profiles, project-control pointers, runner protocol and conformance. A product repository owns product/domain/runtime truth, product tests/CI/deployment contracts and its durable Issue/PR work state.

The default Actions profile installs only stable product transport:
- root trusted bootstrap locator;
- minimal machine bootstrap locator;
- trusted launcher/helper files;
- Human intake template.

It does **not** copy mutable governance/core/project-control trees into the product as authority.

## Bootstrap

`node reference/cli/agenti.mjs bootstrap --repository OWNER/REPO` computes desired state. Directly owned GitHub resources may be applied idempotently. Product/control-plane file changes are generated as governed candidates; bootstrap does not bypass normal publication authority.

Human input is reserved for values or security consent that cannot be derived safely (for example credentials, App ownership/install consent or undeclared release/security policy). Secret values are never written to durable output.

## Effective-state doctor

`doctor --github` verifies at least:
- target default branch and exact `product_bootstrap_sha`;
- trusted product locator;
- exact current `control_plane_sha`;
- one unambiguous registry/project/profile mapping;
- stable trusted launcher integrity;
- O `pull_request_target` metadata wake and absence of privileged ordinary-`pull_request` fallback;
- role/P `workflow_dispatch` launchers;
- effective Actions/event/permission constraints where inspectable;
- O/P privilege separation;
- required secret metadata only;
- declared checks/rules/environment integration;
- no mutable product-local governance dependency.

Failure is classified rather than silently weakened: missing setup, drift, insufficient bootstrap credential, higher-level policy conflict, unavailable platform capability or pending Human security approval.

## Release conformance

Publication is gated on deterministic combined tests plus release evidence for:
- real GitHub final-profile E2E;
- real-provider smoke for every adapter claimed runnable/supported;
- malicious candidate control-surface regression proving candidate launcher/bootstrap/tool changes cannot govern their own run;
- stale default-branch/assignment dispatch failing before provider/material authority;
- existing routing, claims/CAS/fencing, stale-candidate, Stop/reopen, recovery and multi-repo invariants.
