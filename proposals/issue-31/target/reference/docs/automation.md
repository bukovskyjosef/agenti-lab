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

The single-node reference uses one non-expiring in-process FIFO work-item fence for O/claim/failure/recovery/material prepare/resolve while GitHub remains authority. Expiring SQLite leases are operational queue/retry aids only. Declared multi-instance use with that process-local domain is rejected.

App dispatch envelopes carry a freshly derived role-specific claim target digest. Receiver preflight re-derives and revalidates that target before and immediately after claim grant; an initial D run therefore cannot start against a moved implementation default/base SHA.

Remote material writers use PREPARED/RESOLVE control-projection fencing; they do not rely on a precheck-only verification. Single-repo Actions D/P writers likewise persist PREPARED before push/merge and resolve the sink afterward. A failed run with missing semantic result must reconstruct the exact sink outcome before claim recovery; applied or ambiguous outcomes require Human reconciliation instead of blind redispatch.
