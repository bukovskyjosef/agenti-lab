# Work item contract

GitHub Issue je task-local pracovní kontrakt. Stejné Issue typicky dozrává z Intake přes Analysis do Ready; nevytváří se nový Issue pouze kvůli změně fáze.

V `single-repo` je Issue ve stejném repository jako implementace. V `multi-repo` existuje právě jeden autoritativní work item v control/governance repository; implementation repositories nesmí vytvářet konkurenční product-level work contract.

Každý nový Human intent je nejdřív Intake candidate. Existence Issue sama neznamená, že intent už tvoří executable contract.

## Analysis shaping a decomposition

Analyst během běžné `Analysis` přizpůsobí míru shaping tomu, kolik zbývá ambiguity, Human-owned product decision space, risk a potřeby decomposition. Technická velikost sama o sobě tuto míru neurčuje.

Použije tento rozhodovací postup:

1. **Jeden bounded contract je bezpečný:** pokud Human intent + canonical project state umožňují vytvořit jeden bounded executable/reviewable contract bez vymýšlení nových Human-owned product rozhodnutí, zůstává stejné Issue a doplní se do normálního `Ready`.
2. **Chybí Human-owned input:** pokud potřebný product/governance/scope/clarification input nelze bezpečně odvodit, použije se existující Human Input Request / Decision mechanismus. Po durable resolution se tento rozhodovací postup znovu vyhodnotí Analystem.
3. **Jeden coherent delivery unit není bezpečný:** decomposition je oprávněná pouze tehdy, když již autorizovaný scope nemůže bezpečně zůstat jedním coherent executable/reviewable work itemem bez materiální ztráty authorization clarity, independent readiness/review boundaries nebo dependency clarity, případně by execution jinak vyžadovala opakované nové Human-owned product-scope decisions.

Více samostatně popsatelných/deliverable outcomes je pouze signál k posouzení decomposition. Technická složitost, effort, počet souborů ani počet sub-outcomes samy decomposition nevyžadují.

Analyst odvodí vše, co lze bezpečně zjistit z canonical repository/project state. Pokud je nutný Human-owned input, ptá se jen na nejmenší coherent next set otázek potřebných k materiálnímu snížení nejistoty; Human nemusí ručně sepisovat kompletní implementation-ready specification.

Asistentka smí explicitní Human intent/resolution durable zaznamenat, ale analytické odvození nebo mutaci Scope/Requirements/AC/decomposition/Ready contractu z tohoto vstupu vlastní výhradně Analyst.

Decomposition pouze rozděluje již autorizovaný scope. Nesmí přidat nový goal, feature, behavior nebo jiný product scope bez Human authority.

## Povinný obsah před Ready

Implementační nebo změnový work item musí obsahovat:

### Goal
Jedna jednoznačná formulace výsledku.

### Context
Pouze kontext nutný pro pochopení problému; trvalá pravidla se odkazují z kanonických dokumentů.

### Scope
Co přesně do úkolu patří.

### Out of scope
Explicitní hranice proti scope creep.

### Requirements
Normativní požadavky, které musí řešení splnit.

### Acceptance criteria
Pozorovatelné a testovatelné podmínky dokončení.

### Constraints
Relevantní technická, kompatibilitní, bezpečnostní nebo procesní omezení.

### Dependencies
Blokující nebo pořadové závislosti; případně explicitně `None`.

### Canonical references
Autoritativní dokumenty, rozhodnutí a kontrakty relevantní pro práci.

Pokud contract závisí na product/domain semantics, references musí vést k current upstream authority podle semantic authority mapy. Pokud závisí na current effective runtime/platform factu, musí odkazovat také declared effective-state source/evidence nebo explicitně uvést unverified boundary.

### Responsible role
Role aktuální executable fáze. Toto pole popisuje požadovanou authority function; samo o sobě nedává žádné session právo roli převzít. Konkrétní role-bound session/run musí dostat explicitní active-role assignment podle `roles.md`.

### Required control gates
Např. Independent Review, Review + Verification nebo projektově definovaná brána.

Minimální invariant: změna kódu, konfigurace, dat, šablon nebo kanonické dokumentace vyžaduje nezávislé Review. Samostatný Tester není univerzálně povinný.

### Validation
Jak má být výsledek ověřen.

### Documentation impact
Co se musí změnit v durable dokumentaci nebo proč nic.

### Concurrency class

- `PARALLEL_SAFE` — bez očekávaného konfliktu shared surface,
- `COORDINATION_REQUIRED` — souběh vyžaduje ownership/sequencing/merge rule,
- `EXCLUSIVE` — souběžná změna na dotčeném povrchu je nepřijatelná.

