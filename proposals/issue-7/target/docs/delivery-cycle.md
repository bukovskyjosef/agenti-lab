# End-to-end delivery cycle

## 1. Referenční tok

```text
Human intent
  ↓
Asistentka → Intake Issue
  ↓
Analysis
  ├─ required Human input → Human-input interrupt/resume subflow
  └─ Ready
        ↓
Developer / In Progress
        ↓
PR(s) + required checks
        ↓
In Review
  ├─ DEFECT → Changes Required → Developer → re-review
  ├─ DECISION_REQUIRED → Human-input interrupt/resume subflow (DECISION)
  └─ APPROVED
        ↓
Release authorization required by Project Profile?
  ├─ no → Integrator
  └─ yes → Human release queue → Asistentka ↔ Human
                                      ↓ granted
                                  Integrator
                                      ↓
                       production-authoritative boundary
                                      ↓
                               automatic deployment
                                      ↓
                         post-release verification
                                      ↓
                                     Done
```

Human-input interrupt/resume je cross-cutting subflow: může vzniknout v libovolné delivery fázi, ale pouze pokud další nutný krok skutečně vyžaduje Human input. Nevytváří povinný Human gate na každém přechodu.

## 2. Work-item lifecycle

Referenční Issue lifecycle je záměrně malý:

- **Intake** — záměr je zachycený, ale kontrakt může být neúplný,
- **Analysis** — scope, AC, dependencies a decisions se dopracovávají,
- **Blocked** — další autorizovaný krok není možný; blocker musí říct proč a kdo/čeho je třeba,
- **Ready** — kompletní executable contract,
- **In Progress** — vykonávající role pracuje,
- **In Review** — probíhají required control gates,
- **Changes Required** — in-contract corrective loop,
- **Approved** — technické control gates jsou splněné,
- **Done** — všechny completion podmínky konkrétního typu práce jsou skutečně splněné.

Pending Human Input Request blokuje dotčený přechod. Pokud žádný jiný nezávislý autorizovaný krok nemůže pokračovat, používá se existující `Blocked`; nepřidává se nový lifecycle stav.

Release authorization se nemá modelovat přidáním mnoha Issue stavů; je to samostatný durable gate nad konkrétním release candidate.

## 3. Human-input interrupt a deterministic resume

Role smí vyžádat Human input pouze když její další nutnou akci nelze bezpečně a správně provést z aktuálního durable state a existující autority role. Generic request contract vlastní `work-item.md`.

Legitimní generic typy jsou:

- `CLARIFICATION` — chybí nebo je materiálně nejasný fakt, intent detail, acceptance interpretation nebo kontext, který nelze bezpečně odvodit,
- `DECISION` — pokračování vyžaduje novou Human-owned product/governance/scope/material risk/trade-off autoritu,
- `HUMAN_ACTION` — Human musí provést nebo udělit akci, access nebo externí potvrzení; secrets se do durable requestu nekopírují.

Configured release authorization zůstává samostatný specializovaný gate podle oddílu 5.

Generic interrupt probíhá takto:

1. role vytvoří nebo odkáže `PENDING` Human Input Request v autoritativním work itemu s přesným Request ID a context binding,
2. dotčený přechod se zastaví; work item se označí `Blocked`, pokud nezůstává jiná nezávislá autorizovaná práce,
3. Asistentka/Human interface zobrazí request jako view nad durable state a Human odpověď/outcome/action zaznamená proti stejnému Request ID,
4. request přejde na `RESOLVED`, nebo na `STALE`, pokud se jeho bound context mezitím změnil,
5. orchestrace/nová role znovu načte autoritativní work item a linked current evidence,
6. ověří Request ID, status, context binding, aktuální candidate/target identities a required gate validity,
7. Human odpověď se promítne do canonical contract/state tam, kde jej mění,
8. znovu se vyhodnotí lifecycle, role a gates a workflow pokračuje od **nejdříve dotčeného bodu**.

Původní agentní session nemusí přežít. `RESOLVED` znamená pouze „požadovaný vstup byl dodán a current state se má znovu vyhodnotit“, nikoli „proveď starou continuation“.

### Invalidation po Human response

Human odpověď sama o sobě neinvaliduje vše předchozí. Platí jeden dependency invariant:

> Předchozí analýza, check, review nebo approval zůstává platný pouze tehdy, pokud po Human response zůstaly platné vstupy a předpoklady, na kterých závisel.

Proto zejména:

