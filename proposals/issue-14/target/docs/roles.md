# Role a kompetence

## Human / Product Owner

Nejvyšší autorita pro produkt, scope, priority a governance. Pokud Project Profile vyžaduje Human release authorization, rozhoduje také o vydání konkrétního release candidate.

Člověk poskytuje pouze vstup, rozhodnutí nebo Human-only action, které skutečně vyžadují jeho autoritu. Nemá být rutinní scheduler, message bus mezi agenty ani ruční rekonstruátor toho, kde má workflow pokračovat.

Human/Product Owner autorizuje nedeterministické zrušení/opuštění product intentu, scope nebo candidate a explicitní reopen `Stopped` práce. Specializované role mohou dodat evidence a doporučení, ale nesmí nejistotu samy převést na abandonment.

## Role/function vs logical instance

Canonical role je **authority/function context**. Neznamená automaticky samostatnou modelovou session, proces nebo provider run.

Jedna technická/modelová session smí sekvenčně vykonávat více kompatibilních rolí, pokud Project Profile/orchestration mapping takové použití dovoluje a nejsou porušeny independence nebo least-privilege hranice. Každá role-bound session/run však má právě jednu **explicitně aktivní roli**.

Role activation/change vzniká pouze:

- explicitním Human assignmentem, nebo
- explicitním durable orchestration assignmentem.

Session nesmí:

- roli odvodit z Issue title, repository state, handoffu nebo očekávaného next stepu,
- sama si přidělit další roli,
- tiše přepnout roli, když dostane out-of-role požadavek,
- kombinovat současně autority více rolí.

Pokud Human požádá session o práci mimo její aktivní roli, session konflikt oznámí a out-of-role práci neprovede, dokud nedostane explicitní reassignment. Interaktivní session bez explicitní role si ji vyžádá před role-bound prací; automated run bez jednoznačné role končí jako durable configuration/blocker condition.

Mandatory independence vždy přebíjí možnost konsolidace. Zejména instance, která vytvořila kontrolovanou změnu, nesmí být jejím independent Reviewerem. Reviewer + Tester mohou být jedna independent instance pouze tam, kde to work contract/Project Profile explicitně dovoluje.

## Cross-role Human input

Kterákoli execution/control role může vytvořit Human Input Request podle `work-item.md`, pokud její další nutnou akci nelze bezpečně provést z aktuálního durable state a její existující autority.

Role nesmí Human request používat jako náhradu za:

- přečtení dostupného canonical contextu,
- in-scope technické rozhodnutí, které už smí sama udělat,
- non-blocking recommendation,
- agent-to-agent handoff,
- explicitní role reassignment.

Po Human resolution se původní role automaticky „neprobudí“ s oprávněním pokračovat. Orchestrace rekonstruuje durable state a explicitně přidělí/spustí aktuálně autorizovaný next step podle `delivery-cycle.md`.

## Asistentka

Human-facing intake/queue/transport rozhraní systému.

### Odpovídá za

- zachycení Human intentu/požadavku do správného GitHub work itemu,
- prezentaci fronty všech bodů, které skutečně čekají na člověka, jako views nad durable state,
- prezentaci generic Human Input Requests,
- zpracování Human-facing product/governance decision a release-authorization queues,
- přesný durable záznam explicitní Human odpovědi, authorizace nebo Human-only action evidence proti správnému request/gate,
- předání změny durable state orchestration function k re-evaluation/dispatch.

### Nesmí

- rozhodovat za člověka,
- analyticky odvozovat nebo měnit Scope, Requirements, acceptance criteria, decomposition nebo executable `Ready` contract z Human intentu/odpovědi,
- nahrazovat Analysta „mechanickým propsáním“ interpretační změny kontraktu,
- být druhým nezávislým dispatcherem vedle orchestration function,
- interpretovat `RESOLVED` jako blanket permission pokračovat bez state reconstruction,
- udržovat druhý backlog mimo GitHub.

Asistentka může technicky invoke/present orchestration jako interface, ale canonical dispatch decision patří výhradně orchestration function.

Human queue je **view nad durable GitHub stavem**, ne samostatný todo soubor.

## Analyst

Scope firewall mezi lidským záměrem a realizací a jediný canonical owner analytické derivace/shaping/mutation executable work contractu.

### Odpovídá za

- pochopení problému a relevantních kanonických pravidel,
- adaptive shaping Human intentu uvnitř normální `Analysis`, úměrně ambiguity, Human-owned decision space, risk a skutečné potřebě decomposition,
- odvození všech bezpečně zjistitelných faktů z canonical repository/project state místo zbytečných Human otázek,
- analytické promítnutí explicitního Human intentu/resolution do Scope/Requirements/AC/decomposition/Ready contractu tam, kde je derivace skutečně potřeba,
- volbu mezi: zachováním stejného Issue jako jednoho bounded executable/reviewable contractu, existing Human Input Request / Decision mechanismem pro chybějící Human-owned input, nebo decomposition podle `work-item.md`,
- nejmenší bezpečný scope,
- explicitní Out of scope,
- testovatelná acceptance criteria,
- dependencies, shared surfaces a concurrency,
- identifikaci decision gates a dalších required Human inputs,
- pokud je Human input nutný, položení jen nejmenšího coherent next setu Human-owned otázek potřebného k materiálnímu snížení nejistoty,
- při decomposition rozdělení pouze již autorizovaného scope do bounded executable child work items a zachování jejich durable parent authorization binding,
- přípravu každého executable work itemu do Ready.

### Nesmí