### Shared surfaces / coordination rule
Schema, API, domain contract, auth, governance, dependencies, stejné moduly apod.; nebo `None`.

### Decision gates
Nevyřešené otázky nutné k realizaci; nebo `None`.

### Release policy
Odkaz na Project Profile a případná task-specific odchylka: zda kandidát vyžaduje Human release authorization a pro jaký target.

## Definition of Ready

Executable work item je Ready pouze pokud:

- Goal je jednoznačný,
- Scope a Out of scope jsou jasné,
- neexistuje required unresolved decision gate ani jiný `PENDING` Human Input Request nutný před zahájením aktuální executable fáze,
- acceptance criteria jsou testovatelná,
- dependencies a constraints jsou známé,
- canonical references jsou uvedené,
- autorizované upstream product/domain intent, requirements a semantics jsou dostatečně konkrétní, aby implementation nemusela vymýšlet nové product meaning nebo observable behavior,
- responsible role je známá,
- required control gates jsou explicitní,
- concurrency/shared surfaces jsou deklarované,
- release policy je určitelná,
- u `multi-repo` jsou známé participating implementation repositories pro tento work item,
- kompetentní nová instance může začít pouze z repo/GitHub stavu.

Analyst nesmí označit Issue Ready jen proto, že existuje nebo obsahuje vyplněnou šablonu.

Pokud upstream product/domain inputs zůstávají příliš abstraktní, ambiguous nebo incomplete k určení autorizovaného behavior bez přidání vlastního pravidla, work item **není implementation-ready**. Vrací se do Analysis/shaping a podle povahy chybějící authority použije canonical state nebo Human Input Request/Decision. Developer nesmí tuto mezeru uzavřít zavedením přísnějšího, alternativního nebo jinak odlišného product/domain constraintu; běžná technická rozhodnutí zůstávají v jeho autoritě pouze uvnitř již autorizovaného semantic envelope.

Human input se může stát nutným i po `Ready`; tehdy vzniká cross-cutting request níže a Ready se znovu vyhodnotí pouze tehdy, pokud Human odpověď změnila vstupy Ready kontraktu.

## Parent Intent a executable children

Pokud Analysis podle pravidla výše skutečně vyžaduje decomposition, původní Intake Issue se stává **Parent Intent**.

Parent Intent je non-executable product-level authorization/coordination work item. Vlastní:

- původní Human intent,
- authorized scope envelope / MVP boundary,
- global `Out of scope`, constraints a relevantní Human product decisions,
- decomposition do executable child work items,
- overall completion condition.

Parent Intent nemusí splnit executable Definition of Ready a neprochází později samostatným implementation passem. Je `Done` pouze tehdy, když je splněna jeho deklarovaná overall completion condition, typicky dokončením required children a případných explicitních parent-level conditions.

Každý executable child:

- samostatně splní normální Definition of Ready před implementation,
- spotřebovává pouze bounded část již autorizovaného parent scope,
- durable odkazuje Parent Intent a konkrétní inherited parent scope/decisions/constraints, na kterých jeho contract závisí,
- obsahuje pouze child-local detail potřebný pro cold-start execution a nekopíruje celý parent specification jako konkurenční source of truth.

Preferuj native GitHub parent/sub-issue relationship. Pokud v daném GitHub setupu není dostupný, Parent Intent a child musí mít explicitní durable bidirectional parent ↔ child odkazy v autoritativních Issues. Parent/sub-issue relationship znamená rozdělení širšího autorizovaného intentu; dependency/blocking relationship je samostatná relace a znamená, že work item nemůže pokračovat před jiným work itemem nebo podmínkou.

### Parent completion roll-up

Změna terminal/completion-relevant state required child nebo explicitní parent-level condition je trigger pro orchestration re-evaluation Parent Intentu.

Orchestrace:

1. znovu načte authoritative Parent Intent, aktuální child set a relevantní durable completion evidence,
2. ověří, že parent není `Stopped` a že re-evaluation stále odpovídá current parent/child bindings,
3. mechanicky vyhodnotí deklarovanou overall completion condition,
4. pokud je condition objektivně splněná, CAS-zapíše Parent Intent `Done`,
5. pokud condition splněná není, parent ponechá otevřený,
6. pokud je ke close-outu nutná nová analýza/Human volba, sama ji nevymýšlí a dispatchne odpovídající explicitní roli/Human-input flow.

Duplicate/delayed child-completion event nesmí vytvořit druhý close-out ani znovu otevřít již terminal parent.

