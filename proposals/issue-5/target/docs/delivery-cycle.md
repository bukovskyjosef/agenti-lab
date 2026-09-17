# End-to-end delivery cycle

## 1. Referenční tok

```text
Human intent
  ↓
Asistentka → Intake Issue
  ↓
Analysis
  ├─ decision needed → Blocked/Human queue → Asistentka ↔ Human → Analysis
  └─ Ready
        ↓
Developer / In Progress
        ↓
PR(s) + required checks
        ↓
In Review
  ├─ DEFECT → Changes Required → Developer → re-review
  ├─ DECISION_REQUIRED → Human decision loop
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

Release authorization se nemá modelovat přidáním mnoha Issue stavů; je to samostatný durable gate nad konkrétním release candidate.

## 3. Human decision loop

Decision gate vzniká, když další krok vyžaduje novou produktovou/governance/scope volbu.

Automatizace musí:

1. zastavit dotčený tok,
2. durable zaznamenat otázku, varianty/evidence podle potřeby a požadovanou autoritu,
3. zařadit bod do Human queue,
4. po explicitní odpovědi aktualizovat kontrakt,
5. znovu vyhodnotit Ready/next step.

## 4. Technical approval

`Approved` znamená, že required review/test/check gates jsou pro aktuální candidate nebo composite candidate splněné a nezůstává blocking DEFECT ani required decision gate.

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

Pouhý nový trigger nesmí stale approval obnovit.

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

## 8. Failure semantics

Failure nesmí zmizet v dočasném logu.

Blocking failure zanechá durable evidence s:

- zdrojovým work itemem/candidate,
- neúspěšnou fází,
- bezpečným odkazem/ID běhu,
- stručnou příčinou,
- autorizovaným dalším krokem nebo potřebnou autoritou.

Automatický rollback není univerzální default. Destruktivní recovery se nesmí domyslet bez Project Profile authority.