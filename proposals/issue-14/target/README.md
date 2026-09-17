# Agenti — publikovaný referenční standard

`agenti` je **čistý publikovaný blueprint** pro nastavení agentního vývoje softwarového projektu. Není to pracovní repozitář pro vývoj samotného standardu.

Jeho účel je umožnit instrukci typu:

> Agente, přečti `bukovskyjosef/agenti` a připrav repozitář `<nové-repo>` přesně podle tohoto standardu.

## Status tohoto repozitáře

- `main` je jediný autoritativní publikovaný stav.
- Aktuální strom obsahuje pouze současný standard potřebný k jeho adopci.
- Issues, rozhodnutí, audity, experimenty, pracovní větve a review změn tohoto standardu patří do [`bukovskyjosef/agenti-lab`](https://github.com/bukovskyjosef/agenti-lab).
- Historické GitHub artefakty nebo Git historie nejsou součástí aktuálního standardu.
- Agent, který tento repozitář čte kvůli adopci, jej **nemá měnit**.

## Cílový delivery cyklus

```text
Human intent
  ↓
Asistentka — intake / Human-facing transport
  ↓
Orchestration — reconstruct state + explicit role dispatch
  ↓
Analyst — Analysis / scope firewall
  ├─ Human-owned input missing
  │    → durable Human request → Asistentka ↔ Human
  │    → orchestration reconstructs current state → earliest affected step
  ├─ decomposition required
  │    → non-executable Parent Intent + bounded executable child Issues
  │    → normal Analysis/Ready flow per child
  └─ one bounded executable/reviewable contract
       → Ready
            ↓
        Developer
            ↓
        PR(s) + checks
            ↓
        multi-repo only: Integrator maintains current composite-candidate binding
            ↓
        Independent Reviewer / required control gates
          ├─ DEFECT → corrective loop only after objective progress
          ├─ DECISION_REQUIRED → durable Human-input flow
          └─ APPROVED
                ↓
        Human release authorization, pokud ji projekt vyžaduje
                ↓
        Integrator — revalidate + integrate/promote exact candidate
                ↓
        production-authoritative boundary
                ↓
        automatic deployment + post-release verification
                ↓
               Done
```

V libovolné fázi může recoverable blocker vést do `Blocked`. Durable rozhodnutí práci nepokračovat vede do non-success terminal `Stopped`; delayed event ani retry ji nesmí znovu spustit bez explicitního reopen transition.

Parent Intent se neimplementuje samostatně. Orchestrace mechanicky re-evaluuje jeho deklarovanou overall completion condition při změnách relevantních child/parent conditions a uzavře jej pouze tehdy, když je condition skutečně splněná.

Canonical role je authority/function context, ne automaticky nová modelová session. Session může po explicitním reassignmentu sekvenčně vykonávat kompatibilní role, ale vždy má právě jednu explicitně aktivní roli a nesmí porušit mandatory independence (zejména author ≠ independent Reviewer).

Člověk je produktová a release autorita, ne ruční scheduler nebo message bus mezi agenty.

## Kde začít

Agent začíná v [`AGENTS.md`](AGENTS.md). Mapa standardu je v [`docs/README.md`](docs/README.md).

## Dokumenty

- [`docs/principles.md`](docs/principles.md) — základní invarianty a autorita,
- [`docs/roles.md`](docs/roles.md) — role, aktivace a kompetence,
- [`docs/delivery-cycle.md`](docs/delivery-cycle.md) — end-to-end workflow, termination a release model,
- [`docs/work-item.md`](docs/work-item.md) — pracovní kontrakt, Parent Intent, Definition of Ready a durable state,
- [`docs/review.md`](docs/review.md) — nezávislé review a corrective loop,
- [`docs/automation.md`](docs/automation.md) — event-driven orchestrace, run eligibility a bezpečnost automatizace,
- [`docs/adoption.md`](docs/adoption.md) — jak standard zavést do nového nebo existujícího projektu.

## Co je projektově konfigurovatelné

Standard nevnucuje konkrétní AI provider, branch jména, deployment platformu ani univerzální testovací matici. Adoptující projekt musí tyto volby explicitně zaznamenat ve svém **Project Profile** podle `docs/adoption.md`.