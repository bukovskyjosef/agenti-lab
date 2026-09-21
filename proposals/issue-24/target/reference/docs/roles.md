# Roles — claim and fenced-write obligations

Authority roles remain exactly H / A / D / R / P. I and O remain system functions.

## A / D / R / P

Before material work:
1. fresh-read current assignment/authority;
2. obtain the exact current exclusive claim;
3. verify the execution instance owns that claim.

Provider/model computation runs outside the mutation fence.

Before an authoritative sink write, the deterministic writer must either use a native equivalent fence or the configured shared work-item material-write fence. A plain pre-write GET is insufficient.

The normalized trusted result carries the exact `claim_id` and `claim_generation`. O accepts the result only while that claim and execution instance are still current.

R additionally preserves D≠R independence at claim time and result time.

## H

H remains the sole subjective product authority. For a no-lease claim, H may durably recover only the exact current claim and must supply a reason. A stale chat prompt has no authority.

## O

O owns deterministic projection mutation and claim-control coordination but does not gain A/D/R/P privileges or P credentials.

## I

I may present claim state and transport exact Human recovery commands. I never grants claim authority itself.
