# Issue #31 validation evidence

## Exact dependency assembly

`assemble-and-validate.mjs` materializes:
- #21 `7b155f8abd09f84c0065d64063eee3b2c3dce615`
- #22 `666555f1ad9be4a4b3be3c1e9d78e392febcdeff`
- #23 `0edb4d496fdb64e8a194f97a198dac0a3777e2b1`
- #29 `3fa68aca5717e7f966f42dd976bfd11da71c6732`

and overlays the current #31 `target/reference/`.

## Historical implementation validation

Before independent review, combined run `35397660217` completed SUCCESS on tested head
`608973eb43bf64e317671955f43ae87a4b92127c`.
Independent R then reviewed final head
`9736f806ae8a65e7be1f40a80d028fee9ae9f3f6`
and returned three uncovered blocking contract gaps in PR review `5253134427` /
Issue comment `5736889844`:

- F1 — App mutation safety depended on an expiring SQLite lease while receiver/material paths used a separate process mutex;
- F2 — App receiver claim did not bind/revalidate an exact D base/target digest before provider authority;
- F3 — Actions D/P sink writes had no durable PREPARED/resolution lifecycle for crash-window reconstruction.

The prior green run is therefore historical evidence only and is not evidence for the corrected target.

## F1–F3 corrective implementation

### F1 — one non-expiring App mutation domain

The single-instance App now uses one non-expiring FIFO `WorkItemMutationFence` keyed by the authoritative control work item. Ordinary O processing and receiver/material/failure/recovery paths share that same fence. Expiring SQLite work leases remain operational queue/retry aids only.

Corrective conformance explicitly holds O beyond SQLite lease expiry, permits a second SQLite lease owner to appear, and proves the second authoritative receiver mutation still waits on the shared non-expiring fence.

### F2 — exact App pre-claim target binding

App assignment dispatch derives a role-specific immutable `claim.target_binding` and `claim.target_digest`. Initial D binds implementation repository default branch + exact SHA. Receiver preflight fresh-derives the target before claim acquisition and revalidates it after grant before returning provider authority.

Corrective conformance moves the D base between assignment issuance and receiver preflight and proves no active claim/provider authority is granted.

### F3 — durable Actions D/P sink reconstruction

Single-repo D and P writers now persist a deterministic claim-bound `material_operation: PREPARED` before push/merge and resolve it after the sink. O reconciles unresolved material operations before PLATFORM_RUN claim recovery:
- proven `NOT_APPLIED` may proceed to ordinary claim recovery;
- applied or ambiguous D/P outcomes become `HUMAN_ACTION_REQUIRED`;
- automatic blind redispatch is forbidden.

Corrective conformance covers:
- D push applied, semantic result absent;
- P merge applied, semantic result absent;
- P merge proven not applied and therefore retry-eligible.

## Corrective intermediate validation

Combined run `35402427808` on head
`a738d7396299f2c4164b665c0ebfe422dc753dc5`
completed **SUCCESS** after the F1–F3 runtime and conformance changes.

Observed proof included:
- core/routing/claims: **56/56 PASS**;
- both Project Profile doctors: PASS;
- routing static: **4/4 PASS**;
- claim/fencing static including F1–F3 guards: **11/11 PASS**;
- recovery: **4/4 PASS**;
- CAS/race: **6/6 PASS**;
- currentness: **5/5 PASS**;
- new F3 crash-window recovery: **3/3 PASS**;
- single-repo static: **5/5 PASS**;
- local E2E: PASS;
- multi-repo App: **23/23 PASS**, including the F1 lease-expiry race and F2 D base-drift regression;
- Docker build: PASS;
- assembler terminal result: `Child #31 combined exact-target validation: OK`.

After that run, only corrective documentation wording was synchronized with the already-tested runtime behavior.

## Final corrective proof rule

The temporary PR-only workflow
`.github/workflows/issue-31-validation.yml`
exists only to obtain CI evidence and is not part of the Child 6 review target.

After this validation record is committed:
1. one final combined run must complete SUCCESS on the exact documentation-complete implementation head;
2. no implementation/schema/conformance/normative-documentation change may occur after that green run;
3. the temporary validation workflow is then removed;
4. the final R review head may differ from the tested head **only** by deletion of that temporary workflow;
5. the final tested head/run and cleanup-only compare are recorded durably on Issue #31 / PR #39 handoff.
