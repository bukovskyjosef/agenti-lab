# Adoption guide

Cílem adopce je vytvořit v cílovém projektu **samostatný a cold-startable agentní systém** podle tohoto standardu. Běžný agent v cílovém projektu nemá potřebovat znovu číst `agenti`.

## 1. Nejprve audituj cílový projekt

Výchozí a referenční topologie je `single-repo`. `multi-repo` používej pouze tehdy, když existující durable stav nebo Human rozhodnutí určuje právě jeden autoritativní control/governance repository a jeden nebo více implementation repositories.

Než něco vytvoříš:

- najdi existující README/AGENTS/governance,
- zjisti, zda projekt skutečně používá `single-repo` nebo `multi-repo`,
- u `multi-repo` nejdřív identifikuj control/governance repository a z něj relevantní implementation repositories; nepovažuj více repozitářů za rovnocenné governance autority,
- identifikuj business/domain/API/data dokumenty,
- zjisti branch a release model,
- zjisti CI/CD, environments a deployment platformu,
- najdi existující Issues/PR conventions,
- odstraň nebo explicitně vyřeš konkurenční zdroje pravdy místo jejich slepého duplikování.

Pokud je repository topology nebo control authority nejasná, nevymýšlej ji — vytvoř Human decision gate.

## 2. Vytvoř Project Profile

Project Profile je projektově konkrétní instancí tohoto standardu. Musí určit alespoň:

```text
Repository topology: single-repo | multi-repo
Repository / authoritative control plane:
Canonical documentation map:
Human / Product Owner:
Production-authoritative boundary / boundaries:
Task branch policy:
PR target policy:
Required default control gates:
Human release authorization policy:
Deployment trigger:
Environments:
Post-release verification minimum:
Retry / rollback / recovery authority:
Agent/provider/runner mapping:
Concurrency / shared-surface conventions:
Target-drift policy after release approval:
```

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
- product-level integration/release state je rekonstruovatelný z control repository bez kopírování repository-local technické evidence,
- změna implementation repository nebo jeho candidate identity invaliduje předchozí composite candidate podle pravidel `delivery-cycle.md`.

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

V `multi-repo` patří product-level governance, Project Profile a autoritativní work-item kontrakt do control/governance repository. Každé implementation repository musí mít minimální lokální agent entrypoint (typicky `AGENTS.md`), který před repository-local technickým kontextem jednoznačně odkáže na control repository, Project Profile a autoritativní work-item location. Repository-local technická dokumentace, PR konfigurace, checks a implementační evidence zůstávají v příslušném implementation repository.

## 4. AGENTS.md cílového projektu

Má být krátký router, ne druhá specifikace. Musí agentovi říct:

1. přečti autoritativní work item,
2. urč svou roli,
3. načti relevantní canonical docs podle mapy,
4. ověř lifecycle/Ready/dependencies/concurrency,
5. pokud další nutný krok vyžaduje Human input, vytvoř/odkaž durable Human Input Request a zastav pouze dotčenou akci; nehádej a nespoléhej na private chat,
6. pracuj jen v scope,
7. před dokončením zanech durable handoff.

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
- durable Reviewer/Tester/Integrator handoff.

V `multi-repo` je autoritativní Issue template/form pouze v control repository. PR template v každém implementation repository musí podporovat link na autoritativní work item. Control work item drží product-level reverse links, Human Input Requests/resolutions a candidate/release binding; repository-local checks, review a technická evidence mohou zůstat v implementation repository a být z control state pouze odkazované.

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

V `multi-repo` může mít každý implementation repository vlastní nejjednodušší bezpečnou branch/PR policy; Project Profile musí zároveň určit, jak se jejich immutable candidate identities skládají do jednoho product-level candidate.

Chraň production-authoritative boundary nebo boundaries tak, aby je nebylo možné běžně měnit mimo definované gates.

## 7. Release policy

Project Profile musí říct, zda Human release authorization platí:

- pro každou production změnu,
- pouze pro určité risk/work classes,
- pouze pro vybraná environments,
- nebo není požadována.

Pokud je požadována, implementuj exact-candidate binding a stale semantics z `delivery-cycle.md`. U `multi-repo` se approval váže na celý composite candidate, nikoli nezávisle na neúplný subset jeho participating repositories.

Generic Human Input Request nesmí být použit jako levnější náhrada release authorization tam, kde ji Project Profile vyžaduje.

## 8. Automatizuj postupně

Doporučené pořadí:

1. přesný Issue/work contract,
2. durable Developer → Reviewer handoff,
3. CI/checks,
4. automatický Analyst/Developer/Reviewer routing,
5. generic Human-input queue + safe interrupt/resume,
6. Human decision queue přes Asistentku,
7. Human release queue,
8. automatic integration/deployment + verification.

Vyšší autonomie se zapíná až tehdy, když nižší vrstva zachovává scope, authority, durable state a bezpečný resume po Human input.

## 9. Bootstrap validation

Projekt je připravený, pokud nová agentní instance dostane například pouze:

> Jsi Reviewer. Pracuj na Issue #N. Řiď se repozitářem.

…a dokáže bez externího chatu zjistit relevantní kontrakt, role boundaries, evidence, next action a místo durable handoffu.

Pokud v libovolné fázi vznikne blocking Human Input Request, musí fresh instance z autoritativního work itemu bez private-chat kontextu zjistit Request ID/type/status, přesný požadavek, context binding, Human response/evidence, resume point a které předchozí gates je nutné znovu vyhodnotit.

U `multi-repo` musí navíc agent spuštěný v libovolném participating repository bez domýšlení zjistit, který repository je control plane, kde leží autoritativní work item a Human decisions/responses, které implementation repositories jsou v daném work itemu zapojené a jaké PRs/change candidates tvoří aktuální product-level candidate.

Pokročilý test: běžný work item projde od Human intake přes Analysis, Developer, Review a release až do produkce bez ručního přeposílání agentních reportů člověkem; Human vstupuje pouze tam, kde je skutečně potřeba Human input nebo configured release authorization. Po Human response dokáže workflow pokračovat deterministicky z durable state i v nové agentní session.