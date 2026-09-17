# Agenti Lab

`agenti-lab` je **jediné pracovní místo pro vývoj referenčního agentního standardu** publikovaného v [`bukovskyjosef/agenti`](https://github.com/bukovskyjosef/agenti).

## Rozdělení odpovědností

- **`agenti` = produkt / publikovaný etalon.** Obsahuje pouze aktuální čistý výsledek, který má agent použít při bootstrapu jiného repozitáře. `main` je publikovaný standard; repo nemá sloužit jako pracovní backlog standardu.
- **`agenti-lab` = vývoj etalonu.** Patří sem Issues, rozhodnutí Human/Product Ownera, audity, experimenty, alternativy, větve, PR, review a všechny otevřené otázky o tom, zda nebo jak se má standard změnit.

Žádný lab artefakt není sám o sobě aktuálním cílovým pravidlem. Po schválení změny se z labu **publikuje čistý výsledný stav do `agenti/main`**. V `agenti` se kvůli tomu nezakládá druhý vývojový Issue/PR workflow.

## Základní smyčka

```text
reálný projekt / problém / nápad
              ↓
          agenti-lab
 investigation → critique → varianty
              ↓
      Human/Product Owner
        ↙        ↓        ↘
     reject    iterate    approve
                          ↓
                 připrav čistý target
                          ↓
                 publish do agenti/main
                          ↓
                post-publish audit
```

## Co patří sem

- změny a redesign standardu `agenti`,
- rozhodnutí o standardu,
- zkušenosti z Kvazi, FamilyHelperu a dalších adopcí,
- audity a failure analysis,
- experimenty s rolemi, workflow, orchestration, automation a release modely,
- pracovní větve a PR pro paralelní vrstvy problému,
- nezávislé review návrhů před publikací,
- migrační a publikační evidence.

## Co sem nepatří

- produktová práce reálného aplikačního repozitáře,
- kopie aktuálního cílového standardu,
- dlouhodobá normativní pravda, která už byla publikována do `agenti/main`.

## Pro agenty

Začni v [`AGENTS.md`](AGENTS.md). Hranici mezi repozitáři vlastní [`docs/repository-boundary.md`](docs/repository-boundary.md); pracovní tok laboratoře vlastní [`docs/lab-workflow.md`](docs/lab-workflow.md).

## Praktické pravidlo

Když řešíš otázku **„jak by se měl etalon změnit?“**, pracuj zde. Když chceš zjistit **„jak etalon aktuálně zní?“**, čti `agenti/main`.