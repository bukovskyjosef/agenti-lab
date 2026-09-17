# Automation and event model

Cílem je, aby běžný work item procházel rolemi bez Human relay, ale automatizace nikdy nepřevzala produktovou nebo release autoritu.

## 1. Trigger není autorita

Event pouze říká „stav se mohl změnit“. Každý agent/runner před write akcí znovu načte authoritative project GitHub/repository state podle Project Profile a ověří, že další krok je stále povolený.

To platí i pro Human response: `HUMAN_INPUT_RESOLVED` není příkaz „pokračuj“, ale pouze trigger k nové state reconstruction.

U executable child work itemu zahrnuje authoritative state také aktuální `Parent Intent` a inherited parent authorization inputs, na které child durable odkazuje. Child trigger nesmí obejít pozdější parent změnu.

## 2. Referenční event vocabulary

Projekt může eventy mapovat na GitHub native state, labels, comments, checks, webhooks nebo jiný mechanismus. Nemá vytvářet duplicitní pseudo-ERP, pokud GitHub již pravdu reprezentuje.

Sémanticky musí umět rozlišit alespoň:

- `INTAKE_CREATED`
- `ANALYSIS_REQUESTED`
- `HUMAN_INPUT_REQUIRED`
- `HUMAN_INPUT_RESOLVED`
- `READY_FOR_EXECUTION`
- `IMPLEMENTATION_READY`
- `CHECKS_PASSED` / `CHECKS_FAILED`
- `REVIEW_APPROVED`
- `REVIEW_CHANGES_REQUIRED`
- `REVIEW_DECISION_REQUIRED`
- `RELEASE_AUTH_REQUESTED`
- `RELEASE_AUTH_GRANTED`
- `RELEASE_AUTH_REJECTED`
- `RELEASE_AUTH_STALE`
- `INTEGRATION_REQUESTED`
- `INTEGRATION_COMPLETED` / `INTEGRATION_FAILED`
- `DEPLOYMENT_VERIFIED` / `DEPLOYMENT_FAILED`

Adaptive shaping/decomposition nepřidává novou event family; jde o normální `Analysis` a durable Issue state podle `work-item.md`.

## 3. Human-input event semantics

Generic Human Input Request contract vlastní `work-item.md`; resume a invalidation vlastní `delivery-cycle.md`.

`HUMAN_INPUT_REQUIRED` znamená, že existuje `PENDING` durable request a dotčený přechod nesmí pokračovat. Event musí být svázaný alespoň s autoritativním work itemem a Request ID; podle requestu také s relevantním repository/PR/candidate/target/run binding.

`HUMAN_INPUT_RESOLVED` znamená, že request mohl získat durable Human resolution. Runner před pokračováním musí ověřit alespoň:

- authoritative work item identity/state,
- Request ID a aktuální request status,
- že request není `STALE` a jeho context binding stále odpovídá current state,
- current candidate/PR/target identity tam, kde je relevantní,
- validity required gates,
- zda Human odpověď změnila canonical contract nebo assumptions některého předchozího gate.

Teprve potom znovu odvodí lifecycle/role/next action od nejdříve dotčeného bodu. Delayed event pro starý Request ID nebo změněný binding musí skončit bez write akce.

Duplicate `HUMAN_INPUT_RESOLVED` smí opakovat bezpečnou state evaluation, ale nesmí duplicitně provést následný transition/action.

V `multi-repo` žije generic request/resolution s autoritativním work itemem v control/governance repository. Implementation runner může event pozorovat, ale před pokračováním musí znovu načíst control-repository state a repo-qualified local evidence uvedenou v bindingu.

Configured release authorization zůstává samostatnou event/gate rodinou `RELEASE_AUTH_*`; generic Human-input eventy ji nenahrazují ani neudělují.

## 4. Human queues

Asistentka pracuje nad views odvozenými z durable state:

- všechny `PENDING` generic Human Input Requests,
- intake needing Human clarification,
- product/governance decision queue,
- release authorization queue.

Specializované views mohou ukazovat stejný underlying durable stav vhodným způsobem; nevytvářej separátní ručně udržovaný backlog.

## 5. Least privilege

Technická oprávnění mají co nejvíce odpovídat roli:

