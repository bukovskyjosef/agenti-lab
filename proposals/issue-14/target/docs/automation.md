# Automation and event model

Cílem je, aby běžný work item procházel rolemi bez Human relay, ale automatizace nikdy nepřevzala produktovou nebo release autoritu a nespouštěla drahé role runs bez objektivního důvodu.

## 1. Trigger není autorita ani run eligibility

Event pouze říká „stav se mohl změnit“. **Orchestration function je jediný canonical dispatcher.** Před dispatch znovu načte authoritative project GitHub/repository state podle Project Profile a ověří:

- že work item není terminal `Stopped`,
- že další krok je stále povolený current lifecycle/dependencies/gates,
- že dispatchuje právě jednu explicitně aktivní canonical role,
- že run splňuje pre-dispatch eligibility/dedup z oddílu 7.

Runner po startu stále musí před write akcí znovu ověřit current state a své authority boundaries; pre-dispatch guard nenahrazuje write-level CAS/idempotence.

To platí i pro Human response: `HUMAN_INPUT_RESOLVED` není příkaz „pokračuj“, ale pouze trigger k nové state reconstruction.

U executable child work itemu zahrnuje authoritative state také aktuální `Parent Intent` a inherited parent authorization inputs, na které child durable odkazuje. Child trigger nesmí obejít pozdější parent změnu.

Asistentka může orchestration technicky invoke/present jako Human-facing interface, ale nevytváří druhé routing rozhodnutí.

## 2. Referenční event vocabulary

Projekt může eventy mapovat na GitHub native state, labels, comments, checks, webhooks nebo jiný mechanismus. Nemá vytvářet duplicitní pseudo-ERP, pokud GitHub již pravdu reprezentuje.

Sémanticky musí umět rozlišit alespoň:

- `INTAKE_CREATED`
- `ANALYSIS_REQUESTED`
- `HUMAN_INPUT_REQUIRED`
- `HUMAN_INPUT_RESOLVED`
- `READY_FOR_EXECUTION`
- `IMPLEMENTATION_READY`
- `CHECKS_PASSED` / `CHECKS_FAILED`
- `REVIEW_APPROVED`
- `REVIEW_CHANGES_REQUIRED`
- `REVIEW_DECISION_REQUIRED`
- `RELEASE_AUTH_REQUESTED`
- `RELEASE_AUTH_GRANTED`
- `RELEASE_AUTH_REJECTED`
- `RELEASE_AUTH_STALE`
- `INTEGRATION_REQUESTED`
- `INTEGRATION_COMPLETED` / `INTEGRATION_FAILED`
- `DEPLOYMENT_VERIFIED` / `DEPLOYMENT_FAILED`

Adaptive shaping/decomposition, `Stopped`, Parent Intent roll-up ani run dedup nevyžadují novou mandatory event family. Mohou být reprezentovány existujícím/native durable state a změnovými triggery; autoritu určuje reconstructed state, ne event name.

## 3. Human-input event semantics

Generic Human Input Request contract vlastní `work-item.md`; resume a invalidation vlastní `delivery-cycle.md`.

`HUMAN_INPUT_REQUIRED` znamená, že existuje `PENDING` durable request a dotčený přechod nesmí pokračovat. Event musí být svázaný alespoň s autoritativním work itemem a Request ID; podle requestu také s relevantním repository/PR/candidate/target/run binding.

`HUMAN_INPUT_RESOLVED` znamená, že request mohl získat durable Human resolution. Orchestrace/runner před pokračováním musí ověřit alespoň:

- authoritative work item identity/state,
- Request ID a aktuální request status,
- že request není `STALE` a jeho context binding stále odpovídá current state,
- current candidate/PR/target identity tam, kde je relevantní,
- validity required gates,
- zda Human odpověď změnila canonical contract nebo assumptions některého předchozího gate,
- zda response vyžaduje analytical contract mutation, a tedy explicitní Analyst dispatch.

