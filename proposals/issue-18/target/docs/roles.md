# Role a kompetence

## 1. Canonical authority/delivery role

Publikovaný standard používá právě:

- **H = Human**
- **A = Analyst**
- **D = Developer**
- **R = Reviewer**
- **P = Publisher**

**Asistentka** a **O = Orchestrator** jsou first-class systémové funkce, nikoli další role. Canonical role je authority context, ne automaticky samostatná modelová session.

Každý role-bound run/session má právě jednu explicitně aktivní roli. Assignment vzniká pouze explicitním H assignmentem nebo durable O assignmentem. Session si roli nesmí odvodit z Issue statusu, eventu, handoffu ani „zřejmého next stepu“, nesmí sama přepnout roli a nesmí kombinovat role authorities.

Jedna technická/modelová session může sekvenčně vykonávat kompatibilní role pouze po explicitním reassignmentu a pouze pokud zůstávají zachovány least privilege a mandatory independence. Autor exact candidate nesmí být jeho independent R ani po pozdějším reassignmentu.

Kterákoli aktivní delivery role může vytvořit bound Human Input Request podle `work-item.md`. Po H resolution se původní role automaticky neobnovuje; O rekonstruuje current state a explicitně určí earliest authorized next step.

## 2. H = Human

**Place in chain:** zdroj product intentu a rezervované autority; do aktivního toku vstupuje pouze při skutečné H-owned decision/action boundary.

### Entry conditions
- nový intent/input;
- bound Human Input Request;
- configured release authorization;
- intentional stop/reopen, governance change nebo conflict/override resolution;
- O nedokáže odvodit legal next transition bez H authority.

### Inputs
- current authoritative work item/Parent Intent;
- decision-ready evidence/options;
- exact Request ID/context binding;
- exact candidate/composite candidate + required gates pro release authorization;
- governing rule/contract relevantní k override.

### Responsibilities / must do
- poskytnout intent, choice, authorization, rejection, Human-only action, stop/reopen nebo governance decision;
- formulovat výsledek tak, aby šel durably a jednoznačně bindnout.

### Authority
- product behavior a scope;
- governance/policy changes a policy-permitted exceptions;
- priorities;
- intentional abandonment/reopen;
- configured exact-candidate release authorization;
- explicit role reassignment, pokud tím není porušena stále platná mandatory independence.

### Must not
- být rutinní scheduler/message bus;
- být interpretován jako „approved by silence“;
- obcházet required gate unbound chat instrukcí;
- přenést approval z jednoho candidate/target na jiný.

### Durable outputs
- captured intent;
- Human Input Request resolution;
- contract/governance mutation reference;
- role reassignment;
- exact release authorization/rejection;
- stop/reopen authority.

### Exit conditions
- explicitní H state je durably zapsaný a správně bound;
- O může další stav rekonstruovat bez private-chat dependency.

### Allowed next transitions / handoff outcomes
Vždy přes O reconstruction; podle earliest affected point typicky A, D, R nebo P.

### Human-interrupt conditions
H je sám interrupt authority; unresolved H work blokuje pouze dotčený transition.

### Independence
H product/release authority nenahrazuje required independent R control.

## 3. A = Analyst

**Place in chain:** převádí H intent/current authoritative state na bounded executable contract a vlastní analytical mutation po relevantních H resolutions.

### Entry conditions
- Intake existuje;
- current contract je analyticky neúplný/neplatný;
- H response mění Scope/Requirements/AC/decomposition/Ready inputs;
- R odhalí upstream contract deficiency, která není pouze D defect.

### Inputs
H intent/resolutions, semantic-authority/product-context map, current work item/Parent Intent, relevant product/domain/effective-state evidence, dependencies/findings a Project Profile.

### Responsibilities / must do
- odvodit všechny bezpečně zjistitelné facts z canonical state;
- adaptivně shape/decompose jen v nutné míře;
- držet smallest authorized Scope + explicit Out of scope;
- definovat testable AC, dependencies, constraints, gates a canonical references;
- identifikovat genuine H-owned missing inputs;
- vytvořit bounded children pouze z již authorized parent scope;
- dovést executable work item do Ready.

### Authority
Analytical derivation uvnitř authorized intentu, decomposition bez nového product scope, rozhodnutí „not Ready“, vytvoření přesného H requestu.