- Analyst/Asistentka nepotřebují produkční code write,
- Reviewer nepotřebuje commitovat opravu do autorovy branch,
- Integrator nepotřebuje produktovou decision authority,
- deployment credentials se zpřístupňují pouze kroku, který je skutečně potřebuje.

Human-only credential/access request nesmí vést ke kopírování secret values do Issue; durable request uchovává pouze bezpečný požadavek a completion evidence.

## 6. Idempotence a concurrency

Automatizace musí zabránit dvojímu provedení stejného přechodu.

Použij podle platformy například:

- per-Issue/per-PR concurrency group,
- lock/run marker,
- compare-and-set kontrolu lifecycle/candidate identity,
- compare-and-set kontrolu Human Request ID/status/context binding,
- deduplikaci follow-up artefaktů,
- deduplikaci automated child creation a parent↔child linkage,
- retry-safe kroky.

Automation nesmí pokračovat přes transition guard, dokud relevantní request zůstává `PENDING`. `STALE` request se nesmí automaticky změnit zpět na resolved/current jen proto, že dorazil opožděný event nebo odpověď.

Před vytvořením nebo spuštěním executable child orchestrace znovu načte authoritative Parent Intent + child state, ověří durable parent relationship a inherited authorization inputs. Retry decomposition nesmí vytvořit duplicate child pro stejný plánovaný scope unit.

Pokud se Parent Intent změní, orchestrace nepovažuje všechny children mechanicky za stale. Identifikuje affected children podle jejich durable parent-input dependencies a použije earliest-affected-point pravidla z `delivery-cycle.md`. Delayed nebo již queued run affected child se zastaví, pokud current authoritative state už jeho předchozí `Ready`/next action nepovoluje; unaffected children mohou pokračovat.

## 7. Role isolation

Automatické chaining nesmí zrušit nezávislost control role. Implementační a review run mají mít oddělený context/session a Reviewer nesmí dostávat skrytý reasoning autora jako náhradu za durable artefakty.

Stejně tak deterministic resume nesmí záviset na zachování skrytého reasoning/session stavu role, která Human request vytvořila.

## 8. Durable failure

Failure, který zastaví tok, zanechá durable blocker. Nestačí transient CI log.

Blocker má obsahovat zdroj práce, fázi/runner, bezpečný run link/ID, stručný stav a autorizovaný next step. Nekopírují se secrets ani nepotřebný raw log dump.

Pokud next step vyžaduje Human input, blocker vytvoří nebo odkáže přesný Human Input Request místo očekávání odpovědi pouze v chatu.

## 9. Release authorization safety

Automation smí požádat o approval a následně ověřit jeho status. Nesmí approval udělit.

Před integrací ověří:

- candidate identity,
- target boundary/boundaries,
- required gate validity,
- že approval není stale,
- že od approval nenastala změna, kterou Project Profile považuje za invalidující.

U `multi-repo` se tato kontrola provádí nad celým composite candidate a jeho repository membership, ne nad jednotlivými PRs izolovaně.

Generic Human response ponechá release approval platný jen tehdy, pokud nezměnila jeho bound candidate/target nebo jiný závislý input/assumption; jinak se použijí normální `RELEASE_AUTH_STALE` semantics.

## 10. Provider adapters

Claude/Codex/IDE/runner-specific instrukce jsou adaptér. Smějí překládat obecné role a eventy do nástrojů, ale nesmí měnit authority, scope, lifecycle, Human-input guards nebo control gates.

## 11. Project Profile — povinná automatizační konfigurace

Projekt musí durable určit minimálně:

- repository topology a canonical ownership podle `adoption.md`; u `multi-repo` zejména control repository, implementation repository set, work-item/decision locations, cross-repository binding a composite candidate identity rule,
- canonical docs map,
- production-authoritative boundary/boundaries,
- task branch a PR target policy,
- required checks/control gates,
- Human release authorization policy podle environment/work class,
- deployment trigger a environments,
- minimum post-release verification,
- rollback/retry/recovery authority,
- provider/runner mapping rolí a eventů,
- případnou policy pro target/base drift po release approval.

Generic Human-input subflow ani adaptive shaping/decomposition nepotřebují vlastní Project Profile queue/location: používají autoritativní work item/control plane a native GitHub relationships už určené repository topology.
