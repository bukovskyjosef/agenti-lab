# End-to-end delivery cycle

## 1. Referenční tok

```text
Human intent
  ↓
Asistentka → durable Intake capture
  ↓
Orchestration → reconstruct state + explicit Analyst assignment
  ↓
Analysis
  ├─ required Human input
  │    → Human-input interrupt/resume subflow
  │    → orchestration reconstructs current state
  │    → Analyst only if analytical contract mutation is required
  ├─ decomposition required
  │    → Parent Intent + executable child Issue(s)
  │    → Analysis per child
  └─ one bounded executable/reviewable contract → Ready
        ↓
Orchestration → explicit Developer assignment
        ↓
Developer / In Progress
        ↓
PR(s) + required local checks
        ↓
multi-repo only: Integrator maintains current product-level composite binding
        ↓
In Review / required control gates
  ├─ DEFECT → Changes Required → objective-progress guard → Developer → re-review
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
                           orchestration close-out
                                      ↓
                                     Done
```

Cross-cutting outcomes:

- `Blocked` — temporary/recoverable; current next step cannot proceed yet,
- `Stopped` — durable non-success terminal; automatic continuation is forbidden until explicit authorized reopen.

Human-input interrupt/resume může vzniknout v libovolné delivery fázi, ale pouze pokud další nutný krok skutečně vyžaduje Human input. Nevytváří povinný Human gate na každém přechodu.

## 2. Work-item lifecycle

Referenční Issue lifecycle je záměrně malý:

- **Intake** — záměr je zachycený, ale kontrakt může být neúplný,
- **Analysis** — scope, AC, dependencies a decisions se dopracovávají,
- **Blocked** — další autorizovaný krok není momentálně možný; blocker musí říct proč, co jej může odblokovat a kdo/čeho je třeba,
- **Ready** — kompletní executable contract,
- **In Progress** — vykonávající role pracuje,
- **In Review** — probíhají required control gates,
- **Changes Required** — in-contract corrective loop,
- **Approved** — technické control gates jsou splněné,
- **Done** — všechny success completion podmínky konkrétního typu práce jsou skutečně splněné,
- **Stopped** — durable non-success terminal; work item se nesmí automaticky znovu dispatchnout/retryovat.

`Blocked` a `Stopped` nejsou zaměnitelné. `Blocked` předpokládá existenci nebo možnost authorized recovery/resume path. `Stopped` říká, že current work nemá pokračovat bez nového explicitně autorizovaného reopen/current-state transition.

Pending Human Input Request blokuje dotčený přechod. Pokud žádný jiný nezávislý autorizovaný krok nemůže pokračovat, používá se `Blocked`; negativní Human resolution sama o sobě ještě neznamená `Stopped`, dokud není splněna stop authority z oddílu 9.

Release authorization se nemá modelovat přidáním mnoha Issue stavů; je to samostatný durable gate nad konkrétním release candidate.

### Analysis shaping před Ready

`Analysis` vždy znovu určuje, zda aktuální Human intent bezpečně tvoří jeden executable delivery unit. Kanonické shaping/decomposition pravidlo vlastní `work-item.md`:

1. jeden bounded executable/reviewable contract je možný → stejné Issue pokračuje k normálnímu `Ready`,
2. chybí Human-owned input → existing Human Input Request / Decision subflow a po resolution state reconstruction; Analyst pokračuje jen pokud je potřeba analytical derivation/mutation,
3. jeden coherent delivery unit není bezpečný → původní Issue se stává non-executable `Parent Intent` a vzniknou bounded executable child work items z již autorizovaného scope.

Parent Intent není nový lifecycle stav a neprochází implementací. Každý executable child prochází normální `Analysis → Ready → ...` lifecycle samostatně. Technická velikost ani počet popsatelných sub-outcomes samy decomposition nevyžadují.

`Ready` zároveň vyžaduje dostatečně konkrétní autorizovaný upstream product/domain contract podle `work-item.md`. Pokud by implementation musela sama doplnit product meaning, pravidlo, constraint nebo observable behavior, flow zůstává/vrací se do `Analysis` a podle chybějící authority případně do Human-input/decision subflow; Developer tuto mezeru nesmí uzavřít technickým rozhodnutím.

### Parent Intent completion

Při každé změně terminal/completion-relevant state required child nebo explicitní parent-level condition orchestrace re-evaluuje Parent Intent podle `work-item.md`.

Orchestrace smí parent přepnout na `Done` pouze pokud po fresh reconstruction current parent/children/evidence objektivně splňují jeho durable overall completion condition. Pokud condition vyžaduje novou interpretaci, změnu contractu nebo Human rozhodnutí, orchestrace pouze dispatchne správnou explicitní roli/Human-input flow; sama význam completion condition nerozšiřuje.

`Stopped` Parent Intent se child completion eventem neotevírá ani neuzavírá jiným způsobem. Duplicate/delayed event je pouze trigger k idempotentní state evaluation.

## 3. Human-input interrupt a deterministic resume

