# Work item contract

GitHub Issue je task-local pracovní kontrakt. Stejné Issue typicky dozrává z Intake přes Analysis do Ready; nevytváří se nový Issue pouze kvůli změně fáze.

V `single-repo` je Issue ve stejném repository jako implementace. V `multi-repo` existuje právě jeden autoritativní work item v control/governance repository; implementation repositories nesmí vytvářet konkurenční product-level work contract.

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

### Responsible role
Role aktuální executable fáze.

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

Work item je Ready pouze pokud:

- Goal je jednoznačný,
- Scope a Out of scope jsou jasné,
- neexistuje required unresolved decision gate ani jiný `PENDING` Human Input Request nutný před zahájením aktuální executable fáze,
- acceptance criteria jsou testovatelná,
- dependencies a constraints jsou známé,
- canonical references jsou uvedené,
- responsible role je známá,
- required control gates jsou explicitní,
- concurrency/shared surfaces jsou deklarované,
- release policy je určitelná,
- u `multi-repo` jsou známé participating implementation repositories pro tento work item,
- kompetentní nová instance může začít pouze z repo/GitHub stavu.

Analyst nesmí označit Issue Ready jen proto, že existuje nebo obsahuje vyplněnou šablonu.

Human input se může stát nutným i po `Ready`; tehdy vzniká cross-cutting request níže a Ready se znovu vyhodnotí pouze tehdy, pokud Human odpověď změnila vstupy Ready kontraktu.

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

Pending request blokuje pouze dotčený přechod. Pokud žádný jiný nezávislý autorizovaný krok nemůže pokračovat, work item používá existující stav `Blocked`; nový `Human Blocked` lifecycle stav nevzniká.

Po resolution se pokračuje podle `delivery-cycle.md`: current state se znovu načte, Request ID/status/binding se ověří a workflow se vrátí na nejdříve dotčený bod. Resume metadata není oprávnění slepě pokračovat v původní agentní session.

## Repository binding

`single-repo` nepřidává žádná per-work-item topology metadata; Project Profile určuje, že control i implementation jsou ve stejném repository.

V `multi-repo` musí autoritativní work item v control repository během delivery durable udržovat:

- participating implementation repositories,
- reverse links na každý implementation PR/change proposal,
- přesnou immutable candidate identity každého participating repository, jakmile vznikne,
- odkazy na required repository-local review/check/test evidence,
- product-level technical approval, release authorization a integration/release state pro aktuální composite candidate,
- všechny product-level Human Input Requests a jejich Human resolutions.

Každý implementation PR/change proposal musí zpětně odkazovat na tento autoritativní work item. Repository-local evidence zůstává ve svém implementation repository; control work item ji odkazuje místo vytváření druhé kopie. Human request vzniklý z implementation PR/run musí v context binding odkazovat přesnou repo-local evidence zpět z control work itemu.

Pokud se změní participating repository, PR/change proposal nebo candidate identity, product-level candidate musí být znovu vyhodnocen podle exact-candidate/stale pravidel v `delivery-cycle.md`. Stejně tak se každý Human Input Request znovu posuzuje proti svému context binding.

## Handoff destinations

- Analyst/Asistentka aktualizují autoritativní work contract, Human Input Requests/resolutions a decision comments/artefakty v control plane.
- Developer předává implementaci přes PR + commit(s) v příslušném implementation repository; v `multi-repo` PR odkazuje na autoritativní control-repository Issue.
- Reviewer zapisuje durable PR review/comment k přesně reviewovanému candidate.
- Tester zapisuje result proti přesnému testovanému headu/candidate.
- Integrator zapisuje integrated/released candidate a target evidence; v `multi-repo` product-level stav a composite candidate identity zapisuje nebo odkazuje z autoritativního work itemu v control repository.

Soukromý chatový kontext není handoff ani autoritativní Human response.