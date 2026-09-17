# Lab workflow

Tento dokument definuje jednoduchý pracovní model pro vývoj produktu `bukovskyjosef/agenti`.

Lab sám **nemusí být autonomní**. Human/Product Owner může být ruční koordinátor, který jednotlivým agentům zadává konkrétní roli a Issue.

## 1. Issue je jednotka práce

Každá smysluplná otevřená práce nad etalonem má durable Issue v `agenti-lab`.

Issue může představovat například:

- audit nebo review,
- investigation / analýzu,
- zpracování findings,
- rozhodovací bod,
- experiment,
- návrh změny etalonu,
- implementaci schválené změny,
- publication nebo post-publish verification.

Není potřeba složitý univerzální lifecycle. Stav musí být dostatečně jasný z Issue a souvisejících artefaktů, aby další agent poznal, co je hotové a co zbývá.

## 2. Human dispatch

Human může spustit agenta jednoduchou instrukcí typu:

> Jsi Reviewer. Pracuj na Issue #N v `bukovskyjosef/agenti-lab`. Řiď se repozitářem.

Agent si načte:

1. účel labu z root README,
2. přidělené Issue včetně komentářů a linked artefaktů,
3. pravidla své role z `AGENTS.md`,
4. pouze relevantní část aktuálního `agenti/main`.

Agent **nepotřebuje automaticky pokračovat na další Issue** a nemá si bez pověření přibírat práci.

## 3. Analysis / Investigation

Analyst nebo Investigator:

- ověří skutečný problém proti aktuálnímu etalonu,
- shromáždí evidence,
- rozliší fakta, interpretaci a doporučení,
- minimalizuje scope,
- připraví materiální varianty pouze tam, kde je potřeba Human volba,
- durable zapíše závěr do Issue.

Možný výsledek je například:

- nic měnit není potřeba,
- potřebujeme další evidence,
- existuje konkrétní návrh změny,
- potřebujeme Human decision.

## 4. Reviewer

Reviewer je jiná logická instance než autor kontrolovaného návrhu nebo změny.

Review může kontrolovat:

- auditní závěr,
- návrh změny standardu,
- zpracování předchozích findings,
- konkrétní lab branch/PR,
- publikovaný stav `agenti/main`.

Reviewer:

- pracuje z durable artefaktů, ne z ústního/chatového převyprávění,
- findings zapisuje do Issue/PR/review,
- neopravuje kontrolovanou práci jako její autor,
- odlišuje skutečný defect od doporučení a od bodu vyžadujícího Human rozhodnutí.

## 5. Zpracování findings

Pokud review vrátí připomínky, Human může přidělit Issue jiné instanci jako Analyst/Editor/Implementer.

Ta:

- zpracuje pouze relevantní findings,
- neexpanduje scope mimo Issue,
- pokud finding vyžaduje nový materiální směr, připraví Human decision místo jeho automatického rozhodnutí,
- zanechá nový durable výsledek pro další review.

Cyklus se může opakovat, dokud není návrh dostatečně kvalitní.

## 6. Human decision

Materiální změnu směru produktu `agenti` schvaluje Human/Product Owner.

Decision-ready agent má člověku předložit:

- stručný problém,
- evidence a jejich limity,
- relevantní varianty/trade-offy,
- případné doporučení oddělené od rozhodnutí.

Human decision se zapíše do příslušného lab Issue. Samostatná role Asistentky je v labu volitelná; člověk může rozhodovací dialog vést přímo s Analystem nebo jiným pověřeným agentem.

## 7. Příprava změny etalonu

Po schválení směru Editor/Implementer připraví přesný cílový obsah.

Pro větší změnu je vhodná lab branch/PR. Pro malou změnu může přesný návrh existovat přímo v Issue, pokud je stejně jednoznačně reviewovatelný.

Před publikací musí jiná instance Reviewer ověřit **přesný obsah, který má být publikován**, nikoli jen obecnou myšlenku.

## 8. Publish do `agenti/main`

Po explicitním Human schválení a požadovaném independent review smí Publisher:

1. načíst přesný schválený target,
2. zapsat jej do `agenti/main`,
3. nepřenášet do produktu lab historii, diskusi, rejected variants ani otevřené otázky,
4. nepřidávat během publish nový scope,
5. zapsat výsledný target commit SHA zpět do lab Issue.

V `agenti` se kvůli publish nevytváří vlastní Issue nebo feature branch.

## 9. Post-publish verification

Po publish jiná logická instance ověří alespoň:

- že `agenti/main` odpovídá schválenému targetu,
- že dokumentace je interně konzistentní a cold-startable,
- že neobsahuje pracovní lab artefakty,
- že běžný konzument nemusí číst `agenti-lab`, aby pochopil aktuální standard.

Pokud verification najde problém, zapíše jej do lab Issue a práce se vrátí do corrective loopu.

## 10. Durable handoff

| Výsledek | Kam patří |
|---|---|
| analysis / findings / návrh | `agenti-lab` Issue |
| experiment nebo větší editace | lab branch / PR |
| independent review | lab Issue / PR review |
| Human decision | lab Issue |
| přesný approved publication target | lab Issue / reviewed lab PR |
| publikovaný výsledek | `agenti/main` |
| target commit SHA + post-publish verification | lab Issue |

Chat slouží člověku jako pohodlné rozhraní. Další agent ale musí být schopen pokračovat z repozitáře.