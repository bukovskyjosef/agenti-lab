import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { doctor } from "./schema.mjs";
import { validateRoutingConfiguration } from "./routing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const profilePath = resolve(process.cwd(), process.argv[2] ?? "conformance/fixtures/project-profile.valid.json");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const schemaDir = resolve(root, "schemas");
const schemas = {
  projectProfile: await readJson(resolve(schemaDir, "project-profile.schema.json")),
  workflowState: await readJson(resolve(schemaDir, "workflow-state.schema.json")),
  assignment: await readJson(resolve(schemaDir, "assignment.schema.json")),
  roleResult: await readJson(resolve(schemaDir, "role-result.schema.json")),
  capacityObservation: await readJson(resolve(schemaDir, "capacity-observation.schema.json")),
  billingSafety: await readJson(resolve(schemaDir, "billing-safety.schema.json")),
  executionFailure: await readJson(resolve(schemaDir, "execution-failure.schema.json"))
};
const transitionTable = await readJson(resolve(root, "core/transitions.json"));
const projectProfile = await readJson(profilePath);

const result = doctor({
  projectProfile,
  projectProfileSchema: schemas.projectProfile,
  schemas,
  transitionTable
});
result.errors.push(
  ...validateRoutingConfiguration(projectProfile)
    .map((error) => "execution-routing semantics: " + error)
);
result.ok = result.errors.length === 0;

if (!result.ok) {
  console.error("agenti core doctor: FAILED");
  for (const error of result.errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("agenti core doctor: OK");
  console.log("- schemas: 7 valid local-ref contracts");
  console.log("- transitions: T01-T19 coherent");
  console.log("- O/P privilege split: coherent");
  console.log("- R independence mechanism: configured");
  console.log("- execution routing/billing policy: coherent");
}
