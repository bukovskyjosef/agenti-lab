import { createSign } from "node:crypto";

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createAppJwt({ appId, privateKey, now = Math.floor(Date.now() / 1000) }) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: String(appId)
  }));
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

function permissionRank(value) {
  return { none: 0, read: 1, write: 2 }[value ?? "none"] ?? -1;
}

export class GitHubAppClient {
  constructor({ appId, privateKey, installations, configuredRepositories, oPermissions, fetchImpl = fetch }) {
    this.appId = appId;
    this.privateKey = privateKey;
    this.installations = installations;
    this.configuredRepositories = configuredRepositories;
    this.oPermissions = oPermissions;
    this.fetch = fetchImpl;
    this.tokens = new Map();
  }

  assertRepository(repository) {
    if (!this.configuredRepositories.has(repository)) {
      throw new Error(`Repository ${repository} is not a configured participant`);
    }
    if (!this.installations[repository]) {
      throw new Error(`No installation mapping for ${repository}`);
    }
  }

  assertPermissions(requested = {}) {
    for (const [name, value] of Object.entries(requested)) {
      if (permissionRank(value) > permissionRank(this.oPermissions?.[name])) {
        throw new Error(`O permission escalation denied: ${name}=${value}`);
      }
    }
  }

  async installationToken(repository, requestedPermissions = {}) {
    this.assertRepository(repository);
    this.assertPermissions(requestedPermissions);
    const installationId = this.installations[repository];
    const cacheKey = `${installationId}:${repository}:${JSON.stringify(requestedPermissions)}`;
    const cached = this.tokens.get(cacheKey);
    if (cached && cached.expiresAt - Date.now() > 120000) return cached.token;

    const [owner, name] = repository.split("/");
    const response = await this.fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${createAppJwt({ appId: this.appId, privateKey: this.privateKey })}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repositories: [name],
          permissions: requestedPermissions
        })
      }
    );
    if (!response.ok) throw new Error(`GitHub installation token failed: ${response.status}`);
    const body = await response.json();
    const token = body.token;
    const expiresAt = Date.parse(body.expires_at);
    if (!token || Number.isNaN(expiresAt)) throw new Error("Invalid installation-token response");
    this.tokens.set(cacheKey, { token, expiresAt, owner, repository });
    return token;
  }

  async request(repository, path, { method = "GET", body = null, permissions = {} } = {}) {
    const token = await this.installationToken(repository, permissions);
    const response = await this.fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (response.status === 204) return null;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`);
    }
    const parsed = await response.json();
    return parsed;
  }
}
