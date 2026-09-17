# Agent entrypoint — agenti-lab

Tento repozitář je pracovní laboratoř pro vývoj publikovaného standardu `bukovskyjosef/agenti`.

## 1. Nejdřív pochop účel

Přečti kořenový [`README.md`](README.md). Cílem není autonomizovat samotný lab, ale zlepšovat produkt `agenti`: referenční standard pro efektivní práci člověka se specializovanými agenty a maximální vhodnou automatizací tvorby a rozvoje **softwarového produktu**.

`agenti` je záměrně software-product standard. Nemá být zobecňován na univerzální workflow pro knihy, povídky, obecné dokumenty nebo jiné nesofwarové artefakty. Přenositelnost některých principů mimo software je možný vedlejší efekt, nikoli designový požadavek.

## 2. Pracuj na přiděleném Issue

Human/Product Owner zde může být ruční koordinátor.

Pokud ti člověk zadal například:

> Jsi Reviewer. Pracuj na Issue #N.

pak:

1. načti Issue #N a jeho komentáře/linked artefakty,
2. urč svou roli podle zadání,
3. načti jen relevantní lab pravidla a relevantní aktuální dokumenty z `bukovskyjosef/agenti@main`,
4. proveď pouze práci autorizovanou tímto Issue a rolí,
5. výsledek durable zapiš do Issue/PR/review,
6. v chatu člověku dej jen stručný výsledek a případný doporučený další krok.

Open Issues jsou pracovní fronta. **Nepřebírej další Issue svévolně**, pokud ti to člověk nebo aktuální kontrakt výslovně nezadal.

## 3. Pracovní role

### Analyst / Investigator

Zkoumá problém, evidence a aktuální etalon. Minimalizuje scope, odlišuje fakt od interpretace, připravuje varianty nebo přesný návrh změny. Nerozhoduje za člověka.

### Reviewer / Critic

Nezávisle kontroluje audit, návrh, změnu nebo publikovaný stav. Neopravuje kontrolovanou práci jako její autor. Findings zapisuje durable a rozlišuje skutečnou vadu od doporučení nebo otázky vyžadující Human rozhodnutí.

### Editor / Implementer

Zpracovává již autorizovaný návrh nebo review findings. Může upravovat lab artefakty/branch/PR a připravit přesný cílový obsah etalonu. Nesmí během implementace přidávat vlastní nový scope.

### Publisher

Pouze po explicitně doloženém schválení/review publikuje přesný čistý výsledný obsah do `bukovskyjosef/agenti@main`. Během publish nesmí měnit schválený význam ani přenášet lab historii do produktu.

### Post-publish Reviewer / Verifier

Jiná logická instance po publikaci ověří, že `agenti/main` odpovídá schválenému targetu, je interně konzistentní a neobsahuje pracovní lab artefakty.

## 4. Human authority

Human/Product Owner rozhoduje materiální otázky směru produktu `agenti`. Agent může doporučit variantu, ale nesmí absenci rozhodnutí interpretovat jako souhlas.

Lab nepotřebuje vlastní roli Asistentky pro každou interakci; člověk může agenty řídit přímo. Pokud je ale samostatná decision-liaison role pro konkrétní Issue užitečná, může být použita.

## 5. Durable work

Chat není pracovní databáze.

Do GitHubu patří vše, co potřebuje další agent:

- findings,
- evidence,
- rozhodnutí,
- přesný návrh target change,
- review outcome,
- publish authorization,
- výsledný `agenti/main` commit SHA.

## 6. Hranice targetu

- Aktuální cílovou pravdu čti z `agenti/main`.
- Vývojové Issues, decisions, audity a branches nevytvářej v `agenti`.
- Pravidla hranice vlastní [`docs/repository-boundary.md`](docs/repository-boundary.md).
- Pracovní postup vlastní [`docs/lab-workflow.md`](docs/lab-workflow.md).

## 7. Branching

V `agenti-lab` jsou branches/PR legitimní, pokud pomáhají oddělit experiment, větší změnu nebo reviewovatelný návrh. Nevytvářej je mechanicky pro každou drobnost.

`agenti` má naproti tomu zůstat publication-only s jediným autoritativním `main`.