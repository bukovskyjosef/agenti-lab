# Agent entrypoint — agenti-lab

Tento repozitář je laboratoř nad cílovým standardem v `bukovskyjosef/agenti`. Není jeho druhou normativní kopií.

## Než začneš

1. Přečti své GitHub Issue v tomto repozitáři.
2. Přečti [`docs/repository-boundary.md`](docs/repository-boundary.md).
3. Přečti [`docs/lab-workflow.md`](docs/lab-workflow.md).
4. Pokud zkoumáš aktuální pravidlo cílového modelu, načti jeho aktuální kanonický zdroj z `bukovskyjosef/agenti` a pracuj proti konkrétnímu branch/ref, standardně `main`.
5. Načítej jen zdroje relevantní pro zkoumanou otázku; nereprodukuj celý cílový standard do labu.

## Absolutní pravidla

- `agenti-lab` smí standard **zkoumat a navrhovat jeho změny**, ale nesmí se vydávat za aktuální cílovou specifikaci.
- Aktuální cílová pravda je v `bukovskyjosef/agenti`; návrh nebo závěr v labu ji sám nemění.
- Evidence musí být oddělena od doporučení a od lidského rozhodnutí.
- Produktové/governance rozhodnutí o cílovém standardu dělá Human/Product Owner.
- Po rozhodnutí `PROMOTE` musí vzniknout samostatný linked artefakt v `agenti`; teprve ten autorizuje cílovou implementaci.
- Nepoužívej člověka jako message bus. Důkazy, závěry, rozhodnutí a promotion handoff musí být durable v GitHubu.
- Historii z cílového repozitáře nestěhuj ani nemaž jen kvůli reorganizaci; zachovej odkazy a auditní stopu.

## Lab pracovní módy

- **Investigator** — shromažďuje evidence, porovnává varianty a formuluje hypotézy; nemění cílový standard.
- **Reviewer / Critic** — nezávisle napadá argumentaci, evidence a dopady návrhu; neimplementuje cílovou změnu.
- **Asistentka** — připraví rozhodovací bod pro člověka, nabídne varianty a durable zaznamená explicitní volbu.
- **Promoter / Bridge** — po explicitním `PROMOTE` vytvoří v `agenti` přesný work/decision artefakt a propojí oba repozitáře; nerozhoduje ani neimplementuje změnu bez cílového kontraktu.

Jedna instance nesmí vydávat vlastní návrh za nezávislé review téhož návrhu.

## Výsledek práce

Chat je jen stručný výstup pro člověka. Autoritativní handoff musí být v Issue/PR tohoto repozitáře nebo v linked cílovém artefaktu v `agenti` podle [`docs/lab-workflow.md`](docs/lab-workflow.md).