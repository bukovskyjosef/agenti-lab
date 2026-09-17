# Lab workflow

Tento dokument definuje jednoduchý pracovní model pro vývoj produktu `bukovskyjosef/agenti`.

Lab sám **nemusí být autonomní**. Human/Product Owner může být ruční koordinátor; **K = Konzultant** mu může průběžně pomáhat držet kontext, formulovat rozhodnutí a řídit pracovní frontu.

## 1. Kanonické role

V `agenti-lab` platí:

- **A = Analyst**
- **E = Editor**
- **R = Reviewer**
- **K = Konzultant**
- **P = Publisher**

Zkratka je první písmeno jediného kanonického názvu role. Alternativní názvy rolí `Investigator`, `Implementer`, `Critic`, `Verifier` ani `Asistentka` se nepoužívají.

## 2. Issue je jednotka práce

Každá smysluplná otevřená práce nad etalonem má durable Issue v `agenti-lab`.

Issue může představovat například audit/review, analýzu, zpracování findings, rozhodovací bod, experiment, návrh změny, editaci/implementaci schválené změny, publication nebo post-publish review.

Není potřeba složitý univerzální lifecycle. Stav musí být dostatečně jasný z Issue a souvisejících artefaktů, aby další agent poznal, co je hotové a co zbývá.

## 3. K — Konzultant a Human dispatch

K je Human-facing poradce a koordinátor. Pomáhá Humanovi:

- orientovat se v otevřené práci,
- určit, zda další krok patří A, E, R nebo P,
- formulovat decision-ready otázku,
- durable zapsat explicitní Human rozhodnutí,
- založit nebo aktualizovat navazující Issue a dependency/status,
- hlídat, aby se práce nezacyklila nebo nepřeskočila potřebné review.

K nesmí nahrazovat specializované role. Pokud materiálně navrhl nebo editoval změnu, nesmí být jejím nezávislým R.

Human může spustit agenta jednoduchou instrukcí typu:

> Jsi R. Pracuj na Issue #N v `bukovskyjosef/agenti-lab`. Řiď se repozitářem.

Agent si načte účel labu, přidělené Issue včetně komentářů a linked artefaktů, pravidla své role z `AGENTS.md` a pouze relevantní část aktuálního `agenti/main`.

Agent **nepotřebuje automaticky pokračovat na další Issue** a nemá si bez pověření přibírat práci.

## 4. A — Analysis

A:

- ověří skutečný problém proti aktuálnímu etalonu,
- shromáždí evidence,
- rozliší fakta, interpretaci a doporučení,
- minimalizuje scope,
- připraví materiální varianty pouze tam, kde je potřeba Human volba,
- durable zapíše závěr do Issue.

Možný výsledek je například: nic měnit není potřeba, potřebujeme další evidence, existuje konkrétní návrh změny, nebo potřebujeme Human decision.

## 5. E — Editace / implementace změny

Po schválení směru E připraví přesný reviewovatelný cílový obsah.

E:

- zpracuje pouze autorizovaný návrh nebo findings,
- neexpanduje scope mimo Issue,
- pokud narazí na nový materiální směr, zastaví se a vrátí Human decision přes K/Humana místo vlastního rozhodnutí,
- pro větší změnu může použít lab branch/PR,
- pro malou změnu může přesný návrh existovat přímo v Issue, pokud je jednoznačně reviewovatelný,
- nepublikuje změnu přímo do `agenti/main`.

## 6. R — Review

R je jiná logická instance než autor kontrolovaného návrhu nebo změny.

R může kontrolovat auditní závěr, návrh změny standardu, zpracování předchozích findings, konkrétní lab branch/PR i publikovaný stav `agenti/main`.

R:

- pracuje z durable artefaktů, ne z ústního/chatového převyprávění,
- findings zapisuje do Issue/PR/review,
- neopravuje kontrolovanou práci jako její autor,
- odlišuje skutečný defect od doporučení a od bodu vyžadujícího Human rozhodnutí.

Post-publish verification je rovněž práce R; nejde o samostatnou roli.

## 7. Human decision

Materiální změnu směru produktu `agenti` schvaluje Human/Product Owner.

Decision-ready A nebo K má člověku předložit stručný problém, evidence a jejich limity, relevantní varianty/trade-offy a případné doporučení oddělené od rozhodnutí.

Human decision se zapíše do příslušného lab Issue. `agenti-lab` nemá roli Asistentky.

## 8. P — Publish do `agenti/main`

Po explicitním Human schválení a požadovaném independent review smí P:

1. načíst přesný schválený target,
2. zapsat jej do `agenti/main`,
3. nepřenášet do produktu lab historii, diskusi, rejected variants ani otevřené otázky,
4. nepřidávat během publish nový scope,
5. zapsat výsledný target commit SHA zpět do lab Issue.

V `agenti` se kvůli publish nevytváří vlastní Issue nebo feature branch.

## 9. Post-publish review

Po publish jiná logická instance R ověří alespoň:

- že `agenti/main` odpovídá schválenému targetu,
- že dokumentace je interně konzistentní a cold-startable,
- že neobsahuje pracovní lab artefakty,
- že běžný konzument nemusí číst `agenti-lab`, aby pochopil aktuální standard.

Pokud R najde problém, zapíše jej do lab Issue a práce se vrátí do corrective loopu.

## 10. Durable handoff

| Výsledek | Kam patří |
|---|---|
| analysis / findings / návrh | `agenti-lab` Issue |
| experiment nebo větší editace | lab branch / PR |
| independent review | lab Issue / PR review |
| Human decision | lab Issue |
| přesný approved publication target | lab Issue / reviewed lab PR |
| publikovaný výsledek | `agenti/main` |
| target commit SHA + post-publish review | lab Issue |

Chat slouží člověku jako pohodlné rozhraní. Další agent ale musí být schopen pokračovat z repozitáře.