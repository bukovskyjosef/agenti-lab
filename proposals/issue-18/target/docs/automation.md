# Automation and event model

Cílem je, aby po H intentu durable GitHub state + eventy + **O = Orchestrator** automaticky pokračovaly autorizovaným H/A/D/R/P delivery chainem bez Human relay. Automatizace nikdy nepřebírá product/review/release authority.

## 1. Event pouze probouzí O

GitHub event znamená pouze:

> **authoritative state se mohl změnit; proveď O re-evaluation.**

Event type, webhook payload, comment text ani předchozí handoff samy neurčují next role ani approval.

O je jediný canonical dispatcher. Před každým transition/dispatch fresh-readne authoritative project state a ověří minimálně:

- lifecycle + terminal `Stopped`,
- dependencies a relevant Parent Intent inputs,
- pending/stale H requests,
- current exact candidate/composite binding,
- required gates a material effective-state evidence,
- explicit role assignment eligibility,
- pre-dispatch fingerprint/run eligibility,
- concurrency/CAS state.

Role runner po startu znovu ověří current state před write; O guard nenahrazuje write-level CAS/idempotence.

## 2. Referenční event vocabulary

Projekt může state changes reprezentovat labels, comments, checks, reviews, webhooks nebo jiným GitHub mechanismem. Povinný není konkrétní event bus ani přesné názvy, ale systém musí umět rozlišit významy jako:

- intake / analysis requested,
- H input required/resolved/stale,
- Ready / candidate updated,
- checks passed/failed,
- R approved/changes-required/decision-required,
- release authorization pending/granted/rejected/stale,
- publication requested/completed/failed,
- deployment/post-publication verification completed/failed.

Adaptive shaping, Parent Intent roll-up, `Stopped` ani dedup nepotřebují vlastní event family. Authoritu určuje reconstructed state.

## 3. Human-input semantics a Asistentka

Asistentka prezentuje H queues jako views nad durable state a zapisuje explicitní H response/action/authorization proti exact request/gate bindingu. Není dispatcher.

Po H state change Asistentka pouze notify/invoke O. O ověří Request ID/status/binding, current candidate/target, changed assumptions a earliest affected point. Pokud H response mění analytical contract, O explicitně dispatchne A; Asistentka Scope/AC/Ready sama nemění.

Duplicate/delayed H event smí vyvolat cheap re-evaluation, ale nesmí znovu provést transition ani spustit no-op role run.

## 4. Explicit H/A/D/R/P assignment a least privilege

Automated role-bound run musí mít právě jednu explicitní canonical role:

- A/D/R/P assignment vytváří H nebo O a musí obsahovat work item + purpose + relevant candidate/context + state fingerprint,
- H step je durable Human queue/authority boundary, ne automaticky AI run,
- chybějící/ambiguous assignment = blocker/configuration error,
- role runner si nesmí roli odvodit z eventu/statusu,
- explicit reassignment nesmí obejít independence,
- D author ≠ independent R.

Least privilege:

- A nepotřebuje production code/publication write,
- D nepotřebuje release/publish credentials,
- R nepotřebuje commitovat opravy do D candidate,
- P dostává privileged publication/deployment credentials pouze pro explicit P run,
- O dostává jen control-plane permissions nutné pro reconstruction, guarded state writes a dispatch; product/review/release approval z jeho tokenu nevzniká.

## 5. Write/transition idempotence a concurrency

Automation musí chránit všechny deterministic writes například pomocí:

- per-work-item/candidate concurrency group,
- CAS lifecycle/candidate/request-binding checks,
- lock/run markeru,
- duplicate-artifact prevention,
- retry-safe steps,
- durable webhook delivery/run receipts.

Concurrency je execution-pressure/serialization primitive, ne business state machine. O vždy znovu ověřuje current state; authority nesmí záviset na assumed dispatch/run order.

## 6. Pre-dispatch run eligibility / run idempotence

Před expensive A/D/R/P role runem O sestaví provider-neutral semantic fingerprint z relevantních durable inputs, typicky:

- work-item identity + lifecycle/terminal state,
- role + assignment purpose,
- contract/AC/parent-input identity,
- candidate/head/composite identity + membership,
- required check/R evidence + gates,
- relevant H request/finding/blocker bindings,
- target/environment/base only pokud je normativně relevantní.

