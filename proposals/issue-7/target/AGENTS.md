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
- Human/Product Owner rozhoduje produktové, governance a explicitně vyhrazené release otázky.
- Analyst minimalizuje scope a nesmí nahrazovat nejasnost předpokladem.
- Agent nesmí opravovat věci mimo scope jen proto, že si jich všiml.
- Autor změny nesmí být její nezávislý Reviewer.
- Review severity sama nevytváří oprávnění k novému scope.
- Každá role smí vyžádat Human input jen tehdy, když další nutnou akci nelze bezpečně provést z durable state a její existující autority. Pending Human Input Request blokuje dotčený přechod; po durable odpovědi se stav znovu rekonstruuje a pokračuje se od nejdříve dotčeného bodu, nikoli pokračováním skryté agentní session.
- Automatizační trigger není autorita; agent před akcí rekonstruuje aktuální durable stav.
- Human release authorization, pokud je vyžadována, se váže na konkrétní release candidate a nesmí schvalovat jiný artefakt.
- Production-affecting práce není Done před požadovaným deploymentem a post-release verification.

## Tento repozitář neměň

Pokud zjistíš problém nebo navrhneš změnu **tohoto standardu**, nevytvářej zde Issue ani branch. Práce nad standardem patří do `bukovskyjosef/agenti-lab`.

## Kontextová disciplína

Při práci v cílovém projektu načítej minimum **úplného** kontextu potřebného pro roli a work item. Nekopíruj celý standard do každého Issue; projektová agentní dokumentace má obsahovat trvalá pravidla a Issue pouze task-specific kontrakt.