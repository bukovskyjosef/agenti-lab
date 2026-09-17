# Independent review

Cílem review je ověřit správnost změny proti autorizovanému work contractu, ne prosadit Reviewerův preferovaný redesign.

## 1. Nezávislost

Autor změny nesmí být její nezávislý Reviewer. Reviewer pracuje z Issue, skutečného diffu/commitů, kanonické dokumentace a check/test evidence.

## 2. Co Reviewer kontroluje

1. Scope — změna řeší právě autorizovaný problém.
2. Requirements — odpovídá kanonickým pravidlům a decisions.
3. Acceptance criteria — existuje evidence splnění.
4. Shared contracts — nebyly změněny bez autority.
5. Technickou přiměřenost — řešení není zbytečně široké nebo křehké.
6. Validation — test/check evidence podporuje tvrzení.
7. Documentation — durable truth byla aktualizována tam, kde se změnila.
8. Dependencies/concurrency — byla respektována koordinace.

Pokud Reviewer zjistí, že bez Human input nelze review bezpečně dokončit, použije durable Human Input Request podle `work-item.md`; nevytváří ad-hoc chatovou eskalaci.

## 3. Finding má dvě osy

### Severity

- `BLOCKER`
- `MAJOR`
- `MINOR`
- `NIT`

Severity popisuje dopad. **Nevytváří implementační autoritu.**

### Disposition

#### `DEFECT`
Změna porušuje již autorizovaný kontrakt: například AC, existující invariant, required check, podporované chování nebo autorizovaný shared contract.

Autorizovaný další krok je nejmenší in-scope corrective change ve stejném work itemu.

#### `DECISION_REQUIRED`
Riziko nebo mezera vyžaduje nový produktový/governance/scope/architecture kontrakt.

Reviewer popíše evidence a potřebnou autoritu; nesmí sám vybrat variantu jako schválenou.

Blocking `DECISION_REQUIRED` vytvoří nebo odkáže `PENDING` Human Input Request typu `DECISION` v autoritativním work itemu. Finding disposition určuje, **proč** je potřeba Human authority; generic request zajišťuje durable otázku, guard a resume. Human response sama neobnoví review závěr — Reviewer/automation znovu vyhodnotí current contract, candidate a affected gates podle `delivery-cycle.md`.

Blocking factual clarification, která není novou Human-owned product/governance/scope volbou, může použít request typu `CLARIFICATION` bez umělého překlasifikování na `DECISION_REQUIRED`.

#### `RECOMMENDATION`
Volitelné zlepšení nad současný kontrakt. Nezablokuje current work jen proto, že by bylo „lepší“.

Developer ji nesmí oportunisticky implementovat během corrective loopu bez nové autority. Recommendation sama není důvod pro blocking Human Input Request.

## 4. Celkový outcome

Reviewer vydá právě jeden výsledek:

- `APPROVED`,
- `CHANGES_REQUIRED`,
- `DECISION_REQUIRED`.

`APPROVED` může obsahovat Recommendations.

Pokud je review dočasně blokované generic `CLARIFICATION`/`HUMAN_ACTION` requestem, nevyrábí se kvůli tomu nová overall disposition; review zůstává nedokončené, dokud durable state neumožní znovu vyhodnotit výsledek.

## 5. Corrective loop

```text
DEFECT
  ↓
Developer: smallest in-scope correction
  ↓
required validation
  ↓
updated PR
  ↓
independent re-review
```

Reviewer sám neopravuje kontrolovaný kód.

Human response, která mění inputs tohoto loopu, vrací flow na nejdříve dotčený bod; předchozí review/check evidence se invaliduje jen v rozsahu svých změněných dependencies.

## 6. New scope

Finding mimo current contract se nestává součástí PR jen proto, že byl objeven při review. Podle disposition se buď:

- vrací do stejného corrective loopu (`DEFECT`),
- routuje k Human decision (`DECISION_REQUIRED` + Human Input Request typu `DECISION`),
- zachytí jako volitelný future Intake (`RECOMMENDATION`).