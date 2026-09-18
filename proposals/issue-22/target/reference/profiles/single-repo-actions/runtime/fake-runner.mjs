import { readFile, writeFile } from "node:fs/promises";

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function scenario(body) {
  const match = body.match(/agenti-e2e-scenario:\s*(happy|defect|human|stale|stopped)/i);
  return match?.[1]?.toLowerCase() ?? "happy";
}

export async function runFake({ role, contextDir, outputPath }) {
  if (process.env.AGENTI_TEST_MODE !== "true") throw new Error("Fake runner requires explicit AGENTI_TEST_MODE=true");
  const assignment = await json(contextDir + "/assignment.json");
  const body = await readFile(contextDir + "/work-item.md", "utf8");
  const comments = await json(contextDir + "/comments.json").catch(() => []);
  const mode = scenario(body);

  let proposal;
  if (role === "A") {
    const resolved = comments.some((comment) => /\/agenti\s+resolve\s+hir-/i.test(comment.body ?? ""));
    const needsHuman = mode === "human" && !resolved;
    proposal = {
      role: "A",
      status: "COMPLETED",
      result_type: "ANALYST",
      evidence_refs: [],
      human_request: needsHuman ? {
        type: "DECISION",
        question: "E2E deterministic Human decision request.",
        resolution_route: "ANALYST_REEVALUATE"
      } : null,
      retry_or_failure: null,
      payload: {
        base_contract_digest: assignment.state.contract_digest,
        disposition: needsHuman ? "HUMAN_INPUT_REQUIRED" : "READY",
        contract_operations: [],
        decomposition: null,
        blockers: []
      }
    };
  } else if (role === "D") {
    let prior = "";
    try { prior = await readFile("agenti-e2e-output.txt", "utf8"); } catch {}
    const value = mode === "defect" && prior.trim() !== "BAD" ? "BAD" : "GOOD";
    await writeFile("agenti-e2e-output.txt", value + "\n");
    proposal = {
      role: "D",
      status: "COMPLETED",
      result_type: "DEVELOPER",
      evidence_refs: [],
      human_request: null,
      retry_or_failure: null,
      payload: {
        work_contract_digest: assignment.state.contract_digest,
        base: {
          repository: assignment.work_item.control_repository,
          ref_or_sha: assignment.candidate.members?.[0]?.head_sha ?? "default"
        },
        requested_branch_key: "ignored-by-deterministic-writer",
        author_validation: { summary: "test-only fake runner generated deterministic fixture change" },
        blockers: []
      }
    };
  } else if (role === "R") {
    let content = "";
    try { content = await readFile("agenti-e2e-output.txt", "utf8"); } catch {}
    const defect = mode === "defect" && content.trim() === "BAD";
    proposal = {
      role: "R",
      status: "COMPLETED",
      result_type: "REVIEWER",
      evidence_refs: [],
      human_request: null,
      retry_or_failure: null,
      payload: {
        reviewed_candidate_digest: assignment.candidate.digest,
        reviewed_contract_digest: assignment.state.contract_digest,
        outcome: defect ? "CHANGES_REQUIRED" : "APPROVED",
        findings: defect ? [{
          finding_id: "E2E-DEFECT",
          severity: "MAJOR",
          disposition: "DEFECT",
          summary: "Deterministic test defect requires D correction.",
          evidence_refs: [],
          affected_binding: assignment.candidate.digest
        }] : [],
        correction_owner: defect ? "D" : "NONE"
      }
    };
  } else {
    throw new Error("Fake runner supports A/D/R only");
  }

  await writeFile(outputPath, JSON.stringify(proposal, null, 2) + "\n");
  return proposal;
}

async function main() {
  const [role, contextDir, outputPath] = process.argv.slice(2);
  if (!role || !contextDir || !outputPath) throw new Error("Usage: fake-runner.mjs A|D|R CONTEXT_DIR OUTPUT");
  await runFake({ role, contextDir, outputPath });
}

if (import.meta.url === "file://" + process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
