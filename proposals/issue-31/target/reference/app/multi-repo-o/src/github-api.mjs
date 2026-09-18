export class GitHubApi {
  constructor(appClient) { this.client = appClient; }
  repoPath(repository, suffix = "") {
    const [owner, repo] = repository.split("/");
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
  }
  async getIssue(repository, issueNumber) {
    return this.client.request(repository, this.repoPath(repository, `/issues/${issueNumber}`), { permissions: { issues: "read" } });
  }
  async getBranch(repository, branch) {
    return this.client.request(
      repository,
      this.repoPath(
        repository,
        `/branches/${encodeURIComponent(branch)}`
      ),
      { permissions: { contents: "read" } }
    );
  }
  async listIssueComments(repository, issueNumber) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const rows = await this.client.request(
        repository,
        this.repoPath(repository, `/issues/${issueNumber}/comments?per_page=100&page=${page}`),
        { permissions: { issues: "read" } }
      );
      all.push(...rows);
      if (rows.length < 100) return all;
    }
  }
  async createIssueComment(repository, issueNumber, body) {
    return this.client.request(repository, this.repoPath(repository, `/issues/${issueNumber}/comments`), { method: "POST", body: { body }, permissions: { issues: "write" } });
  }
  async updateIssueComment(repository, commentId, body) {
    return this.client.request(repository, this.repoPath(repository, `/issues/comments/${commentId}`), { method: "PATCH", body: { body }, permissions: { issues: "write" } });
  }
  async listManagedIssues(repository) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const rows = await this.client.request(
        repository,
        this.repoPath(repository, `/issues?state=open&labels=agenti%3Amanaged&per_page=100&page=${page}`),
        { permissions: { issues: "read" } }
      );
      all.push(...rows);
      if (rows.length < 100) return all;
    }
  }
  async getPullRequest(repository, number) {
    return this.client.request(repository, this.repoPath(repository, `/pulls/${number}`), { permissions: { pull_requests: "read" } });
  }
  async listPullRequests(repository, state = "open") {
    const all = [];
    for (let page = 1; ; page += 1) {
      const rows = await this.client.request(
        repository,
        this.repoPath(repository, `/pulls?state=${state}&per_page=100&page=${page}`),
        { permissions: { pull_requests: "read" } }
      );
      all.push(...rows);
      if (rows.length < 100) return all;
    }
  }
  async listCheckRunsForRef(repository, ref) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const body = await this.client.request(
        repository,
        this.repoPath(repository, `/commits/${ref}/check-runs?per_page=100&page=${page}`),
        { permissions: { checks: "read" } }
      );
      const rows = body.check_runs ?? [];
      all.push(...rows);
      if (rows.length < 100) return all;
    }
  }
  async getWorkflow(repository, workflow) {
    return this.client.request(
      repository,
      this.repoPath(repository, `/actions/workflows/${encodeURIComponent(workflow)}`),
      { permissions: { actions: "read" } }
    );
  }
  async getWorkflowRun(repository, runId) {
    return this.client.request(repository, this.repoPath(repository, `/actions/runs/${encodeURIComponent(runId)}`), { permissions: { actions: "read" } });
  }
  async workflowDispatch(repository, workflow, ref, inputs) {
    return this.client.request(repository, this.repoPath(repository, `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`), {
      method: "POST",
      body: { ref, inputs, return_run_details: true },
      permissions: { actions: "write" }
    });
  }
}
