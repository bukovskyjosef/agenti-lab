# Single-repo conformance

## Local fixture

After overlaying the R-approved Child #21 `reference/` with this Child #22 `reference/`:

```bash
node --test reference/conformance/single-repo-actions/static.test.mjs
node --test reference/conformance/single-repo-actions/local-e2e.test.mjs
```

The lab helper `proposals/issue-22/assemble-and-validate.mjs` performs the exact overlay and also reruns the Child #21 core suite/doctor.

## Real GitHub E2E

Run only against a disposable repository after installing/committing the profile and running `setup-github`.

The command uses the currently authenticated `gh` actor for actual Human authority commands. That actor must be listed in `.agenti/project-profile.json`.

```bash
node .agenti-runtime/conformance/single-repo-actions/github-e2e.mjs \
  --repo owner/disposable-repo \
  --scenario happy \
  --confirm-disposable yes
```

Scenarios:
- `happy` — fake A/D/R → exact H release → deterministic P → Done.
- `defect` — fake R returns CHANGES_REQUIRED once, O routes D, second candidate is approved, then release/P/Done.
- `human` — fake A raises HIR; exact configured H resolves it; chain resumes and reaches Done.
- `stale` — reaches release gate, mutates candidate head externally, proves old R/H/P path becomes stale and no P assignment is created.
- `stopped` — configured H stops the work, explicit reconcile cannot resume/change terminal state.
- `provider-smoke` — sets test mode off and runs actual Codex A/D/R until exact release gate, then configured H rejects publication. This proves provider invocation without merging the smoke candidate.

The harness always resets `AGENTI_TEST_MODE=false` in cleanup. Use `--keep` only when retaining sandbox artifacts is intentional.

This helper is conformance tooling, not workflow authority.
