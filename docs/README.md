# Agenti Lab documentation map

`agenti-lab` vlastní vývoj standardu; `bukovskyjosef/agenti` vlastní pouze jeho publikovaný aktuální výsledek.

## Kanoničtí vlastníci lab pravidel

| Otázka | Kanonický vlastník |
|---|---|
| Co patří do `agenti` vs `agenti-lab`, kde je autorita a co znamená publication | [`repository-boundary.md`](repository-boundary.md) |
| Jak probíhá investigation, design/experiment, critique, Human decision a publication | [`lab-workflow.md`](lab-workflow.md) |

Kořenové `README.md` a `AGENTS.md` jsou entrypointy; detailní pravidla pouze směrují na vlastníky výše.

## Externí cílová autorita

Aktuální standard se v labu neduplikuje. Čte se z `bukovskyjosef/agenti@main`.

Při investigation uváděj konkrétní cílové dokumenty/ref, které hodnotíš. Lab návrh nebo decision history nenahrazuje aktuální target.

## Pracovní artefakty

- Issues, decisions, audits, evidence a otevřené body standardu: **`agenti-lab`**.
- Experimenty a návrhy: **lab branches / PRs**.
- Human rozhodnutí o standardu: **příslušný lab Issue**.
- Publish handoff a výsledný target SHA: **lab Issue**.
- Aktuální výsledný standard: **`agenti/main`**.

V `agenti` se kvůli změně standardu nezakládá paralelní implementační Issue/PR workflow.