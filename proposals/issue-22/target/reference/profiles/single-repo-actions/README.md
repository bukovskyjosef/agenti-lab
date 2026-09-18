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

`setup-github` creates/updates only the Agenti labels and repository variables it owns. It sets `AGENTI_TEST_MODE=false`, configures `AGENTI_CODEX_SECRET_NAME`, checks only secret metadata, and never prints secret values.

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

## GitHub-native Human interface

Create intent through the installed Markdown Issue template or apply the configured intake label to an Issue.

O/Asistentka presents exact Human boundaries as comments. Configured H principals may use:

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

Free-form comments and commands from actors outside configured H principals are untrusted data. Asistentka never chooses a role.

## Runner isolation

A and R model jobs have `contents: read` only. D model job also receives no GitHub write token and uses Codex workspace permission only. The OpenAI credential is passed only as the Codex Action input.

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

Real provider smoke must run with test mode off.
