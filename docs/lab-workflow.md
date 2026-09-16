# Lab workflow

Tento dokument definuje minimální pracovní model pro `agenti-lab`. Je záměrně lehčí než cílový produktový workflow v `agenti`.

## 1. Intake

Vstupem může být:

- problém pozorovaný v reálném projektu,
- auditní nález,
- otázka nad cílovým standardem,
- alternativní workflow nápad,
- failure/incident agentní spolupráce,
- experimentální hypotéza.

Vznikne lab Issue. Vstup nemusí mít řešení; musí být jasné, co chceme zjistit a proč.

## 2. Investigation

**Investigator**:

- načte přesně relevantní aktuální zdroje z `agenti` a/nebo reálných adopcí,
- rozlišuje fakta, pozorování, hypotézy a doporučení,
- dokumentuje evidence a limity evidence,
- navrhne materiálně odlišné varianty jen pokud je pro ně dost podkladů,
- nemění cílový standard.

Výstupem může být `NO_CHANGE`, `MORE_EVIDENCE_NEEDED` nebo `PROPOSAL_READY`.

## 3. Critique / independent review

Pro významnou změnu cílového workflow má návrh před lidským rozhodnutím nezávisle napadnout **Reviewer / Critic**.

Kontroluje zejména:

- zda evidence podporuje problém,
- zda návrh neřeší pouze lokální zvláštnost jako univerzální pravidlo,
- zda nejsou přehlédnuté jednodušší varianty,
- zda se nezvyšuje procesní/tokenová režie bez jasné hodnoty,
- zda návrh zachovává lidskou produktovou autoritu,
- zda nezavádí druhý zdroj pravdy nebo nejasnou kompetenci.

Reviewer/Critic neimplementuje cílovou změnu a nemá právo ji sám promotovat.

## 4. Human decision

Když je návrh decision-ready, **Asistentka** nebo jiná explicitně pověřená liaison role předloží Human/Product Ownerovi:

- stručný problém,
- hlavní evidence a její omezení,
- obvykle 2–3 materiálně odlišné varianty,
- dopady/trade-offy,
- případné doporučení oddělené od rozhodnutí.

Human rozhodne `REJECT`, `ITERATE` nebo `PROMOTE`.

Rozhodnutí musí být durable v lab Issue. Absence odpovědi není rozhodnutí.

## 5. Promotion

Při `PROMOTE` přebírá **Promoter / Bridge** administrativní handoff podle [`repository-boundary.md`](repository-boundary.md).

Musí vzniknout samostatný linked artefakt v `agenti`. Ten začíná v lifecycle stavu odpovídajícím skutečné připravenosti; promotion nesmí obcházet Analysis/Ready pravidla cílového repozitáře.

Po vytvoření cílového artefaktu:

- lab Issue odkáže na target Issue,
- lab Issue může být uzavřeno jako `PROMOTED`, pokud další experiment není potřeba,
- implementace, review a integrace pokračují v `agenti`, nikoli v labu.

## 6. Experimenty

Experiment může používat branch/PR a pomocné soubory v labu. Výsledek experimentu je evidence, ne automatická specifikace.

Experiment musí uvést:

- hypotézu,
- setup a omezení,
- pozorování,
- co výsledek podporuje a co neprokazuje,
- zda navrhuje target change.

## 7. Handoff destinations

| Událost | Durable místo |
|---|---|
| otázka / audit / hypotéza | lab Issue |
| evidence / investigation report | lab Issue comment nebo autorizovaný lab artefakt |
| experimentální změna | lab branch / PR |
| independent critique | lab Issue/PR review podle artefaktu |
| Human decision | původní lab Issue |
| target change promotion | nové linked Issue/decision v `agenti` + backlink v lab Issue |
| target implementation/review | pouze `agenti` |

Člověk nemá kopírovat reporty mezi rolemi nebo repozitáři ručně; agent, který provádí handoff, ho zapíše durable.

## 8. Completion

Lab Issue je dokončené, pokud nastane jedna z podmínek:

- `NO_CHANGE` — evidence neodůvodňuje změnu a závěr je doložen,
- `REJECTED` — Human návrh explicitně odmítl,
- `PROMOTED` — linked cílový artefakt v `agenti` existuje a obsahuje potřebný handoff,
- `CLOSED_INCONCLUSIVE` — další investigation nemá nyní smysl a limity jsou explicitně zaznamenané.

Samotné dokončení lab Issue nemění cílový standard.