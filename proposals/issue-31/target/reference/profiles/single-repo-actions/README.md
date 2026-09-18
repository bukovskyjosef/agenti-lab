# Single-repo Actions reference profile

This profile is the bounded Child #22 implementation layered on the R-approved Child #21 core at:

`7b155f8abd09f84c0065d64063eee3b2c3dce615`

It does not redefine `reference/core/*`, `reference/schemas/*` or T01–T19.

## Install from an assembled fixed agenti version

```bash
node reference/cli/agenti.mjs install \
  --target /path/to/project \
  --repository owner/repo \
  --human-login your-login \
  --human-actor-id 12345 \
  --default-branch main \
  --source-version <fixed-agenti-version> \
  --no-github
```

Commit the generated files, configure the provider secret, then:

```bash
cd /path/to/project
node .agenti-runtime/agenti.mjs setup-github --target .
node .agenti-runtime/agenti.mjs doctor --target . --github
```

`setup-github` creates/updates only the Agenti labels and repository variables it owns. It sets `AGENTI_TEST_MODE=false`, checks the configured required provider-secret metadata (the cost-min profile requires `CLAUDE_CODE_OAUTH_TOKEN`) and never prints secret values. `OPENAI_API_KEY` is optional unless a Human-authorized paid/budgeted routing policy explicitly makes the Codex API candidate reachable.

## Runtime authority

- GitHub Issue body/canonical project artifacts remain semantic authority.
- Exactly one `agenti-state:v1` Issue comment is the bounded O projection.
- Labels are UI projections only.
- GitHub events only wake O.
- O fresh-reads state and uses the shared Child #21 engine to determine the next already-authorized transition.
- A/D/R/P only start from explicit current assignments.
- Role results are durable comments normalized through the shared role-result schema.
- Role completion explicitly wakes O with `workflow_dispatch`; it does not rely on recursive comment/label events.
- `agenti-reconcile.yml` periodically reconstructs all managed work and repairs a missing dispatch when a current assignment has neither result nor durable run claim.

## GitHub-native I = Interface

Create intent through the installed Markdown Issue template or apply the configured intake label to an Issue.

I presents exact Human boundaries as comments; O remains the deterministic role/transition authority. Configured H principals may use:

```text
/agenti resolve <request-id>
<answer>

/agenti release grant <authorization-id>

/agenti release reject <authorization-id>
<reason>

/agenti stop <reason>

/agenti reopen <reason>

/agenti reconcile
```

Free-form comments and commands from actors outside configured H principals are untrusted data. I never chooses a role.

## Cost/capacity routing

The default routed profile prefers `claude-subscription` for A/D/R and deterministic P.

The Claude OAuth route is fail-closed under `paid_execution: FORBIDDEN`: it is not eligible for unattended execution unless trusted current billing-safety evidence proves `VERIFIED_NO_PAID_SPILLOVER`. OAuth-token presence alone does not satisfy this gate.

Codex remains installed as `codex-api-optional` but is not an automatic paid fallback in the default policy.

Capacity/rate-limit execution outcomes are written as trusted machine evidence and wake O. O applies existing T14 to reroute the same role/purpose or project durable wait. Before `wait.not_before`, periodic reconcile remains a no-op.

## Runner isolation

A and R model jobs have `contents: read` only. D model job also receives no GitHub write token and uses Codex workspace permission only. Provider credentials are passed only to their selected model job. Deterministic finalizer/writer/O/P jobs receive no Claude/OpenAI provider secret.

Deterministic jobs without the OpenAI secret:
- validate and apply A operations;
- capture/apply D patch and observe trusted PR/head facts;
- normalize/write R result;
- callback O.

Independent R always starts a fresh non-resumed action run and the deterministic preflight creates the trusted execution attestation before the provider is invoked.

## Publication boundary

P is not a model job. It is a separate privileged workflow. Immediately before merge it revalidates:
- exact current P assignment;
- PR/head candidate;
- current R approval and mutable R evidence;
- current required checks;
- target digest;
- exact current Human release authorization and mutable H evidence.

Any drift wakes O and aborts before the privileged write. P records publication facts but never sets Done.

## Test mode

The installed profile defaults to repository variable:

`AGENTI_TEST_MODE=false`

When explicitly set to `true`, A/D/R workflows use the bundled deterministic fake runner instead of Codex. This is only for conformance/E2E. The fake runner also refuses execution unless `AGENTI_TEST_MODE=true` is present in its process environment.

Real provider smoke must run with test mode off and with the exact selected route's required credential/safety evidence.


## Exclusive run claim

An explicit assignment is necessary but is no longer sufficient for material A/D/R/P execution. The deterministic preflight acquires the current work item's exclusive claim in the authoritative `agenti-state:v1` projection before provider work starts.

Claim bookkeeping has its own monotonic `claim_version`; it does not increment semantic `state_version` or change Child #5 `semantic_work_digest`.

All state/claim/material-writer jobs share:

```text
agenti-state-${{ github.repository_id }}-${{ inputs.issue_number }}
```

with queued non-cancelling serialization. Provider/model compute runs outside that group. All role jobs have bounded `timeout-minutes`.

When a bound Actions run reaches authoritative terminal non-success and no applicable result/material operation exists, periodic reconcile may CAS-terminalize that exact PLATFORM_RUN claim and redispatch the same still-current assignment. A successful run with no result is not guessed stale.

For a `NONE` recovery profile, only a configured Human principal may recover the exact current claim:

```text
/agenti claim recover <claim-id>
<reason>
```

The command never steals a different or superseded claim.
