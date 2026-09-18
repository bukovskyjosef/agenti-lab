# Adoption guide

Cílem adopce je vytvořit v cílovém projektu **samostatný a cold-startable agentní systém** podle tohoto standardu. Běžný agent v cílovém projektu nemá potřebovat znovu číst `agenti`.

## 1. Nejprve audituj cílový projekt

Výchozí a referenční topologie je `single-repo`. `multi-repo` používej pouze tehdy, když existující durable stav nebo Human rozhodnutí určuje právě jeden autoritativní control/governance repository a jeden nebo více implementation repositories.

Než něco vytvoříš:

- najdi existující README/AGENTS/governance,
- zjisti, zda projekt skutečně používá `single-repo` nebo `multi-repo`,
- u `multi-repo` nejdřív identifikuj control/governance repository a z něj relevantní implementation repositories; nepovažuj více repozitářů za rovnocenné governance autority,
- identifikuj product intent/context authority a business/domain/API/data dokumenty potřebné k interpretaci produktu,
- pro významné truth-bearing artifact families zjisti jejich semantic purpose, authority scope, binding/currentness a vztah k upstream/downstream authority,
- zjisti, kde se declared/design state může lišit od effective runtime/platform state a jaká evidence nebo equivalence rule dokládá effective current state,
- zjisti branch a release model,
- zjisti CI/CD, environments a deployment platformu,
- najdi existující Issues/PR conventions,
- zjisti, jak jsou canonical H/A/D/R/P role mapované na provider/runner/session, jak se role explicitně aktivují a jak jsou implementované Asistentka + O,
- zjisti, jak se dnes potlačují duplicate/no-op role runs a jak se eviduje retry/non-convergence,
- odstraň nebo explicitně vyřeš konkurenční zdroje pravdy místo jejich slepého duplikování.

Pokud je repository topology, control authority, product/domain semantic authority, effective-state evidence nebo role assignment nejasný a tato nejasnost je materiální pro bezpečnou adopci, nevymýšlej ji — vytvoř odpovídající Human decision/configuration blocker.

## 2. Vytvoř Project Profile

Project Profile je projektově konkrétní instancí tohoto standardu. Musí určit alespoň:

```text
Repository topology: single-repo | multi-repo
Repository / authoritative control plane:
Product intent / context authority:
Canonical documentation / semantic authority map:
Effective-state evidence / declared→effective equivalence for relevant surfaces:
Human authority identity / allowed Human principals:
Production-authoritative boundary / boundaries:
Task branch policy:
PR target policy:
Required default control gates:
Human release authorization policy:
Deployment trigger:
Environments:
Post-release verification minimum:
Retry / rollback / recovery authority:
Asistentka / Human-interface implementation:
Orchestrator implementation: Actions-centric | external GitHub App/service | hybrid | equivalent
O event subscriptions / wake-up mechanism:
O durable dedup / CAS / semantic fingerprint mechanism:
A runner / provider / session mapping:
D runner / provider / session mapping:
R runner / provider / session mapping:
P runner / tooling mapping:
Explicit role assignment / transition encoding:
Independent-R enforcement mechanism:
Role completion → O callback / dispatch mechanism:
Publication boundary operations owned by P:
P credentials / secrets boundary:
Post-publication verification contract:
Optional independent post-publication R gate:
Concurrency / shared-surface conventions:
Target-drift policy after release approval:
Deterministic automatic supersession policy: explicit rule | disabled
```

`Product intent / context authority` nemusí být nový samostatný soubor. Může odkazovat existující README, product specification nebo jiný current canonical source.

`Deterministic automatic supersession policy` může být `disabled`; pokud projekt explicitně nepovolí přesně definovaný automatic supersession případ, `Stopped` z důvodu supersession vyžaduje Human authority. I když je automatic supersession povolen, source work se nesmí uzavřít jako superseded dříve, než je rekonstruovatelný lossless source→replacement mapping podle `work-item.md`.

### Semantic authority map invariant

Canonical documentation / semantic authority map nemusí používat pevnou taxonomy ani metadata schema. Musí však umožnit cold-start agentovi pro **významné truth-bearing artifact families** určit tam, kde je to relevantní:

- semantic purpose / fact domain,
- authority scope — které facts artefakt autoritativně určuje,
- binding effect na implementation/review/runtime work,
- currentness — current canonical, derived/explanatory, effective-state evidence nebo historical/snapshot/superseded význam; projekt může použít jiné názvy,
- upstream/downstream vztah nebo precedence potřebnou k řešení konfliktů,
- conflict behavior — který source rozhoduje daný typ faktu a který artefakt je při rozporu stale/defective/incomplete.