Role smí vyžádat Human input pouze když její další nutnou akci nelze bezpečně a správně provést z aktuálního durable state a existující autority role. Generic request contract vlastní `work-item.md`.

Legitimní generic typy jsou:

- `CLARIFICATION` — chybí nebo je materiálně nejasný fakt, intent detail, acceptance interpretation nebo kontext, který nelze bezpečně odvodit,
- `DECISION` — pokračování vyžaduje novou Human-owned product/governance/scope/material risk/trade-off autoritu,
- `HUMAN_ACTION` — Human musí provést nebo udělit akci, access nebo externí potvrzení; secrets se do durable requestu nekopírují.

Configured release authorization zůstává samostatný specializovaný gate podle oddílu 6.

Generic interrupt probíhá takto:

1. aktivní role vytvoří nebo odkáže `PENDING` Human Input Request v autoritativním work itemu s přesným Request ID a context binding,
2. dotčený přechod se zastaví; work item se označí `Blocked`, pokud nezůstává jiná nezávislá autorizovaná práce,
3. Asistentka/Human interface zobrazí request jako view nad durable state a Human odpověď/outcome/action durable zaznamená proti stejnému Request ID,
4. request přejde na `RESOLVED`, nebo na `STALE`, pokud se jeho bound context mezitím změnil,
5. orchestrace znovu načte autoritativní work item a linked current evidence,
6. ověří Request ID, status, context binding, terminal state, aktuální candidate/target identities a required gate validity,
7. pokud explicitní Human response vyžaduje analytical derivation/mutation executable contractu, orchestrace explicitně přiřadí Analysta; Asistentka tuto derivaci neprovádí,
8. znovu se vyhodnotí lifecycle, role a gates a orchestrace spustí právě jeden aktuálně autorizovaný next step od **nejdříve dotčeného bodu**.

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

Pokud Human response změní autorizovaný input na `Parent Intent` — například scope/MVP boundary, global exclusion/constraint nebo inherited product decision — použije se tentýž dependency invariant přes child→parent binding:

1. identifikují se pouze executable children, jejichž contract/evidence na změněném parent inputu skutečně závisí,
2. každý affected child se vrátí na svůj **nejdříve dotčený bod**,
3. child, který už nesplňuje Definition of Ready, opustí executable path, dokud není jeho contract opraven,
4. affected implementation/check/review/approval evidence se re-evaluuje podle normální dependency validity,
5. změněný PR/head/candidate/target používá existující exact-candidate a release `STALE` semantics,
6. unaffected children zůstávají validní,
7. dříve spuštěná obsolete child práce nesmí pokračovat jen proto, že byla před parent změnou `Ready` nebo už dostala trigger.

Nevzniká parent-specific stale status ani druhý invalidation framework.

### Decision special case

Reviewer `DECISION_REQUIRED` nebo jiný required Human-owned decision vytváří nebo odkazuje `PENDING` Human Input Request typu `DECISION`. Decision disposition popisuje důvod/autoritu; generic request zajišťuje durable otázku, guard a resume. Ani jedno samo neautorizuje pokračování bez explicitní Human response.

## 4. Multi-repo composite candidate control plane

V `single-repo` je candidate identity přímo v jednom repository/work itemu.

V `multi-repo` začíná Integrator function vlastnit product-level composite-candidate binding **ještě před product-level approval**, jakmile se více repo-local candidates musí posuzovat jako jeden product candidate.

Integrator mechanicky:

1. načte participating implementation repositories a local change proposals z authoritative control work itemu,
2. sestaví/CAS-updatuje immutable repo-qualified candidate mapu a repository membership,
3. odkáže current local check/review/test evidence bez jejího kopírování,
4. při změně kteréhokoli člena/evidence znovu sestaví binding a označí závislé product-level gates k re-evaluation podle jejich normálních pravidel,
5. poskytuje current exact composite identity pro product-level technical approval a případný release authorization request.

Tato funkce je control-plane aggregation, nikoli approval. Integrator nesmí waive missing/failed local gates, měnit Scope/AC ani udělit release authorization.

Local Developer/Reviewer vlastní local implementation/evidence; Integrator vlastní product-level composite binding/state.

## 5. Technical approval

`Approved` znamená, že required review/test/check gates jsou pro aktuální candidate nebo composite candidate splněné a nezůstává blocking DEFECT, required decision gate ani jiný `PENDING` Human Input Request, který brání approval/integration.

U `multi-repo` lze product-level `Approved` vyhodnotit pouze proti current composite candidate, který Integrator mechanicky zrekonstruoval a jehož local evidence/gates jsou stále validní.

Neznamená to automaticky oprávnění vydat do produkce.

## 6. Release authorization

Project Profile určuje, pro které environments/work classes je Human release authorization vyžadována.

Pokud je vyžadována, request musí identifikovat alespoň:

- source work item,
- PR/change proposal nebo všechny participating PRs/change proposals,
- přesnou candidate identity: v `single-repo` candidate/head SHA nebo ekvivalentní immutable artifact identity; v `multi-repo` current immutable mapu `implementation repository → candidate SHA/artifact identity` pro všechny participating repositories,
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

