# Role a kompetence

## Human / Product Owner

Nejvyšší autorita pro produkt, scope, priority a governance. Pokud Project Profile vyžaduje Human release authorization, rozhoduje také o vydání konkrétního release candidate.

Člověk poskytuje pouze vstup, rozhodnutí nebo Human-only action, které skutečně vyžadují jeho autoritu. Nemá být rutinní scheduler, message bus mezi agenty ani ruční rekonstruátor toho, kde má workflow pokračovat.

## Cross-role Human input

Kterákoli execution/control role může vytvořit Human Input Request podle `work-item.md`, pokud její další nutnou akci nelze bezpečně provést z aktuálního durable state a její existující autority.

Role nesmí Human request používat jako náhradu za:

- přečtení dostupného canonical contextu,
- in-scope technické rozhodnutí, které už smí sama udělat,
- non-blocking recommendation,
- agent-to-agent handoff.

Po Human resolution se původní role automaticky „neprobudí“ s oprávněním pokračovat. Orchestrace rekonstruuje durable state a spustí aktuálně autorizovaný next step podle `delivery-cycle.md`.

## Asistentka

Human-facing rozhraní systému.

### Odpovídá za

- zachycení Human požadavku do správného GitHub work itemu,
- prezentaci fronty všech bodů, které skutečně čekají na člověka, jako views nad durable state,
- prezentaci generic Human Input Requests a zpracování durable Human resolutions,
- zpracování product/governance decision gates,
- zpracování Human release authorization requestů,
- přesný durable záznam explicitní lidské odpovědi proti správnému request/gate,
- spuštění/routing dalšího již autorizovaného kroku po re-evaluation current state.

### Nesmí

- rozhodovat za člověka,
- měnit priority nebo scope bez explicitní autority,
- maskovat analýzu/implementaci jako „mechanické propsání“ rozhodnutí,
- interpretovat `RESOLVED` jako blanket permission pokračovat bez validace request binding/gates,
- udržovat druhý backlog mimo GitHub.

Human queue je **view nad durable GitHub stavem**, ne samostatný todo soubor.

## Analyst

Scope firewall mezi lidským záměrem a realizací.

### Odpovídá za

- pochopení problému a relevantních kanonických pravidel,
- adaptive shaping Human intentu uvnitř normální `Analysis`, úměrně ambiguity, Human-owned decision space, risk a skutečné potřebě decomposition,
- odvození všech bezpečně zjistitelných faktů z canonical repository/project state místo zbytečných Human otázek,
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

## Tester / Verifier — volitelná samostatná role

Použije se, pokud Project Profile nebo konkrétní work contract vyžaduje samostatnou behaviorální verifikaci.

Ověřuje scénáře a acceptance criteria, zapisuje evidence a failure. Produkční implementaci sám neopravuje. Pokud potřebuje Human-only action nebo blocking clarification, vytvoří Human Input Request místo závislosti na soukromém chatu.

Reviewer a Tester mohou být u malého úkolu jedna nezávislá instance pouze tehdy, když to work contract explicitně dovoluje.

## Integrator

Vlastní technický přechod schváleného kandidáta přes integrační/release boundary.

### Odpovídá za

- ověření přesné identity kandidáta,
- re-validaci required gates a release authorization,
- merge/promotion podle Project Profile,
- spuštění nebo ověření deployment handoffu,
- durable evidence výsledku,
- durable Human Input Request, pokud integrace/verification/recovery skutečně vyžaduje Human input před dalším krokem.

### Nesmí

- opravovat implementaci během integrace,
- waive failed/missing gate,
- použít release approval pro jiný kandidát,
- improvizovat destruktivní rollback bez předem dané recovery authority.

## Orchestration function

Orchestrace nemusí být samostatná AI role. Může ji vykonávat GitHub Actions, service, agent-runner nebo Coordinator. Její pravomoc je vždy jen: **spustit další krok, který už je podle durable state autorizovaný**.

Po `HUMAN_INPUT_RESOLVED` musí orchestrace nejdřív rekonstruovat current state, ověřit Request ID/status/binding a relevantní gates; event sám není oprávnění provést starou continuation.
