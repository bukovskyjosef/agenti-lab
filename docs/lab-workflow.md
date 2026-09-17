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

### Waiting ownership

Každý otevřený Issue a každý aktivní PR musí explicitně říkat, **na koho nebo na co právě čeká**. Stav nesmí být nutné odvozovat z historie komentářů.

Používej krátké jednoznačné statusy, například:

- `READY FOR A`
- `READY FOR E`
- `READY FOR R`
- `READY FOR P`
- `WAITING FOR HUMAN`
- `WAITING FOR K`
- `BLOCKED BY #N`
- `IMPLEMENTED — WAITING FOR R IN #N`

Pokud agent dokončí svůj krok nebo vznikne nový blocker, musí odpovídající Issue/PR status aktualizovat ještě před handoffem v chatu.

## 3. K — Konzultant a Human dispatch

K je Human-facing poradce a koordinátor. Pomáhá Humanovi:

- orientovat se v otevřené práci,
- určit, zda další krok patří A, E, R nebo P,
- formulovat decision-ready otázku,
- durable zapsat explicitní Human rozhodnutí, pokud vzniklo v dialogu s K,
- založit nebo aktualizovat navazující Issue a dependency/status,
- hlídat, aby se práce nezacyklila nebo nepřeskočila potřebné review.

K nesmí nahrazovat specializované role. Pokud materiálně navrhl nebo editoval změnu, nesmí být jejím nezávislým R.

K **není povinný prostředník Human rozhodnutí**. Pokud aktivní A/E/R/P při práci narazí na konkrétní rozhodnutí, které spadá do scope jeho aktuálního Issue, položí otázku Humanovi přímo. Human může odpovědět přímo tomuto agentovi; aktivní agent rozhodnutí durable zapíše do relevantního Issue/PR, přehodnotí dotčený stav a pokračuje, pokud je blocker odstraněn.

K se zapojuje zejména tehdy, když rozhodnutí přesahuje scope aktuálního Issue, ovlivňuje více pracovních bodů nebo rolí, není jasné kam patří, vyžaduje změnu pracovní fronty, nebo si Human přeje konzultaci před rozhodnutím.

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

Pokud potřebný Human decision patří přímo do scope analyzovaného Issue, A jej může s Humanem vyřešit přímo a odpověď sám durable zaznamená.

## 5. E — Editace / implementace změny

Po schválení směru E připraví přesný reviewovatelný cílový obsah.

E:

- zpracuje pouze autorizovaný návrh nebo findings,
- neexpanduje scope mimo Issue,
- pokud narazí na Human rozhodnutí uvnitř scope svého Issue, položí otázku Humanovi přímo, durable zapíše odpověď a pokračuje po přehodnocení dotčeného stavu,
- pokud by rozhodnutí měnilo širší scope nebo další pracovní body, zastaví se a předá koordinaci K,
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
- odlišuje skutečný defect od doporučení a od bodu vyžadujícího Human rozhodnutí,
- pokud review vyžaduje konkrétní Human rozhodnutí v rámci aktuálního review Issue, může se Humanovi zeptat přímo a jeho odpověď durable zaznamená; širší koordinaci předá K.

Post-publish review je rovněž práce R; nejde o samostatnou roli.

## 7. Human decision

Materiální změnu směru produktu `agenti` schvaluje Human/Product Owner.

Human rozhodnutí nemusí vždy protékat přes K. Aktivní A/E/R/P může s Humanem vést decision dialog přímo, pokud otázka patří do scope jeho aktuálního Issue.

Agent, který rozhodnutí obdržel, je odpovědný za:

1. durable zápis přesného rozhodnutí do relevantního Issue/PR,
2. aktualizaci waiting/status informace,
3. přehodnocení, které dosavadní artefakty, review nebo assumptions zůstávají platné,
4. pokračování v rámci již autorizovaného scope, pokud je blocker odstraněn.

K je vhodný pro širší nebo nejasné rozhodnutí, koordinaci více Issues/rolí a konzultaci na přání Humana.

`agenti-lab` nemá roli Asistentky.

## 8. P — Publish do `agenti/main`

Po explicitním Human schválení a požadovaném independent review smí P:

1. načíst přesný schválený target,
2. zapsat jej do `agenti/main`,
3. nepřenášet do produktu lab historii, diskusi, rejected variants ani otevřené otázky,
4. nepřidávat během publish nový scope,
5. zapsat výsledný target commit SHA zpět do lab Issue.

Pokud P narazí na konkrétní Human rozhodnutí uvnitř svého aktuálního publish kontraktu, může si jej vyžádat přímo a durable zaznamenat. P nesmí rozhodnutím rozšířit schválený publication scope.

V `agenti` se kvůli publish nevytváří vlastní Issue nebo feature branch.

## 9. Post-publish review

Po publish jiná logická instance R ověří alespoň:

- že `agenti/main` odpovídá schválenému targetu,
- že dokumentace je interně konzistentní a cold-startable,
- že neobsahuje pracovní lab artefakty,
- že běžný konzument nemusí číst `agenti-lab`, aby pochopil aktuální standard.

Pokud R najde problém, zapíše jej do existujícího lab Issue a práce se vrátí do corrective loopu.

## 10. Povinný Human-facing handoff

Po každém dokončeném pověření musí **A, E, R a P** v chatu Humanovi explicitně říct, co má zadat dál. Cílem je, aby Human nemusel znovu rekonstruovat workflow ani formulovat prompt.

Agent musí z aktuálního durable stavu určit **jedinou další kanonickou roli** a odpověď ukončit ve formátu:

> **Dle pravidel je teď potřeba zadat R (Reviewerovi) úkol:**
>
> `Jsi R. Pracuj na Issue #N v repozitáři bukovskyjosef/agenti-lab. Řiď se repozitářem. <stručné upřesnění jen pokud je nutné>`

Role se nahradí skutečným dalším krokem `A`, `E`, `R`, `K` nebo `P`.

Handoff musí splnit:

- prompt je copy-paste ready,
- prompt odkazuje na repository state a nevyžaduje přenášet soukromý chatový kontext,
- agent vybere právě jednu další roli,
- pokud je uvnitř aktivního Issue potřeba Human decision, agent se ptá přímo Humana a po durable zápisu pokračuje; K není automatický mezikrok,
- pokud rozhodnutí přesahuje scope Issue, ovlivňuje více bodů nebo vyžaduje koordinaci, další krok se předá na K,
- při close-outu nebo potřebě koordinace se další krok předá na K,
- blokované roli se úkol nepředává; prompt míří na roli nebo Humana, kteří skutečně odstraní blocker,
- handoff sám o sobě nevytváří nový Issue/PR, pokud existující artefakt stačí.

K je z povinného formátu vyňat, protože jeho průběžnou funkcí je právě koordinace Humana a dalších handoffů. Může však stejný formát používat pro pohodlí a konzistenci.

## 11. Durable handoff

| Výsledek | Kam patří |
|---|---|
| analysis / findings / návrh | `agenti-lab` Issue |
| experiment nebo větší editace | lab branch / PR |
| independent review | lab Issue / PR review |
| Human decision | relevantní lab Issue / PR |
| přesný approved publication target | lab Issue / reviewed lab PR |
| publikovaný výsledek | `agenti/main` |
| target commit SHA + post-publish review | lab Issue |

Chat slouží člověku jako pohodlné rozhraní. Další agent ale musí být schopen pokračovat z repozitáře. Povinný Human-facing prompt je navigační pomůcka pro Humana, nikoli náhrada durable handoffu.