# Adoption — claim mechanism requirements

A Project Profile enabling automated A/D/R/P must declare:

- `work_item_claims.mutation_domain`;
- recovery mode: `MANUAL_H`, `PLATFORM_RUN` or `EXPIRING_HEARTBEAT`;
- `material_write_fencing: REQUIRED`;
- claim-mechanism capabilities proving one linearizable work-item mutation domain;
- authoritative claim location `O_PROJECTION`;
- material-write fencing as `SHARED_DOMAIN` or a documented native equivalent.

Doctor/config validation must fail closed when:
- projection writers use split domains;
- claim authority exists only in operational storage;
- material writes can bypass the shared/native fence;
- recovery mode is unsupported;
- multi-repo mutation is keyed by an implementation repo instead of the control work item;
- a multi-instance App declares the single-node process-local reference fence.

Operational credentials remain role-scoped. Adopting the claim mechanism must not give O P publication credentials.