`REJECTED` znamená pouze zamítnutí aktuální release authorization. Pokud Human zároveň durable rozhodne, že nechce žádný další candidate/current intent pokračovat, work item přechází na Human-authorized `Stopped` s reason `RELEASE_REJECTED_NO_FURTHER_CANDIDATE`.

## 7. Production-authoritative boundary

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

## 8. Deployment, verification a Done

Pokud práce ovlivňuje produkci, Project Profile musí určit:

- co deployment spouští,
- cílové environment(s),
- jak se potvrzuje úspěch deploymentu,
- minimum post-release verification (např. health/readiness + bounded smoke),
- kdo smí retry/rollback/recover.

Production-affecting work není `Done`, dokud required deployment + verification neuspěje.

Role/runner, který provede verification, zapíše durable evidence. Orchestrace po relevantním completion eventu znovu načte current work item/candidate/evidence a mechanicky zapíše `Done` pouze pokud jsou všechny deklarované success completion conditions splněné a work item není `Stopped`.

Pokud deployment/verification/recovery narazí na Human-only action nebo jiný legitimate Human input, použije stejný generic interrupt/resume contract; po resolution se znovu ověří candidate, target a relevantní gates před pokračováním.

## 9. Stopped — non-success terminal

`Stopped` znamená, že current work item nemá dále automaticky pokračovat. Durable Stop record vlastní `work-item.md`.

Taxonomy musí pokrývat alespoň:

- Human withdrawal/cancellation,
- superseded/obsolete work,
- permanently unavailable dependency/access,
- infeasible work under authorized constraints,
- release rejected with no further candidate desired,
- intentionally abandoned non-convergent work.

### Authority

- Human/Product Owner autorizuje intentional abandonment product intentu/scope/candidate.
- Specialized role smí zaznamenat evidence a recommend `Stopped`, ale nesmí sama převést uncertainty/failure na abandonment.
- `SUPERSEDED_OR_OBSOLETE` smí orchestrace zapsat deterministicky bez nové Human odpovědi pouze pokud authoritative replacement/current work item už durable existuje, lossless source→replacement mapping všech stále autorizovaných obligations podle `work-item.md` je rekonstruovatelný a project policy explicitně automatic supersession pro daný případ dovoluje.

### Terminal guard

Jakmile je work item `Stopped`:

- delayed/replayed event, retry ani queued role run jej nesmí znovu spustit,
- orchestrace nesmí dispatchnout další executable step,
- starý Human resolution/candidate/check event nesmí implicitně reopen,
- resume/reopen vyžaduje explicitní authorized reopen/current-state transition a novou current-state reconstruction.

## 10. Objective progress a non-convergence

Další corrective/retry/recovery iteration je oprávněná pouze tehdy, pokud od posledního applicable completed run nastal:

- **material semantic state change** relevantní pro danou roli/loop, například nový candidate/head, změněný authorized contract/parent input, nový nebo změněný required evidence/gate result, změněný blocker/request binding, změněný target/environment state, nebo
- jiný **objektivně platný progress reason** dovolený current durable policy, například retry transient external operation podle Project Profile, kde opakování samo má odlišný aktuální execution context.

Pouhý duplicate/no-op trigger, nové run ID nebo opakování stejného tvrzení není progress.

Semanticky stejný unresolved Reviewer finding, Human request nebo blocker se znovu nepřepisuje pod novou identitou jen kvůli dalšímu pokusu; existing durable artifact se aktualizuje/resolvuje/stale označí podle current state.

Pokud loop opakovaně nedokáže vytvořit objektivní progress a neexistuje další již autorizovaný corrective/recovery path:

1. další identický run se nespouští,
2. non-convergence se zaznamená durable s current evidence a posledním validním state fingerprint/reason,
3. orchestrace dispatchne existující autoritu schopnou rozhodnout next step (např. Analyst/Human podle povahy chybějící authority),
4. pokud Human rozhodne práci opustit, použije se `Stopped` reason `NON_CONVERGENT_ABANDONED`.

Standard nevyžaduje univerzální počet retries. Konkrétní technická hranice může mít bounded retry policy v Project Profile, ale nesmí obejít tento progress/termination invariant.

## 11. Failure semantics

Failure nesmí zmizet v dočasném logu.

Blocking failure zanechá durable evidence s:

- zdrojovým work itemem/candidate,
- neúspěšnou fází,
- bezpečným odkazem/ID běhu,
- stručnou příčinou,
- autorizovaným dalším krokem nebo potřebnou autoritou,
- informací, zda nový attempt splňuje objective-progress/retry reason z oddílu 10.

Pokud je autorizovaný next step Human input, failure evidence vytvoří nebo odkáže odpovídající Human Input Request; nesmí očekávat řešení pouze přes soukromý chat.

Pokud je failure prokazatelně permanentní, specializovaná role zaznamená evidence a doporučí termination; bez Human/deterministic supersession authority sama `Stopped` neudělí.

Automatický rollback není univerzální default. Destruktivní recovery se nesmí domyslet bez Project Profile authority.