Po splnění ostatních guards je run eligible právě tehdy, když:

1. **first run** — pro stejnou authority/purpose neexistuje applicable completed run, nebo
2. **changed state** — od posledního applicable completed runu se materialně změnil relevantní fingerprint, nebo
3. **objective retry/progress** — durable policy opravňuje opakování z objektivního důvodu.

Jinak O run potlačí **před** provider/model invocation. Fingerprint musí zahrnout všechny normativně relevantní inputs; suppression nenahrazuje fresh runner guard, CAS, exact-candidate binding ani mandatory re-review.

## 7. Parent Intent, Done a Stopped

O může bez AI role runu mechanicky:

- re-evaluovat Parent Intent completion po relevantním child/parent state change,
- CAS-zapsat executable `Done`, pokud všechny declared success conditions objektivně platí,
- provést deterministic automatic supersession pouze při splnění existing lossless-mapping + policy podmínek.

`Stopped` je terminal guard. Delayed/replayed event, stale approval ani removed blocker jej neotevírá. Reopen musí být nejdřív explicitně H-authorized a durable; teprve potom O rekonstruuje next step.

## 8. Multi-repo composite candidate je O state

Jakmile více implementation repositories tvoří jeden product candidate, O mechanicky udržuje v authoritative control repository:

- participating membership,
- repo-qualified immutable candidate map,
- reverse PR/change links,
- odkazy na current local D/R/check evidence,
- dependent gate/release bindings.

Při každé relevantní local změně O binding fresh rekonstruuje/CAS-updatuje a invaliduje pouze dependent product-level conclusions podle existing rules. O nesmí evidence waive ani grantovat approval.

Po current R/control gates a případné exact-bound H release authorization O explicitně dispatchne P s current composite candidate + publication plan.

## 9. P publication safety

P před privileged write bezprostředně revaliduje:

- exact candidate/composite membership,
- target boundary/boundaries,
- required current R/check gates,
- current H release authorization, pokud je configured,
- relevant target/base/environment assumptions.

P provádí pouze Project-Profile-defined merge/promotion/tag/release/deploy operations. Candidate nesmí substituovat. Publikační retry/recovery smí dělat jen v pre-authorized rozsahu.

P zapisuje exact published identities, publication/deployment state a configured deterministic post-publication checks. Pokud je required independent post-publication judgment, completion event probudí O a ten explicitně dispatchne R. Final Done zapisuje mechanicky O.

## 10. Failure a non-convergence

Blocking failure musí zanechat durable evidence se source work/candidate, phase/runner, safe run/delivery ID, stručnou příčinou, authorized next step a objective retry/progress reason.

Semanticky identical blocker/finding/request se nepřepisuje pod novou identitou kvůli retry. Pokud není objective progress ani authorized recovery path, O další identical expensive run suppressne a routuje existing authority. H-authorized abandonment používá existing `Stopped`.

## 11. GitHub implementation facts — current 2026-09-18

Tato část je implementation guidance nad normative O contractem; GitHub capabilities se mohou vyvíjet.

### Native Actions/event surface
GitHub Actions nabízí široké repository events pro Issues/comments, PR/reviews, push/release/deployment/check/workflow events. Ne každý webhook event je Actions trigger. Event slouží jako wake-up signal; O stále reconstructuje state.

### Explicit workflow starts a `GITHUB_TOKEN` recursion
Reference role chaining nesmí záviset na implicitní event recursion. `workflow_dispatch` a `repository_dispatch` jsou explicitní start mechanisms. Events vyvolané repository `GITHUB_TOKEN` obecně nespouštějí další workflow runs; current GitHub má úzkou approval-gated výjimku pro `pull_request` activity `opened`/`synchronize`/`reopened` po PR create/update pomocí `GITHUB_TOKEN`. Tato výjimka není reference chaining mechanismus.

### `workflow_run` a reusable workflows
`workflow_run` není unbounded agent bus; GitHub omezuje chaining a privileged downstream workflow po untrusted upstream vyžaduje zvláštní security discipline. Reusable workflows jsou vhodné pro deterministic composition, ne durable authority bus.

