# Základní principy

## 1. Repository state je durable source of truth

Pravidlo, rozhodnutí, work contract, blocker, review výsledek nebo informace nutná pro další roli nesmí existovat pouze v chatu nebo paměti agenta.

Chat může být Human interface. Agent-to-agent handoff musí být reconstructable z GitHub/repository state.

### Repository topology

Referenční a výchozí topologie je `single-repo`: jeden repozitář vlastní product-level governance, Human decisions, autoritativní work items, implementaci i product-level delivery state.

`multi-repo` je podporováno pouze jako právě **jeden autoritativní control/governance repository + jeden nebo více implementation repositories**.

- Control/governance repository vlastní product-level governance, Human decisions, autoritativní umístění work items a cross-repository coordination state a odkazy nutné k rekonstrukci product-level delivery state.
- Implementation repositories vlastní své implementační artefakty, branches/PRs/checks a repository-local technical evidence.
- Implementation repository nesmí vytvořit druhý konkurenční product-level source of truth.
- Project Profile musí deklarovat topologii a canonical ownership podle `adoption.md`. U `single-repo` samotná deklarace jednoho repository určuje všechny výše uvedené ownership role. U `multi-repo` musí být control repository a všechny implementation repositories identifikovatelné bez domýšlení.

## 2. Human/Product Owner drží produktovou autoritu

Agent smí dělat technická rozhodnutí uvnitř již autorizovaného scope. Nesmí sám rozhodnout:

- nové produktové chování,
- materiální změnu scope,
- governance změnu,
- vědomé přijetí významného trade-offu/rizika,
- release authorization tam, kde ji Project Profile vyžaduje.

Absence odpovědi není rozhodnutí.

## 3. Human input je podmíněný durable interrupt

Kterákoli role smí vyžádat Human input pouze tehdy, když její další nutnou akci nelze bezpečně a správně provést z aktuálního durable state a existující autority role.

Blocking request i Human odpověď musí být durable navázané na autoritativní work item. Dokud je požadovaný vstup unresolved, automatizace nesmí překročit dotčenou hranici. Pokud žádná jiná nezávislá autorizovaná práce nemůže pokračovat, používá se existující lifecycle stav `Blocked`; nevzniká nový hlavní stav.

Po Human odpovědi se nepokračuje slepě v původní agentní session. Systém znovu načte aktuální authoritative state, ověří identitu a binding requestu, promítne odpověď do relevantního kontraktu/stavu a pokračuje od nejdříve dotčeného bodu.

Předchozí analýza, check, review nebo approval zůstává platný pouze tehdy, pokud zůstaly platné jeho vstupy a předpoklady. Specializovaná Human release authorization si zachovává vlastní exact-candidate a `STALE` pravidla.

Human nesmí být používán jako rutinní transport agent-to-agent handoffu.

## 4. Scope je kontrakt, ne inspirace

Výchozí cíl je **nejmenší změna, která splní autorizovaný záměr a existující kontrakty**.

Agent:

- explicitně rozlišuje `Scope` a `Out of scope`,
- neopravuje oportunisticky sousední problémy,
- nepovyšuje recommendation, hardening nebo redesign na povinnou implementaci,
- nový materiální problém zaznamená a routuje správné autoritě.

## 5. Role spolupracují, nekonkurují

Výchozí model není několik agentů řešících totéž. Každá fáze má vlastní odpovědnost a kontrolní role práci autora nepřebírá.

Autor změny a její nezávislý Reviewer musí být různé logické pracovní instance.

## 6. Jedna aktuální pravda pro každou rule family

Projekt má určit kanonického vlastníka každé trvalé rodiny pravidel. README, AGENTS a task-local Issues mohou shrnovat nebo odkazovat, ale nesmí vytvářet nezávislou druhou specifikaci.

## 7. Context economy

Agent načítá minimum **úplného** kontextu potřebného pro úkol. Tokenová úspora nesmí znamenat vynechání relevantního kontraktu; zároveň se do tasků nekopíruje celý repozitář.

## 8. Automatizace nerozšiřuje autoritu

Workflow, API token, CLI nebo AI provider jsou mechanismy. Technická možnost něco zapsat nebo mergnout není oprávnění to udělat.

Každý automatizovaný krok musí být:

- odvoditelný z durable state,
- povolený rolí,
- idempotentní nebo chráněný proti duplicitě,
- bezpečně zastavitelný na unresolved Human input nebo jiném Human-owned gate.

## 9. Decision gate ≠ release authorization gate

**Decision gate** určuje, *co* je autorizovaný produkt/scope/governance výsledek.

**Release authorization gate** určuje, zda *konkrétní již technicky přijatý kandidát* smí překročit production-authoritative boundary.

Release approval nesmí měnit scope ani obejít chybějící technické gate. Generic Human Input Request tyto specializované významy nenahrazuje.

## 10. Projektový profil odděluje invariant od konfigurace

Referenční standard vlastní obecné invarianty. Konkrétní projekt musí explicitně určit repository topology a canonical ownership, své branches, environments, required gates, deployment trigger, release-approval policy a recovery authority v Project Profile.