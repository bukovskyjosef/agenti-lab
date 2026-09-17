# Automation and event model

Cílem je, aby běžný work item procházel rolemi bez Human relay, ale automatizace nikdy nepřevzala produktovou nebo release autoritu.

## 1. Trigger není autorita

Event pouze říká „stav se mohl změnit“. Každý agent/runner před write akcí znovu načte authoritative project GitHub/repository state podle Project Profile a ověří, že další krok je stále povolený.

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

## 3. Human queues

Asistentka pracuje nad views odvozenými z durable state:

- intake needing Human clarification,
- product/governance decision queue,
- release authorization queue.

Nevytváří separátní ručně udržovaný backlog.

## 4. Least privilege

Technická oprávnění mají co nejvíce odpovídat roli:

- Analyst/Asistentka nepotřebují produkční code write,
- Reviewer nepotřebuje commitovat opravu do autorovy branch,
- Integrator nepotřebuje produktovou decision authority,
- deployment credentials se zpřístupňují pouze kroku, který je skutečně potřebuje.

## 5. Idempotence a concurrency

Automatizace musí zabránit dvojímu provedení stejného přechodu.

Použij podle platformy například:

- per-Issue/per-PR concurrency group,
- lock/run marker,
- compare-and-set kontrolu lifecycle/candidate identity,
- deduplikaci follow-up artefaktů,
- retry-safe kroky.

## 6. Role isolation

Automatické chaining nesmí zrušit nezávislost control role. Implementační a review run mají mít oddělený context/session a Reviewer nesmí dostávat skrytý reasoning autora jako náhradu za durable artefakty.

## 7. Durable failure

Failure, který zastaví tok, zanechá durable blocker. Nestačí transient CI log.

Blocker má obsahovat zdroj práce, fázi/runner, bezpečný run link/ID, stručný stav a autorizovaný next step. Nekopírují se secrets ani nepotřebný raw log dump.

## 8. Release authorization safety

Automation smí požádat o approval a následně ověřit jeho status. Nesmí approval udělit.

Před integrací ověří:

- candidate identity,
- target boundary/boundaries,
- required gate validity,
- že approval není stale,
- že od approval nenastala změna, kterou Project Profile považuje za invalidující.

U `multi-repo` se tato kontrola provádí nad celým composite candidate a jeho repository membership, ne nad jednotlivými PRs izolovaně.

## 9. Provider adapters

Claude/Codex/IDE/runner-specific instrukce jsou adaptér. Smějí překládat obecné role a eventy do nástrojů, ale nesmí měnit authority, scope, lifecycle nebo control gates.

## 10. Project Profile — povinná automatizační konfigurace

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