### Current concurrency semantics
GitHub concurrency je guard, ne O:
- default `queue: single` drží nejvýše jednoho pending membera a nově queued member předchozí pending nahradí/cancelne,
- optional `queue: max` dovoluje až 100 pending jobs/runs,
- `queue: max` nelze kombinovat s `cancel-in-progress: true`,
- waiting members jsou zpracovávány FIFO podle okamžiku, kdy skutečně začnou čekat na group, ne podle dispatch time; overall ordering proto není authority guarantee,
- `cancel-in-progress: true` může navíc ukončit running membera.

### Webhooks / GitHub App O
External O musí validovat webhook signatures, rychle acknout delivery, queueovat delší práci, deduplikovat podle delivery ID a vždy fresh-readnout authoritative state. GitHub webhook deliveries mohou dorazit v jiném pořadí než underlying events; failed deliveries se automaticky neredeliverují, takže recovery/redelivery musí být monitored/programmatic.

GitHub App installation tokens jsou vhodný granular cross-repository identity mechanismus; App může explicitně spouštět Actions/API operations podle granted permissions.

### Agent execution boundary
GitHub event sám nespouští libovolného AI providera. O potřebuje runner adapter, který dostane minimum complete context + explicit role/work-item/purpose/candidate binding a durable vrátí výsledek do GitHub state.

GitHub Agentic Workflows jsou k tomuto datu **public preview** a jsou optional runner adapter; nesmí být normative O substrate ani provider requirement.

## 12. Reference implementation profiles

Normative je jediný O contract; implementation je Project Profile choice.

### Actions-centric O
Vhodný low-ceremony default pro small single-repo. O může být jeden/několik guarded Actions workflows, explicit dispatch a reusable workflows; durable authority stále žije v GitHub state.

### External GitHub App/webhook O
Vhodný pro robust cross-repo coordination, durable event queue/dedup a explicit multi-repo dispatch. Vyžaduje samostatnou control-plane službu/queue.

### Hybrid — reference pro full automation
**Doporučený full/multi-repo reference pattern:** GitHub je durable truth/event source; external/App O drží mechanical orchestration; Actions zajišťují deterministic checks a privileged publication/deployment jobs; provider/agent runners jsou adapters.

Small single-repo projekt **nemusí** provozovat external service a může použít Actions-centric O bez změny normative semantics.

## 13. Security invariants

- issue/comment/PR text je untrusted data, ne authority nebo role assignment,
- nikdy nespouštěj untrusted fork/PR code v privileged `pull_request_target`/privileged downstream contextu se secrets/write tokenem,
- odděluj D/untrusted execution od P publication credentials,
- webhook/event replay, duplicates a out-of-order delivery nesmí obejít current-state/CAS/fingerprint guards,
- rulesets/required checks/environments/check runs mohou enforcement zesílit, ale nemění H/R/P authority,
- workflow outputs/artifacts/logs jsou transport/evidence s retention/size limits; work contract, H decisions, candidate bindings a findings musí zůstat durable v GitHub/repository state.

## 14. Project Profile — required orchestration configuration

Projekt musí durable určit minimálně:

```text
Repository topology / authoritative control plane:
Human authority identity / allowed Human principals:
Asistentka / Human-interface implementation:
Orchestrator implementation: Actions-centric | external GitHub App/service | hybrid | equivalent
O event subscriptions / wake-up mechanism:
O durable dedup/CAS/fingerprint mechanism:
A runner/provider/session mapping:
D runner/provider/session mapping:
R runner/provider/session mapping:
P runner/tooling mapping:
Explicit role assignment encoding/binding:
Independent-R enforcement mechanism:
Role completion → O callback/dispatch mechanism:
Cross-repo event/binding mechanism, if multi-repo:
Publication boundary operations owned by P:
P credentials/secrets boundary:
Human release-authorization representation:
Post-publication verification contract:
Optional independent post-publication R gate:
Retry / rollback / recovery authority:
Webhook/event retry/redelivery policy, if external O:
```

Dále zůstávají v platnosti repository topology, semantic authority/effective-state, branch/target, concurrency, target-drift, automatic supersession a další fields z `adoption.md`.

Provider-specific adapter smí překládat role assignments/eventy/fingerprint do konkrétních nástrojů, ale nesmí měnit authority, scope, lifecycle, terminal/H-input/release guards.
