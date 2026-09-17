# Základní principy

## 1. Repository state je durable source of truth

Pravidlo, rozhodnutí, work contract, blocker, review výsledek nebo informace nutná pro další roli nesmí existovat pouze v chatu nebo paměti agenta.

Chat může být Human interface. Agent-to-agent handoff musí být reconstructable z GitHub/repository state.

### Repository topology

Referenční a výchozí topologie je `single-repo`: jeden repozitář vlastní product-level governance, Human decisions, autoritativní work items, implementaci i product-level delivery state.

`multi-repo` je podporováno pouze jako právě **jeden autoritativní control/governance repository + jeden nebo více implementation repositories**.

- Control/governance repository vlastní product-level governance, Human decisions, autoritativní umístění work items a cross-repository coordination state a odkazy nutné k rekonstrukci product-level delivery state.
- Implementation repositories vlastní své implementační artefakty, branches/PRs/checks a repository-local technical evidence.
- Implementation repository nesmí vytvořit druhý konkurenční product-level source of truth.
- Project Profile musí deklarovat topologii a canonical ownership podle `adoption.md`. U `single-repo` samotná deklarace jednoho repository určuje všechny výše uvedené ownership role. U `multi-repo` musí být control repository a všechny implementation repositories identifikovatelné bez domýšlení.

### Declared/design state vs effective state

Versioned specification, design nebo configuration artifact je důkazem **declared/intended state**, pokud projekt nemá deterministický mechanismus dokazující, že je současně authoritative evidence aktuálního effective state.

Pokud se runtime/platform state může od versioned declaration lišit, Project Profile / canonical map musí určit, odkud se pro danou fact domain získává nebo dokládá effective current state — například platform/API state, deployment evidence, immutable release metadata nebo deterministicky odvozený artifact.

Když je effective fact materiální pro aktuální work contract nebo gate, příslušná role musí použít/citovat relevantní effective evidence. Pokud k ní v autorizovaném prostředí nemá přístup, zaznamená unverified boundary/blocker a nesmí tvrdit equivalence pouze z design/configuration artifactu.

Toto pravidlo nezavádí povinnou runtime kontrolu pro každý task. Projekty s deterministickou Git→effective-state equivalence mohou tento vztah deklarovat jednou a následně jej používat jako autoritativní pravidlo.

## 2. Human/Product Owner drží produktovou autoritu

Agent smí dělat technická rozhodnutí uvnitř již autorizovaného scope. Nesmí sám rozhodnout:

- nové produktové chování,
- materiální změnu scope,
- governance změnu,
- vědomé přijetí významného trade-offu/rizika,
- release authorization tam, kde ji Project Profile vyžaduje,
- nedeterministické zrušení/opuštění product intentu, scope nebo candidate.

Absence odpovědi není rozhodnutí.

Specializovaná role smí durable zaznamenat evidence a doporučit ukončení práce. `Stopped` smí vzniknout bez nového Human rozhodnutí pouze v deterministickém `SUPERSEDED` případě, kdy authoritative replacement/current work item už durable existuje, lossless source→replacement mapping podle `work-item.md` je rekonstruovatelný a Project Profile/project policy takový automatic supersession explicitně dovoluje.

## 3. Human input je podmíněný durable interrupt

Kterákoli role smí vyžádat Human input pouze tehdy, když její další nutnou akci nelze bezpečně a správně provést z aktuálního durable state a existující autority role.

Blocking request i Human odpověď musí být durable navázané na autoritativní work item. Dokud je požadovaný vstup unresolved, automatizace nesmí překročit dotčenou hranici. Pokud žádná jiná nezávislá autorizovaná práce nemůže pokračovat, používá se lifecycle stav `Blocked`.

`Blocked` je recoverable/temporary. Pokud je durable rozhodnuto, že work item nemá dále pokračovat, používá se non-success terminal `Stopped` podle `delivery-cycle.md`; nejde o druhou formu blockeru.

Po Human odpovědi se nepokračuje slepě v původní agentní session. Systém znovu načte aktuální authoritative state, ověří identitu a binding requestu, promítne explicitní Human response do durable state a spustí další již autorizovaný krok od nejdříve dotčeného bodu.

Pokud Human response vyžaduje analytical derivation/mutation Scope/Requirements/AC/Ready contractu, tuto analytickou práci provádí Analyst; Asistentka pouze transportuje/zapisuje explicitní Human input.

Předchozí analýza, check, review nebo approval zůstává platný pouze tehdy, pokud zůstaly platné jeho vstupy a předpoklady. Specializovaná Human release authorization si zachovává vlastní exact-candidate a `STALE` pravidla.

Human nesmí být používán jako rutinní transport agent-to-agent handoffu.

## 4. Scope je kontrakt, ne inspirace

Výchozí cíl je **nejmenší změna, která splní autorizovaný záměr a existující kontrakty**.

Agent:

- explicitně rozlišuje `Scope` a `Out of scope`,
- neopravuje oportunisticky sousední problémy,
- nepovyšuje recommendation, hardening nebo redesign na povinnou implementaci,
- nový materiální problém zaznamená a routuje správné autoritě.

Implementace je realizace dostatečně konkrétního autorizovaného upstream product/domain kontraktu. Kód, DB constraint, validator, UI, generated artifact nebo platform configuration nesmí zavést další, přísnější, alternativní ani jinak odlišné product/domain pravidlo jen jako technické rozhodnutí. Pokud upstream intent/requirements/semantics nejsou dost konkrétní k určení autorizovaného observable behavior bez vymýšlení product meaning, práce není implementation-ready a vrací se do Analysis/shaping/Human decision podle `work-item.md`.