Teprve potom orchestrace odvodí lifecycle/role/next action od nejdříve dotčeného bodu. Delayed event pro starý Request ID nebo změněný binding musí skončit bez role dispatch/write akce.

Duplicate `HUMAN_INPUT_RESOLVED` smí opakovat levnou state evaluation, ale nesmí duplicitně provést transition/action ani spustit semanticky totožný drahý role run.

V `multi-repo` žije generic request/resolution s autoritativním work itemem v control/governance repository. Implementation runner může event pozorovat, ale před pokračováním musí znovu načíst control-repository state a repo-qualified local evidence uvedenou v bindingu.

Configured release authorization zůstává samostatnou event/gate rodinou `RELEASE_AUTH_*`; generic Human-input eventy ji nenahrazují ani neudělují.

## 4. Human queues

Asistentka pracuje nad views odvozenými z durable state:

- všechny `PENDING` generic Human Input Requests,
- intake needing Human clarification,
- product/governance decision queue,
- release authorization queue.

Asistentka durable transportuje explicitní Human answer/authorization do správného request/gate. Z odpovědi sama neodvozuje nový Scope/AC/Ready contract a sama nevybírá next role; změnu state předá canonical orchestration function.

Specializované views mohou ukazovat stejný underlying durable stav vhodným způsobem; nevytvářej separátní ručně udržovaný backlog.

## 5. Explicit active role a least privilege

Canonical role je authority/function context, ne nutně samostatná provider session. Automated dispatch však musí každému role-bound runu předat právě jednu explicitní active role.

- role assignment pochází z durable orchestration assignmentu nebo explicitního Human assignmentu,
- runner nesmí roli inferovat z eventu, work-item statusu nebo očekávaného next stepu,
- chybějící/ambiguous role assignment je durable configuration/blocker condition; provider run se nespustí,
- role transition ve stejné technické/modelové session musí být explicitní a sekvenční,
- mandatory independence/least privilege přebíjí session reuse.

Technická oprávnění mají co nejvíce odpovídat aktivní roli:

- Analyst/Asistentka nepotřebují produkční code write,
- Reviewer nepotřebuje commitovat opravu do autorovy branch,
- Integrator nepotřebuje produktovou decision/release-approval authority,
- deployment credentials se zpřístupňují pouze kroku, který je skutečně potřebuje.

Human-only credential/access request nesmí vést ke kopírování secret values do Issue; durable request uchovává pouze bezpečný požadavek a completion evidence.

## 6. Write/transition idempotence a concurrency

Automatizace musí zabránit dvojímu provedení stejného přechodu nebo write akce.

Použij podle platformy například:

- per-Issue/per-PR concurrency group,
- lock/run marker,
- compare-and-set kontrolu lifecycle/candidate identity,
- compare-and-set kontrolu Human Request ID/status/context binding,
- deduplikaci follow-up artefaktů,
- deduplikaci automated child creation a parent↔child linkage,
- retry-safe kroky.

Automation nesmí pokračovat přes transition guard, dokud relevantní request zůstává `PENDING`. `STALE` request se nesmí automaticky změnit zpět na resolved/current jen proto, že dorazil opožděný event nebo odpověď.

Před vytvořením nebo spuštěním executable child orchestrace znovu načte authoritative Parent Intent + child state, ověří durable parent relationship a inherited authorization inputs. Retry decomposition nesmí vytvořit duplicate child pro stejný plánovaný scope unit.

Pokud se Parent Intent změní, orchestrace nepovažuje všechny children mechanicky za stale. Identifikuje affected children podle jejich durable parent-input dependencies a použije earliest-affected-point pravidla z `delivery-cycle.md`. Delayed nebo již queued run affected child se zastaví, pokud current authoritative state už jeho předchozí `Ready`/next action nepovoluje; unaffected children mohou pokračovat.

## 7. Pre-dispatch run eligibility / run idempotence

Write-level idempotence nestačí: orchestrace musí zabránit i zbytečnému vytvoření drahého Analyst/Developer/Reviewer/Tester/Integrator role runu, pokud se pro něj relevantní semantic state nezměnil.