### Must not
Inventovat H-owned behavior/scope, skrývat ambiguity jako assumption, implementovat candidate, schvalovat implementation, publikovat nebo splitovat práci jen kvůli velikosti.

### Durable outputs
Updated work contract/Parent Intent/children, Ready evidence, H requests, blockers/dependencies, analytical disposition.

### Exit conditions
Ready executable contract, durable H/blocker path, nebo validní decomposition + parent bindings.

### Allowed next transitions / handoff outcomes
Ready → O → D; H input → Asistentka/H → O → earliest affected step; termination pouze podle existing Stop authority.

### Human-interrupt conditions
Nová product/governance/scope choice nebo Human-only clarification/action.

### Independence
Samotná analýza z A nedělá autora D candidate. Pokud však stejná logical instance materiálně vytvořila kontrolovaný candidate, nesmí být jeho independent R.

## 4. D = Developer

**Place in chain:** realizuje current Ready executable contract do exact candidate.

### Entry conditions
O rekonstruuje work jako Ready/executable, není blocking H request/dependency/terminal state, D assignment je explicitní a target/base splňuje current policy.

### Inputs
Ready contract, canonical semantic/product/technical docs, exact target/base context, validation/check policy, parent inputs a dependencies.

### Responsibilities / must do
- implementovat pouze authorized scope;
- dělat technická rozhodnutí uvnitř semantic envelope;
- zachovat implementation fidelity k upstream product/domain authority;
- provést author-side/local validation;
- vytvořit exact change proposal/candidate;
- durable zapsat candidate identity, validation a handoff;
- surface blockers/out-of-scope findings bez silent scope expansion.

### Authority
In-scope technical implementation choices a author-side validation/retry uvnitř policy.

### Must not
Měnit AC/scope tak, aby odpovídaly implementation, inventovat product rules, approve vlastní candidate jako independent R, publish/release ani používat H chat jako implicitní scope change.

### Durable outputs
Branch/PR/change proposal + immutable candidate identity, local validation/check evidence, blocker/H request.

### Exit conditions
Exact candidate + required author-side evidence, nebo durable blocker/H request/authorized stop path.

### Allowed next transitions / handoff outcomes
Candidate/evidence → O → deterministic gates/R; upstream contract deficiency → O → A; H-owned issue → Human-input flow; R implementation defect → O → D corrective run po objective progress.

### Human-interrupt conditions
Chybí nová H-owned product/scope/risk authority nebo Human-only action.

### Independence
D logical author nesmí být independent R stejného candidate.

## 5. R = Reviewer

**Place in chain:** nezávislý control nad exact candidate/evidence; je také canonical independent role pro behavioral verification vyžadující nezávislý judgment.

### Entry conditions
O rekonstruuje exact candidate/composite candidate + prerequisite evidence, R assignment je explicitní, R logical instance je independent od autora a neexistuje upstream blocker, který review činí neplatným.

### Inputs
Authoritative work contract + parent inputs, exact diff/candidate/composite binding, D validation, automated check evidence, canonical product/semantic/technical docs a material effective-state evidence.

### Responsibilities / must do
- independently inspect/test evidence požadované review contractem;
- ověřit scope, requirements, AC, fidelity, effective-state claims, dependencies a documentation;
- provést independent behavioral verification scenarios, pokud je contract vyžaduje a deterministic gates je plně nepokrývají;
- klasifikovat findings a overall outcome;
- rozlišit implementation defect, upstream contract deficiency a H-owned decision.

### Authority
Finding classification, `APPROVED | CHANGES_REQUIRED | DECISION_REQUIRED` a independent verification judgment.

### Must not
Opravovat D candidate jako R, vytvářet new product scope, waive failed/missing gates, publish nebo měnit recommendation na requirement bez authority.

### Durable outputs
Reviewed exact candidate identity, findings/evidence, review/behavioral-verification result, případný H request.

### Exit conditions
Durable outcome bound na exact current inputs, nebo durable blocker na H/missing evidence.

### Allowed next transitions / handoff outcomes
Implementation defect → O → D; upstream contract deficiency → O → A; H-owned decision → Human-input flow; APPROVED → O → optional H release authorization → P; configured post-publication R gate → O Done/corrective path.

### Human-interrupt conditions
Genuine H-owned product/governance/scope/material-risk choice.

### Independence
Author ≠ independent R. Dedicated R behavioral-verification run může být stejná independent R instance jako code review pouze pokud to dovoluje Project Profile/work contract; nikdy se tím nestává D.

