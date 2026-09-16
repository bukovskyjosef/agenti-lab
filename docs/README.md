# Agenti Lab documentation map

Lab záměrně používá malou sadu kanonických pravidel. Nemá kopírovat plný model z `bukovskyjosef/agenti`.

## Kanoničtí vlastníci

| Otázka | Kanonický vlastník |
|---|---|
| Co patří do `agenti` vs `agenti-lab`, kde je autorita a jak probíhá promotion | [`repository-boundary.md`](repository-boundary.md) |
| Jak probíhá investigation, critique, human decision a promotion | [`lab-workflow.md`](lab-workflow.md) |

`README.md` a `AGENTS.md` jsou entrypointy a smí tato pravidla pouze stručně shrnout.

## Externí cílová autorita

Aktuální cílový agentní standard není duplikován v tomto repozitáři. Jeho autoritativní zdroje jsou v `bukovskyjosef/agenti`, standardně na `main`. Lab issue musí při hodnocení cílového pravidla odkázat na konkrétní soubor/issue/PR/ref, který skutečně zkoumá.

## Pracovní artefakty

- Evidence, audity, experimenty a návrhy: GitHub Issues / PRs v `agenti-lab`.
- Lidská volba o tom, zda se návrh má posunout dál: durable v příslušném lab Issue.
- Autorizovaný kontrakt změny cílového standardu: GitHub Issue/decision/PR v `agenti`.
- Aktuální výsledné pravidlo po implementaci: kanonický dokument v `agenti`.