Před provider/model dispatch vytvoří nebo rekonstruuje **semantic state fingerprint** pro konkrétní zamýšlenou active role. Fingerprint je provider-neutral koncept a obsahuje pouze relevantní durable vstupy, typicky:

- authoritative work-item identity + lifecycle/terminal state,
- active role / assignment purpose,
- relevantní contract/requirements/AC/parent-input version nebo content identity,
- candidate/head/composite-candidate identity a repository membership,
- required check/test/review evidence a gate statuses,
- relevantní Human Request/finding/blocker IDs + statuses/bindings,
- target/environment/base state pouze pokud je pro daný run normativně relevantní.

Projekt nemusí používat cryptographic hash; může použít durable version tuple, content IDs nebo jiný deterministický ekvivalent. Project Profile/provider adapter musí určit, jak se fingerprint persistuje/porovnává.

### Eligibility rule

Po splnění current lifecycle/dependency/gate/terminal/active-role guardů je nový role run eligible právě tehdy, když platí alespoň jedna z těchto podmínek:

1. **First run:** pro stejnou authority/purpose ještě neexistuje žádný applicable completed run; aktuální již autorizovaný run se proto nesmí potlačit jen kvůli absenci předchozího fingerprintu,
2. **Changed state:** applicable completed run existuje a od něj došlo k material change relevantního fingerprintu, **nebo**
3. **Objective retry/progress:** existuje durable objektivně validní progress reason podle `delivery-cycle.md`, který opakování opravňuje i bez změny contract/candidate (např. Project Profile-authorized retry transient external operation s novým execution contextem).

First-run eligibility není bypass ostatních guardů: terminal `Stopped`, chybějící/ambiguous active role, nesplněný lifecycle/dependency/gate nebo jiný blocking stav run stále zakazují.

Pokud applicable completed run existuje a neplatí ani changed-state ani objective retry/progress podmínka, orchestrace run potlačí **před** provider/model invocation. Duplicate/replayed event může skončit levnou state/fingerprint evaluací bez token/context churn.

Run fingerprint guard nesmí potlačit běh jen proto, že se změna odehrála mimo zvolený fingerprint; proto fingerprint musí zahrnovat všechny a pouze normativně relevantní inputs dané role/purpose.

Pre-dispatch suppression nenahrazuje:

- fresh state reconstruction uvnitř runneru před write,
- CAS/concurrency guards,
- exact-candidate binding,
- mandatory re-review tam, kde se skutečně změnil review input.

## 8. Completion roll-up a terminal guards

### Parent Intent / Done

Když se změní completion-relevant child/parent state, orchestrace může provést levnou Parent Intent re-evaluation bez spuštění samostatného AI role runu:

1. re-read parent + current child set + completion evidence,
2. ověř current binding a že parent není `Stopped`,
3. mechanicky vyhodnoť durable overall completion condition,
4. CAS-zapiš `Done` pouze pokud condition objektivně platí,
5. pokud je nutný domain judgment, dispatchni explicitní roli/Human input místo jeho vymýšlení.

Stejný pattern platí pro final executable `Done`: role/runner produkuje required evidence, orchestrace provádí mechanický guarded lifecycle close-out.

### Stopped

Jakmile authoritative work item říká `Stopped`, orchestrace musí před jakýmkoli role dispatch/retry ověřit explicitní authorized reopen/current-state transition. Delayed/replayed events, staré approvals/resolutions ani změna externího stavu nesmějí terminal guard obejít.

Deterministic automatic `SUPERSEDED_OR_OBSOLETE` transition je dovolen pouze pokud authoritative replacement/current work item už existuje a Project Profile/project policy explicitně automatic supersession dovoluje; jinak automation pouze připraví evidence/Human decision path.

## 9. Multi-repo composite candidate automation

Jakmile current work item vyžaduje více participating implementation repositories, orchestrace může explicitně dispatchnout Integrator function už před product-level approval, aby mechanicky udržovala product-level composite binding v control repository.

