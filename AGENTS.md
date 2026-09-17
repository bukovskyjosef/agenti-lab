# Agent entrypoint — agenti-lab

Tento repozitář je **vývojové prostředí standardu** publikovaného v `bukovskyjosef/agenti`.

## Než začneš

1. Přečti své GitHub Issue v `agenti-lab`.
2. Přečti [`docs/repository-boundary.md`](docs/repository-boundary.md).
3. Přečti [`docs/lab-workflow.md`](docs/lab-workflow.md).
4. Pokud hodnotíš aktuální etalon, načti relevantní dokumenty z `bukovskyjosef/agenti@main`.
5. Načítej jen kontext potřebný pro konkrétní otázku.

## Absolutní pravidla

- Všechny otevřené otázky, rozhodnutí, audity, experimenty a návrhy změn standardu patří do `agenti-lab`.
- `agenti/main` je publikovaný výsledek, nikoli místo pro vývoj standardu.
- Nezakládej v `agenti` vývojové Issues, decision Issues, review tasky ani feature branches.
- Evidence, návrh, review a Human rozhodnutí musí být od sebe rozlišitelné.
- O změně standardu rozhoduje Human/Product Owner.
- Schválení změny autorizuje přípravu **čistého výsledného targetu** a jeho publikaci do `agenti/main`; nevytváří druhý implementační backlog v `agenti`.
- Publikační agent nesmí do `agenti` přenášet lab historii, diskusi, alternativy ani rozhodovací deník, pokud nejsou součástí aktuálního výsledného pravidla.
- Člověk nemá být message bus mezi agenty. Stav práce musí být durable v tomto repozitáři.

## Pracovní módy

- **Investigator / Analyst** — shromažďuje evidence, vymezuje problém a varianty.
- **Reviewer / Critic** — nezávisle kontroluje argumentaci, scope a dopady návrhu.
- **Asistentka** — zpracovává s člověkem otevřené decision body a přesně zaznamenává rozhodnutí.
- **Developer / Editor** — připravuje v lab branchi konkrétní podobu změny etalonu, pokud je pro návrh už autorizována.
- **Publisher** — po splnění lab gate vytvoří čistý publikovaný stav `agenti/main` a ověří jeho konzistenci. Není oprávněn během publikace přidávat nový scope.

Jedna logická pracovní instance nesmí vydávat vlastní návrh za nezávislé review téhož návrhu.

## Branching

Na rozdíl od `agenti` jsou pracovní větve v `agenti-lab` legitimní a žádoucí tam, kde oddělují experimenty, paralelní vrstvy problému nebo reviewovatelnou změnu lab artefaktů.

## Výsledek práce

Chat je uživatelské rozhraní. Autoritativní pracovní stav patří do Issues/PR/reviews v `agenti-lab`. `agenti` dostává až čistý publikovaný výsledek.