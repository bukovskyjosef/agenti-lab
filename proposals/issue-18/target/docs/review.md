# Independent review

Cílem review je ověřit správnost změny proti autorizovanému work contractu, ne prosadit Reviewerův preferovaný redesign.

## 1. Nezávislost

Autor změny nesmí být její nezávislý Reviewer. R pracuje z Issue, skutečného diffu/commitů, kanonické dokumentace a check/test evidence.

R je canonical independent control role. Role je authority context, ne automaticky samostatná session, ale mandatory review independence přebíjí session reuse: logical instance, která kontrolovaný exact candidate vytvořila, nesmí být jeho independent R ani po pozdějším reassignmentu.

R run musí mít explicitně aktivní roli `R`; nesmí si ji odvodit z PR/Issue state ani se z jiné role sám přepnout.

## 2. Co R kontroluje

1. Scope — změna řeší právě autorizovaný problém.
2. Requirements — odpovídá kanonickým pravidlům a decisions.
3. Acceptance criteria — existuje evidence splnění.
4. Semantic authority / implementation fidelity — implementation/technical artifact nepřidal, nezpřísnil ani jinak nezměnil product/domain behavior mimo dostatečně konkrétní autorizovaný upstream contract; konflikt se neposuzuje tak, že executable artifact automaticky přebírá product authority.
5. Effective-state evidence — pokud review závěr závisí na current runtime/platform factu, evidence pochází z declared effective-state source/equivalence rule; design/config artifact sám není automaticky důkazem effective state.
6. Shared contracts — nebyly změněny bez autority.
7. Technickou přiměřenost — řešení není zbytečně široké nebo křehké.
8. Validation — test/check evidence podporuje tvrzení.
9. Documentation — durable truth byla aktualizována tam, kde se změnila.
10. Dependencies/concurrency — byla respektována koordinace.
11. Independent behavioral verification — pokud work contract vyžaduje nezávislý behavioral judgment, R jej provede/ověří proti exact candidate; deterministic test suite sama nemění role authority.

R používá semantic authority/currentness informace z Project Profile/canonical map podle `principles.md` a `adoption.md`. Authority je fact-domain-scoped: effective runtime evidence může rozhodovat fakt o skutečně nasazeném/configured stavu, ale sama tím nezískává product/domain authority pro autorizované chování.

Historical/snapshot/superseded artifact se nepoužije jako current authoritative source jen proto, že obsahuje relevantní text. Pokud current authority není zjistitelná nebo je upstream product/domain contract příliš neurčitý k posouzení fidelity bez vymýšlení product meaning, review zaznamená odpovídající blocker/finding místo normalizace podle current code/configuration.

Effective-state inspection je požadována pouze pokud je effective fact materiální pro aktuální review contract/gate. Pokud R nemá k deklarovanému effective source autorizovaný přístup, přesně zaznamená unverified boundary/blocker a nesmí tvrdit equivalence z declared/design state.

Pokud R zjistí, že bez Human input nelze review bezpečně dokončit, použije durable Human Input Request podle `work-item.md`; nevytváří ad-hoc chatovou eskalaci.

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

Technický/executable artifact, který bez autority zavádí další, přísnější, alternativní nebo jinak odlišné product/domain pravidlo oproti dostatečně konkrétnímu upstream contractu, je `DEFECT`; jeho existující executability/enforcement není authority k přepsání product intentu.

#### `DECISION_REQUIRED`
Riziko nebo mezera vyžaduje nový produktový/governance/scope/architecture kontrakt.

R popíše evidence a potřebnou autoritu; nesmí sám vybrat variantu jako schválenou.

Blocking `DECISION_REQUIRED` vytvoří nebo odkáže `PENDING` Human Input Request typu `DECISION` v autoritativním work itemu. Finding disposition určuje, **proč** je potřeba Human authority; generic request zajišťuje durable otázku, guard a resume. Human response sama neobnoví review závěr — O znovu vyhodnotí current state a explicitně dispatchne R/Analyst/other next role pouze podle nejdříve dotčeného bodu.

Blocking factual clarification, která není novou Human-owned product/governance/scope volbou, může použít request typu `CLARIFICATION` bez umělého překlasifikování na `DECISION_REQUIRED`.

#### `RECOMMENDATION`
Volitelné zlepšení nad současný kontrakt. Nezablokuje current work jen proto, že by bylo „lepší“.

D ji nesmí oportunisticky implementovat během corrective loopu bez nové autority. Recommendation sama není důvod pro blocking Human Input Request.

## 4. Celkový outcome

R vydá právě jeden výsledek:

- `APPROVED`,
- `CHANGES_REQUIRED`,
- `DECISION_REQUIRED`.

`APPROVED` může obsahovat Recommendations.

Pokud je review dočasně blokované generic `CLARIFICATION`/`HUMAN_ACTION` requestem, nevyrábí se kvůli tomu nová overall disposition; review zůstává nedokončené, dokud durable state neumožní znovu vyhodnotit výsledek.

## 5. Corrective loop a re-review eligibility

```text
DEFECT
  ↓
O routes from durable finding
  ├─ implementation defect → D: smallest in-scope correction
  └─ upstream contract deficiency → A: contract repair/shaping
  ↓
required validation / materially updated state
  ↓
O → independent R re-review
```

R sám neopravuje kontrolovaný kód.

Další re-review run je oprávněný pouze pokud se od posledního applicable completed review materiálně změnil některý vstup, na kterém review závisí, nebo existuje jiný objektivně validní progress reason podle `delivery-cycle.md`.

Typicky je validní:

- nový candidate/head,
- changed authorized contract/AC/parent input,
- nové nebo změněné required check/test evidence,
- resolution/staleness blocking Human requestu nebo findingu,
- relevantní target/base/environment drift, který review contract vyžaduje znovu posoudit.

Pouhý duplicate trigger, nový run ID nebo bezezměnný candidate/evidence není důvod ke spuštění dalšího drahého review. Pre-dispatch suppression vlastní `automation.md`.

Semanticky stejný unresolved finding se nevytváří znovu jako nový finding jen proto, že došlo k retry/no-op runu; existing durable finding/thread se aktualizuje nebo resolve/stale označí podle current state.

Human response, která mění inputs tohoto loopu, vrací flow na nejdříve dotčený bod; předchozí review/check evidence se invaliduje jen v rozsahu svých změněných dependencies.

### Non-convergence

Pokud corrective loop opakovaně neprodukuje objective progress a není k dispozici další již autorizovaný corrective path, R/D nevytvářejí další identický ping-pong. Durable state zachytí non-convergence evidence a O routuje existující autoritu podle `delivery-cycle.md`.

Human může rozhodnout o abandonment; pak se použije `Stopped` reason `NON_CONVERGENT_ABANDONED`. R sám takové intentional termination nerozhodne.

## 6. New scope

Finding mimo current contract se nestává součástí PR jen proto, že byl objeven při review. Podle disposition se buď:

- vrací do stejného corrective loopu (`DEFECT`),
- routuje k Human decision (`DECISION_REQUIRED` + Human Input Request typu `DECISION`),
- zachytí jako volitelný future Intake (`RECOMMENDATION`).

Pokud Human výslovně stáhne/ukončí intent místo autorizace dalšího scope/candidate, nejde o `RECOMMENDATION` ani nekonečný `Blocked`; workflow použije Human-authorized `Stopped` podle `delivery-cycle.md`.