## 6. P = Publisher

**Place in chain:** finální execution role přesouvající exact technically accepted a případně H-release-authorized candidate přes configured publication boundary.

### Entry conditions
O rekonstruuje exact candidate/composite candidate, required technical gates jsou current, required H release authorization je current/exact-bound, neexistuje Stopped/blocking/stale stav a P assignment je explicitní.

### Inputs
Exact candidate/composite map, current R/check evidence, current H release authorization pokud je required, publication target/boundary plan, deployment/recovery policy, P-only credentials a publication-specific verification contract.

### Responsibilities / must do
- bezprostředně před privileged write znovu ověřit exact candidate/target/gates/authorization;
- provést pouze Project-Profile-defined merge/promotion/tag/release/deploy operations;
- nikdy nesubstituovat candidate;
- zapsat exact published identities a publication evidence;
- spustit/koordinovat publication-specific deterministic checks (deployment completion, exact-version evidence, readiness/health, bounded smoke) podle contractu;
- durably zachytit partial failure/recovery state;
- vyžádat H input pouze pokud je nutná nová authority/action.

### Authority
Execution již authorized publication planu a bounded retry/recovery pouze tam, kde ji Project Profile předem autorizuje.

### Must not
Approve product scope, grant release authorization, waive R/check failure, repair implementation, improvizovat destructive rollback ani publikovat jiný SHA/artifact/member set.

### Durable outputs
Merge/tag/release/deployment IDs, exact published candidate identity, publication/deployment status, publication-specific verification evidence a failure/recovery/H-request evidence.

### Exit conditions
Required publication operations + P-owned checks mají durable result, nebo je durable failure/blocker/H request.

### Allowed next transitions / handoff outcomes
Success bez dalšího independent gate → O → Done; success + configured post-publication independent judgment → O → R → O; stale/gate drift → O earliest affected point; retryable failure → O/P podle policy; H-owned recovery/exception → Human-input flow.

### Human-interrupt conditions
Human-only access/action, nový recovery trade-off, policy exception nebo nová release authorization kvůli stale candidate.

### Independence
P není R substitute. P pre-write revalidation je safety check, nikoli independent approval.

## 7. Asistentka — Human interface system function

Asistentka nemá single-letter role shorthand.

### Owns
- capture raw H intentu do durable Intake bez analytical rewrite;
- H queues/views nad durable GitHub state;
- presentation exact Human Input Requests a release/decision gates;
- durable record explicit H response/action/authorization proti exact binding;
- notify/invoke O po durable H state change.

### Does not own
Scope/AC derivation, Ready decision, role selection, candidate validity, technical approval, release approval ani parallel backlog.

Asistentka může být UI, chatbot, GitHub App UI, issue form nebo jiný adapter. Její implementation je Project Profile configuration.

## 8. O = Orchestrator — system/control-plane function

O je **jediný canonical dispatcher** a není H/A/D/R/P.

### Owns
1. wake/receive relevant trigger;
2. fresh-read authoritative state místo důvěry event payloadu;
3. validate lifecycle/terminal state, dependencies, parent inputs, gates, H requests, exact candidate binding, material effective-state requirements a run eligibility;
4. mechanicky udržovat current multi-repo composite candidate binding;
5. derive právě jeden next **already-authorized** transition;
6. CAS/idempotentně zapisovat deterministic lifecycle/control-plane transitions;
7. vytvořit explicit role assignment s work itemem, purpose, candidate/context a state fingerprint;
8. dispatch role-bound runner nebo H queue step;
9. suppress duplicate/no-op/replayed work;
10. stop na real H authority boundary;
11. po H response reconstruct a resume od earliest affected point;
12. mechanicky close executable work/Parent Intent, když objective completion conditions platí.

### Must never
Inferovat product meaning, volit product trade-off, převést natural-language event content na authority, waive gate, grant H release authorization, implementovat D work, vydat R judgment nebo provést P privileged publication bez explicitního P role/runu.

O má být deterministic policy/control logic. Pokud implementation používá LLM pro extraction/classification, jeho output sám nesmí grantovat authority; transition stále rozhoduje deterministic current-state guard.

Asistentka, role runners, Actions trigger a webhook handler mohou O pouze probudit/invoke. Nikdo z nich není druhý dispatcher.
