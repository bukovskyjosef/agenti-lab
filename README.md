# Agenti Lab

`agenti-lab` je výzkumná a meta-vývojová vrstva pro referenční agentní workflow udržovaný v [`bukovskyjosef/agenti`](https://github.com/bukovskyjosef/agenti).

## Rozdělení odpovědností

- **`agenti`** odpovídá na otázku: **Jak má cílový agentní workflow aktuálně fungovat?** Jeho `main` je autoritativní cílový standard.
- **`agenti-lab`** odpovídá na otázku: **Je tento standard dobrý a jak by se měl změnit?** Obsahuje audity, experimenty, zkušenosti z reálných projektů, alternativy a návrhy změn.

Lab nikdy není druhým zdrojem aktuálního cílového pravidla. Návrh v tomto repozitáři nemění `agenti` bez samostatného durable work/decision artefaktu v cílovém repozitáři.

## Základní smyčka

```text
reálné projekty / zkušenost / problém
                ↓
            agenti-lab
     evidence → audit → návrh
                ↓
        Human/Product Owner
                ↓
        promote / reject / iterate
                ↓
       issue / decision v agenti
                ↓
       implementace + review
                ↓
          agenti/main
```

Po promování je cílový issue/PR v `agenti` autoritativní pro implementaci změny. Lab issue zůstává pouze zdrojem evidence, experimentální historie a důvodu návrhu.

## Co patří sem

- audity a kritika modelu `agenti`,
- zkušenosti z FamilyHelperu, Kvazi a dalších adopcí,
- porovnání alternativních workflow,
- experimenty s orchestration/automation/handoff modely,
- návrhy změn cílového standardu,
- otázky typu „funguje toto pravidlo dobře?“.

## Co sem nepatří

- aktuální normativní definice cílového workflow,
- implementační kontrakt schválené změny `agenti`,
- review konkrétního PR v `agenti`,
- produktová práce reálného aplikačního repozitáře.

## Pro agenty

Začni v [`AGENTS.md`](AGENTS.md). Kanonickou hranici mezi oběma repozitáři definuje [`docs/repository-boundary.md`](docs/repository-boundary.md); průběh lab práce definuje [`docs/lab-workflow.md`](docs/lab-workflow.md).

## Bootstrap

Repozitář byl založen jako prázdný. Issue #1 explicitně povoluje jednorázový přímý bootstrap `main`; po vytvoření této kostry mají další změny používat issue/branch/PR přiměřeně povaze změny.