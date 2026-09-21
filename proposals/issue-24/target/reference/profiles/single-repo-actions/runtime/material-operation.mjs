import {
  prepareMaterialOperation,
  resolveMaterialOperation
} from "../core/index.mjs";
import { loadState, saveStateCAS } from "./state.mjs";

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

export async function prepareDurableMaterialOperation({
  github,
  runtime,
  loaded,
  state,
  assignment,
  claimGrant,
  executionInstanceId,
  operationKind,
  targetBinding,
  preparedAt = new Date().toISOString()
}) {
  const prepared = prepareMaterialOperation({
    state,
    claimId: claimGrant.claim_id,
    claimGeneration: claimGrant.claim_generation,
    assignmentId: assignment.assignment_id,
    executionInstanceId,
    operationKind,
    targetBinding,
    preparedAt
  });
  if (!prepared.prepared) {
    throw new Error("MATERIAL_PREPARE_FAILED: " + prepared.reason);
  }

  prepared.state.updated_by = {
    o_run_id: process.env.GITHUB_RUN_ID ?? "material-writer",
    transition_id: state.updated_by?.transition_id ?? null,
    idempotence_key:
      "material-prepare:" +
      prepared.material_operation.material_operation_id
  };

  const comment = await saveStateCAS(
    github,
    state.work_item.issue_number,
    prepared.state,
    runtime.workflowStateSchema,
    loaded.comment,
    state.state_version,
    state.claim_control?.claim_version ?? 0
  );

  return {
    state: prepared.state,
    comment,
    material_operation: prepared.material_operation
  };
}

export async function resolveDurableMaterialOperation({
  github,
  runtime,
  issueNumber,
  materialOperationId,
  outcome,
  evidenceRef = null
}) {
  const loaded = await loadState(
    github,
    issueNumber,
    runtime.workflowStateSchema
  );
  const state = loaded.state;
  const resolved = resolveMaterialOperation({
    state,
    materialOperationId,
    outcome,
    evidenceRef
  });
  if (!resolved.resolved) {
    throw new Error("MATERIAL_RESOLVE_FAILED: " + resolved.reason);
  }
  if (resolved.idempotent) {
    return {
      state,
      comment: loaded.comment,
      material_operation: state.material_operation,
      idempotent: true
    };
  }

  resolved.state.updated_by = {
    o_run_id: process.env.GITHUB_RUN_ID ?? "material-writer",
    transition_id: state.updated_by?.transition_id ?? null,
    idempotence_key:
      "material-resolve:" + materialOperationId + ":" + outcome
  };
  const comment = await saveStateCAS(
    github,
    issueNumber,
    resolved.state,
    runtime.workflowStateSchema,
    loaded.comment,
    state.state_version,
    state.claim_control?.claim_version ?? 0
  );
  return {
    state: resolved.state,
    comment,
    material_operation: resolved.material_operation,
    idempotent: false
  };
}

export async function inspectPreparedMaterialOperation({
  github,
  materialOperation
}) {
  const binding = materialOperation?.target_binding;
  if (!materialOperation || !binding) {
    return {
      outcome: "HUMAN_ACTION_REQUIRED",
      evidence: "material-operation:binding-missing"
    };
  }

  if (materialOperation.operation_kind === "D_CANDIDATE_REF_WRITE") {
    try {
      const branch = await github.getBranch(binding.branch);
      const actual = branch.commit?.sha ?? null;
      if (actual === binding.expected_head_sha) {
        return {
          outcome: "HUMAN_ACTION_REQUIRED",
          evidence:
            "git-branch:" + binding.branch + "@" + actual +
            ":push-applied-result-missing"
        };
      }
      return {
        outcome: "HUMAN_ACTION_REQUIRED",
        evidence:
          "git-branch:" + binding.branch + "@" +
          String(actual ?? "unknown") + ":unexpected-head"
      };
    } catch (error) {
      if (String(error.message).includes("failed 404")) {
        return {
          outcome: "NOT_APPLIED",
          evidence: "git-branch:" + binding.branch + ":absent"
        };
      }
      throw error;
    }
  }

  if (materialOperation.operation_kind === "P_MERGE") {
    const pull = await github.getPull(binding.pr_number);
    if (
      pull.merged === true ||
      pull.merged_at ||
      pull.merge_commit_sha
    ) {
      return {
        outcome: "HUMAN_ACTION_REQUIRED",
        evidence:
          "pull:" + binding.pr_number + ":merge-applied:" +
          String(pull.merge_commit_sha ?? "unknown")
      };
    }
    if (pull.head?.sha === binding.expected_head) {
      return {
        outcome: "NOT_APPLIED",
        evidence:
          "pull:" + binding.pr_number + ":not-merged@" +
          binding.expected_head
      };
    }
    return {
      outcome: "HUMAN_ACTION_REQUIRED",
      evidence:
        "pull:" + binding.pr_number + ":head-drift:" +
        String(pull.head?.sha ?? "unknown")
    };
  }

  return {
    outcome: "HUMAN_ACTION_REQUIRED",
    evidence:
      "material-operation:" + materialOperation.operation_kind +
      ":unsupported-recovery"
  };
}

