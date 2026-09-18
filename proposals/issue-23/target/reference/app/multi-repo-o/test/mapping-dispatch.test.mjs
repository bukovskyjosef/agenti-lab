import test from "node:test";
import assert from "node:assert/strict";
import { parseControlMarker, workItemFromWebhook } from "../src/mapping.mjs";
import { dispatchAssignment, parseWorkflowAdapterId } from "../src/dispatch.mjs";
import { OperationalStore } from "../src/store.mjs";

const profile = {
  control_repository: "acme/control",
  implementation_repositories: ["acme/service-a", "acme/service-b"],
  role_runners: {
    A: { adapter_id: "github-workflow://acme/control/a.yml", adapter_version: "1" },
    D: { adapter_id: "github-workflow://acme/service-a/d.yml", adapter_version: "1" },
    R: { adapter_id: "github-workflow://acme/service-b/r.yml", adapter_version: "1" },
    P: { adapter_id: "github-workflow://acme/control/p.yml", adapter_version: "1" }
  }
};

test("implementation PR reverse link maps to authoritative control item", () => {
  assert.deepEqual(
    parseControlMarker("text\n<!-- agenti-control: acme/control#42 -->"),
    { control_repository: "acme/control", issue_number: 42, kind: "executable" }
  );
  const item = workItemFromWebhook({
    eventName: "pull_request",
    profile,
    payload: {
      repository: { full_name: "acme/service-a" },
      pull_request: { body: "<!-- agenti-control: acme/control#42 -->" }
    }
  });
  assert.equal(item.control_repository, "acme/control");
  assert.equal(item.issue_number, 42);
});

test("workflow adapter mapping is explicit and repository-qualified", () => {
  assert.deepEqual(
    parseWorkflowAdapterId("github-workflow://acme/service-b/agenti-role-r.yml"),
    { repository: "acme/service-b", workflow: "agenti-role-r.yml" }
  );
  assert.throws(() => parseWorkflowAdapterId("codex"), /github-workflow/);
});

test("cross-repo workflow dispatch is effect-deduplicated", async () => {
  const calls = [];
  const gh = {
    workflowDispatch: async (...args) => { calls.push(args); }
  };
  const store = new OperationalStore(":memory:");
  const assignment = {
    assignment_id: "asg-123456789012",
    role: "R"
  };
  const first = await dispatchAssignment({ gh, profile, assignment, store });
  const second = await dispatchAssignment({ gh, profile, assignment, store });
  assert.equal(first.dispatched, true);
  assert.equal(second.duplicate, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "acme/service-b");
  assert.equal(calls[0][1], "r.yml");
  store.close();
});