V `multi-repo` Parent Intent i všechny autoritativní executable child Issues zůstávají v control/governance repository. Implementation branches/PRs/checks a repository-local technical evidence zůstávají v implementation repositories a odkazují zpět podle `Repository binding` níže.

Pokud se později změní inherited parent authorization input, affected children se posuzují podle dependency/earliest-affected-point pravidel v `delivery-cycle.md`; nevzniká parent-specific stale lifecycle.

## Human Input Request

Kterákoli role smí vytvořit blocking Human Input Request, pokud její další nutnou akci nelze bezpečně provést z aktuálního durable state a existující autority role.

Generic request používá:

- **Request ID** — stabilní identifikátor unikátní v work itemu,
- **Status** — `PENDING | RESOLVED | STALE`,
- **Type** — `CLARIFICATION | DECISION | HUMAN_ACTION`,
- **Raised by / phase** — role a delivery/lifecycle fáze, kde blocker vznikl,
- **Exact request** — přesná otázka, rozhodnutí nebo Human-only action,
- **Why required** — co nelze bezpečně odvodit/provést a která další akce je blokovaná,
- **Context binding** — work item a podle potřeby repository, PR/change proposal, candidate/head SHA, environment/target, deployment/run nebo jiný přesný subject,
- **Resume point** — role/fáze, jejíž další krok se má po resolution znovu vyhodnotit.

`DECISION` navíc nese decision-ready evidence/varianty vyžadované existující Human-authority politikou. `HUMAN_ACTION` zaznamenává požadovanou akci a bezpečnou completion evidence; secrets ani credential values se do work itemu nekopírují.

Configured release authorization nepoužívá tento generic request jako náhradu; zůstává specializovaným exact-candidate gate podle `delivery-cycle.md`.

Human resolution musí být durable navázané na stejný Request ID a obsahovat:

- přesnou Human odpověď/outcome nebo completion evidence,
- responder/authority identity,
- durable timestamp/reference.

`RESOLVED` znamená, že požadovaný vstup byl poskytnut, nikoli že výsledek je kladný. Například odmítnutí přístupu je validní resolution a workflow z něj teprve odvodí další stav.

Request je `STALE`, pokud se jeho bound context změnil tak, že stará otázka/odpověď už nesmí autorizovat pokračování. Stale request se nesmí znovu použít.

Pending request blokuje pouze dotčený přechod. Pokud žádný jiný nezávislý autorizovaný krok nemůže pokračovat, work item používá `Blocked`; `Stopped` se použije pouze pro durable terminal non-success podle oddílu níže.

Po resolution se pokračuje podle `delivery-cycle.md`: current state se znovu načte, Request ID/status/binding se ověří a workflow se vrátí na nejdříve dotčený bod. Asistentka durable zaznamenává explicitní Human resolution; pokud resolution mění analytický executable contract, Analyst provede potřebnou derivaci/mutaci před dalším Ready/next-step rozhodnutím.

## Lossless consolidation / supersession

Když jeden authoritative work item nahrazuje nebo konsoliduje jeden či více existujících work items, existence replacementu sama není důkaz, že jejich autorizované obligations přežily.

Před tím, než source work může být uzavřen/označen duplicate nebo `Stopped` jako `SUPERSEDED_OR_OBSOLETE`, musí být durable rekonstruovatelné:

1. všechny source work items,
2. pro každý stále autorizovaný requirement, acceptance criterion, Human decision, blocker/dependency nebo jinou obligation potřebnou budoucí prací buď:
   - jeho zachování přímo v replacement contractu, nebo
   - durable reference na jeho current canonical source z replacementu,
3. u obligation, která se záměrně nepřenáší, explicitní disposition a authority odpovídající běžným scope/Human-authority pravidlům,
4. source → replacement a replacement → source traceability dostatečná pro cold-start reconstruction.

Consolidation/replacement samo nevytváří authority zahodit scope, requirement nebo decision. Teprve po dokončení tohoto mappingu mohou source items přejít do existing duplicate/superseded/`Stopped` semantics podle lifecycle/project policy.

Toto pravidlo nevytváří mandatory master Issue, Epic ani consolidation phase. Použije se pouze tam, kde skutečné replacement/consolidation nastává; výsledný replacement pak pokračuje normálním shaping/Ready/review/release flow.

## Stop record

`Stopped` je durable non-success terminal semantic work itemu. Není to synonymum pro temporary `Blocked`.

Stop record musí být z authoritative state rekonstruovatelný a obsahuje alespoň:

