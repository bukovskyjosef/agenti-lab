# Issue #5 — exact publication target

This directory is the reviewable implementation artifact for lab Issue #5.

## Target baseline

- Published repository: `bukovskyjosef/agenti`
- Baseline commit: `789459cedc9cf708210d7fca717a4b0e9658e323`
- Proposed target: replace only the files present under `target/` with the exact contents stored here.
- All other files in `agenti` remain byte-for-byte unchanged.

## Files changed

- `AGENTS.md`
- `docs/principles.md`
- `docs/adoption.md`
- `docs/automation.md`
- `docs/work-item.md`
- `docs/delivery-cycle.md`

`docs/README.md`, `docs/roles.md` and `docs/review.md` remain unchanged because their canonical responsibilities do not require topology-specific semantics.

## Implemented contract

The proposal implements the already authorized Human decision from Issue #2:

- `single-repo` remains the reference/default topology;
- optional `multi-repo` means exactly one authoritative control/governance repository plus one or more implementation repositories;
- the control repository owns product-level governance, Human decisions, authoritative work items and product-level cross-repository coordination state;
- implementation repositories own implementation artifacts and repository-local branches, PRs, checks and technical evidence;
- the Project Profile declares topology and canonical ownership without adding multi-repo ceremony to the single-repo path;
- multi-repo work items bind every implementation PR/change candidate back to one authoritative control-repository Issue;
- a release candidate spanning repositories has one composite immutable identity, so existing exact-candidate and stale semantics remain deterministic.

## Scope guard

This proposal does not alter role authority, Human/product authority, review independence, finding dispositions, software-product scope, or the separate Human-pause/resume topic tracked in Issue #6.

## Review contract

A different logical Reviewer should review the exact snapshots in `target/` against the baseline commit and Issue #5 acceptance criteria. This branch/PR is a proposal only; it must not be published to `agenti/main` until that review and subsequent publication authorization are durable.