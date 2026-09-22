import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionAllowedBySelectedPolicy,
  buildGithubDesiredState,
  evaluateGithubSnapshot,
  eventPolicyAllows
} from "../../cli/github-setup.mjs";

const here=dirname(fileURLToPath(import.meta.url));
const referenceRoot=resolve(here,"..","..");
const setupModule=join(referenceRoot,"cli","github-setup.mjs");
const cliModule=join(referenceRoot,"cli","agenti.mjs");

function readySnapshot(){
  return {
    repository_binding:true,
    product_bootstrap_sha:true,
    trusted_locator:true,
    pointer_stubs:true,
    control_plane_sha:true,
    control_plane_revision_consistency:true,
    registry_mapping:true,
    no_local_mutable_authority:true,
    transport_present:true,
    transport_integrity:true,
    launcher_trust:true,
    candidate_not_authority:true,
    issues:true,
    actions:true,
    actions_policy:true,
    workflow_permissions:true,
    merge_method:true,
    required_checks:true,
    ruleset:true,
    environment:true,
    labels:true,
    variables:true,
    secrets:true,
    permission_split:true
  };
}

test("effective doctor classification is READY only when all #36 checks 1-24 pass", () => {
  const result=evaluateGithubSnapshot(readySnapshot());
  assert.equal(result.status,"READY");
  assert.equal(result.ok,true);
  assert.equal(result.checks.length,24);
  assert.ok(result.checks.every(check=>check.status==="PASS"));
});

test("every missing/drifted #36 effective-state surface fails closed", () => {
  for(const key of Object.keys(readySnapshot())){
    const snapshot=readySnapshot();
    snapshot[key]=false;
    const result=evaluateGithubSnapshot(snapshot);
    assert.equal(result.status,"NOT_READY",key);
    assert.equal(result.ok,false,key);
    assert.equal(result.checks.filter(check=>check.status==="FAIL").length,1,key);
  }
});

test("typed policy/security approval boundary is WAITING_HUMAN_APPROVAL and cannot manufacture READY", () => {
  const snapshot=readySnapshot();
  snapshot.actions_policy={
    status:"WAIT",
    code:"WAITING_HUMAN_APPROVAL",
    detail:"parent policy blocks pull_request_target"
  };
  const result=evaluateGithubSnapshot(snapshot);
  assert.equal(result.status,"WAITING_HUMAN_APPROVAL");
  assert.equal(result.ok,false);
  assert.match(result.warnings[0],/WAITING_HUMAN_APPROVAL/);
});

test("insufficient bootstrap credential remains NOT_READY with typed cause", () => {
  const snapshot=readySnapshot();
  snapshot.actions_policy={
    status:"FAIL",
    code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",
    detail:"organization Actions policy is not inspectable"
  };
  const result=evaluateGithubSnapshot(snapshot);
  assert.equal(result.status,"NOT_READY");
  assert.match(result.errors[0],/INSUFFICIENT_BOOTSTRAP_CREDENTIAL/);
});

test("selected-actions policy matches exact pinned GitHub-owned and declared third-party actions", () => {
  const selected={
    github_owned_allowed:true,
    patterns_allowed:["anthropics/claude-code-action@*"]
  };
  assert.equal(actionAllowedBySelectedPolicy("actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09",selected),true);
  assert.equal(actionAllowedBySelectedPolicy("anthropics/claude-code-action@a4f54ef2c58884867281bd8e2f8d63352ad019a9",selected),true);
  assert.equal(actionAllowedBySelectedPolicy("untrusted/action@deadbeef",selected),false);
});

test("active effective Actions event policy blocks pull_request_target while evaluate-only policy does not", () => {
  const active=[{
    enforcement:"active",
    conditions:{workflow_path:{include:[".github/workflows/agenti-orchestrate.yml"],exclude:[]}},
    rules:[{type:"restrict_action_events",parameters:{allowed_events:["issues","workflow_dispatch"]}}]
  }];
  assert.equal(eventPolicyAllows(active,".github/workflows/agenti-orchestrate.yml","pull_request_target"),false);
  assert.equal(eventPolicyAllows(active,".github/workflows/agenti-orchestrate.yml","issues"),true);
  const evaluate=structuredClone(active);
  evaluate[0].enforcement="evaluate";
  assert.equal(eventPolicyAllows(evaluate,".github/workflows/agenti-orchestrate.yml","pull_request_target"),true);
});

test("desired state is derived from trusted runtime/profile/project control and keeps optional hardening declaration-driven", () => {
  const desired=buildGithubDesiredState({
    runtime:{
      test_mode:false,
      publication:{merge_method:"squash"},
      runner:{required_secret_names:["CLAUDE_CODE_OAUTH_TOKEN"]}
    },
    profile:{required_checks:["unit / required"]},
    project:{
      github_setup:{
        variables:{AGENTI_RUNTIME_CHANNEL:"stable"},
        ruleset:{
          name:"Agenti release protection",
          target:"branch",
          enforcement:"active",
          conditions:{ref_name:{include:["~DEFAULT_BRANCH"],exclude:[]}},
          rules:[]
        },
        branch_protection:{
          required_status_checks:{strict:true,contexts:["unit / required"]},
          enforce_admins:true,
          required_pull_request_reviews:null,
          restrictions:null
        },
        publish_environment:{
          name:"agenti-publish",
          wait_timer:0,
          reviewers:[{type:"User",id:123}]
        }
      }
    },
    transportDefaults:{labels:["agenti:managed","agenti:done"]}
  });
  assert.equal(desired.merge_method,"squash");
  assert.deepEqual(desired.required_checks,["unit / required"]);
  assert.deepEqual(desired.required_secret_names,["CLAUDE_CODE_OAUTH_TOKEN"]);
  assert.equal(desired.variables.AGENTI_TEST_MODE,"false");
  assert.equal(desired.variables.AGENTI_RUNTIME_CHANNEL,"stable");
  assert.equal(desired.declared_ruleset.name,"Agenti release protection");
  assert.equal(desired.branch_protection.enforce_admins,true);
  assert.equal(desired.publish_environment.name,"agenti-publish");
  assert.deepEqual(desired.labels.map(item=>item.name),["agenti:managed","agenti:done"]);
});

test("setup implementation contains the #36 AUTO/apply surfaces and rereads doctor after apply", async () => {
  const source=await readFile(setupModule,"utf8");
  for(const pattern of [
    /has_issues:true/,
    /actions\/permissions/,
    /actions\/permissions\/workflow/,
    /allow_squash_merge/,
    /variable","set"/,
    /secret","set"/,
    /actions\/policies/,
    /rulesets/,
    /environments/,
    /await githubDoctor\(args\)/
  ]){
    assert.match(source,pattern);
  }
  assert.match(source,/\{input:value\+"\\n"\}/);
  assert.doesNotMatch(source,/secret","set"[\s\S]{0,160}"--body"/);
});

test("doctor uses effective policy evidence and the CLI has no unbound event-policy confirmation escape hatch", async () => {
  const [setup,cli]=await Promise.all([
    readFile(setupModule,"utf8"),
    readFile(cliModule,"utf8")
  ]);
  assert.match(setup,/actions\/policies\?has_parents=true/);
  assert.match(setup,/INSUFFICIENT_BOOTSTRAP_CREDENTIAL/);
  assert.match(setup,/WAITING_HUMAN_APPROVAL/);
  assert.match(setup,/required_action_uses/);
  assert.doesNotMatch(cli,/event-policy-confirmed/);
});
