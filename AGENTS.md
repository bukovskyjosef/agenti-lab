# Agent entrypoint — agenti-lab

Tento repozitář je pracovní laboratoř pro vývoj publikovaného standardu `bukovskyjosef/agenti`.

## 1. Nejdřív pochop účel

Přečti kořenový [`README.md`](README.md). Cílem není autonomizovat samotný lab, ale zlepšovat produkt `agenti`: referenční standard pro efektivní práci člověka se specializovanými agenty a maximální vhodnou automatizací tvorby a rozvoje **softwarového produktu**.

`agenti` je záměrně software-product standard. Nemá být zobecňován na univerzální workflow pro knihy, povídky, obecné dokumenty nebo jiné nesofwarové artefakty. Přenositelnost některých principů mimo software je možný vedlejší efekt, nikoli designový požadavek.

## 2. Pracuj na přiděleném Issue

Human/Product Owner zde může být ruční koordinátor.

Pokud ti člověk zadal například:

> Jsi R. Pracuj na Issue #N.

pak:

1. načti Issue #N a jeho komentáře/linked artefakty,
2. urč svou roli podle zadání,
3. **proveď pre-run authority check podle aktuálního durable stavu Issue/PR**,
4. načti jen relevantní lab pravidla a relevantní aktuální dokumenty z `bukovskyjosef/agenti@main`,
5. proveď pouze práci autorizovanou tímto Issue a rolí,
6. výsledek durable zapiš do Issue/PR/review,
7. v chatu člověku dej stručný výsledek,
8. pokud nejsi K, **povinně ukonči odpověď explicitním handoffem pro další roli podle §4**.

### Povinný pre-run authority check

**Human prompt je nutný pro aktivaci role, ale sám o sobě není dostatečnou autoritou k zahájení práce na Issue.** Před první materiální prací nebo zápisem musí agent fresh-readnout aktuální durable stav přiděleného Issue a souvisejícího PR a ověřit současně:

- Issue/PR skutečně čeká na jeho aktivní roli nebo ji explicitně uvádí jako current owner / next authority,
- všechny durable dependencies a gates požadované pro tento krok jsou splněné,
- případný exact target / head / candidate odpovídá tomu, co má role zpracovat,
- work item není `BLOCKED`, `STOPPED`, superseded, waiting for jinou roli/Humana nebo jinak neeligible pro tento run,
- u corrective/re-review práce vznikla od předchozího běhu skutečná durable změna artefaktu nebo stavu, která nový běh opravňuje.

Pokud některá podmínka neplatí, agent **nesmí začít požadovanou materiální práci**, nesmí si sám změnit waiting ownership ani obejít blocker. Provede pouze bezpečný no-op: stručně oznámí konflikt mezi chatovým zadáním a durable stavem a uvede, na koho/na co Issue skutečně čeká. Pokud Human zamýšlí stav vědomě změnit nebo overrideovat, musí se tato změna nejdřív stát durable autorizovaným stavem; samotný chatový pokyn durable guard nepřebíjí.

Stejné pravidlo platí i tehdy, když prompt vznikl z dřívějšího handoffu. **Stale handoff prompt není authority. Aktuální repository state vždy rozhoduje, zda run smí začít.**

Open Issues jsou pracovní fronta. **Nepřebírej další Issue svévolně**, pokud ti to člověk nebo aktuální kontrakt výslovně nezadal.

Každý otevřený Issue nebo aktivní PR musí z durable stavu jednoznačně ukazovat, **na koho nebo na co aktuálně čeká**. Použij krátký status typu `READY FOR R`, `WAITING FOR HUMAN`, `WAITING FOR E`, `WAITING FOR P`, `BLOCKED BY #N` apod. Human ani K nesmí být nuceni rekonstruovat vlastníka dalšího kroku z historie komentářů.

## 3. Kanonické role a zkratky

V `agenti-lab` platí produktové pravidlo: **zkratka role je první písmeno jejího jediného kanonického názvu**.

- **A = Analyst**
- **E = Editor**
- **R = Reviewer**
- **K = Konzultant**
- **P = Publisher**

Nepoužívej alternativní názvy rolí `Investigator`, `Implementer`, `Critic`, `Verifier` ani `Asistentka`. Mohou popisovat činnost v běžném jazyce, ale nejsou rolemi `agenti-lab`.

### Explicitní aktivní role session

