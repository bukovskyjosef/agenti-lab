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

## Wait

If no eligible route exists, O writes a bounded routing wait with:

- reason;
- candidate;
- `not_before`;
- optional max-wait deadline;
- pending role/purpose/semantic digest.

Before due, reconcile is a cheap no-op/suppressed wake. At due, O fresh-reads evidence and reselects deterministically.

## T14

T14 is the only transient execution retry/reroute transition. It keeps the same role/purpose authority. A failure callback cannot change role authority; it only provides trusted current execution/capacity evidence to O.
