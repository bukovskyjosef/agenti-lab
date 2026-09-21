# Agenti — published software delivery control plane

`agenti` is a version-bound reference standard **and executable reference control plane** for software-product delivery with H/A/D/R/P roles, Interface I and deterministic Orchestrator O.

The published commit binds the normative contract, project/profile registry, executable O/runtime, runner adapters, bootstrap/doctor tooling and conformance assets. Consumer projects must not reconstruct compatibility across unrelated versions.

## Repository map

- `AGENTS.md` — trusted external cold-start entrypoint.
- `docs/` — normative standard and navigation.
- `core/` — cold-start map for cross-project normative control semantics.
- `profiles/manual/` — manual/Human-proxy execution profile.
- `profiles/automated/` — automated control-plane profile definitions.
- `projects/registry.yml` — repository-to-project/profile registry.
- `projects/<project>/project.yml` — project-specific agent-control pointers only.
- `reference/` — executable schemas, O core, Actions profile, multi-repo App, adapters, bootstrap/doctor and conformance harness.

Product/domain/runtime truth remains in each product repository. GitHub Issue/PR state in the product remains the durable work map.

## Trusted activation

A run never establishes authority from candidate content. It binds the target default-branch `product_bootstrap_sha`, then one exact published `control_plane_sha`, then resolves registry/core/profile/project-control at that same revision. Candidate `AGENTS.md`, tool instructions and workflow files cannot govern their own review/run.

See `AGENTS.md` and `docs/reference-implementation.md`.

## Direct adoption

The intended setup flow is:

```text
node reference/cli/agenti.mjs bootstrap --repository OWNER/REPO
# review/apply the generated desired-state plan and any required governed enrollment/transport candidates
node reference/cli/agenti.mjs doctor --github --repository OWNER/REPO
```

Bootstrap automates owned GitHub setup where safe, asks only for missing Human/security values, and generates governed repository/control-plane candidates where direct mutation would bypass authority. `doctor --github` verifies effective state and fails closed on missing/ambiguous control-plane binding, launcher drift, blocked event policy, permission drift, missing secret metadata or other required setup.

The default single-repo Actions transport uses a trusted default-branch `pull_request_target` metadata wake for O and `workflow_dispatch`-only privileged A/D/R/P launchers. Candidate code is not executed before trusted bootstrap and current assignment/claim validation.

## Development

This repository is publication-only. Issues, proposals, reviews and experiments for the standard belong in `bukovskyjosef/agenti-lab`.
