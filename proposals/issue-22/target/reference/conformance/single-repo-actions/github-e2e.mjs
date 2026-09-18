#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const MARKER = "agenti-state:v1";
const START = "<!-- agenti-state-json:start -->";
const END = "<!-- agenti-state-json:end -->";

function args(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    parsed[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--")
      ? argv[++i]
      : true;
  }
  return parsed;
}

function gh(command, options = {}) {
  return execFileSync("gh", command, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "inherit"]
  }).trim();
}

function repoApi(repository, suffix) {
  return "repos/" + repository + suffix;
}

function parseState(body) {
  if (!body?.includes(MARKER)) return null;
  const start = body.indexOf(START);
  const end = body.indexOf(END);
  if (start < 0 || end <= start) return null;
  return JSON.parse(body.slice(start + START.length, end).trim());
}

function comments(repository, issueNumber) {
  return JSON.parse(gh([
    "api",
    repoApi(repository, "/issues/" + issueNumber + "/comments?per_page=100")
  ]));
}

function state(repository, issueNumber) {
  const states = comments(repository, issueNumber)
    .map((comment) => ({ comment, state: parseState(comment.body) }))
    .filter((entry) => entry.state);
  if (states.length !== 1) {
    throw new Error("Expected exactly one agenti-state:v1 comment, got " + states.length);
  }
  return states[0].state;
}

function postComment(repository, issueNumber, body) {
  gh([
    "api", "--method", "POST",
    repoApi(repository, "/issues/" + issueNumber + "/comments"),
    "-f", "body=" + body
  ]);
}