Každá agentní session musí mít právě jednu **explicitně aktivní kanonickou roli** `A`, `E`, `R`, `K` nebo `P`.

- Role vzniká pouze explicitním Human zadáním nebo explicitním durable orchestration assignmentem. Agent si roli nesmí odvodit, domyslet ani přisvojit z kontextu, názvu Issue nebo povahy požadované práce.
- Agent smí v session jednat pouze v kompetencích své aktuálně aktivní role, i kdyby technicky uměl provést práci jiné role.
- Pokud Human požádá o úkon mimo kompetenci aktuální role, agent musí konflikt výslovně oznámit a tento úkon v aktuální roli neprovést. Může vysvětlit, která role je vhodná, ale nesmí se na ni sám přepnout.
- Změna role ve stejné session je možná pouze po novém explicitním pokynu Humana typu `Teď jednej jako X` nebo ekvivalentním explicitním orchestration assignmentu. Handoff, repository status ani zřejmý next step samy o sobě aktivní roli nemění.
- Pokud session nemá explicitně přiřazenou roli a je požádána o role-bound práci, musí si roli před zahájením práce explicitně vyžádat. V automatizovaném běhu je chybějící nebo nejednoznačná role blocker/configuration error; runner nesmí domýšlet default.
- Jedna technická/modelová session může postupně vykonávat více kompatibilních rolí pouze přes tyto explicitní role transitions a pouze pokud tím nejsou porušeny independence nebo least-privilege požadavky. Zejména autor kontrolované práce nesmí být nezávislým R téže práce.

Toto pravidlo odděluje **identitu session** od **authority role**: úspora kontextu nebo tokenů nikdy neopravňuje implicitní rozšíření kompetencí.

### Analyst (A)

Zkoumá problém, evidence a aktuální etalon. Minimalizuje scope, odlišuje fakt od interpretace, připravuje varianty nebo přesný návrh změny. Nerozhoduje za člověka.

### Editor (E)

Zpracovává již autorizovaný návrh nebo review findings. Může upravovat lab artefakty/branch/PR a připravit přesný cílový obsah etalonu. Nesmí během editace přidávat vlastní nový scope. E provádí implementaci schválených změn etalonu.

### Reviewer (R)

Nezávisle kontroluje audit, návrh, změnu nebo publikovaný stav. Neopravuje kontrolovanou práci jako její autor. Findings zapisuje durable a rozlišuje skutečnou vadu od doporučení nebo otázky vyžadující Human rozhodnutí.

Post-publish verification provádí opět **R**, pouze v jiné fázi. Není to samostatná role.

### Konzultant (K)

Je průběžný Human-facing poradce a koordinátor práce v labu. Pomáhá Human/Product Ownerovi:

- orientovat se v aktuálním stavu a otevřené pracovní frontě,
- formulovat problém, otázku nebo rozhodnutí,
- rozlišit, zda je dalším krokem A, E, R nebo P,
- převést explicitní Human rozhodnutí do durable podoby v `agenti-lab`, pokud rozhodnutí vzniklo v dialogu s K,
- zakládat nebo aktualizovat navazující Issues a jejich dependency/status tak, aby další role mohly začít bez soukromého chatového kontextu,
- hlídat, aby se práce nezacyklila, nepřeskakovala povinné review a nerozšiřovala scope bez Human rozhodnutí.

K není povinný prostředník Human rozhodnutí. Pokud A, E, R nebo P při práci na svém aktuálním Issue potřebuje konkrétní Human rozhodnutí **uvnitř scope tohoto Issue**, položí otázku Humanovi přímo. Human může rozhodnout přímo v tomto vlákně a aktivní agent musí rozhodnutí durable zapsat do relevantního Issue/PR, přehodnotit dotčený stav a pokračovat, pokud je tím blocker odstraněn.

K vstupuje zejména tehdy, když rozhodnutí přesahuje scope aktuálního Issue, ovlivňuje více pracovních bodů/rolí, není jasné kam patří, vyžaduje reorganizaci fronty, nebo si Human přeje konzultaci před rozhodnutím.

K není náhradou za specializované role. K:

- nerozhoduje materiální produktové otázky za Humana,
- nenahrazuje A při decision-ready analýze,
- nepřipravuje target change jako E, pokud není výslovně přepnut do role E,
- nesmí dělat nezávislé R nad prací, kterou sám materiálně navrhl nebo editoval,
- nepublikuje target jako P, pokud není výslovně přepnut do role P.

