export class GitHubApi {
  constructor(appClient) { this.client = appClient; }
  repoPath(repository, suffix = "") {
    const [owner, repo] = repository.split("/");
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
  }
  async getIssue(repository, issueNumber) {
    return this.client.request(repository, this.repoPath(repository, `/issues/${issueNumber}`), { permissions: { issues: "read" } });
  }
  async listIssueComments(repository, issueNumber) {
    return this.client.request(repository, this.repoPath(repository, `/issues/${issueNumber}/comments?per_page=100`), { permissions: { issues: "read" } });
  }
  async createIssueComment(repository, issueNumber, body) {
    return this.client.request(repository, this.repoPath(repository, `/issues/${issueNumber}/comments`), { method: "POST", body: { body }, permissions: { issues: "write" } });
  }
  async updateIssueComment(repository, commentId, body) {
    return this.client.request(repository, this.repoPath(repository, `/issues/comments/${commentId}`), { method: "PATCH", body: { body }, permissions: { issues: "write" } });
  }
  async listManagedIssues(repository) {
    return this.client.request(repository, this.repoPath(repository, "/issues?state=open&labels=agenti%3Amanaged&per_page=100"), { permissions: { issues: "read" } });
  }
  async getPullRequest(repository, number) {
    return this.client.request(repository, this.repoPath(repository, `/pulls/${number}`), { permissions: { pull_requests: "read" } });
  }
  async listPullRequests(repository, state = "open") {
    return this.client.request(repository, this.repoPath(repository, `/pulls?state=${state}&per_page=100`), { permissions: { pull_requests: "read" } });
  }
  async listCheckRunsForRef(repository, ref) {
    const body = await this.client.request(repository, this.repoPath(repository, `/commits/${ref}/check-runs?per_page=100`), { permissions: { checks: "read" } });
    return body.check_runs ?? [];
  }
  async getWorkflowRun(repository, runId) {
    return this.client.request(repository, this.repoPath(repository, `/actions/runs/${encodeURIComponent(runId)}`), { permissions: { actions: "read" } });
  }
  async workflowDispatch(repository, workflow, ref, inputs) {
    return this.client.request(repository, this.repoPath(repository, `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`), {
      method: "POST", body: { ref, inputs }, permissions: { actions: "write" }
    });
  }
}