export async function reconcileMaterialOperationForFailedRun({
  github,
  runtime,
  loaded,
  issueNumber
}) {
  const state = loaded.state;
  const operation = state?.material_operation;
  const claim = state?.claim_control?.active_claim;
  if (!operation || !claim || operation.claim_id !== claim.claim_id) {
    return null;
  }
  if (!["PREPARED", "APPLIED", "HUMAN_ACTION_REQUIRED"].includes(
    operation.status
  )) {
    return null;
  }
  if (operation.status === "HUMAN_ACTION_REQUIRED") {
    return {
      blocked: true,
      status: "MATERIAL_OPERATION_REQUIRES_HUMAN",
      material_operation: operation
    };
  }

  const runId = claim.owner?.platform_run_id;
  if (!runId) {
    return {
      blocked: true,
      status: "MATERIAL_OPERATION_REQUIRES_HUMAN",
      material_operation: operation
    };
  }

  let run;
  try {
    run = await github.getWorkflowRun(runId);
  } catch (error) {
    if (String(error.message).includes("failed 404")) return null;
    throw error;
  }
  if (
    run.status !== "completed" ||
    !TERMINAL_NON_SUCCESS.has(String(run.conclusion ?? ""))
  ) {
    return {
      blocked: true,
      status: "MATERIAL_OPERATION_IN_FLIGHT",
      material_operation: operation
    };
  }

  let inspection;
  if (operation.status === "APPLIED") {
    inspection = {
      outcome: "HUMAN_ACTION_REQUIRED",
      evidence:
        (operation.evidence_ref ?? "material-operation:applied") +
        ":semantic-result-missing"
    };
  } else {
    inspection = await inspectPreparedMaterialOperation({
      github,
      materialOperation: operation
    });
  }

  let evidenceRef = inspection.evidence;
  if (inspection.outcome === "HUMAN_ACTION_REQUIRED") {
    const comment = await github.createIssueComment(
      issueNumber,
      [
        "Material operation requires Human reconciliation.",
        "",
        "- operation: " + operation.material_operation_id,
        "- kind: " + operation.operation_kind,
        "- evidence: " + inspection.evidence,
        "",
        "The sink may already be applied. Automatic redispatch is blocked."
      ].join("\n")
    );
    evidenceRef =
      "issue-comment:" + String(comment.id) + ":" + inspection.evidence;
  }

  const resolved = await resolveDurableMaterialOperation({
    github,
    runtime,
    issueNumber,
    materialOperationId: operation.material_operation_id,
    outcome: inspection.outcome,
    evidenceRef
  });

  return {
    blocked: inspection.outcome === "HUMAN_ACTION_REQUIRED",
    changed: true,
    status:
      inspection.outcome === "NOT_APPLIED"
        ? "MATERIAL_OPERATION_CONFIRMED_NOT_APPLIED"
        : "MATERIAL_OPERATION_REQUIRES_HUMAN",
    material_operation: resolved.material_operation
  };
}