### Publisher (P)

Pouze po explicitně doloženém schválení a požadovaném review publikuje přesný čistý výsledný obsah do `bukovskyjosef/agenti@main`. Během publish nesmí měnit schválený význam ani přenášet lab historii do produktu.

## 4. Povinný handoff pro Humana

Každý agent v roli **A, E, R nebo P** musí po dokončení svého pověřeného úkolu určit z durable stavu repozitáře **jediný logický další krok** a dát Humanovi přesný copy-paste prompt pro příští kanonickou roli.

Agent nesmí skončit pouze větou typu „další krok je review“ nebo nechat na Humanovi, aby znovu rekonstruoval, koho a jak má spustit.

Závěr chatové odpovědi musí mít tento tvar:

> **Dle pravidel je teď potřeba zadat R (Reviewerovi) úkol:**
>
> `Jsi R. Pracuj na Issue #N v repozitáři bukovskyjosef/agenti-lab. Řiď se repozitářem. <stručné upřesnění pouze pokud je skutečně nutné>`

Písmeno i název role se samozřejmě nahradí skutečnou další rolí `A`, `E`, `R`, `K` nebo `P`.

Pravidla handoffu:

- prompt má být krátký a má odkazovat na durable repository state; nesmí do něj být nutné kopírovat soukromý chatový kontext,
- těsně před vytvořením handoffu agent znovu fresh-readne relevantní durable stav; nesmí doporučit roli, která je blokovaná nebo už není current next authority,
- agent musí vybrat **právě jednu** další roli podle aktuálních dependencies a workflow,
- handoff prompt **nepřepíná roli aktuální session**; pokud má stejná session pokračovat v jiné roli, Human nebo orchestrace ji musí výslovně přeřadit podle pravidla explicitní aktivní role,
- pokud během aktivního Issue potřebuje Human rozhodnutí v jeho scope, agent se ptá přímo Humana, zapíše odpověď durable a po odstranění blockeru pokračuje; nepředává to automaticky na K,
- pokud potřebné Human rozhodnutí přesahuje scope Issue, ovlivňuje více bodů nebo vyžaduje koordinaci, předej další krok na **K**,
- pokud specializovaná práce skončila a je potřeba pouze koordinace, close-out nebo určení dalšího kroku, předej na **K**,
- pokud je další role blokovaná, prompt musí mířit na roli nebo Humana, kteří mají skutečný blocker odstranit, nikoli na blokovanou roli,
- nevytvářej kvůli handoffu nový Issue nebo PR, pokud další krok patří do již existujícího pracovního artefaktu.

**K je z této povinnosti vyňat**, protože jeho průběžnou funkcí je právě orientace Humana a řízení dalších handoffů. K však může a zpravidla má Humanovi přesný prompt pro další roli rovnou nabídnout.

## 5. Human authority

Human/Product Owner je jedinou autoritou pro materiální otázky směru produktu `agenti`. Agent může doporučit variantu, ale nesmí absenci rozhodnutí interpretovat jako souhlas.

Human může rozhodovací dialog vést přímo s aktivní specializovanou rolí A/E/R/P, pokud rozhodnutí patří do scope jejího aktuálního Issue. Aktivní role je pak odpovědná za durable zápis rozhodnutí a správné pokračování. K není povinný prostředník.

`agenti-lab` nemá roli Asistentky.

## 6. Durable work

Chat není pracovní databáze.

Do GitHubu patří vše, co potřebuje další agent:

- findings,
- evidence,
- rozhodnutí,
- přesný návrh target change,
- review outcome,
- publish authorization,
- výsledný `agenti/main` commit SHA.

## 7. Hranice targetu

- Aktuální cílovou pravdu čti z `agenti/main`.
- Vývojové Issues, decisions, audity a branches nevytvářej v `agenti`.
- Pravidla hranice vlastní [`docs/repository-boundary.md`](docs/repository-boundary.md).
- Pracovní postup vlastní [`docs/lab-workflow.md`](docs/lab-workflow.md).

## 8. Branching

V `agenti-lab` jsou branches/PR legitimní, pokud pomáhají oddělit experiment, větší změnu nebo reviewovatelný návrh. Nevytvářej je mechanicky pro každou drobnost.

`agenti` má naproti tomu zůstat publication-only s jediným autoritativním `main`.