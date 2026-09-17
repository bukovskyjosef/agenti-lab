# Repository boundary: `agenti` vs `agenti-lab`

Tento dokument je kanonickým vlastníkem hranice mezi publikovaným etalonem a jeho vývojovým prostředím.

## 1. `bukovskyjosef/agenti` — publikovaný produkt

`agenti` vlastní **pouze aktuální cílový výsledek**.

Jeho účel je umožnit cold-start instrukci typu:

> Přečti `bukovskyjosef/agenti` a připrav nový repozitář podle tohoto standardu.

Proto má ve steady state platit:

- `main` je jediný autoritativní publikovaný stav,
- aktuální strom obsahuje jen dokumentaci potřebnou k adopci standardu,
- žádné open Issues, decision backlog, audit queue ani review tasks,
- žádné pracovní feature branches nebo vývojové PR,
- žádný decision/history adresář v aktuálním stromu,
- žádná self-development governance, která by z `agenti` dělala druhé pracovní prostředí.

Historie Git commitů nebo starých uzavřených GitHub artefaktů může fyzicky existovat, ale **není součástí aktuálního standardu ani běžné kontextové cesty**.

## 2. `bukovskyjosef/agenti-lab` — vývoj standardu

Veškerá meta-práce nad etalonem patří sem:

- Issues a otevřené body,
- Human/Product Owner decisions,
- audity a retrospektivy,
- evidence z reálných projektů,
- experimenty a prototypy,
- alternativy a change proposals,
- pracovní branches a PR,
- nezávislé critique/review,
- publikační handoff a post-publish audit.

Lab smí standard zkoumat a připravovat jeho změnu, ale aktuální cílovou pravdu čte z `agenti/main`.

## 3. Autorita

Human/Product Owner rozhoduje o změně etalonu.

Decision outcome může být například:

- **REJECT** — návrh se nepublikuje,
- **ITERATE** — pokračuje investigation/design v labu,
- **APPROVE / PUBLISH** — lab smí připravit a publikovat konkrétní cílový stav.

Absence odpovědi není approval.

## 4. Publication contract

Po Human approval se nevytváří implementační Issue v `agenti`.

Místo toho lab:

1. finalizuje přesný cílový obsah v lab artefaktech/branchi,
2. provede požadované nezávislé review v labu,
3. Publisher rekonstruuje schválený stav z durable lab evidence,
4. publikuje pouze čistý výsledný standard do `agenti/main`,
5. ověří, že v targetu nezůstala lab historie, alternativy, otevřené otázky ani interní rozhodovací stopa,
6. zaznamená publikovaný target commit zpět do lab Issue.

`agenti/main` se tím stává novou cílovou pravdou.

## 5. Co se nesmí při publikaci přenášet

Pokud to není samo součástí aktuálního pravidla, do `agenti` nepatří:

- auditní reporty,
- rozhodovací historie,
- rejected variants,
- pracovní komentáře,
- lab statusy,
- odkazy nutné jen k pochopení vývoje etalonu,
- issue/PR workflow určený k vývoji etalonu samotného.

Publikovaný produkt musí být samonosný.

## 6. Zpětná vazba z adopcí

Problém objevený při adopci standardu v Kvazi, FamilyHelperu nebo jiném projektu se vrací jako nové Issue do `agenti-lab`.

Reálný projekt se kvůli tomu nesmí stát skrytým místem, kde se univerzální standard potichu redefinuje.

## 7. Historické artefakty

Pre-split Issues/PR/commity, které už existují v `agenti`, se nemusí technicky mazat, pokud to GitHub neumožňuje. Musí však být uzavřené, neaktivní a nesmí být součástí aktuální dokumentační mapy nebo pracovního procesu.

Aktuální vývojová pravda od zavedení této hranice patří výhradně do `agenti-lab`.