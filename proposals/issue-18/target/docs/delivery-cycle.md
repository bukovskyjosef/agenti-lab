# End-to-end delivery cycle

## 1. Referenční tok

```text
H intent
  ↓
Asistentka → durable Intake capture
  ↓ trigger only
O → fresh state reconstruction + explicit A assignment
  ↓
A / Analysis
  ├─ required H input → Human-input subflow → O → earliest affected point
  ├─ decomposition → Parent Intent + executable child Issue(s) → A per child
  └─ bounded executable contract → Ready
       ↓ O
D / In Progress
  ↓
exact candidate/PR + author validation + deterministic checks
  ↓ events wake O
O → reconstruct current candidate/evidence
  ↓
R / independent review + required independent behavioral verification
  ├─ implementation DEFECT → O → D
  ├─ upstream contract deficiency → O → A
  ├─ DECISION_REQUIRED → Asistentka ↔ H → O
  └─ APPROVED
       ↓ O
Configured H release authorization?
  ├─ no
  └─ yes → exact candidate/composite → H → durable GRANTED → O
       ↓
P → immediate exact-candidate/gate revalidation
  → configured merge/promotion/tag/release/deploy operations
  → publication-specific deterministic checks/evidence
       ↓
Configured independent post-publication R gate?
  ├─ yes → O → R → O
  └─ no
       ↓
O → mechanical completion evaluation → Done
```

Cross-cutting outcomes:

- `Blocked` — temporary/recoverable; current next step cannot proceed yet,
- `Stopped` — durable non-success terminal; automatic continuation is forbidden until explicit authorized reopen.

GitHub/durable event znamená pouze „authoritative state se mohl změnit“. Event probudí O, ale sám neurčuje roli, approval ani transition.

Human-input interrupt/resume může vzniknout v libovolné fázi jen tehdy, pokud další nutný krok skutečně vyžaduje H input. H není routine message bus mezi A/D/R/P.

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
2. chybí Human-owned input → existing Human Input Request / Decision subflow a po resolution state reconstruction; A pokračuje jen pokud je potřeba analytical derivation/mutation,
3. jeden coherent delivery unit není bezpečný → původní Issue se stává non-executable `Parent Intent` a vzniknou bounded executable child work items z již autorizovaného scope.

Parent Intent není nový lifecycle stav a neprochází implementací. Každý executable child prochází normální `Analysis → Ready → ...` lifecycle samostatně. Technická velikost ani počet popsatelných sub-outcomes samy decomposition nevyžadují.

`Ready` zároveň vyžaduje dostatečně konkrétní autorizovaný upstream product/domain contract podle `work-item.md`. Pokud by implementation musela sama doplnit product meaning, pravidlo, constraint nebo observable behavior, flow zůstává/vrací se do `Analysis` a podle chybějící authority případně do Human-input/decision subflow; D tuto mezeru nesmí uzavřít technickým rozhodnutím.

### Parent Intent completion

Při každé změně terminal/completion-relevant state required child nebo explicitní parent-level condition O re-evaluuje Parent Intent podle `work-item.md`.

O smí parent přepnout na `Done` pouze pokud po fresh reconstruction current parent/children/evidence objektivně splňují jeho durable overall completion condition. Pokud condition vyžaduje novou interpretaci, změnu contractu nebo Human rozhodnutí, O pouze dispatchne správnou explicitní roli/Human-input flow; sama význam completion condition nerozšiřuje.

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
5. O znovu načte autoritativní work item a linked current evidence,
6. ověří Request ID, status, context binding, terminal state, aktuální candidate/target identities a required gate validity,
7. pokud explicitní Human response vyžaduje analytical derivation/mutation executable contractu, O explicitně přiřadí A; Asistentka tuto derivaci neprovádí,
8. znovu se vyhodnotí lifecycle, role a gates a O spustí právě jeden aktuálně autorizovaný next step od **nejdříve dotčeného bodu**.

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

R `DECISION_REQUIRED` nebo jiný required Human-owned decision vytváří nebo odkazuje `PENDING` Human Input Request typu `DECISION`. Decision disposition popisuje důvod/autoritu; generic request zajišťuje durable otázku, guard a resume. Ani jedno samo neautorizuje pokračování bez explicitní Human response.

### Human conflict / override resume

Když aktivní role obdrží H instrukci kolidující s current contractem/gatem/role boundary/governance, nejde o nový bypass transition. Role použije typed conflict/override semantics z `work-item.md` a konfliktní akci neprovede, dokud není H resolution správně durably bound.

Po task-contract change O dispatchne A, pokud je potřeba analytical derivation/mutation. Governance change/exception musí být nejdřív validní podle current governance. Role reassignment musí být explicitní a nesmí obejít independence. Release authorization zůstává specialized exact-candidate gate. Po každé takové durable změně O rekonstruuje current state a pokračuje od earliest affected point; původní session nemá blanket continuation right.

## 4. Multi-repo composite candidate control plane

V `single-repo` je candidate identity přímo v jednom repository/work itemu.

V `multi-repo` O mechanicky vlastní current product-level composite-candidate binding **ještě před product-level approval**, jakmile se více repo-local candidates musí posuzovat jako jeden product candidate.

O:

