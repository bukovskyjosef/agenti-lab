import test from "node:test";
import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  actionAllowedBySelectedPolicy,
  buildGithubDesiredState,
  evaluateGithubSnapshot,
  eventPolicyAllows,
  githubDoctor,
  setupGithub
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


async function walkFiles(root){
  const out=[];
  async function walk(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isDirectory()) await walk(path);
      else if(entry.isFile()) out.push(path);
    }
  }
  await walk(root);
  return out.sort();
}

test("safely fixable GitHub state is planned/applied idempotently and subsequent effective doctor is READY", async () => {
  const temp=await mkdtemp(join(tmpdir(),"agenti-setup-doctor-"));
  const bin=join(temp,"bin");
  await mkdir(bin,{recursive:true});
  const fakeGhPath=join(bin,"gh");
  await copyFile(join(here,"fixtures","fake-gh.mjs"),fakeGhPath);
  await chmod(fakeGhPath,0o755);

  const product="example/product";
  const control="bukovskyjosef/agenti";
  const productSha="a".repeat(40);
  const controlSha="b".repeat(40);
  const targetRoot=join(referenceRoot,"profiles","single-repo-actions","target");
  const productContents={};
  for(const file of await walkFiles(targetRoot)){
    productContents[relative(targetRoot,file)]=await readFile(file,"utf8");
  }

  const validUntil=new Date(Date.now()+60*60*1000).toISOString();
  const controlContents={
    "projects/registry.yml":JSON.stringify({
      schema_version:1,
      projects:{
        [product]:{
          project_id:"e2e",
          project_control:"projects/e2e/project.yml",
          selected_profile:"automated"
        }
      }
    },null,2)+"\n",
    "projects/e2e/project.yml":JSON.stringify({
      schema_version:1,
      project_id:"e2e",
      repository:product,
      selected_profile:"automated",
      human_principals:[{login:"human",actor_id:1001}],
      runner_evidence:{
        billing_safety:[{
          runner_candidate_id:"claude-subscription",
          status:"VERIFIED_NO_PAID_SPILLOVER",
          observed_at:new Date(Date.now()-60_000).toISOString(),
          valid_until:validUntil,
          source:{kind:"ADMIN_POLICY_ATTESTATION",trust:"EXTERNAL_CURRENT_EVIDENCE"},
          attested_by:{actor_id:1001,evidence_ref:"test:human-attestation"}
        }]
      }
    },null,2)+"\n",
    "profiles/automated/single-repo-actions/project-profile.json":await readFile(
      join(referenceRoot,"..","profiles","automated","single-repo-actions","project-profile.json"),"utf8"
    ),
    "profiles/automated/single-repo-actions/runtime.json":await readFile(
      join(referenceRoot,"..","profiles","automated","single-repo-actions","runtime.json"),"utf8"
    ),
    "reference/profiles/single-repo-actions/profile.defaults.json":await readFile(
      join(referenceRoot,"profiles","single-repo-actions","profile.defaults.json"),"utf8"
    )
  };

  const state={
    repos:{
      [product]:{
        full_name:product,
        default_branch:"main",
        has_issues:false,
        allow_squash_merge:false,
        allow_merge_commit:true,
        allow_rebase_merge:true,
        owner:{type:"User"}
      },
      [control]:{
        full_name:control,
        default_branch:"main",
        owner:{type:"User"}
      }
    },
    branches:{[product]:productSha,[control]:controlSha},
    contents:{[product]:productContents,[control]:controlContents},
    actions:{[product]:{enabled:false,allowed_actions:"all",sha_pinning_required:false}},
    workflowPermissions:{
      [product]:{default_workflow_permissions:"read",can_approve_pull_request_reviews:false}
    },
    labels:{[product]:[]},
    variables:{[product]:{}},
    secrets:{[product]:[]},
    policies:{[product]:[]},
    parentPolicies:{[product]:[]},
    rulesets:{[product]:[]}
  };
  const statePath=join(temp,"state.json");
  await writeFile(statePath,JSON.stringify(state,null,2)+"\n");

  const prior={
    PATH:process.env.PATH,
    FAKE_GH_STATE:process.env.FAKE_GH_STATE,
    CLAUDE_CODE_OAUTH_TOKEN:process.env.CLAUDE_CODE_OAUTH_TOKEN
  };
  const priorExit=process.exitCode;
  const priorLog=console.log;
  process.env.PATH=bin+":"+prior.PATH;
  process.env.FAKE_GH_STATE=statePath;
  process.env.CLAUDE_CODE_OAUTH_TOKEN="opaque-test-secret";
  process.exitCode=0;
  console.log=()=>{};

  try{
    const plan=await setupGithub({repository:product});
    assert.equal(plan.status,"PLAN_READY");
    assert.ok(plan.plan.some(item=>item.id==="issues"));
    assert.ok(plan.plan.some(item=>item.id==="actions"));
    assert.ok(plan.plan.some(item=>item.id==="merge-method"));
    assert.ok(plan.plan.some(item=>item.id==="secret:CLAUDE_CODE_OAUTH_TOKEN"));
    assert.ok(plan.plan.some(item=>item.id==="actions-event-policy"));

    const applied=await setupGithub({repository:product,apply:true});
    assert.equal(applied.status,"READY");
    assert.equal(applied.doctor.status,"READY");
    assert.equal(applied.doctor.checks.length,24);
    assert.equal(applied.doctor.provider_checks[0].status,"PASS");

    const doctor=await githubDoctor({repository:product});
    assert.equal(doctor.status,"READY");
    assert.equal(doctor.ok,true);

    const rerun=await setupGithub({repository:product});
    assert.equal(rerun.status,"PLAN_READY");
    assert.deepEqual(rerun.plan,[]);

    const after=JSON.parse(await readFile(statePath,"utf8"));
    assert.equal(after.repos[product].has_issues,true);
    assert.equal(after.repos[product].allow_squash_merge,true);
    assert.equal(after.actions[product].enabled,true);
    assert.equal(after.workflowPermissions[product].can_approve_pull_request_reviews,true);
    assert.equal(after.variables[product].AGENTI_TEST_MODE,"false");
    assert.ok(after.secrets[product].includes("CLAUDE_CODE_OAUTH_TOKEN"));
    assert.equal(after.secret_upload_count,1);
    assert.ok(after.policies[product].some(policy=>
      policy.name==="Agenti trusted workflow events"&&
      policy.rules[0].parameters.allowed_events.includes("pull_request_target")
    ));
    assert.equal(JSON.stringify(after).includes("opaque-test-secret"),false);
  } finally {
    console.log=priorLog;
    process.exitCode=priorExit;
    if(prior.PATH===undefined) delete process.env.PATH; else process.env.PATH=prior.PATH;
    if(prior.FAKE_GH_STATE===undefined) delete process.env.FAKE_GH_STATE; else process.env.FAKE_GH_STATE=prior.FAKE_GH_STATE;
    if(prior.CLAUDE_CODE_OAUTH_TOKEN===undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN=prior.CLAUDE_CODE_OAUTH_TOKEN;
    await rm(temp,{recursive:true,force:true});
  }
});
