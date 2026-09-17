# Agenti Lab

`agenti-lab` je pracovní laboratoř pro vývoj produktu [`bukovskyjosef/agenti`](https://github.com/bukovskyjosef/agenti).

## Cíl projektu

Cílem je **maximálně vyladit referenční standard `agenti` tak, aby člověk dokázal co nejefektivněji využít potenciál specializovaných AI agentů k tvorbě a rozvoji produktu s co nejvyšší rozumnou mírou automatizace**.

„Produkt“ zde není omezen na software. Stejný základní model má být použitelný například pro:

- aplikaci nebo službu,
- dokumentaci nebo odborný dokument,
- analýzu nebo výzkumný výstup,
- knihu, povídku nebo jiný kreativní artefakt,
- jiný verzovaný produkt, u kterého dává smysl zadání → zpracování → kontrola → schválení/publikace.

Maximální automatizace není cíl sama o sobě. Standard má automatizovat rutinní handoff a provedení tam, kde tím neklesá kvalita, neztrácí se lidská autorita a nevzniká zbytečná procesní režie.

## Dva repozitáře

- **`agenti` = produkt / publikovaný etalon.** Obsahuje pouze aktuální čistý výsledek určený k adopci. Jeho `main` je publikovaný standard.
- **`agenti-lab` = pracovní prostor.** Patří sem Issues, otevřené otázky, rozhodnutí, audity, experimenty, návrhy, branches, PR a review změn etalonu.

`agenti` nemá být backlogem vlastního vývoje. Vývojová historie a diskuse zůstávají zde.

## Jak se zde pracuje

Lab **nemusí napodobovat autonomní delivery model, který sám navrhuje**. Human/Product Owner může být zcela legitimně ruční koordinátor práce.

Typický vstup pro agenta je například:

> Jsi Reviewer. Pracuj na Issue #12 v `bukovskyjosef/agenti-lab`. Řiď se repozitářem.

nebo:

> Jsi Analyst. Zpracuj findings z Issue #12 a připrav návrh dalšího postupu.

Agent má z repozitáře pochopit cíl projektu, své kompetence, stav přiděleného Issue a relevantní část aktuálního etalonu. Nemá potřebovat soukromý chatový kontext.

## Jednoduchý pracovní model

```text
Human vybere práci / roli
        ↓
open Issue v agenti-lab
        ↓
Analyst / Investigator / Editor
        ↓
independent Reviewer
        ↓
Human decision, pokud je potřeba
        ↓
approved exact target change
        ↓
Publisher zapíše čistý výsledek do agenti/main
        ↓
independent post-publish verification
```

Ne každé Issue musí projít všechny kroky. Audit může skončit review reportem; jednoduchá analýza může skončit doporučením; změna publikovaného standardu vždy vyžaduje oddělení autora změny a nezávislé kontroly.

## Work queue

**Open Issues v tomto repozitáři jsou pracovní fronta.** Nevytváří se vedle nich další ruční backlog.

Human může agentovi přímo určit, které Issue má řešit. Agent si nemá svévolně přibírat další otevřenou práci jen proto, že ji vidí.

## Změna produktu `agenti`

Pokud z práce v labu vznikne schválená změna etalonu:

1. přesný zamýšlený target se připraví a zdokumentuje v labu,
2. jiná logická instance jej nezávisle zkontroluje,
3. potřebná Human rozhodnutí musí být explicitní v lab Issue,
4. Publisher zapíše **jen schválený čistý výsledek** do `agenti/main`, bez lab historie,
5. jiná instance ověří publikovaný stav proti schválenému návrhu.

V `agenti` kvůli tomu nevzniká vlastní Issue/feature-branch workflow.

## Dokumentace labu

- [`AGENTS.md`](AGENTS.md) — instrukce pro každého nově připojeného agenta,
- [`docs/repository-boundary.md`](docs/repository-boundary.md) — autorita a hranice `agenti` ↔ `agenti-lab`,
- [`docs/lab-workflow.md`](docs/lab-workflow.md) — jednoduchý pracovní a review/publish postup,
- [`docs/README.md`](docs/README.md) — mapa kanonických lab pravidel.

Když řešíš **„jak by se měl etalon změnit?“**, pracuj v `agenti-lab`. Když potřebuješ zjistit **„jak etalon aktuálně zní?“**, čti `agenti/main`.