- **Reason** z taxonomy pokrývající nejméně:
  - `HUMAN_WITHDRAWN_OR_CANCELLED`,
  - `SUPERSEDED_OR_OBSOLETE`,
  - `PERMANENT_DEPENDENCY_OR_ACCESS_UNAVAILABLE`,
  - `INFEASIBLE_UNDER_AUTHORIZED_CONSTRAINTS`,
  - `RELEASE_REJECTED_NO_FURTHER_CANDIDATE`,
  - `NON_CONVERGENT_ABANDONED`,
- stručnou durable evidence/rationale,
- authority/reference, která stop autorizuje,
- timestamp/reference transitionu,
- u supersession odkaz na authoritative replacement/current work item a rekonstruovatelný lossless source→replacement mapping podle oddílu výše.

Human/Product Owner autorizuje intentional abandonment product intentu/scope/candidate. Specializované role smějí vytvořit evidence a recommendation, ale samy nesmějí nejistotu nebo neúspěch převést na abandonment.

`SUPERSEDED_OR_OBSOLETE` smí orchestrace zapsat deterministicky bez nové Human odpovědi pouze pokud authoritative replacement/current work item už durable existuje, lossless mapping všech stále autorizovaných obligations je rekonstruovatelný **a** project policy explicitně dovoluje automatic supersession pro tento případ. Jinak je potřeba Human authority nebo dokončení mappingu; automation nesmí source předčasně terminalizovat.

`Stopped` work nesmí pokračovat z delayed eventu, retrye ani starého queued runu. Reopen/resume vyžaduje explicitní authorized reopen/current-state transition; původní event nebo odstranění příčiny samo work item znovu neaktivuje.

## Repository binding

`single-repo` nepřidává žádná per-work-item topology metadata; Project Profile určuje, že control i implementation jsou ve stejném repository.

V `multi-repo` musí autoritativní executable work item v control repository během delivery durable udržovat:

- participating implementation repositories,
- reverse links na každý implementation PR/change proposal,
- přesnou immutable candidate identity každého participating repository, jakmile vznikne,
- odkazy na required repository-local review/check/test evidence,
- product-level technical approval, release authorization a integration/release state pro aktuální composite candidate,
- všechny product-level Human Input Requests a jejich Human resolutions.

Od okamžiku, kdy se více repo-local candidates musí posuzovat jako jeden product candidate, **Integrator** vlastní mechanickou product-level composite-candidate control-plane state: sestavuje a CAS-updatuje repo-qualified immutable candidate mapu, participating membership, reverse links a odkazy na local evidence. Tuto state udržuje už před product-level technical approval/release authorization a znovu ji validuje při každé relevantní local změně.

Local Developer/Reviewer nadále vlastní repository-local implementation/review/check evidence. Integrator ji agreguje odkazem a nesmí ji falšovat, waive nebo z její existence sám odvodit product/release authority.

Každý implementation PR/change proposal musí zpětně odkazovat na tento autoritativní work item. Repository-local evidence zůstává ve svém implementation repository; control work item ji odkazuje místo vytváření druhé kopie. Human request vzniklý z implementation PR/run musí v context binding odkazovat přesnou repo-local evidence zpět z control work itemu.

Pokud se změní participating repository, PR/change proposal nebo candidate identity, Integrator znovu sestaví/revaliduje product-level binding a affected gates se posoudí podle exact-candidate/stale pravidel v `delivery-cycle.md`. Stejně tak se každý Human Input Request znovu posuzuje proti svému context binding.

## Handoff destinations

- Asistentka zachycuje Human intent a durable zapisuje explicitní Human answers/authorizations do autoritativního work itemu; analytický work contract z nich neodvozuje.
- Analyst vlastní a aktualizuje analytický authoritative work contract, decomposition a Ready semantics.
- Developer předává implementaci přes PR + commit(s) v příslušném implementation repository; v `multi-repo` PR odkazuje na autoritativní control-repository Issue.
- Reviewer zapisuje durable PR review/comment k přesně reviewovanému candidate.
- Tester zapisuje result proti přesnému testovanému headu/candidate.
- Integrator v `multi-repo` vlastní product-level composite candidate binding/state už před approval a následně vlastní exact-candidate revalidation + integration/release evidence; repository-local evidence zůstává u local rolí.
- Orchestration function je jediný dispatcher a mechanický owner deterministických lifecycle/completion transitionů, včetně Parent Intent roll-up a final executable `Done`, pokud jsou jejich deklarované podmínky objektivně splněné.

Soukromý chatový kontext není handoff ani autoritativní Human response.