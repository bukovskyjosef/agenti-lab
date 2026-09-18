const API = "https://api.github.com";

export class GitHubClient {
  constructor({ token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY } = {}) {
    if (!token) throw new Error("GITHUB_TOKEN is required");
    if (!repository || !repository.includes("/")) throw new Error("GITHUB_REPOSITORY owner/name is required");
    this.token = token;
    this.repository = repository;
    [this.owner, this.repo] = repository.split("/");
  }

  async request(path, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(API + path, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer " + this.token,
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.status === 204) return null;
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = text; }
    }
    if (!response.ok) {
      throw new Error("GitHub API " + method + " " + path + " failed " + response.status + ": " + JSON.stringify(payload));
    }
    return payload;
  }

  repoPath(suffix = "") {
    return "/repos/" + encodeURIComponent(this.owner) + "/" + encodeURIComponent(this.repo) + suffix;
  }

  getRepository() { return this.request(this.repoPath()); }
  getBranch(branch) {
    return this.request(
      this.repoPath("/branches/" + encodeURIComponent(branch))
    );
  }
  getIssue(issueNumber) { return this.request(this.repoPath("/issues/" + Number(issueNumber))); }
  updateIssue(issueNumber, patch) {
    return this.request(this.repoPath("/issues/" + Number(issueNumber)), { method: "PATCH", body: patch });
  }

  async listIssueComments(issueNumber) {
    const all = [];
    let page = 1;
    while (true) {
      const chunk = await this.request(this.repoPath("/issues/" + Number(issueNumber) + "/comments?per_page=100&page=" + page));
      all.push(...chunk);
      if (chunk.length < 100) return all;
      page += 1;
    }
  }

  getIssueComment(commentId) { return this.request(this.repoPath("/issues/comments/" + Number(commentId))); }
  createIssueComment(issueNumber, body) {
    return this.request(this.repoPath("/issues/" + Number(issueNumber) + "/comments"), { method: "POST", body: { body } });
  }
  updateIssueComment(commentId, body) {
    return this.request(this.repoPath("/issues/comments/" + Number(commentId)), { method: "PATCH", body: { body } });
  }

  addLabels(issueNumber, labels) {
    if (!labels.length) return Promise.resolve(null);
    return this.request(this.repoPath("/issues/" + Number(issueNumber) + "/labels"), { method: "POST", body: { labels } });
  }
  async removeLabel(issueNumber, label) {
    try {
      return await this.request(this.repoPath("/issues/" + Number(issueNumber) + "/labels/" + encodeURIComponent(label)), { method: "DELETE" });
    } catch (error) {
      if (String(error.message).includes("failed 404")) return null;
      throw error;
    }
  }
  listManagedIssues(label = "agenti:managed") {
    return this.request(this.repoPath("/issues?state=open&per_page=100&labels=" + encodeURIComponent(label)));
  }

  getPull(prNumber) { return this.request(this.repoPath("/pulls/" + Number(prNumber))); }
  async findPullByHead(branch) {
    const pulls = await this.request(this.repoPath("/pulls?state=all&head=" + encodeURIComponent(this.owner + ":" + branch) + "&per_page=100"));
    return pulls[0] ?? null;
  }
  createPull({ title, head, base, body }) {
    return this.request(this.repoPath("/pulls"), { method: "POST", body: { title, head, base, body } });
  }

  async getChecksForRef(ref) {
    const result = await this.request(this.repoPath("/commits/" + encodeURIComponent(ref) + "/check-runs?per_page=100"));
    return result.check_runs ?? [];
  }

  dispatchWorkflow(workflow, inputs = {}, ref = null) {
    return this.request(this.repoPath("/actions/workflows/" + encodeURIComponent(workflow) + "/dispatches"), {
      method: "POST",
      body: { ref: ref ?? process.env.GITHUB_DEFAULT_BRANCH ?? "main", inputs }
    });
  }

  getWorkflowRun(runId) {
    return this.request(this.repoPath("/actions/runs/" + encodeURIComponent(String(runId))));
  }

  mergePull(prNumber, { sha, merge_method = "squash", commit_title } = {}) {
    return this.request(this.repoPath("/pulls/" + Number(prNumber) + "/merge"), {
      method: "PUT",
      body: { sha, merge_method, ...(commit_title ? { commit_title } : {}) }
    });
  }

  async createOrUpdateLabel(name, color = "ededed", description = "") {
    try {
      return await this.request(this.repoPath("/labels"), { method: "POST", body: { name, color, description } });
    } catch (error) {
      if (!String(error.message).includes("failed 422")) throw error;
      return this.request(this.repoPath("/labels/" + encodeURIComponent(name)), {
        method: "PATCH",
        body: { new_name: name, color, description }
      });
    }
  }
}

export function githubClientFromEnv() {
  return new GitHubClient();
}