- pouhé doplnění access/Human action bez změny work contractu a candidate neinvaliduje nesouvisející evidence,
- clarification měnící Requirements/AC/scope vrací flow na nejdříve dotčený contract/implementation/review bod,
- Human decision měnící autorizovaný kontrakt vyžaduje re-evaluation všech závislých conclusions/gates,
- změna PR/head/candidate invaliduje gates bound na starý candidate,
- target/environment/base drift invaliduje pouze evidence, pro které je podle Project Profile relevantní,
- release authorization používá navíc vlastní přísná exact-candidate `STALE` pravidla níže.

### Decision special case

Reviewer `DECISION_REQUIRED` nebo jiný required Human-owned decision vytváří nebo odkazuje `PENDING` Human Input Request typu `DECISION`. Decision disposition popisuje důvod/autoritu; generic request zajišťuje durable transport, guard a resume. Ani jedno samo neautorizuje pokračování bez explicitní Human response.

## 4. Technical approval

`Approved` znamená, že required review/test/check gates jsou pro aktuální candidate nebo composite candidate splněné a nezůstává blocking DEFECT, required decision gate ani jiný `PENDING` Human Input Request, který brání approval/integration.

Neznamená to automaticky oprávnění vydat do produkce.

## 5. Release authorization

Project Profile určuje, pro které environments/work classes je Human release authorization vyžadována.

Pokud je vyžadována, request musí identifikovat alespoň:

- source work item,
- PR/change proposal nebo všechny participating PRs/change proposals,
- přesnou candidate identity: v `single-repo` candidate/head SHA nebo ekvivalentní immutable artifact identity; v `multi-repo` immutable mapu `implementation repository → candidate SHA/artifact identity` pro všechny participating repositories,
- production-authoritative target/boundary nebo boundaries,
- required review outcome,
- required check/test evidence.

U `multi-repo` tvoří celá tato immutable mapa jeden product-level composite candidate. Membership participating repositories i identity každého člena jsou součástí exact-candidate binding. Product-level release status musí být durable rekonstruovatelný z autoritativního work itemu v control repository; repository-local evidence může zůstat odkazovaná ve svém implementation repository.

Durable status je minimálně:

- `PENDING`,
- `GRANTED`,
- `REJECTED`,
- `STALE`.

### Approval invalidation

Approval se stává `STALE`, pokud už neplatí, že vydáváme kandidát, který člověk schválil. Typicky při:

- změně candidate SHA/artifactu; u `multi-repo` také změně kteréhokoli člena composite candidate nebo jeho repository membership,
- invalidaci required review/check/test gate,
- změně release targetu,
- změně target/base stavu, která podle Project Profile mění nebo zneplatňuje identitu schváleného výsledku.

Pouhý nový trigger nebo generic Human Input Request nesmí stale approval obnovit. Generic Human response invaliduje release approval právě tehdy, když změnila některý z jeho bound inputs nebo assumptions.

## 6. Production-authoritative boundary

Projekt explicitně určí, co je jeho production-authoritative boundary nebo boundaries: například `main`, release branch, tag nebo jiný immutable artifact.

Pro malý kontinuálně vydávaný `single-repo` projekt je doporučený jednoduchý pattern:

```text
task branch
  → PR
  → CI + independent review
  → Human release authorization
  → merge to production-authoritative main
  → automatic deploy
```

V `multi-repo` může mít každý participating implementation repository vlastní production-authoritative boundary nebo může Project Profile určit společný publikovaný artifact boundary. V obou případech musí product-level release state zůstat navázaný na přesný composite candidate z oddílu výše.

Standard nevyžaduje název `main` ani univerzální `develop` branch.

## 7. Deployment a verification

Pokud práce ovlivňuje produkci, Project Profile musí určit:

- co deployment spouští,
- cílové environment(s),
- jak se potvrzuje úspěch deploymentu,
- minimum post-release verification (např. health/readiness + bounded smoke),
- kdo smí retry/rollback/recover.

Production-affecting work není `Done`, dokud required deployment + verification neuspěje.

Pokud deployment/verification/recovery narazí na Human-only action nebo jiný legitimate Human input, použije stejný generic interrupt/resume contract; po resolution se znovu ověří candidate, target a relevantní gates před pokračováním.

## 8. Failure semantics

Failure nesmí zmizet v dočasném logu.

Blocking failure zanechá durable evidence s:

- zdrojovým work itemem/candidate,
- neúspěšnou fází,
- bezpečným odkazem/ID běhu,
- stručnou příčinou,
- autorizovaným dalším krokem nebo potřebnou autoritou.

Pokud je autorizovaný next step Human input, failure evidence vytvoří nebo odkáže odpovídající Human Input Request; nesmí očekávat řešení pouze přes soukromý chat.

Automatický rollback není univerzální default. Destruktivní recovery se nesmí domyslet bez Project Profile authority.