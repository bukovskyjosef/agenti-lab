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
H intent
  ↓
Asistentka — durable intake / Human-facing transport
  ↓ event/explicit call (trigger only)
O — reconstruct current state + guard + explicit A assignment
  ↓
A — Analysis / shaping / scope firewall
  ├─ H-owned input missing → durable H request → Asistentka ↔ H → O
  ├─ decomposition → Parent Intent + bounded executable children
  └─ Ready
       ↓ O
D — implementation + author validation → exact candidate/PR
       ↓ checks/events wake O
R — independent review / required behavioral verification
  ├─ implementation defect → O → D
  ├─ upstream contract deficiency → O → A
  ├─ H-owned decision → Asistentka ↔ H → O
  └─ APPROVED
       ↓ O
configured H release authorization?
  ├─ no
  └─ yes → exact candidate → H → durable GRANTED → O
       ↓
P — revalidate exact candidate + publish/promote/deploy + publication checks
       ↓
optional independent post-publication R gate
       ↓
O — mechanical completion evaluation → Done
```

V `multi-repo` O mechanicky udržuje current composite-candidate binding z repo-qualified immutable candidate identities a current local evidence. P následně provádí pouze již autorizovaný coordinated publication plan; žádná samostatná integrační role neexistuje.

Recoverable blocker vede do `Blocked`. Durable rozhodnutí práci nepokračovat vede do terminal `Stopped`; delayed event ani retry ji nesmí znovu spustit bez explicitního reopen transition.

Parent Intent se neimplementuje samostatně. O mechanicky re-evaluuje jeho deklarovanou overall completion condition při změnách relevantních child/parent conditions a uzavře jej pouze tehdy, když condition skutečně platí.

Canonical authority/delivery role jsou právě **H/A/D/R/P**. Asistentka a O jsou systémové funkce. Role-bound session může po explicitním reassignmentu sekvenčně vykonávat kompatibilní role, ale vždy má právě jednu explicitně aktivní roli a nesmí porušit mandatory independence (zejména D/author ≠ independent R).

H je produktová, governance a případně release-authorization autorita, ne ruční scheduler nebo message bus. GitHub event pouze probouzí O; autorita vzniká z current durable state, nikoli z eventu nebo handoff textu.

Human override se nejdřív durably promítne do work contractu/governance/role assignmentu/release gate/stop-reopen recordu. Teprve potom O znovu rekonstruuje stav a určí další autorizovaný krok.

## Kde začít

Agent začíná v [`AGENTS.md`](AGENTS.md). Mapa standardu je v [`docs/README.md`](docs/README.md).

## Dokumenty

- [`docs/principles.md`](docs/principles.md) — základní invarianty a autorita,
- [`docs/roles.md`](docs/roles.md) — role, aktivace a kompetence,
- [`docs/delivery-cycle.md`](docs/delivery-cycle.md) — end-to-end workflow, termination a release model,
- [`docs/work-item.md`](docs/work-item.md) — pracovní kontrakt, Parent Intent, Definition of Ready a durable state,
- [`docs/review.md`](docs/review.md) — nezávislé review a corrective loop,
- [`docs/automation.md`](docs/automation.md) — event-driven O model, run eligibility a bezpečnost automatizace,
- [`docs/adoption.md`](docs/adoption.md) — jak standard zavést do nového nebo existujícího projektu.

## Co je projektově konfigurovatelné

Standard nevnucuje konkrétní AI provider, branch jména, deployment platformu ani univerzální testovací matici. Adoptující projekt musí tyto volby explicitně zaznamenat ve svém **Project Profile** podle `docs/adoption.md`.