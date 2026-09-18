import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { GitHubAppClient } from "../src/app-auth.mjs";
import { validateMultiRepoRuntimeConfig } from "../src/config.mjs";
import * as core from "../../../core/index.mjs";

function baseProfile() {
  return {
    schema_version: 1,
    runtime_version: "0.1.0-child1",
    repository_topology: "multi-repo",
    control_repository: "acme/control",
    implementation_repositories: ["acme/a", "acme/b"],
    human: { principals: [{ actor_id: 1 }] },
    role_runners: {
      A: { adapter_id: "github-workflow://acme/control/a.yml", adapter_version: "1", capability_profile: "A_READ_ANALYZE" },
      D: { adapter_id: "github-workflow://acme/a/d.yml", adapter_version: "1", capability_profile: "D_WORKSPACE_WRITE" },
      R: { adapter_id: "github-workflow://acme/b/r.yml", adapter_version: "1", capability_profile: "R_READ_REVIEW", independence_mechanism: "fresh-wrapper" },
      P: { adapter_id: "github-workflow://acme/control/p.yml", adapter_version: "1", capability_profile: "P_PUBLISH" }
    },
    independent_r_enforcement: {
      mechanisms: {
        "fresh-wrapper": {
          attestation_source: "deterministic-wrapper",
          fresh_execution_required: true
        }
      }
    },
    identities: {
      O: {
        identity_id: "o",
        capability_profile: "O_CONTROL_PLANE",
        dispatch_mechanism: "workflow_dispatch",
        permissions: {
          metadata: "read", contents: "read", issues: "write",
          pull_requests: "read", checks: "read", actions: "write", deployments: "read"
        }
      },
      P: {
        identity_id: "p",
        capability_profile: "P_PUBLISH",
        dispatch_mechanism: "none",
        permissions: { contents: "write" }
      }
    },
    release_authorization: { required: true, target: "production" },
    publication: { boundary_operations: ["MERGE"] },
    state_projection: { marker: "agenti-state:v1", single_writer: "O" }
  };
}

test("runtime config rejects O publication capability", () => {
  const profile = baseProfile();
  const config = {
    projectProfile: profile,
    configuredRepositories: new Set(["acme/control", "acme/a", "acme/b"]),
    installations: { "acme/control": 1, "acme/a": 1, "acme/b": 1 },
    trustedResultActorIds: new Set([99])
  };
  assert.deepEqual(validateMultiRepoRuntimeConfig(config, core), []);
  profile.identities.O.permissions.contents = "write";
  assert.ok(validateMultiRepoRuntimeConfig(config, core).some((error) => error.includes("Contents write")));
});

test("installation token is restricted to one configured repository and O permissions", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const requests = [];
  const client = new GitHubAppClient({
    appId: "123",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
    installations: { "acme/a": 77 },
    configuredRepositories: new Set(["acme/a"]),
    oPermissions: { contents: "read", actions: "write" },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          token: "installation-token",
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      };
    }
  });

  const token = await client.installationToken("acme/a", { contents: "read" });
  assert.equal(token, "installation-token");
  assert.deepEqual(requests[0].repositories, ["a"]);
  await assert.rejects(
    client.installationToken("acme/a", { contents: "write" }),
    /permission escalation/
  );
  await assert.rejects(
    client.installationToken("acme/other", { contents: "read" }),
    /not a configured participant/
  );
});