Developer nadále smí dělat běžná technická rozhodnutí uvnitř autorizovaného semantic envelope, pokud tím nemění product/domain semantics nebo observable behavior.

## 5. Role jsou authority contexts, ne automaticky sessions

Canonical role definuje kompetenci/autoritu pro právě vykonávanou práci. Neznamená automaticky samostatný model, proces nebo session.

Každá role-bound session/run však musí mít v každém okamžiku právě jednu **explicitně aktivní roli**:

- role activation/change vzniká pouze explicitním Human assignmentem nebo durable orchestration assignmentem,
- session nesmí roli odvodit z Issue title, handoffu, repository state ani z toho, že další krok působí zřejmě,
- session nesmí tiše přejít na jinou roli nebo vykonat out-of-role práci,
- jedna session smí sekvenčně vykonávat více kompatibilních rolí pouze přes explicitní role transitions a pouze pokud tím není porušena independence/least-privilege hranice,
- chybějící nebo nejednoznačná role je blocker/configuration error, nikoli důvod k domýšlení defaultu.

Autor změny a její nezávislý Reviewer musí být různé logické pracovní instance. Reviewer + Tester lze konsolidovat pouze tam, kde to work contract/Project Profile explicitně dovoluje.

## 6. Role spolupracují, nekonkurují

Výchozí model není několik agentů řešících totéž. Každá fáze má vlastní odpovědnost a kontrolní role práci autora nepřebírá.

Asistentka je Human-facing intake/queue/transport function. Analyst vlastní analytical derivation/shaping/mutation executable work contractu. Orchestration function je jediný canonical dispatcher dalšího již autorizovaného kroku. Integrator vlastní product-level composite-candidate control-plane binding v `multi-repo`, jakmile více repo-local candidates tvoří jeden product candidate.

## 7. Jedna aktuální pravda a semantic authority

Projekt má určit kanonického vlastníka každé trvalé rodiny pravidel. README, AGENTS a task-local Issues mohou shrnovat nebo odkazovat, ale nesmí vytvářet nezávislou druhou specifikaci.

Pro významné truth-bearing artifact families musí canonical documentation/authority map umožnit cold-start agentovi určit, kde je to relevantní:

- product intent/context authority potřebná k interpretaci scope a produktu,
- semantic purpose / fact domain artefaktu,
- authority scope — které facts smí artefakt autoritativně určit,
- binding effect na implementation/review/runtime work,
- currentness — zda jde o current canonical truth, derived/explanatory material, effective-state evidence nebo historical/snapshot/superseded material,
- upstream/downstream vztah nebo precedence potřebnou k řešení konfliktu,
- conflict behavior — který source je při konkrétním typu rozporu autorita a který artefakt je stale/defective/incomplete.

Authority je **fact-domain-scoped**, nikoli jedna globální total ordering všech artefaktů. Effective runtime/platform evidence může být autoritativní pro fakt „co je právě deploynuto/nakonfigurováno“, ale z toho nezískává autoritu měnit fakt „jaké product/domain chování je autorizováno“.

Derived, technical nebo executable artifact má autoritu jen ve svém deklarovaném semantic scope. Samotná executability/enforcement nikdy nevytváří novou product/domain authority. Konflikt technického artefaktu s autorizovaným upstream product/domain kontraktem znamená technický defect nebo neúplný upstream contract; nesmí se normalizovat tím, že current code/config/DB/UI prohlásíme za product rule.

Historical/snapshot/superseded material je pro current-state reconstruction **non-current by default**. Může sloužit jako provenance/evidence, ale nenahrazuje current canonical rule, authoritative work state ani effective-state evidence, pokud jej current authority explicitně nereaktivuje/reassignuje.

Standard nepředepisuje pevnou taxonomy názvů, directory tree, lokální authority headers ani samostatný metadata registry.

## 8. Context economy

Agent načítá minimum **úplného** kontextu potřebného pro aktivní roli a úkol. Tokenová úspora nesmí znamenat vynechání relevantního kontraktu; zároveň se do tasků nekopíruje celý repozitář.

Nový drahý role run se nespouští jen proto, že dorazil event. Pokud relevantní semantic work state od posledního applicable completed run zůstává materiálně stejný a neexistuje jiný objektivně platný progress reason, orchestrace run potlačí podle `automation.md`.

## 9. Automatizace nerozšiřuje autoritu

Workflow, API token, CLI nebo AI provider jsou mechanismy. Technická možnost něco zapsat nebo mergnout není oprávnění to udělat.

Každý automatizovaný krok musí být:

- odvoditelný z durable state,
- povolený explicitně aktivní rolí,
- před dispatch způsobilý podle run-eligibility/dedup pravidel,
- idempotentní nebo chráněný proti duplicitě na write/transition úrovni,
- bezpečně zastavitelný na unresolved Human input nebo jiném Human-owned gate,
- neschopný restartovat `Stopped` práci bez explicitně autorizovaného reopen transition.

## 10. Decision gate ≠ release authorization gate

**Decision gate** určuje, *co* je autorizovaný produkt/scope/governance výsledek.

**Release authorization gate** určuje, zda *konkrétní již technicky přijatý kandidát* smí překročit production-authoritative boundary.

Release approval nesmí měnit scope ani obejít chybějící technické gate. Generic Human Input Request tyto specializované významy nenahrazuje.

## 11. Projektový profil odděluje invariant od konfigurace

Referenční standard vlastní obecné invarianty. Konkrétní projekt musí explicitně určit repository topology a canonical ownership, semantic documentation/authority map, effective-state evidence/equivalence pro relevantní surfaces, své branches, environments, required gates, deployment trigger, release-approval policy, recovery authority, role/provider/runner mapping a provider-neutral způsob pre-dispatch run eligibility/dedup v Project Profile.