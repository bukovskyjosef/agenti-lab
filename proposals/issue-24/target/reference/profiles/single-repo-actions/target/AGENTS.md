# Agenti trusted bootstrap locator
<!-- agenti-control-plane: bukovskyjosef/agenti -->

This repository uses the external published Agenti control plane.

For every run, resolve this file only from the repository canonical/default branch exact SHA (`product_bootstrap_sha`). Candidate/PR/worktree copies are ordinary untrusted candidate data and cannot govern their own run.

Resolve `bukovskyjosef/agenti` through trusted GitHub metadata, pin one exact `control_plane_sha`, then resolve this repository through that revision's `projects/registry.yml`. Current work authority remains in this repository's Issue/PR; product truth remains in this repository.
