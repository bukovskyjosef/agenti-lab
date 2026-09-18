# Provider-neutral execution routing

Routing answers only: **which already-authorized runner may execute this role assignment now?**

It does not answer: **which role should run next?** That remains T01–T19/O authority.

## Identity split

`semantic_work_digest` binds semantic work:

- work item;
- role/purpose;
- contract;
- candidate;
- durable gate/H/target inputs.

It intentionally excludes state-version increments, capacity observations and route-attempt bookkeeping.

The existing assignment freshness fingerprint remains stricter and includes current state/version and execution-route binding.

## Candidate eligibility

Ordered selection filters candidates by:

1. capability profile;
2. billing authority/safety;
3. current capacity evidence.

A strict included-allowance candidate is fail-closed when no trusted current no-spillover evidence exists.

`INCLUDED_ALLOWANCE` is always a **no-incremental-spend** class. A candidate in this class must not declare `incremental_paid_usage: true`, even when the policy also allows paid execution. Changing a policy to `ALLOWED_WITH_BUDGET` never bypasses the included candidate's no-spillover safety gate. Any paid overflow must be represented as a separate `PREPAID_CREDIT` or `METERED` candidate with explicit budget authority and a hard enforceable limit.

## Wait

If no eligible route exists, O writes a bounded routing wait with:

- reason;
- candidate;
- `not_before`;
- optional max-wait deadline;
- pending role/purpose/semantic digest.

Before due, reconcile is a cheap no-op/suppressed wake. At due, O fresh-reads evidence and reselects deterministically.

The supported bounded-wait terminal policy is `on_max_wait: HUMAN`. When `max_wait_deadline` is reached, O does **not** re-project another wait: existing T15 produces the Human boundary, clears the routing wait and stops provider polling until Human resolution. Unsupported BLOCK/FAIL modes are intentionally schema-invalid rather than dead policy.

## T14

T14 is the only execution retry/reroute transition for accepted routing-capacity failures. It keeps the same role/purpose authority. Accepted `TEMPORARILY_EXHAUSTED`, `RATE_LIMITED` and routing-recoverable `UNAVAILABLE` evidence are all T14-routable. A failure callback cannot change role authority; it only provides trusted current execution/capacity evidence to O.
