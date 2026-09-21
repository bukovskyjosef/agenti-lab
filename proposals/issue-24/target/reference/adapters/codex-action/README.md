# Codex Action adapter — experimental / unverified

This adapter implementation is shipped as an **experimental, unverified example** for A/D/R. It is **not release-supported and is not represented as proven runnable** by this publication because Issue #24 has no live `OPENAI_API_KEY` smoke evidence.

The provider-neutral protocol is owned by the shared published control plane. Enabling this adapter in an adopting project is an explicit project policy choice and requires its own credential, spend/budget authority and live validation.

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

## Release support status

`EXPERIMENTAL_UNVERIFIED_NOT_RELEASE_SUPPORTED`

Presence of workflow/templates or a pinned upstream action is not a support claim. The stock published routing policy does not select this adapter.
