# Automation — claim, CAS and fencing

Automation is responsible for:

- pre-run eligibility and exact claim acquisition;
- one bounded `claim_control` in the O projection;
- separate `claim_version` fencing;
- one work-item mutation domain for all projection writers;
- claim-aware result/failure acceptance;
- deterministic material-operation identity;
- stale recovery that never guesses from silence;
- ambiguous projection-write reread before retry;
- claim terminalization on result, Stop, drift and T14;
- DB-loss reconstruction from GitHub authority.

## Actions reference

All authoritative mutation/fence jobs use the same `agenti-state-<control-work-item>` concurrency group. Provider compute is outside the group. Jobs are bounded by timeout.

PLATFORM_RUN recovery requires authoritative GitHub Actions terminal non-success, no applicable result, the exact current claim and no unresolved material operation.

## App reference

The single-node reference uses one SQLite work-item mutex for O/claim/failure/material prepare/resolve while GitHub remains authority. Declared multi-instance use with that local SQLite domain is rejected.

Remote material writers use PREPARED/RESOLVE control-projection fencing; they do not rely on a precheck-only verification.
