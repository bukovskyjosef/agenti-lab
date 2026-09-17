# Lab workflow

Tento dokument definuje pracovní model pro vývoj standardu publikovaného v `bukovskyjosef/agenti`.

## 1. Intake

Vstupem může být:

- problém pozorovaný při adopci,
- auditní nález,
- otázka nad cílovým standardem,
- nový workflow/release nápad,
- failure/incident agentní spolupráce,
- experimentální hypotéza.

Vznikne Issue v `agenti-lab`. `agenti` se pro tento účel nepoužívá.

## 2. Investigation / Analysis

Investigator nebo Analyst:

- načte relevantní aktuální zdroje z `agenti/main` a případně z reálných adopcí,
- rozlišuje evidence, interpretaci, hypotézu a návrh,
- minimalizuje scope otázky,
- dokumentuje limity evidence,
- porovnává materiálně odlišné varianty pouze tam, kde je to užitečné,
- nemění publikovaný etalon.

Typický výstup: `NO_CHANGE`, `MORE_EVIDENCE_NEEDED` nebo `PROPOSAL_READY`.

## 3. Design / experiment

Pokud je potřeba konkrétní návrh nebo prototyp, práce může pokračovat v lab branchi/PR.

Větve mohou oddělit:

- alternativní varianty,
- nezávislé vrstvy problému,
- experimenty,
- konkrétní reviewovatelnou úpravu lab artefaktů.

Experimentální stav nikdy není automaticky cílovou specifikací.

## 4. Independent critique / review

Významnou změnu před Human rozhodnutím nebo publikací kontroluje jiná logická instance Reviewer/Critic.

Kontroluje zejména:

- zda evidence opravdu podporuje problém,
- zda se lokální zkušenost nepovyšuje bezdůvodně na univerzální pravidlo,
- zda nebyla přehlédnuta jednodušší varianta,
- zda scope neexpandoval oproti otázce,
- zda se nezvyšuje procesní/tokenová režie bez konkrétní hodnoty,
- zda návrh zachovává Human authority a oddělení rolí,
- zda cílový dokumentační model zůstane čistý a neduplicitní.

Reviewer/Critic nesmí vydat svůj návrh za nezávislé review.

## 5. Human decision

Decision-ready bod zpracuje Asistentka s Human/Product Ownerem.

Předloží:

- problém,
- klíčovou evidence a její limity,
- relevantní varianty a trade-offy,
- případné doporučení oddělené od rozhodnutí.

Human zvolí typicky `REJECT`, `ITERATE` nebo `APPROVE/PUBLISH`.

Rozhodnutí se zapíše do původního lab Issue. Žádný decision Issue se kvůli tomu nevytváří v `agenti`.

## 6. Publication preparation

Po `APPROVE/PUBLISH` se v labu připraví přesný výsledný target.

Platí:

- žádný nový scope během publikace,
- odstranění lab-only kontextu a historických vysvětlení,
- jeden aktuální kanonický owner každé rule family,
- publikovaný obsah musí být pochopitelný bez labu,
- pokud finalizace mění schválený význam, návrh se vrací do decision/review kroku.

## 7. Publish to `agenti/main`

Publisher:

1. načte schválený lab Issue a finální review evidence,
2. ověří přesný obsah k publikaci,
3. aktualizuje `agenti/main` přímo na čistý cílový stav,
4. nepřidává v `agenti` Issue, decision record ani feature branch,
5. zkontroluje, že target tree neobsahuje lab artefakty nebo otevřené otázky,
6. zapíše výsledný target commit SHA do lab Issue.

Publikace je integrační krok standardu, nikoli další kolo jeho návrhu.

## 8. Post-publish verification

Po publikaci se ověří alespoň:

- cold-start čitelnost `agenti`,
- interní odkazy a konzistence,
- že target nevyžaduje `agenti-lab` k pochopení aktuálního pravidla,
- že v `agenti` není otevřený pracovní backlog standardu,
- že publish odpovídá Human-approved výsledku.

Širší audit může běžet jako samostatné lab Issue.

## 9. Handoff destinations

| Událost | Durable místo |
|---|---|
| otázka / audit / hypotéza | `agenti-lab` Issue |
| evidence / investigation | lab Issue comment nebo lab artefakt |
| experiment / návrh souborů | lab branch / PR |
| independent critique | lab Issue/PR review |
| Human decision | původní lab Issue |
| publish authorization | původní lab Issue |
| publikovaný cílový stav | `agenti/main` |
| publish evidence / target SHA | lab Issue |

## 10. Completion

Lab Issue je dokončené, pokud nastane například:

- `NO_CHANGE`,
- `REJECTED`,
- `PUBLISHED`,
- `CLOSED_INCONCLUSIVE`.

`PUBLISHED` znamená, že čistý cílový stav už existuje v `agenti/main` a publish evidence je durable zaznamenaná v labu.