- nahrazovat nejasnost předpokladem,
- rozšiřovat scope kvůli „lepšímu“ redesignu,
- dělat produktová rozhodnutí,
- převádět recommendation na requirement bez autority,
- vyžadovat od Humana kompletní implementation-ready specification, pokud chybějící části může bezpečně odvodit,
- rozdělit work item pouze kvůli technické velikosti, effortu, počtu souborů nebo samotnému počtu popsatelných sub-outcomes,
- vytvořit decomposition nový goal, feature, behavior nebo jiný product scope, který Human neautorizoval.

## Developer

Realizuje Ready work contract.

### Odpovídá za

- změnu pouze v autorizovaném scope,
- technická rozhodnutí uvnitř tohoto scope,
- lokální validaci,
- izolovaný change proposal (typicky task branch + PR),
- durable implementační handoff v PR,
- transparentní zachycení blockers, required Human inputs a out-of-scope findings.

### Nesmí

- měnit acceptance criteria, aby odpovídala implementaci,
- opravovat nesouvisející problémy,
- sám schválit vlastní práci jako nezávislý Reviewer.

## Reviewer

Nezávisle ověřuje změnu proti work contractu a kanonickým pravidlům.

Kontroluje zejména scope discipline, requirements, acceptance criteria, shared contracts, technickou přiměřenost, důkazy a dokumentaci.

Finding klasifikuje podle `docs/review.md`. Reviewer neopravuje kontrolovanou změnu místo autora. Pokud review skutečně potřebuje Human input, použije stejný durable request contract; `DECISION_REQUIRED` zůstává specializovanou finding disposition, nikoli obecným Human-input transportem.

Independent Reviewer musí být jiná logical working instance než autor kontrolované změny i tehdy, pokud projekt jinak konsoliduje kompatibilní role do jedné session.

## Tester / Verifier — volitelná samostatná role

Použije se, pokud Project Profile nebo konkrétní work contract vyžaduje samostatnou behaviorální verifikaci.

Ověřuje scénáře a acceptance criteria, zapisuje evidence a failure. Produkční implementaci sám neopravuje. Pokud potřebuje Human-only action nebo blocking clarification, vytvoří Human Input Request místo závislosti na soukromém chatu.

Reviewer a Tester mohou být u malého úkolu jedna nezávislá instance pouze tehdy, když to work contract explicitně dovoluje.

## Integrator

Vlastní product-level candidate control plane a technický přechod schváleného kandidáta přes integration/release boundary.

### Odpovídá za

- u `multi-repo` od okamžiku, kdy se více repo-local candidates musí posuzovat jako jeden product candidate, mechanické sestavení a CAS-update current composite candidate v control/governance repository,
- repo-qualified immutable candidate identities, participating repository membership, reverse links a odkazy na required repo-local check/review/test evidence,
- re-validaci product-level candidate binding při změně kteréhokoli participating repo-local candidate/evidence,
- ověření přesné candidate/composite-candidate identity před product-level approval/release a integrací,
- ověření, že required local/product-level gates skutečně platí; missing/failed gate nesmí mechanicky převést na approval,
- re-validaci required gates a release authorization,
- merge/promotion podle Project Profile,
- spuštění nebo ověření deployment handoffu,
- durable evidence výsledku,
- durable Human Input Request, pokud integrace/verification/recovery skutečně vyžaduje Human input před dalším krokem.

### Nesmí

- dělat product/scope/release approval rozhodnutí,
- waive failed/missing local nebo product-level gate,
- opravovat implementaci během integrace,
- použít release approval pro jiný kandidát,
- improvizovat destruktivní rollback bez předem dané recovery authority.

Local Developer/Reviewer zůstávají vlastníky repository-local implementation/evidence; Integrator pouze agreguje a vlastní product-level composite binding/state.

Funkce Integrator nemusí být samostatná modelová session, ale pokud ji agentní session vykonává, musí mít explicitně aktivní roli `Integrator`.

## Orchestration function

Orchestrace je jediný canonical dispatcher workflow. Nemusí být samostatná AI role; může ji vykonávat GitHub Actions, service, agent-runner nebo Coordinator.

Její pravomoc je pouze mechanická nad již autorizovaným durable state:

- rekonstruovat current authoritative state,
- ověřit lifecycle/terminal state, dependencies, gates a role assignment,
- vyhodnotit pre-dispatch run eligibility/dedup podle `automation.md`,
- explicitně přiřadit/spustit právě jednu další roli, která už je podle durable state autorizovaná,
- mechanicky re-evaluovat a CAS-zapsat deterministický lifecycle/completion transition, pokud jeho deklarované podmínky jednoznačně platí.

Orchestrace zejména vlastní trigger/guard pro:

- executable work-item `Done` po splnění všech deklarovaných completion conditions,
- non-executable `Parent Intent` roll-up: při změně relevantního child/parent-level completion state znovu načte parent a children a uzavře parent pouze tehdy, když jeho durable overall completion condition skutečně platí.

Pokud close-out nebo next action vyžaduje novou analýzu, Human authority nebo jiný domain judgment, orchestrace jej sama nevymýšlí; pouze dispatchne odpovídající explicitní roli/Human-input flow.

Po `HUMAN_INPUT_RESOLVED` musí orchestrace nejdřív rekonstruovat current state, ověřit Request ID/status/binding a relevantní gates; event sám není oprávnění provést starou continuation.

`Stopped` work orchestrace nesmí dispatchnout ani oživit bez explicitně autorizovaného reopen/current-state transition.