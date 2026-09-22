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

`node reference/cli/agenti.mjs bootstrap --repository OWNER/REPO` generates/reconciles the stable product transport candidate and binds it to the external control plane. Product/control-plane file changes remain governed candidates; bootstrap does not bypass normal publication authority.

After that candidate and any control-plane enrollment are trusted on their default branches, `setup-github` is the automation-first desired-state applier. It reads project/profile/runtime truth from one exact `control_plane_sha`, plans before mutating, and with `--apply` performs read → diff → apply → reread/doctor verification for the release-supported single-repo profile. The owned AUTO surface includes Issues/Actions enablement where repository policy permits, workflow PR capability, the declared merge method, `agenti:*` labels, `AGENTI_*` variables, a workflow-scoped Agenti Actions event policy, required-check enforcement when checks are declared, and explicitly declared Agenti ruleset/default-branch-protection/P-environment policy.

Required provider secret names come from the trusted runtime. Missing values are accepted only from same-named process-environment inputs and uploaded through GitHub's secret API; values are sent on stdin and are never printed, persisted in setup output or read back by doctor. Higher-level allowed-actions/event restrictions are inspected, never silently widened. A parent security restriction or an uninspectable effective policy remains a typed Human/credential boundary rather than being bypassed.

## Effective-state doctor

`doctor --github` verifies at least:
- target default branch and exact `product_bootstrap_sha`;
- trusted product locator;
- exact current `control_plane_sha`;
- one unambiguous registry/project/profile mapping;
- stable trusted launcher integrity;
- O `pull_request_target` metadata wake and absence of privileged ordinary-`pull_request` fallback;
- role/P `workflow_dispatch` launchers;
- effective repository/owner Actions allow-list and workflow-event policy for every pinned release-supported action/workflow;
- effective workflow PR capability and trusted O/P permission separation;
- configured merge method and current required-check mapping;
- declared ruleset/branch-protection and P-environment/protection state when present;
- exact required `agenti:*` labels and non-secret `AGENTI_*` variables;
- required provider secret metadata only;
- schema/runtime/profile compatibility from the same exact control-plane revision;
- no mutable product-local governance dependency.

The machine-readable result is `READY`, `NOT_READY` or `WAITING_HUMAN_APPROVAL` and carries individual checks 1–24. Failure is classified rather than silently weakened: missing setup, drift, insufficient bootstrap credential, higher-level policy/security approval, unavailable platform capability or incompatible state. No caller assertion can turn an uninspected event policy into `READY`.

## Release conformance

The **release-supported directly-adoptable profile in this release is the single-repo GitHub Actions profile**.

Publication is gated on deterministic combined tests plus release evidence for that supported scope:
- real GitHub single-repo final-profile E2E;
- real-provider smoke for every adapter claimed runnable/supported with that profile;
- malicious candidate control-surface regression proving candidate launcher/bootstrap/tool changes cannot govern their own run;
- stale default-branch/assignment dispatch failing before provider/material authority;
- existing routing, claims/CAS/fencing, stale-candidate, Stop/reopen and single-repo recovery invariants.

The retained multi-repo GitHub App implementation and its deterministic/local regression suite are **experimental / unverified** for this release. No live GitHub App/webhook E2E claim is made, and that live proof is not a current publication gate.
