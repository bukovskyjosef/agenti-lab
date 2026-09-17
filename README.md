# Agenti Lab

`agenti-lab` je pracovní laboratoř pro vývoj produktu [`bukovskyjosef/agenti`](https://github.com/bukovskyjosef/agenti).

## Cíl projektu

Cílem je **maximálně vyladit referenční standard `agenti` tak, aby člověk dokázal co nejefektivněji využít potenciál specializovaných AI agentů k tvorbě a rozvoji softwarového produktu s co nejvyšší rozumnou mírou automatizace**.

`agenti` je záměrně standard pro **software product development**. Nemá být univerzálním frameworkem pro knihy, povídky, obecné dokumenty, výzkumné výstupy nebo jiné nesofwarové artefakty. Některé principy mohou být přenositelné i mimo software, ale není to designový požadavek a nesmí kvůli tomu klesat přesnost softwarového workflow.

Maximální automatizace není cíl sama o sobě. Standard má automatizovat rutinní handoff a provedení tam, kde tím neklesá kvalita, neztrácí se lidská autorita a nevzniká zbytečná procesní režie.

## Dva repozitáře

- **`agenti` = produkt / publikovaný etalon.** Obsahuje pouze aktuální čistý výsledek určený k adopci. Jeho `main` je publikovaný standard.
- **`agenti-lab` = pracovní prostor.** Patří sem Issues, otevřené otázky, rozhodnutí, audity, experimenty, návrhy, branches, PR a review změn etalonu.

`agenti` nemá být backlogem vlastního vývoje. Vývojová historie a diskuse zůstávají zde.

## Kanonické role v labu

Zkratka role je vždy první písmeno jejího jediného kanonického názvu:

- **A = Analyst** — analýza, evidence, varianty a decision-ready podklady.
- **E = Editor** — implementuje již autorizovanou změnu etalonu a připravuje exact target change.
- **R = Reviewer** — nezávisle kontroluje návrh, změnu nebo publikovaný stav; stejná role dělá i post-publish review.
- **K = Konzultant** — průběžný poradce a koordinátor pro Humana; drží kontext, pomáhá formulovat rozhodnutí a řídí pracovní frontu, ale nenahrazuje specializované A/E/R/P.
- **P = Publisher** — po schválení publikuje přesně reviewovaný target do `agenti/main`.

`agenti-lab` nemá roli Asistentky. Alternativní názvy `Investigator`, `Implementer`, `Critic` a `Verifier` nejsou kanonické role.

## Jak se zde pracuje

Lab **nemusí napodobovat autonomní delivery model, který sám navrhuje**. Human/Product Owner může být ruční koordinátor práce; K mu může průběžně pomáhat s orientací a dispatchingem.

Typický vstup pro agenta je například:

> Jsi R. Pracuj na Issue #12 v `bukovskyjosef/agenti-lab`. Řiď se repozitářem.

nebo:

> Jsi A. Zpracuj findings z Issue #12 a připrav decision-ready návrh dalšího postupu.

Agent má z repozitáře pochopit cíl projektu, své kompetence, stav přiděleného Issue a relevantní část aktuálního etalonu. Nemá potřebovat soukromý chatový kontext.

## Jednoduchý pracovní model

```text
Human + K drží směr a pracovní frontu
        ↓
open Issue v agenti-lab
        ↓
A podle potřeby připraví analýzu / Human decision
        ↓
E připraví exact target change
        ↓
R provede independent review
        ↓
P publikuje schválený target do agenti/main
        ↓
R provede post-publish review
```

Ne každé Issue musí projít všechny kroky. Audit může skončit review reportem; jednoduchá analýza může skončit doporučením; změna publikovaného standardu vždy vyžaduje oddělení autora změny a nezávislé kontroly.

## Work queue

**Open Issues v tomto repozitáři jsou pracovní fronta.** Nevytváří se vedle nich další ruční backlog.

Human může agentovi přímo určit, které Issue má řešit. K může Humanovi doporučit další roli/Issue a podle explicitních Human rozhodnutí udržovat durable návaznosti. Agent si nemá svévolně přibírat další otevřenou práci jen proto, že ji vidí.

## Změna produktu `agenti`

Pokud z práce v labu vznikne schválená změna etalonu:

1. E připraví přesný zamýšlený target v labu,
2. R jej jako jiná logická instance nezávisle zkontroluje,
3. potřebná Human rozhodnutí musí být explicitní v lab Issue,
4. P zapíše **jen schválený čistý výsledek** do `agenti/main`, bez lab historie,
5. R jako jiná logická instance ověří publikovaný stav proti schválenému návrhu.

V `agenti` kvůli tomu nevzniká vlastní Issue/feature-branch workflow.

## Dokumentace labu

- [`AGENTS.md`](AGENTS.md) — instrukce pro každého nově připojeného agenta,
- [`docs/repository-boundary.md`](docs/repository-boundary.md) — autorita a hranice `agenti` ↔ `agenti-lab`,
- [`docs/lab-workflow.md`](docs/lab-workflow.md) — jednoduchý pracovní a review/publish postup,
- [`docs/README.md`](docs/README.md) — mapa kanonických lab pravidel.

Když řešíš **„jak by se měl etalon změnit?“**, pracuj v `agenti-lab`. Když potřebuješ zjistit **„jak etalon aktuálně zní?“**, čti `agenti/main`.