Integrator automation:

- CAS-agreguje repo-qualified immutable candidate identities/membership,
- udržuje reverse links a odkazy na local evidence,
- při local change binding znovu sestaví a revaliduje,
- neposouvá product-level approval/release gate, pokud local evidence chybí/selhala,
- žádnou approval/product authority sama nezískává.

Local implementation/review jobs zůstávají v příslušných implementation repositories.

## 10. Role isolation

Automatické chaining nesmí zrušit nezávislost control role. Implementační a independent review run musí být různé logical working instances; Reviewer nesmí dostávat skrytý reasoning autora jako náhradu za durable artefakty.

Stejně tak deterministic resume nesmí záviset na zachování skrytého reasoning/session stavu role, která Human request vytvořila.

Safe sequential reuse jedné session pro kompatibilní ne-independent role je dovoleno pouze s explicitní role transition a se změnou effective least-privilege contextu tam, kde je to technicky možné.

## 11. Durable failure a non-convergence

Failure, který zastaví tok, zanechá durable blocker. Nestačí transient CI log.

Blocker má obsahovat zdroj práce, fázi/runner, bezpečný run link/ID, stručný stav, autorizovaný next step a zda další attempt má objective progress/retry reason. Nekopírují se secrets ani nepotřebný raw log dump.

Pokud next step vyžaduje Human input, blocker vytvoří nebo odkáže přesný Human Input Request místo očekávání odpovědi pouze v chatu.

Semanticky identický blocker/finding/request se při retry znovu nevytváří jen s novým ID; existing durable artifact se aktualizuje/resolvuje/stale označí.

Pokud current loop nemá objective progress a žádný další already-authorized recovery/corrective path, orchestrace další identický drahý run potlačí a vytvoří/routuje durable non-convergence escalation podle `delivery-cycle.md`. Human-authorized abandonment používá existing `Stopped`, nikoli druhý termination mechanismus.

## 12. Release authorization safety

Automation smí požádat o approval a následně ověřit jeho status. Nesmí approval udělit.

Před integrací ověří:

- candidate/composite-candidate identity,
- target boundary/boundaries,
- required gate validity,
- že approval není stale,
- že od approval nenastala změna, kterou Project Profile považuje za invalidující.

U `multi-repo` se tato kontrola provádí nad current composite candidate udržovaným Integrator function, ne nad jednotlivými PRs izolovaně.

Generic Human response ponechá release approval platný jen tehdy, pokud nezměnila jeho bound candidate/target nebo jiný závislý input/assumption; jinak se použijí normální `RELEASE_AUTH_STALE` semantics.

## 13. Provider adapters

Claude/Codex/IDE/runner-specific instrukce jsou adaptér. Smějí překládat obecné role, explicit role assignments, eventy a semantic fingerprint do konkrétních nástrojů, ale nesmí měnit authority, scope, lifecycle, terminal guards, Human-input guards nebo control gates.

## 14. Project Profile — povinná automatizační konfigurace

Projekt musí durable určit minimálně:

- repository topology a canonical ownership podle `adoption.md`; u `multi-repo` zejména control repository, implementation repository set, work-item/decision locations, cross-repository binding a composite candidate identity rule,
- canonical docs map,
- production-authoritative boundary/boundaries,
- task branch a PR target policy,
- required checks/control gates,
- Human release authorization policy podle environment/work class,
- deployment trigger a environments,
- minimum post-release verification,
- rollback/retry/recovery authority,
- canonical role → provider/runner/session mapping a způsob explicitního role assignment/transition,
- pre-dispatch semantic fingerprint / run-eligibility/dedup mechanism,
- concurrency / shared-surface conventions,
- případnou policy pro target/base drift po release approval,
- případnou deterministic automatic supersession policy; pokud není explicitně definovaná, supersession termination vyžaduje Human authority.

Generic Human-input subflow ani adaptive shaping/decomposition nepotřebují vlastní Project Profile queue/location: používají autoritativní work item/control plane a native GitHub relationships už určené repository topology.