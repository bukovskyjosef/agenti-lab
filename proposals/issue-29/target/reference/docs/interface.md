# I = Interface

`I` is the canonical system function that connects the Human authority boundary to the durable workflow.

## What I may do

I may:

- present current Human Input Requests;
- present release/stop/reopen decisions that require H;
- transport configured Human commands/responses;
- render current workflow status, evidence references and next required Human action.

## What I may not do

I may not:

- choose A/D/R/P;
- create workflow authority;
- approve review findings;
- infer Human decisions;
- publish;
- mutate the deterministic transition table;
- appear as an assignment role or role-result discriminator.

The canonical role set remains exactly `H/A/D/R/P`.

## Implementations

In the single-repo Actions profile, GitHub Issues/comments/labels provide the reference I surface.

In the multi-repo profile, the control Issue remains the reference durable Human surface. A richer UI may be added later, but it must remain transport/presentation only and must not become another authority store.

Free-form data from non-configured Human principals is untrusted input.