async function waitFor(repository, issueNumber, predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = state(repository, issueNumber);
      if (predicate(last)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timed out waiting for " + label + ". Last state: " + JSON.stringify(last));
}

function issueBody(scenario) {
  const goal = scenario === "provider-smoke"
    ? "Create a file named agenti-provider-smoke.txt containing one line: provider smoke ok"
    : "Produce the deterministic Agenti E2E fixture change.";
  return [
    "agenti-e2e-scenario: " + (scenario === "provider-smoke" ? "happy" : scenario),
    "",
    "## Goal", "", goal, "",
    "## Context", "", "Disposable real-GitHub Child #22 conformance run.", "",
    "## Scope", "", "Only the requested disposable E2E fixture change.", "",
    "## Out of scope", "", "No unrelated repository changes.", "",
    "## Requirements", "", "- Preserve installed Agenti runtime.", "",
    "## Acceptance criteria", "", "- Delivery reaches the expected automated gate/state.", "",
    "## Constraints", "", "- Disposable sandbox repository only.", "",
    "## Dependencies", "",
    "## Canonical references", "",
    "## Required control gates", "",
    "## Validation", "", "- GitHub durable state is reconstructable.", "",
    "## Documentation impact", "", "None.", "",
    "## Decision gates", "",
    "## Release policy", "", "Use configured exact Human release gate."
  ].join("\n");
}

function createIssue(repository, scenario) {
  const url = gh([
    "issue", "create",
    "--repo", repository,
    "--title", "[agenti:e2e] " + scenario + " " + Date.now(),
    "--body", issueBody(scenario),
    "--label", "agenti:managed"
  ]);
  const match = url.match(/\/(\d+)$/);
  if (!match) throw new Error("Could not parse created issue URL: " + url);
  return Number(match[1]);
}

function currentGhActor() {
  const user = JSON.parse(gh(["api", "user"]));
  return { id: user.id, login: user.login };
}

async function configuredHuman() {
  const profile = JSON.parse(await readFile(".agenti/project-profile.json", "utf8"));
  return profile.human.principals;
}

function setTestMode(repository, value) {
  gh(["variable", "set", "AGENTI_TEST_MODE", "--repo", repository, "--body", value ? "true" : "false"]);
}

function closeArtifacts(repository, issueNumber) {
  try {
    const pulls = JSON.parse(gh([
      "api",
      repoApi(repository, "/pulls?state=open&head=" + repository.split("/")[0] + "%3Aagenti%2Fissue-" + issueNumber)
    ]));
    for (const pull of pulls) {
      gh(["pr", "close", String(pull.number), "--repo", repository], { inherit: true });
    }
  } catch {}
  try { gh(["issue", "close", String(issueNumber), "--repo", repository], { inherit: true }); } catch {}
  try {
    gh(["api", "--method", "DELETE", repoApi(repository, "/git/refs/heads/agenti/issue-" + issueNumber)]);
  } catch {}
}

function mutateCandidateHead(repository, currentState, issueNumber) {
  const prNumber = currentState.candidate.members[0].pr_number;
  const pull = JSON.parse(gh(["api", repoApi(repository, "/pulls/" + prNumber)]));
  const content = Buffer.from("stale candidate probe " + Date.now() + "\n").toString("base64");
  gh([
    "api", "--method", "PUT",
    repoApi(repository, "/contents/agenti-e2e-drift-" + issueNumber + ".txt"),
    "-f", "message=agenti e2e stale candidate probe",
    "-f", "content=" + content,
    "-f", "branch=" + pull.head.ref
  ]);
}

async function main() {
  const options = args(process.argv.slice(2));
  const scenario = options.scenario ?? "happy";
  const repository = options.repo ?? process.env.GITHUB_REPOSITORY;
  const timeoutMs = Number(options.timeout ?? 900) * 1000;
  const keep = Boolean(options.keep);

  if (!repository || !repository.includes("/")) throw new Error("--repo owner/repo is required");
  if (!["happy", "defect", "human", "stale", "stopped", "provider-smoke"].includes(scenario)) {
    throw new Error("Unsupported --scenario");
  }
  if (options["confirm-disposable"] !== "yes") {
    throw new Error("Real GitHub E2E mutates/merges sandbox content. Pass --confirm-disposable yes only for a disposable repository.");
  }

  const actor = currentGhActor();
  const humanPrincipals = await configuredHuman();
  if (!humanPrincipals.some((principal) => principal.actor_id === actor.id)) {
    throw new Error(
      "Current gh actor " + actor.login + " (" + actor.id + ") is not a configured H principal. " +
      "Human-boundary E2E commands must use real configured H authority."
    );
  }

  const testMode = scenario !== "provider-smoke";
  setTestMode(repository, testMode);
  const issueNumber = createIssue(repository, scenario);
  console.log("Created E2E issue #" + issueNumber + " scenario=" + scenario + " testMode=" + testMode);

  try {
    if (scenario === "stopped") {
      await waitFor(repository, issueNumber, (s) => Boolean(s.assignment), "first assignment", timeoutMs);
      postComment(repository, issueNumber, "/agenti stop E2E terminal guard");
      const stopped = await waitFor(repository, issueNumber, (s) => s.lifecycle === "STOPPED", "STOPPED", timeoutMs);
      const stoppedVersion = stopped.state_version;
      gh(["workflow", "run", "agenti-reconcile.yml", "--repo", repository]);
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const afterReplay = state(repository, issueNumber);
      if (afterReplay.lifecycle !== "STOPPED" || afterReplay.state_version !== stoppedVersion) {
        throw new Error("Stopped replay changed terminal state");
      }
      console.log("STOPPED terminal replay guard: PASS");
      return;
    }

    if (scenario === "human") {
      let waiting = await waitFor(
        repository,
        issueNumber,
        (s) => s.lifecycle === "BLOCKED" && s.human_requests.active.some((r) => r.status === "PENDING"),
        "Human Input Request",
        timeoutMs
      );
      const request = waiting.human_requests.active.find((r) => r.status === "PENDING");
      postComment(repository, issueNumber, "/agenti resolve " + request.request_id + "\nE2E Human decision approved.");
      console.log("Resolved HIR " + request.request_id);
    }

    const releasePending = await waitFor(
      repository,
      issueNumber,
      (s) => s.release_authorization.status === "PENDING",
      "exact release authorization",
      timeoutMs
    );

    if (scenario === "stale") {
      mutateCandidateHead(repository, releasePending, issueNumber);
      const stale = await waitFor(
        repository,
        issueNumber,
        (s) =>
          s.lifecycle === "IN_REVIEW" &&
          (s.review.status === "STALE" || s.release_authorization.status === "STALE") &&
          s.assignment?.role !== "P",
        "candidate-drift invalidation",
        timeoutMs
      );
      console.log("Stale candidate invalidation: PASS state_version=" + stale.state_version);
      return;
    }

    if (scenario === "provider-smoke") {
      postComment(
        repository,
        issueNumber,
        "/agenti release reject " + releasePending.release_authorization.authorization_id +
        "\nProvider A/D/R smoke completed; publication intentionally rejected."
      );
      await waitFor(
        repository,
        issueNumber,
        (s) => s.release_authorization.status === "REJECTED" && s.assignment === null,
        "provider smoke rejection boundary",
        timeoutMs
      );
      console.log("Real provider A/D/R smoke: PASS");
      return;
    }

    postComment(
      repository,
      issueNumber,
      "/agenti release grant " + releasePending.release_authorization.authorization_id
    );

    const done = await waitFor(
      repository,
      issueNumber,
      (s) => s.lifecycle === "DONE",
      "mechanical Done",
      timeoutMs
    );
    console.log("Scenario " + scenario + ": PASS lifecycle=" + done.lifecycle + " state_version=" + done.state_version);
  } finally {
    setTestMode(repository, false);
    if (!keep) closeArtifacts(repository, issueNumber);
    else console.log("Keeping E2E artifacts for inspection: issue #" + issueNumber);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
