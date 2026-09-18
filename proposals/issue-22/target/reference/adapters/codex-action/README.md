# Codex Action adapter

Concrete reference adapter for A/D/R only. The provider-neutral protocol remains owned by Child #21.

Pinned action:

`openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e`

The exact pin is deliberate. Updating it changes executable supply-chain input and requires review.

## A

Model job:
- GitHub `contents: read`;
- Codex `:read-only`;
- structured analyst proposal schema.

Deterministic finalizer:
- no OpenAI secret;
- re-fetches current assignment/state;
- normalizes against shared Child #21 role-result schema;
- applies only allowlisted contract operations with exact digest preconditions;
- writes durable result;
- explicitly dispatches O.

## D

Model job:
- GitHub `contents: read`;
- Codex `:workspace`;
- no GitHub write/P credential;
- structured proposal does not contain authoritative candidate facts.

Deterministic candidate writer:
- no OpenAI secret;
- consumes captured patch artifact;
- rechecks current assignment;
- applies to exact authorized base;
- writes deterministic `agenti/issue-N` branch/PR;
- fresh-reads exact PR head/base;
- injects trusted candidate/change-artifact facts before shared normalization;
- writes durable result and explicitly dispatches O.

## R

Model job:
- fresh non-resumed invocation;
- exact candidate checkout;
- GitHub `contents: read`;
- Codex `:read-only`;
- structured canonical R result.

Preflight creates wrapper/platform execution attestation before Codex invocation. Shared core rejects an execution instance that collides with D author identities.

## Secret boundary

The OpenAI key is referenced only in Codex model steps through the action input. Writer/finalizer/O/P jobs do not receive it. P credentials are confined to the deterministic P workflow.
