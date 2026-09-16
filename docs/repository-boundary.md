# Repository boundary: agenti vs agenti-lab

Tento dokument je kanonickým vlastníkem hranice mezi cílovým standardem a jeho laboratoří.

## 1. Cílový repozitář `bukovskyjosef/agenti`

`agenti` vlastní **aktuální cílový stav** agentního workflow.

Patří do něj:

- aktuální normativní pravidla,
- role a kompetence cílového systému,
- cílový issue/PR/handoff/automation model,
- rozhodnutí a work itemy, které autorizují konkrétní změnu cílového standardu,
- implementace, review a integrace takové změny,
- adopční návod pro produktové repozitáře.

Agent musí být schopen pochopit současný standard bez čtení `agenti-lab`.

## 2. Laboratoř `bukovskyjosef/agenti-lab`

`agenti-lab` vlastní **meta-práci nad standardem**, nikoli standard samotný.

Patří do něj:

- evidence z reálných adopcí,
- audity cílového modelu,
- experimenty a prototypy workflow,
- srovnání alternativ,
- retrospektivy a failure analysis,
- otevřené otázky a change proposals,
- nezávislá kritika návrhů před promotion.

Lab artefakt může tvrdit „navrhujeme změnit X“, ale nesmí tvrdit „aktuální pravidlo je X“, pokud pouze neodkazuje na skutečný kanonický stav v `agenti`.

## 3. Autorita

Human/Product Owner rozhoduje, zda se lab návrh:

- **REJECT** — odmítne,
- **ITERATE** — vrátí k dalšímu zkoumání,
- **PROMOTE** — předá do `agenti` jako kandidát na změnu cílového standardu.

`PROMOTE` ještě samo nemění cílový standard. Musí vzniknout linked artefakt v `agenti`, který obsahuje dostatek aktuálního kontraktu pro cílový proces.

## 4. Promotion contract

Promoter / Bridge při `PROMOTE`:

1. vytvoří v `agenti` nový Intake/Analysis/Decision work item podle povahy změny,
2. uvede odkaz na zdrojový lab Issue,
3. přenese pouze schválený problém, lidské rozhodnutí, relevantní evidence summary, scope/out-of-scope a požadovaný výsledek,
4. nekopíruje zbytečně celý výzkumný deník,
5. nepovažuje lab návrh za implementační oprávnění, pokud cílový issue ještě není Ready,
6. zapíše do lab Issue odkaz na cílový artefakt a označí promotion stav.

Od tohoto okamžiku je pro konkrétní implementaci autoritativní cílový artefakt v `agenti`. Pokud se jeho kontrakt během cílové Analysis změní, lab se zpětně nepřepisuje; zůstává historickým zdrojem původní evidence a návrhu.

## 5. Zpětná vazba z cíle do labu

Během implementace/review v `agenti` mohou vzniknout:

- **DEFECT** vůči schválenému kontraktu — řeší se v `agenti`, nevrací se do labu jako výzkumný problém.
- **DECISION_REQUIRED** pro právě implementovanou cílovou změnu — řeší se podle governance `agenti`; pokud vyžaduje nový širší výzkum, může vzniknout linked lab Issue.
- **RECOMMENDATION / nová hypotéza / systémový problém standardu** — vhodný kandidát na nové Intake/Investigation Issue v `agenti-lab`, nikoli automatické rozšíření aktuálního cílového scope.

## 6. Historické artefakty

Staré audity, decisions a remediation issues, které už vznikly v `agenti` před rozdělením repozitářů, se **nestěhují ani nemažou**. Zůstávají tam jako platná historická auditní stopa a odkazy se nesmí rozbíjet.

Od zavedení tohoto boundary modelu má nová obecná meta-diskuse, audit modelu, experiment nebo návrh budoucího redesignu začínat v `agenti-lab`. Konkrétní autorizovaná změna cílového standardu se realizuje v `agenti`.