1. načte participating implementation repositories a local change proposals z authoritative control work itemu,
2. sestaví/CAS-updatuje immutable repo-qualified candidate mapu + membership,
3. odkáže current local D/R/check evidence bez jejího kopírování,
4. při změně kteréhokoli člena/evidence znovu sestaví binding a označí dependent product-level gates k re-evaluation,
5. poskytne current exact composite identity pro R, případný H release authorization a P.

Tato činnost je deterministic control-plane aggregation, nikoli approval. O nesmí waive gates, měnit Scope/AC, vydat R judgment ani udělit H release authorization.

Repo-local D/R vlastní local implementation/evidence. P až po splnění current gates a případné H release authorization provádí configured coordinated publication plan across boundaries a zapisuje actual published identities/partial failures.

## 5. Technical approval

`Approved` znamená, že required R/check gates jsou pro current exact candidate nebo composite candidate splněné a nezůstává blocking DEFECT, required H decision ani jiný `PENDING` Human Input Request bránící publication path.

U `multi-repo` lze product-level `Approved` vyhodnotit pouze proti current composite candidate mechanicky rekonstruovanému O a current local evidence/gates.

Technical approval není release authorization a nedává P právo publikovat, pokud Project Profile vyžaduje ještě H release gate.

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

## 7. Production-authoritative boundary a P publication

Project Profile určí production-authoritative boundary/boundaries a přesné publication operations vlastněné P: například merge, promotion, tag/release, deploy invocation nebo jiný already-authorized write.

Pro malý kontinuálně vydávaný `single-repo` projekt je jednoduchý pattern:

```text
task branch
  → PR
  → CI + independent R
  → optional H release authorization
  → O explicit P assignment
  → P merge/publish exact candidate
  → configured deployment/publication checks
```

P před každým privileged publication write znovu ověří exact candidate/composite identity, target, required gates a current H release authorization, pokud je vyžadována. P nesmí substituovat candidate, waive gate, opravovat D candidate ani sám grantovat release authorization.

V `multi-repo` může P vykonat koordinovaný publish plan přes více boundaries, ale všechny kroky musí být navázané na current composite candidate z O. Partial success/failure se zapisuje durably; O z něj znovu rekonstruuje next state.

Standard nevyžaduje název `main` ani univerzální `develop` branch.

## 8. Publication, post-publication verification a Done

Project Profile musí pro production-affecting work určit:

- publication/deployment trigger a target environments,
- jak se potvrzuje exact published identity a úspěch deploymentu,
- P-owned deterministic publication-specific checks (např. deployment completion, exact-version evidence, health/readiness, bounded smoke),
- zda je navíc vyžadován independent post-publication R judgment,
- kdo smí bounded retry/rollback/recover a za jakých podmínek.

Production-affecting work není `Done`, dokud všechny required publication + post-publication completion conditions neuspějí.

P zapisuje publication/deployment/check evidence. Pokud Project Profile vyžaduje independent post-publication semantic/behavioral judgment, O explicitně dispatchne R; nevzniká nová canonical role.

O po relevantním completion eventu fresh-readne current work item/candidate/evidence a mechanicky zapíše `Done` pouze pokud jsou všechny declared success conditions splněné a work item není `Stopped`. P samotný nesmí odvodit Done jen z úspěšného publish write.

Human-only action nebo nový recovery trade-off používá existing Human-input/override semantics; po durable H resolution O znovu ověří candidate/target/gates a určí earliest affected point.

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

- Human autorizuje intentional abandonment product intentu/scope/candidate.
- Specialized role smí zaznamenat evidence a recommend `Stopped`, ale nesmí sama převést uncertainty/failure na abandonment.
- `SUPERSEDED_OR_OBSOLETE` smí O zapsat deterministicky bez nové Human odpovědi pouze pokud authoritative replacement/current work item už durable existuje, lossless source→replacement mapping všech stále autorizovaných obligations podle `work-item.md` je rekonstruovatelný a project policy explicitně automatic supersession pro daný případ dovoluje.

### Terminal guard

Jakmile je work item `Stopped`:

- delayed/replayed event, retry ani queued role run jej nesmí znovu spustit,
- O nesmí dispatchnout další executable step,
- starý Human resolution/candidate/check event nesmí implicitně reopen,
- resume/reopen vyžaduje explicitní authorized reopen/current-state transition a novou current-state reconstruction.

## 10. Objective progress a non-convergence

Další corrective/retry/recovery iteration je oprávněná pouze tehdy, pokud od posledního applicable completed run nastal:

- **material semantic state change** relevantní pro danou roli/loop, například nový candidate/head, změněný authorized contract/parent input, nový nebo změněný required evidence/gate result, změněný blocker/request binding, změněný target/environment state, nebo
- jiný **objektivně platný progress reason** dovolený current durable policy, například retry transient external operation podle Project Profile, kde opakování samo má odlišný aktuální execution context.

Pouhý duplicate/no-op trigger, nové run ID nebo opakování stejného tvrzení není progress.

Semanticky stejný unresolved R finding, Human request nebo blocker se znovu nepřepisuje pod novou identitou jen kvůli dalšímu pokusu; existing durable artifact se aktualizuje/resolvuje/stale označí podle current state.

Pokud loop opakovaně nedokáže vytvořit objektivní progress a neexistuje další již autorizovaný corrective/recovery path:

1. další identický run se nespouští,
2. non-convergence se zaznamená durable s current evidence a posledním validním state fingerprint/reason,
3. O dispatchne existující autoritu schopnou rozhodnout next step (např. A/Human podle povahy chybějící authority),
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