Authority je fact-domain-scoped, nikoli globální žebříček všech souborů. Například live platform evidence může být autoritativní pro fakt „co je právě deploynuto“, ale nesmí přepsat product/domain authority pro fakt „jaké chování je autorizováno“.

Technical/executable artifact nesmí z executability/enforcementu odvodit product/domain authority. Historical/snapshot/superseded artifacts jsou pro current-state reconstruction non-current by default, dokud je current authority explicitně nereaktivuje/reassignuje.

Malý `single-repo` projekt může tento invariant splnit několika stručnými entries v existujícím Project Profile/docs mapě. Standard nevyžaduje nový document tree, local authority headers ani samostatný registry/provenance systém.

### Effective-state invariant

Pro surface, kde se versioned declaration může lišit od skutečného platform/runtime state, Project Profile/map určí effective-state source/evidence nebo deterministickou equivalence rule.

- design/config artifact sám dokládá declared/intended state,
- current effective-state claim používá relevantní effective evidence, pokud je tento fakt materiální pro work contract/gate,
- pokud autorizovaná role effective source nemůže inspectovat, zaznamená unverified boundary/blocker místo tvrzení equivalence,
- projekt s deterministickou Git→effective-state equivalence může tuto vazbu deklarovat jednou a nemusí zavádět recurring manual inspection.

### Role/system-function mapping invariant

Project Profile rozlišuje authority roles od system functions:

- canonical role jsou právě H/A/D/R/P,
- Asistentka je Human interface a nevybírá next role,
- O je jediný mechanical dispatcher/control plane,
- A/D/R/P run má právě jednu explicitní active role,
- H nebo O vytváří explicit role assignment; runner si roli neinferuje,
- compatible session reuse je možný jen po explicit reassignmentu,
- mandatory independence zůstává: D/author a independent R jsou různé logical instances,
- P publication context má oddělené privileged credentials a nesmí být D/R authority.

Pokud automated run nemá jednoznačný active-role assignment, provider/model se nespustí. O/Asistentka se nesmí maskovat jako delivery role jen proto, že jejich implementation používá AI/provider session.

### Run-eligibility invariant

Project Profile musí určit provider-neutral mechanismus, kterým O před drahým role runem vyhodnotí relevantní semantic state fingerprint a případný poslední applicable completed run stejné authority/purpose. Může jít o durable content/version tuple, hash nebo ekvivalentní deterministický mechanismus.

Mechanismus musí explicitně rozlišit:

- **first run** — pokud žádný applicable completed run stejné authority/purpose neexistuje, current již autorizovaný run je eligible; absence předchozího fingerprintu jej nesmí sama potlačit,
- **subsequent run** — pokud applicable completed run existuje, nový run vyžaduje material change relevantních contract/candidate/evidence/gate inputs nebo jiný objective progress/retry reason podle `delivery-cycle.md`.

First-run eligibility nikdy neobchází lifecycle, dependency, gate, terminal `Stopped` ani explicit-active-role guards. Mechanismus má potlačit semanticky no-op opakování před provider invocation, ne legitimní první provedení autorizovaného kroku.

Pro `single-repo` je deklarace topologie a repository současně deklarací canonical ownership: stejný repozitář vlastní product-level governance, Human decisions, autoritativní work items, implementaci a product-level coordination state. Další topology fields nejsou potřeba.

Pro `multi-repo` musí Project Profile v control/governance repository navíc explicitně určit:

```text
Implementation repositories:
Authoritative work-item location:
Human / product-decision location:
Cross-repository work-item ↔ change binding rule:
Composite candidate / release identity rule:
```

`Authoritative work-item location` a `Human / product-decision location` musí být uvnitř control/governance repository; implementation repository může držet pouze repository-local technické evidence a odkazy zpět.

Multi-repo binding musí zajistit, že:

- každý implementation PR/change proposal odkazuje na jeden autoritativní work item v control repository,
- autoritativní work item drží reverse links na všechny participating implementation PRs/change proposals,
- přesná reviewed candidate identity každého participating repository je durable dohledatelná,
- O od okamžiku multi-repo product-level aggregation mechanicky vlastní/current CAS-updatuje composite candidate binding v control repository ještě před product-level approval/release authorization,
- product-level publication/release state je rekonstruovatelný z control repository bez kopírování repository-local technické evidence,
- změna implementation repository nebo jeho candidate identity invaliduje/re-evaluuje předchozí composite candidate podle pravidel `delivery-cycle.md`.

Pokud některá nutná volba není z projektu zřejmá, nevymýšlej ji — vytvoř Human decision gate.

## 3. Doporučená lokální struktura cílového projektu

