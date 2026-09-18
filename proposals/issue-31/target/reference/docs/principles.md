# Principles — exclusive execution ownership

Assignment is authority to attempt one role/purpose. It is not live execution ownership.

Every material A/D/R/P run must additionally own the exact current exclusive claim for its executable work item. At most one such claim is active per work item.

The durable GitHub O projection remains workflow authority. Operational mutexes, GitHub Actions concurrency groups and App SQLite state serialize operations but never become authority.

All authoritative mutations of one work item share one serialization domain keyed by the authoritative control work item. This includes claim acquire/recovery, semantic O projection, Stop/drift/H mutations and non-native-fenced material writes.

Claim bookkeeping uses monotonic `claim_version`, separate from semantic `state_version`. Acquiring or renewing a claim does not self-stale an assignment and does not alter Child #5 `semantic_work_digest`.

A chat/handoff message cannot grant, steal, revoke or recover a claim. Human override is durable and exact-claim bound.
