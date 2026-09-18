const TERMINAL_NON_SUCCESS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
  "neutral",
  "skipped"
]);

export function platformRunRecoveryDecision({
  state,
  roleResultPresent = false,
  run
}) {
  const claim = state?.claim_control?.active_claim;
  if (!claim) return { eligible: false, reason: "NO_ACTIVE_CLAIM" };
  if (claim.lease?.mode !== "PLATFORM_RUN") {
    return { eligible: false, reason: "CLAIM_NOT_PLATFORM_RUN" };
  }
  if (roleResultPresent) {
    return { eligible: false, reason: "APPLICABLE_RESULT_EXISTS" };
  }
  if (
    state.material_operation?.claim_id === claim.claim_id &&
    !["NOT_APPLIED"].includes(state.material_operation.status)
  ) {
    return {
      eligible: false,
      reason: "MATERIAL_OPERATION_RECONCILIATION_REQUIRED"
    };
  }
  const boundRunId = claim.owner?.platform_run_id;
  if (!boundRunId) return { eligible: false, reason: "PLATFORM_RUN_ID_MISSING" };
  if (!run || String(run.id) !== String(boundRunId)) {
    return { eligible: false, reason: "PLATFORM_RUN_ID_MISMATCH" };
  }
  if (run.status !== "completed") {
    return { eligible: false, reason: "PLATFORM_RUN_NOT_TERMINAL" };
  }
  if (!TERMINAL_NON_SUCCESS.has(String(run.conclusion ?? ""))) {
    return {
      eligible: false,
      reason: run.conclusion === "success"
        ? "PLATFORM_RUN_SUCCEEDED"
        : "PLATFORM_RUN_CONCLUSION_NOT_RECOVERABLE"
    };
  }
  return {
    eligible: true,
    reason: "PLATFORM_RUN_TERMINAL_NON_SUCCESS",
    claim,
    run
  };
}

export function recoverPlatformRunState({
  state,
  roleResultPresent = false,
  run,
  core
}) {
  const decision = platformRunRecoveryDecision({
    state,
    roleResultPresent,
    run
  });
  if (!decision.eligible) {
    return { recovered: false, reason: decision.reason, state };
  }

  const recovered = core.recoverClaim({
    state,
    reason: "FAILED",
    platformRunTerminalNonSuccess: true,
    durableEvidenceRef: "actions-run:" + String(run.id)
  });
  if (!recovered.recovered) return recovered;

  const next = recovered.state;
  next.updated_by = {
    o_run_id: process.env.GITHUB_RUN_ID ?? "local-o",
    transition_id: state.updated_by?.transition_id ?? null,
    idempotence_key:
      "platform-run-recovery:" +
      core.digest({
        claim_id: decision.claim.claim_id,
        claim_generation: decision.claim.claim_generation,
        run_id: String(run.id),
        conclusion: run.conclusion
      }).slice(7, 39)
  };
  return {
    recovered: true,
    reason: recovered.reason,
    state: next,
    evidence_ref: "actions-run:" + String(run.id)
  };
}

export function manualHumanRecoveryDecision({
  state,
  command,
  humanActorId,
  configuredHumanActorIds
}) {
  const claim = state?.claim_control?.active_claim;
  if (!claim) return { eligible: false, reason: "NO_ACTIVE_CLAIM" };
  if (claim.lease?.mode !== "NONE") {
    return { eligible: false, reason: "CLAIM_NOT_MANUAL_H" };
  }
  if (!configuredHumanActorIds?.has(humanActorId)) {
    return { eligible: false, reason: "HUMAN_NOT_AUTHORIZED" };
  }
  if (command?.kind !== "claim-recover") {
    return { eligible: false, reason: "RECOVERY_COMMAND_MISSING" };
  }
  if (command.claim_id !== claim.claim_id) {
    return { eligible: false, reason: "CLAIM_ID_MISMATCH" };
  }
  if (!command.reason?.trim()) {
    return { eligible: false, reason: "RECOVERY_REASON_REQUIRED" };
  }
  return { eligible: true, reason: "H_RECOVERY_AUTHORIZED", claim };
}

export function recoverManualHumanState({
  state,
  command,
  humanActorId,
  configuredHumanActorIds,
  evidenceRef,
  core
}) {
  const decision = manualHumanRecoveryDecision({
    state,
    command,
    humanActorId,
    configuredHumanActorIds
  });
  if (!decision.eligible) {
    return { recovered: false, reason: decision.reason, state };
  }
  const recovered = core.recoverClaim({
    state,
    reason: "ABORTED",
    humanAuthorizedClaimId: decision.claim.claim_id,
    durableEvidenceRef: evidenceRef
  });
  if (!recovered.recovered) return recovered;
  const next = recovered.state;
  next.updated_by = {
    o_run_id: process.env.GITHUB_RUN_ID ?? "local-o",
    transition_id: state.updated_by?.transition_id ?? null,
    idempotence_key:
      "manual-claim-recovery:" +
      core.digest({
        claim_id: decision.claim.claim_id,
        evidence_ref: evidenceRef,
        reason: command.reason
      }).slice(7, 39)
  };
  return {
    recovered: true,
    reason: recovered.reason,
    state: next,
    evidence_ref: evidenceRef
  };
}