Pro `single-repo` přizpůsob názvy existujícím conventions, ale zachovej odpovědnosti:

```text
/
├── README.md
├── AGENTS.md
├── docs/
│   ├── agent/
│   │   ├── README.md              # mapa agentních pravidel
│   │   ├── PROJECT_PROFILE.md
│   │   ├── ROLES.md
│   │   ├── WORKFLOW.md
│   │   ├── ISSUE_STANDARD.md
│   │   ├── REVIEW.md
│   │   └── AUTOMATION.md
│   └── ... produktová/domain dokumentace ...
└── .github/
    ├── ISSUE_TEMPLATE/
    ├── pull_request_template.md
    └── workflows/
```

Nevytvářej soubor jen proto, že je v příkladu. Pokud existující kanonický dokument už odpovědnost bezpečně vlastní, odkaž na něj a neduplikuj jej.

V `multi-repo` patří product-level governance, Project Profile a autoritativní work-item contract do control/governance repository. Každé implementation repository musí mít minimální lokální agent entrypoint (typicky `AGENTS.md`), který před repository-local technickým kontextem jednoznačně odkáže na control repository, Project Profile a autoritativní work-item location. Repository-local technická dokumentace, PR konfigurace, checks a implementační evidence zůstávají v příslušném implementation repository.

## 4. AGENTS.md cílového projektu

Má být krátký router, ne druhá specifikace. Musí agentovi říct:

1. přečti autoritativní work item,
2. ověř, že máš právě jednu explicitně aktivní canonical H/A/D/R/P role z H nebo durable O assignmentu; roli si neodvozuj a sám ji neměň,
3. načti relevantní canonical docs podle semantic authority mapy a respektuj jejich fact-domain-scoped authority/currentness,
4. ověř lifecycle/terminal state/Ready/dependencies/concurrency,
5. pokud je pro aktuální contract/gate materiální effective runtime/platform fact, použij jeho declared effective-state source/evidence nebo zaznamenej unverified boundary,
6. pokud další nutný krok vyžaduje Human input, vytvoř/odkaž durable Human Input Request a zastav pouze dotčenou akci; nehádej a nespoléhej na private chat,
7. pokud work item je `Stopped`, nepokračuj bez explicitního authorized reopen transition,
8. pracuj jen v scope a authority aktivní role,
9. před dokončením zanech durable handoff; handoff sám nepřepíná aktivní roli další session.

V `multi-repo` je control-repository AGENTS product-level router. AGENTS v implementation repository musí nejprve identifikovat control repository a Project Profile a poté přidat pouze repository-local technický routing potřebný pro práci.

## 5. GitHub work contract

V `single-repo` vytvoř Issue template/form odpovídající `work-item.md` a PR template podporující:

- linked Issue,
- implementovaný scope + intentionally out of scope,
- acceptance criteria evidence,
- validation/checks,
- shared-contract impact,
- decision gates,
- Human Input Requests/resolutions,
- exact candidate/head SHA pro review/release,
- durable D/R/P outputs + O bindings,
- durable `Stopped` reason/evidence/authority/replacement binding tam, kde work item terminal non-success používá.

V `multi-repo` je autoritativní Issue template/form pouze v control repository. PR template v každém implementation repository musí podporovat link na autoritativní work item. Control work item drží product-level reverse links, Human Input Requests/resolutions, current O-owned composite candidate binding a release/publication state; repository-local checks, review a technická evidence mohou zůstat v implementation repository a být z control state pouze odkazované.

Template je provozní pomůcka; kanonický význam polí vlastní projektová dokumentace.

## 6. Branch a integration policy

Pro malý `single-repo` projekt preferuj nejjednodušší bezpečný model, často:

```text
production-authoritative main
↑
PR
↑
task branch
```

Nepřidávej `develop`, release train nebo environment matrix bez konkrétní potřeby.

V `multi-repo` může mít každý implementation repository vlastní nejjednodušší bezpečnou branch/PR policy; Project Profile musí zároveň určit, jak se jejich immutable candidate identities skládají do jednoho product-level candidate. O tento binding udržuje od pre-approval aggregation až po P publication/release completion.

Chraň production-authoritative boundary nebo boundaries tak, aby je nebylo možné běžně měnit mimo definované gates.

## 7. Release policy

Project Profile musí říct, zda Human release authorization platí:

- pro každou production změnu,
- pouze pro určité risk/work classes,
- pouze pro vybraná environments,
- nebo není požadována.

Pokud je požadována, implementuj exact-candidate binding a stale semantics z `delivery-cycle.md`. U `multi-repo` se approval váže na celý current O-owned composite candidate, nikoli nezávisle na neúplný subset jeho participating repositories.

