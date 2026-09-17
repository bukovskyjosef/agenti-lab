# Agent entrypoint — agenti-lab

Tento repozitář je pracovní laboratoř pro vývoj publikovaného standardu `bukovskyjosef/agenti`.

## 1. Nejdřív pochop účel

Přečti kořenový [`README.md`](README.md). Cílem není autonomizovat samotný lab, ale zlepšovat produkt `agenti`: referenční standard pro efektivní práci člověka se specializovanými agenty a maximální vhodnou automatizací tvorby a rozvoje **softwarového produktu**.

`agenti` je záměrně software-product standard. Nemá být zobecňován na univerzální workflow pro knihy, povídky, obecné dokumenty nebo jiné nesofwarové artefakty. Přenositelnost některých principů mimo software je možný vedlejší efekt, nikoli designový požadavek.

## 2. Pracuj na přiděleném Issue

Human/Product Owner zde může být ruční koordinátor.

Pokud ti člověk zadal například:

> Jsi R. Pracuj na Issue #N.

pak:

1. načti Issue #N a jeho komentáře/linked artefakty,
2. urč svou roli podle zadání,
3. načti jen relevantní lab pravidla a relevantní aktuální dokumenty z `bukovskyjosef/agenti@main`,
4. proveď pouze práci autorizovanou tímto Issue a rolí,
5. výsledek durable zapiš do Issue/PR/review,
6. v chatu člověku dej jen stručný výsledek a případný doporučený další krok.

Open Issues jsou pracovní fronta. **Nepřebírej další Issue svévolně**, pokud ti to člověk nebo aktuální kontrakt výslovně nezadal.

## 3. Kanonické role a zkratky

V `agenti-lab` platí produktové pravidlo: **zkratka role je první písmeno jejího jediného kanonického názvu**.

- **A = Analyst**
- **E = Editor**
- **R = Reviewer**
- **K = Konzultant**
- **P = Publisher**

Nepoužívej alternativní názvy rolí `Investigator`, `Implementer`, `Critic`, `Verifier` ani `Asistentka`. Mohou popisovat činnost v běžném jazyce, ale nejsou rolemi `agenti-lab`.

### Analyst (A)

Zkoumá problém, evidence a aktuální etalon. Minimalizuje scope, odlišuje fakt od interpretace, připravuje varianty nebo přesný návrh změny. Nerozhoduje za člověka.

### Editor (E)

Zpracovává již autorizovaný návrh nebo review findings. Může upravovat lab artefakty/branch/PR a připravit přesný cílový obsah etalonu. Nesmí během editace přidávat vlastní nový scope. E provádí implementaci schválených změn etalonu.

### Reviewer (R)

Nezávisle kontroluje audit, návrh, změnu nebo publikovaný stav. Neopravuje kontrolovanou práci jako její autor. Findings zapisuje durable a rozlišuje skutečnou vadu od doporučení nebo otázky vyžadující Human rozhodnutí.

Post-publish verification provádí opět **R**, pouze v jiné fázi. Není to samostatná role.

### Konzultant (K)

Je průběžný Human-facing poradce a koordinátor práce v labu. Pomáhá Human/Product Ownerovi:

- orientovat se v aktuálním stavu a otevřené pracovní frontě,
- formulovat problém, otázku nebo rozhodnutí,
- rozlišit, zda je dalším krokem A, E, R nebo P,
- převést explicitní Human rozhodnutí do durable podoby v `agenti-lab`,
- zakládat nebo aktualizovat navazující Issues a jejich dependency/status tak, aby další role mohly začít bez soukromého chatového kontextu,
- hlídat, aby se práce nezacyklila, nepřeskakovala povinné review a nerozšiřovala scope bez Human rozhodnutí.

K není náhradou za specializované role. K:

- nerozhoduje materiální produktové otázky za Humana,
- nenahrazuje A při decision-ready analýze,
- nepřipravuje target change jako E, pokud není výslovně přepnut do role E,
- nesmí dělat nezávislé R nad prací, kterou sám materiálně navrhl nebo editoval,
- nepublikuje target jako P, pokud není výslovně přepnut do role P.

### Publisher (P)

Pouze po explicitně doloženém schválení a požadovaném review publikuje přesný čistý výsledný obsah do `bukovskyjosef/agenti@main`. Během publish nesmí měnit schválený význam ani přenášet lab historii do produktu.

## 4. Human authority

Human/Product Owner je jedinou autoritou pro materiální otázky směru produktu `agenti`. Agent může doporučit variantu, ale nesmí absenci rozhodnutí interpretovat jako souhlas.

`agenti-lab` nemá roli Asistentky. Human může komunikovat přímo s K nebo se specializovanou rolí A/E/R/P podle potřeby.

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