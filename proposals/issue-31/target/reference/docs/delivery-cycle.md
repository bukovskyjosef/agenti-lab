# Delivery cycle — claim-aware execution

```text
O explicit current assignment
  ↓
shared-domain claim CAS
  ├─ stale / active claim / invalid authority → no-op
  └─ CLAIM_GRANTED
       ↓
provider/model compute outside mutation fence
       ↓
shared-domain or native-equivalent fenced material write(s)
       ↓
claim-bound durable role result
       ↓
shared-domain result consume + claim terminalization + semantic transition
```

No new lifecycle state is introduced.

Stop, drift/INVALIDATE, H state changes and Child #5 T14 use the same per-work-item mutation domain. If they linearize before a material write, the old writer cannot become authoritative. If a material operation linearizes first, later semantic mutation observes that durable ordering.

For remote App writers, a bounded PREPARED `material_operation` may reserve the operation order before the sink call. O safe-holds conflicting semantic mutation until that exact operation is resolved.
