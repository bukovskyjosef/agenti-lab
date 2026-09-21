# Single-repo Actions — external-control-plane profile

This is the default small-project automated reference profile.

## Product-local surface

Bootstrap installs only stable transport assets from `target/`:
- trusted root `AGENTS.md` locator;
- `.agenti/bootstrap.json`;
- `.agenti-bootstrap/bootstrap-trust.mjs`;
- GitHub launcher workflows;
- the Human intake Issue template.

It intentionally does **not** install `.agenti-runtime`, a mutable local Project Profile, local runner prompts or another governance copy.

## Trusted T0

Every launcher first checks out the product canonical/default branch and runs the trusted bootstrap helper before any provider secret, candidate execution or material write.

T0:
1. resolves current target default branch SHA and requires the workflow context to match it;
2. verifies the trusted AGENTS locator and machine bootstrap locator agree;
3. resolves the external control-plane default branch exact SHA;
4. checks out that exact control plane;
5. resolves one project/profile mapping;
6. exports the exact trust binding.

O's PR wake is `pull_request_target` and metadata-only until T0 completes. There is no privileged ordinary-`pull_request` fallback. A/D/R/P launchers are `workflow_dispatch` only.

A/D/R/P then require the durable assignment's `trust_binding` to equal the freshly resolved:
- `product_bootstrap_sha`;
- control-plane repository + `control_plane_sha`;
- project id;
- profile id.

If the default branch moves after assignment, the stale run fails before provider/material authority; O recovery/retry can subsequently issue a fresh current assignment.

## Runtime authority

The runtime executes from the exact external control-plane checkout in runner temp. Project/runtime config is resolved from the external automated profile plus the small external project-control record. Product truth and work state remain in the product repository.

## Runner routing

The integrated reference retains routed A/D/R execution and deterministic P. The default cost-min policy selects only the Claude subscription route when trusted billing-safety/capacity evidence makes it eligible. That route is release-supported only with the live-smoke evidence required by Issue #24.

Codex API artifacts are included only as an experimental/unverified adapter example. The stock routing policy does not select them, and this publication does not claim that Codex path as runnable or supported.

Independent R uses a fresh execution identity distinct from author execution. D provider compute has no GitHub material-write authority; a deterministic fenced writer applies the resulting change. P receives no model/provider authority.

## Setup

From a fixed published Agenti checkout:

```bash
node reference/cli/agenti.mjs bootstrap --target /path/to/project --repository owner/repo
# review/commit generated stable transport and publish any required control-plane enrollment
node reference/cli/agenti.mjs setup-github --repository owner/repo
node reference/cli/agenti.mjs doctor --github --repository owner/repo
```

For existing work:

```bash
node reference/cli/agenti.mjs enroll --repository owner/repo --issue 123
node reference/cli/agenti.mjs enroll --repository owner/repo --issue 123 --apply
```

Dry-run enrollment reports current evidence and does not silently reclassify historical evidence as current.

## Release conformance

Local deterministic test mode remains explicit and cannot count as live-provider proof. Before publication, Issue #24 must carry real GitHub and real-provider evidence required by the final release contract.
