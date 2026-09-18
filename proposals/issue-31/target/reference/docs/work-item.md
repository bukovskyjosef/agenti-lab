# Work item — concurrency boundaries

The exclusive claim invariant is per executable work item:

> one executable work item → at most one active material A/D/R/P run.

This is distinct from the existing work-item Concurrency class.

`PARALLEL_SAFE` may allow two different work items/children to proceed concurrently on declared shared surfaces. It never allows two live role runs to own the same work item.

Parent mechanical roll-up requires no role claim. If a Parent Intent itself receives a material A assignment, that parent work item is claimed like any other executable analytical work item.

For multi-repo work, the claim and mutation key belong to the authoritative control work item exactly once. Implementation repositories do not create independent claim authorities for the same logical work.
