# Automated execution profile

Automated mode uses deterministic O as the sole dispatcher. GitHub events are wakeups only.

Reference implementations live under `../../reference/`:
- default small-project transport: `reference/profiles/single-repo-actions/`;
- experimental/unverified multi-repo O: `reference/app/multi-repo-o/`;
- common schemas/core: `reference/schemas/` and `reference/core/`.

The default single-repo transport leaves only stable bootstrap/launcher assets in the product repository. Mutable governance, core, runner protocol and project-control semantics remain in this pinned external control plane.

Every assignment/run binds:
- target repository/work item;
- exact `product_bootstrap_sha`;
- exact `control_plane_sha`;
- project/profile identity;
- semantic state/fingerprint;
- exact candidate/target where relevant;
- current execution route and claim.

Privileged PR wake is metadata-only `pull_request_target`; A/D/R/P launchers are `workflow_dispatch` only. No provider secret, candidate execution or material authority is reached until trusted bootstrap and current assignment/claim checks pass.