Generic Human Input Request nesmí být použit jako levnější náhrada release authorization tam, kde ji Project Profile vyžaduje.

Human `REJECTED` release approval není automaticky terminal. Pokud Human zároveň rozhodne, že nechce další candidate, work item se durable uzavře `Stopped` podle standardní termination authority.

## 8. Automatizuj postupně

Doporučené pořadí:

1. přesný Issue/work contract,
2. explicit role assignment + durable D → R handoff,
3. CI/checks,
4. write/transition CAS/idempotence,
5. pre-dispatch semantic run eligibility/dedup,
6. automatický A/D/R/P routing přes jediný O control plane,
7. generic Human-input queue + safe interrupt/resume,
8. Human decision queue přes Asistentku jako interface/transport,
9. Human release queue,
10. multi-repo O composite binding, pokud je relevantní,
11. P publication/deployment execution + publication-specific verification,
12. optional post-publication R gate + O guarded close-out.

Vyšší autonomie se zapíná až tehdy, když nižší vrstva zachovává scope, authority, explicit active roles, durable state, run/write idempotence a bezpečný resume po Human input.

### Proportional orchestration profile

Project může implementovat stejný O contract různě podle velikosti:

- **small single-repo:** Actions-centric O je doporučený low-ceremony pattern; explicit dispatch/reusable workflows + durable GitHub state jsou dostačující, pokud guards/least privilege platí,
- **full/multi-repo:** hybrid GitHub durable state/events + GitHub App/webhook O + Actions deterministic checks/P jobs je doporučený robustní reference pattern,
- GitHub Agentic Workflows mohou být optional current runner adapter; protože jsou public preview a nejsou provider-universal, standard je nevyžaduje.

Event recursion, workflow ordering ani concurrency queue nejsou authority model. Každý relevantní event pouze probouzí O k fresh reconstruction.

## 9. Bootstrap validation

Projekt je připravený, pokud nová agentní instance dostane například pouze:

> Jsi R. Pracuj na Issue #N. Řiď se repozitářem.

…a dokáže bez externího chatu zjistit relevantní kontrakt, svou explicitně aktivní roli, role boundaries, evidence, next action a místo durable handoffu.

Musí zároveň platit:

- cold-start agent dokáže z Project Profile/docs mapy určit product intent/context authority a semantic authority/currentness významných truth-bearing artifact families bez globálního žebříčku všech souborů,
- technical/executable artifact není považován za product/domain authority jen proto, že je executable/enforced,
- historical/snapshot/superseded material není používán jako current truth bez explicitní reactivation/reassignment,
- pokud je effective runtime/platform fact materiální pro aktuální contract/gate, agent dokáže zjistit jeho effective-state source/evidence nebo explicitně označit unverified boundary,
- cold-start agent rozliší H/A/D/R/P role od Asistentka/O functions,
- Asistentka ani event handler nemohou vybrat next role; O je jediný dispatcher,
- stejná session nedostane právo na jinou roli pouhým handoffem nebo změnou Issue state; explicit reassignment je nutný,
- automated run bez unambiguous role assignment se nespustí,
- první již autorizovaný run pro danou authority/purpose se nesmí potlačit jen proto, že ještě neexistuje applicable completed run/fingerprint; všechny ostatní lifecycle/gate/terminal/active-role guards však stále platí,
- pokud applicable completed run existuje, duplicate/no-op event nespustí drahý role run, pokud relevantní semantic fingerprint od něj materiálně nezměnil a není jiný validní progress/retry reason,
- `Stopped` work se delayed/replayed eventem neobnoví,
- Parent Intent se po změně child completion state mechanicky re-evaluuje a nezůstane otevřený, pokud jeho durable overall completion condition objektivně platí.

Pokud v libovolné fázi vznikne blocking Human Input Request, musí fresh instance z autoritativního work itemu bez private-chat kontextu zjistit Request ID/type/status, přesný požadavek, context binding, Human response/evidence, resume point a které předchozí gates je nutné znovu vyhodnotit.

U `multi-repo` musí navíc agent spuštěný v libovolném participating repository bez domýšlení zjistit, který repository je control plane, kde leží autoritativní work item a Human decisions/responses, které implementation repositories jsou v daném work itemu zapojené, jaké PRs/change candidates tvoří aktuální product-level candidate a že O vlastní current composite binding.

Pokročilý test: běžný work item projde od H intake přes A → D → R → optional H release authorization → P → O Done bez ručního přeposílání agentních reportů člověkem; H vstupuje pouze tam, kde je skutečně potřeba H-owned input, intentional termination/reopen authority nebo configured release authorization. Po durable H response dokáže O workflow deterministicky obnovit i v nové agentní session.