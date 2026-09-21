# Mapa publikovaného standardu a control plane

Normative cross-project semantics remain in the established `docs/*` documents; `core/README.md` is the cold-start core map to those exact same-version authorities. Executable/profile/project-control material is separated from product truth.

| Oblast | Kanonický zdroj |
|---|---|
| autorita, source of truth, scope, semantic authority | [principles.md](principles.md) |
| role H/A/D/R/P a I/O boundaries | [roles.md](roles.md) |
| delivery lifecycle, gates, release | [delivery-cycle.md](delivery-cycle.md) |
| work item, Ready, Blocked/Stopped, claims | [work-item.md](work-item.md) |
| independent review/corrective loop | [review.md](review.md) |
| automation safety and O invariants | [automation.md](automation.md) |
| adoption/project binding | [adoption.md](adoption.md) |
| executable reference implementation | [reference-implementation.md](reference-implementation.md) |
| cold-start core map | [../core/README.md](../core/README.md) |
| execution profiles | [../profiles/](../profiles/) |
| project registry/control profiles | [../projects/](../projects/) |
| executable package/conformance | [../reference/](../reference/) |

## Cold-start order

1. trusted product bootstrap at exact `product_bootstrap_sha`;
2. this published control plane at exact `control_plane_sha`;
3. `projects/registry.yml`;
4. `core/README.md`;
5. selected profile;
6. selected project control profile;
7. target Issue/PR;
8. task-specific product truth.

Candidate/worktree content enters only after current authority/claim guards pass.
