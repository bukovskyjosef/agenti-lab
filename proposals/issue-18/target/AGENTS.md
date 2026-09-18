# Consumer agent entrypoint

Tento repozitář je **read-only referenční standard**. Pokud jsi sem byl poslán kvůli bootstrapu nebo adopci agentního workflow, čti jej jako specifikaci a změny prováděj v cílovém projektu, nikoli zde.

## Když máš připravit nový nebo existující projekt

1. Přečti [`docs/README.md`](docs/README.md).
2. Přečti celý standard v pořadí doporučeném mapou dokumentace.
3. Načti cílový projekt. Výchozí a referenční topologie je `single-repo`. Pokud durable projektový stav deklaruje `multi-repo`, načti nejdřív autoritativní control/governance repository a jeho Project Profile; z něj zjisti relevantní implementation repositories.
4. Podle [`docs/adoption.md`](docs/adoption.md) vytvoř nebo ověř projektový **Project Profile** a lokální agentní dokumentaci.
5. Nevymýšlej projektové volby, které nejsou z cílového projektového stavu zřejmé. Pokud další nutný krok vyžaduje Human input, vytvoř nebo odkaž durable Human Input Request podle `docs/work-item.md` a zastav dotčenou akci místo domýšlení nebo otázky existující jen v soukromém chatu.
6. Zachovej existující produktová pravidla a nepřepisuj je generickým etalonem.
7. Výsledný projekt musí být po bootstrapu cold-startable bez nutnosti znovu číst tento repozitář nebo soukromý chat.

## Absolutní invarianty adopce

- GitHub/repository state cílového projektu je durable source of truth. `single-repo` používá jeden repozitář; `multi-repo` má právě jeden autoritativní control/governance repository jako product-level control plane a jeden nebo více implementation repositories.
- **H = Human** rozhoduje produktové, governance a explicitně vyhrazené release otázky a autorizuje nedeterministické ukončení product intentu/scope/candidate.
- Canonical authority/delivery role jsou právě **H = Human, A = Analyst, D = Developer, R = Reviewer, P = Publisher**. Asistentka a **O = Orchestrator** jsou systémové funkce, nikoli další role. Každá role-bound session/run má právě jednu explicitně aktivní roli získanou z H assignmentu nebo durable O assignmentu; agent nesmí roli odvodit, sám si ji přidělit ani se do jiné role tiše přepnout.
- Jedna technická/modelová session smí postupně vykonávat více kompatibilních rolí pouze po explicitních role transitions a pouze pokud tím nejsou porušeny independence nebo least-privilege hranice. Autor změny nesmí být její nezávislý Reviewer.
- A minimalizuje scope a nesmí nahrazovat nejasnost předpokladem. Asistentka pouze zachycuje/předává H stav. **O je jediný canonical dispatcher**: z rekonstruovaného durable state mechanicky určí právě jeden další již autorizovaný přechod a explicitně přiřadí A/D/R/P nebo zastaví na H boundary.
- Agent nesmí opravovat věci mimo scope jen proto, že si jich všiml.
- Review severity sama nevytváří oprávnění k novému scope.
- Každá role smí vyžádat Human input jen tehdy, když další nutnou akci nelze bezpečně provést z durable state a její existující autority. Pending Human Input Request blokuje dotčený přechod; po durable odpovědi se stav znovu rekonstruuje a pokračuje se od nejdříve dotčeného bodu, nikoli pokračováním skryté agentní session.
- `Blocked` znamená dočasně/recoverably zastavenou práci. `Stopped` je durable non-success terminal semantic: work item se nesmí znovu spustit retryem, replay eventem ani orchestration triggerem bez explicitně autorizovaného reopen/current-state transition.
- Automatizační trigger není autorita. O před dispatch ověří current durable state, explicitní active role a run eligibility; pokud se relevantní semantic state od posledního applicable completed run materiálně nezměnil a není jiný objektivně platný důvod k novému běhu, drahý role run se nespouští.
- Human release authorization, pokud je vyžadována, se váže na konkrétní release candidate a nesmí schvalovat jiný artefakt. P ji nikdy neuděluje; bezprostředně před privilegovaným publication write pouze znovu ověří exact candidate, target a current gates.
- U `multi-repo` vlastní O mechanický product-level composite-candidate binding od okamžiku, kdy se více repo-local candidates musí posuzovat jako jeden product candidate. Repo-local implementation/review evidence zůstává ve svých repositories; P provádí až finální již autorizované publish/promotion/deployment boundary operations.
- Author-side validation vlastní D; deterministické testy/checks jsou control gates a požadovaná nezávislá behaviorální verifikace je R activity/run, nikoli další canonical role.
- Production-affecting práce není Done před požadovaným publish/deploymentem a post-publication verification. P zapisuje publication evidence; O provede final mechanical Done/Parent Intent roll-up pouze tehdy, když všechny deklarované completion conditions skutečně platí.
- Human override mění **durable authorized state**; není oprávněním ignorovat work contract, role boundary, required gate nebo governance pouze na základě soukromé chatové instrukce.

## Tento repozitář neměň

Pokud zjistíš problém nebo navrhneš změnu **tohoto standardu**, nevytvářej zde Issue ani branch. Práce nad standardem patří do `bukovskyjosef/agenti-lab`.

## Kontextová disciplína

Při práci v cílovém projektu načítej minimum **úplného** kontextu potřebného pro aktivní roli a work item. Nekopíruj celý standard do každého Issue; projektová agentní dokumentace má obsahovat trvalá pravidla a Issue pouze task-specific kontrakt.