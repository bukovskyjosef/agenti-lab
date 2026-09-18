import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function parseInstallations(raw) {
  const parsed = JSON.parse(raw ?? "{}");
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("AGENTI_INSTALLATIONS_JSON must be an object");
  for (const [repo, installationId] of Object.entries(parsed)) {
    if (!/^[^/]+\/[^/]+$/.test(repo) || !Number.isInteger(installationId)) throw new Error(`Invalid installation mapping for ${repo}`);
  }
  return parsed;
}

export function loadRuntimeConfig(env = process.env) {
  const profilePath = resolve(requireEnv(env, "AGENTI_PROJECT_PROFILE_PATH"));
  const projectProfile = JSON.parse(readFileSync(profilePath, "utf8"));
  const privateKey = env.AGENTI_PRIVATE_KEY ?? readFileSync(resolve(requireEnv(env, "AGENTI_PRIVATE_KEY_PATH")), "utf8");
  const configuredRepositories = new Set([projectProfile.control_repository, ...(projectProfile.implementation_repositories ?? [])]);

  return {
    projectProfile,
    webhookSecret: requireEnv(env, "AGENTI_WEBHOOK_SECRET"),
    receiverVerifySecret: requireEnv(env, "AGENTI_RECEIVER_VERIFY_SECRET"),
    appId: requireEnv(env, "AGENTI_APP_ID"),
    privateKey,
    dbPath: env.AGENTI_DB_PATH ?? "/data/agenti-o.sqlite",
    port: Number(env.AGENTI_PORT ?? 8080),
    workerId: env.AGENTI_WORKER_ID ?? "multi-repo-o-1",
    instanceCount: Number(env.AGENTI_INSTANCE_COUNT ?? 1),
    leaseMs: Number(env.AGENTI_LEASE_MS ?? 30000),
    reconcileIntervalMs: Number(env.AGENTI_RECONCILE_INTERVAL_MS ?? 60000),
    publicBaseUrl: env.AGENTI_PUBLIC_BASE_URL ?? null,
    installations: parseInstallations(requireEnv(env, "AGENTI_INSTALLATIONS_JSON")),
    trustedResultActorIds: new Set(requireEnv(env, "AGENTI_TRUSTED_RESULT_ACTOR_IDS").split(",").map(v => Number(v.trim())).filter(Number.isInteger)),
    configuredRepositories
  };
}

export function validateMultiRepoRuntimeConfig(config, core) {
  const errors = core.validateProjectProfileSemantics(config.projectProfile);
  if (core.validateRoutingConfiguration) {
    errors.push(
      ...core.validateRoutingConfiguration(config.projectProfile)
        .map((error) => "execution-routing semantics: " + error)
    );
  }
  if (core.validateClaimsConfiguration) {
    errors.push(
      ...core.validateClaimsConfiguration(config.projectProfile)
        .map((error) => "claim/fencing semantics: " + error)
    );
  }
  if (!Number.isInteger(config.instanceCount ?? 1) || (config.instanceCount ?? 1) < 1) {
    errors.push("AGENTI_INSTANCE_COUNT must be an integer >= 1");
  }
  if (
    (config.instanceCount ?? 1) > 1 &&
    String(config.projectProfile.work_item_claims?.mutation_domain ?? "")
      .toLowerCase()
      .includes("sqlite")
  ) {
    errors.push(
      "multi-instance App cannot use a local SQLite work-item mutation domain"
    );
  }
  if (config.projectProfile.repository_topology !== "multi-repo") errors.push("multi-repo-o requires repository_topology=multi-repo");
  for (const repo of config.configuredRepositories) if (!config.installations[repo]) errors.push(`missing GitHub App installation mapping for ${repo}`);
  if (!config.trustedResultActorIds || config.trustedResultActorIds.size === 0) errors.push("at least one trusted deterministic-wrapper actor ID is required");
  for (const role of ["A", "D", "R", "P"]) {
    const adapterId = config.projectProfile.role_runners?.[role]?.adapter_id ?? "";
    const match = /^github-workflow:\/\/([^/]+\/[^/]+)\/(.+)$/.exec(adapterId);
    if (!match) errors.push(`role ${role} adapter_id must use github-workflow://owner/repo/workflow-file`);
    else if (!config.configuredRepositories.has(match[1])) errors.push(`role ${role} runner repository ${match[1]} is not a configured participant`);
  }
  for (const [candidateId, candidate] of Object.entries(
    config.projectProfile.execution_routing?.runner_catalog ?? {}
  )) {
    if (candidate.dispatch?.kind !== "GITHUB_WORKFLOW") continue;
    if (!candidate.dispatch.repository || !candidate.dispatch.workflow) {
      errors.push(
        `routing candidate ${candidateId} requires dispatch repository/workflow`
      );
      continue;
    }
    if (!config.configuredRepositories.has(candidate.dispatch.repository)) {
      errors.push(
        `routing candidate ${candidateId} dispatch repository ` +
        `${candidate.dispatch.repository} is not a configured participant`
      );
    }
  }
  const o = config.projectProfile.identities?.O;
  if (o?.permissions?.contents === "write") errors.push("O must not have Contents write");
  if (o?.permissions?.actions !== "write") errors.push("O requires Actions write for workflow_dispatch");
  if (config.projectProfile.identities?.P?.capability_profile !== "P_PUBLISH") errors.push("P must remain a separate P_PUBLISH identity");
  return errors;
}
