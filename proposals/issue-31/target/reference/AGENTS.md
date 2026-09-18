# Agent execution invariant

For material A/D/R/P work, an explicit assignment is necessary but not sufficient.

Before provider/model invocation:
- fresh-read current durable authority;
- acquire the exact work item's exclusive claim;
- no-op if another current claim exists or assignment authority is stale.

Before an authoritative sink write, use the configured shared/native material-write fence.

H/A/D/R/P authority and I/O responsibilities are unchanged. Chat handoffs are navigation only.
