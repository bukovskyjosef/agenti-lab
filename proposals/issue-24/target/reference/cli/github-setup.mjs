import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";

const SELF=fileURLToPath(import.meta.url);
const REFERENCE_ROOT=resolve(dirname(SELF),"..");
const CONTROL_ROOT=resolve(REFERENCE_ROOT,"..");
const PROFILE_ID="single-repo-actions";
const TARGET_TEMPLATE=join(REFERENCE_ROOT,"profiles",PROFILE_ID,"target");

function sh(command,args,{input=null}={}){
  const result=execFileSync(command,args,{
    encoding:"utf8",
    stdio:["pipe","pipe","pipe"],
    input:input===null?undefined:input
  });
  return String(result??"").trim();
}
const GITHUB_API_VERSION="2026-03-10";
function gh(args,options={}){return sh("gh",args,options);}
function versionedArgs(args){
  return args[0]==="api"&&!args.includes("X-GitHub-Api-Version: "+GITHUB_API_VERSION)
    ? ["api","-H","X-GitHub-Api-Version: "+GITHUB_API_VERSION,...args.slice(1)]
    : args;
}
function ghJson(args){const raw=gh(versionedArgs(args));return raw?JSON.parse(raw):null;}
function ghApi(method,path,body=null){
  const args=["api","-H","X-GitHub-Api-Version: "+GITHUB_API_VERSION,"--method",method,path];
  if(body!==null) args.push("--input","-");
  const raw=gh(args,{input:body===null?null:JSON.stringify(body)});
  return raw?JSON.parse(raw):null;
}
function tryCall(fn){try{return {ok:true,value:fn()};}catch(error){return {ok:false,error};}}
function decodeContent(payload){return Buffer.from(payload.content.replace(/\n/g,""),"base64");}
function ghFile(repository,path,ref){
  return decodeContent(ghJson(["api","repos/"+repository+"/contents/"+path+"?ref="+encodeURIComponent(ref)]));
}
function ghFileOptional(repository,path,ref){
  const result=tryCall(()=>ghFile(repository,path,ref));
  return result.ok?result.value:null;
}
function apiPath(url){return String(url??"").replace(/^https:\/\/api\.github\.com\//,"");}
function sha256(bytes){return "sha256:"+createHash("sha256").update(bytes).digest("hex");}
async function files(root){
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
async function sourcePlan(){
  const out=[];
  for(const source of await files(TARGET_TEMPLATE)){
    out.push({source,targetRel:relative(TARGET_TEMPLATE,source),content:await readFile(source)});
  }
  return out;
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}
function sameJson(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function wildcardMatch(pattern,value){
  const escaped=String(pattern).split("*").map(part=>part.replace(/[.+?^$()|[\]\\]/g,"\\$&")).join(".*");
  return new RegExp("^"+escaped+"$").test(String(value));
}

export function actionAllowedBySelectedPolicy(actionUse,policy={}){
  const repository=String(actionUse).split("@")[0];
  const owner=repository.split("/")[0];
  if(owner==="actions"&&policy.github_owned_allowed===true) return true;
  return (policy.patterns_allowed??[]).some(pattern=>
    wildcardMatch(pattern,actionUse)||wildcardMatch(pattern,repository)
  );
}

function workflowConditionApplies(policy,workflowPath){
  const condition=policy?.conditions?.workflow_path;
  if(!condition) return true;
  const include=condition.include??[];
  const exclude=condition.exclude??[];
  if(exclude.some(pattern=>wildcardMatch(pattern,workflowPath))) return false;
  if(include.length===0||include.includes("~ALL")) return true;
  return include.some(pattern=>wildcardMatch(pattern,workflowPath));
}

export function eventPolicyAllows(policies,workflowPath,eventName){
  for(const policy of policies??[]){
    if(policy.enforcement!=="active"||!workflowConditionApplies(policy,workflowPath)) continue;
    for(const rule of policy.rules??[]){
      if(rule.type!=="restrict_action_events") continue;
      const allowed=rule.parameters?.allowed_events??[];
      if(!allowed.includes("~ALL")&&!allowed.includes(eventName)) return false;
    }
  }
  return true;
}

const LABEL_SPECS={
  "agenti:managed":{color:"1d76db",description:"Agenti durable state projection"},
  "agenti:waiting-human":{color:"fbca04",description:"Agenti durable state projection"},
  "agenti:release-approval":{color:"d93f0b",description:"Agenti durable state projection"},
  "agenti:blocked":{color:"b60205",description:"Agenti durable state projection"},
  "agenti:stopped":{color:"5319e7",description:"Agenti durable state projection"},
  "agenti:done":{color:"0e8a16",description:"Agenti durable state projection"}
};

export function buildGithubDesiredState({runtime,profile,project,transportDefaults}){
  const setup=project?.github_setup??{};
  const variableOverrides=setup.variables??{};
  for(const name of Object.keys(variableOverrides)){
    if(!name.startsWith("AGENTI_")){
      throw new Error("Project github_setup.variables may manage only AGENTI_* names: "+name);
    }
  }
  const labelNames=transportDefaults?.labels??Object.keys(LABEL_SPECS);
  const labels=labelNames.map(name=>({
    name,
    color:LABEL_SPECS[name]?.color??"1d76db",
    description:LABEL_SPECS[name]?.description??"Agenti durable state projection"
  }));
  const requiredChecks=[...new Set(
    (setup.required_checks??project?.required_checks??profile?.required_checks??[]).map(String)
  )].sort();
  const variables={
    AGENTI_TEST_MODE:String(Boolean(runtime?.test_mode)),
    ...Object.fromEntries(Object.entries(variableOverrides).map(([name,value])=>[name,String(value)]))
  };
  const mergeMethod=setup.merge_method??runtime?.publication?.merge_method??"squash";
  if(!["squash","merge","rebase"].includes(mergeMethod)){
    throw new Error("Unsupported declared merge method: "+mergeMethod);
  }
  return {
    issues:true,
    actions:true,
    merge_method:mergeMethod,
    labels,
    variables,
    required_secret_names:[...new Set(runtime?.runner?.required_secret_names??[])].sort(),
    required_checks:requiredChecks,
    declared_ruleset:setup.ruleset??null,
    branch_protection:setup.branch_protection??null,
    publish_environment:setup.publish_environment??null
  };
}

function result(value,passCode,failCode,detail){
  if(value===true) return {status:"PASS",code:passCode??null,detail:detail??null};
  if(value&&typeof value==="object"&&value.status) return value;
  return {status:"FAIL",code:failCode??"NOT_READY",detail:detail??"check failed"};
}
export function evaluateGithubSnapshot(snapshot){
  const specs=[
    ["1","repository/default branch",snapshot.repository_binding],
    ["2","product_bootstrap_sha",snapshot.product_bootstrap_sha],
    ["3","trusted AGENTS locator",snapshot.trusted_locator],
    ["4","pointer-only tool stubs",snapshot.pointer_stubs],
    ["5","control_plane_sha",snapshot.control_plane_sha],
    ["6","schema/runtime/profile compatibility",snapshot.control_plane_revision_consistency],
    ["7","registry/project/profile mapping",snapshot.registry_mapping],
    ["8","no mutable product-local control authority",snapshot.no_local_mutable_authority],
    ["9","trusted transport present",snapshot.transport_present],
    ["10","trusted transport integrity",snapshot.transport_integrity],
    ["11","trusted launcher semantics",snapshot.launcher_trust],
    ["12","candidate control files are not current-run authority",snapshot.candidate_not_authority],
    ["13","GitHub Issues available",snapshot.issues],
    ["14","GitHub Actions enabled",snapshot.actions],
    ["15","effective Actions/action/event policy",snapshot.actions_policy],
    ["16","effective workflow token permissions",snapshot.workflow_permissions],
    ["17","declared merge method enabled",snapshot.merge_method],
    ["18","required checks current",snapshot.required_checks],
    ["19","declared ruleset/branch protection effective",snapshot.ruleset],
    ["20","declared P environment/protection effective",snapshot.environment],
    ["21","required agenti labels exact",snapshot.labels],
    ["22","required AGENTI variables exact",snapshot.variables],
    ["23","required secret metadata present",snapshot.secrets],
    ["24","O/P publication permission split effective",snapshot.permission_split]
  ];
  const checks=specs.map(([id,title,value])=>{
    const normalized=result(value,null,"NOT_READY",title+" is not satisfied");
    return {id,title,...normalized};
  });
  const failed=checks.filter(check=>check.status==="FAIL");
  const waiting=checks.filter(check=>check.status==="WAIT");
  const status=failed.length?"NOT_READY":waiting.length?"WAITING_HUMAN_APPROVAL":"READY";
  return {
    ok:status==="READY",
    status,
    checks,
    errors:failed.map(check=>(check.code?check.code+": ":"")+(check.detail??check.title)),
    warnings:waiting.map(check=>(check.code?check.code+": ":"")+(check.detail??check.title))
  };
}

function requiredWorkflowNames(runtime,profile){
  const out=new Set(["agenti-orchestrate.yml","agenti-reconcile.yml","agenti-publish.yml"]);
  const candidates=new Set();
  for(const policy of profile?.execution_routing?.policies??[]){
    for(const candidate of policy.candidates??[]) candidates.add(candidate);
  }
  for(const candidate of candidates){
    for(const workflow of Object.values(runtime?.runner?.candidate_workflows?.[candidate]??{})){
      out.add(workflow);
    }
  }
  return out;
}
function requiredActionUses(plan,runtime,profile){
  const workflowNames=requiredWorkflowNames(runtime,profile);
  const out=new Set();
  for(const item of plan){
    if(!item.targetRel.startsWith(".github/workflows/")) continue;
    if(!workflowNames.has(item.targetRel.split("/").at(-1))) continue;
    const text=item.content.toString("utf8");
    for(const match of text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)){
      if(!match[1].startsWith("./")) out.add(match[1]);
    }
  }
  return [...out].sort();
}
function expectedWorkflowEvents(runtime,profile){
  const names=requiredWorkflowNames(runtime,profile);
  const all={
    "agenti-orchestrate.yml":["issues","issue_comment","pull_request_target","check_suite","workflow_dispatch"],
    "agenti-reconcile.yml":["schedule","workflow_dispatch"],
    "agenti-role-a-claude.yml":["workflow_dispatch"],
    "agenti-role-d-claude.yml":["workflow_dispatch"],
    "agenti-role-r-claude.yml":["workflow_dispatch"],
    "agenti-publish.yml":["workflow_dispatch"]
  };
  return Object.fromEntries(
    Object.entries(all)
      .filter(([name])=>names.has(name))
      .map(([name,events])=>[".github/workflows/"+name,events])
  );
}

function trustedContext(repo){
  const meta=ghJson(["api","repos/"+repo]);
  const defaultBranch=meta.default_branch;
  const productSha=ghJson(["api","repos/"+repo+"/branches/"+encodeURIComponent(defaultBranch)]).commit.sha;
  const bootstrap=JSON.parse(ghFile(repo,".agenti/bootstrap.json",productSha).toString("utf8"));
  const agents=ghFile(repo,"AGENTS.md",productSha).toString("utf8");
  const marker=agents.match(/<!--\s*agenti-control-plane:\s*([^\s]+)\s*-->/i)?.[1]??null;
  const controlRepo=bootstrap.control_plane_repository;
  const controlMeta=ghJson(["api","repos/"+controlRepo]);
  const controlSha=ghJson(["api","repos/"+controlRepo+"/branches/"+encodeURIComponent(controlMeta.default_branch)]).commit.sha;
  const registry=JSON.parse(ghFile(controlRepo,"projects/registry.yml",controlSha).toString("utf8"));
  const mapping=registry.projects?.[repo]??null;
  if(!mapping){
    return {repo,meta,defaultBranch,productSha,bootstrap,agents,marker,controlRepo,controlMeta,controlSha,registry,mapping:null};
  }
  if(!["automated","single-repo-actions"].includes(mapping.selected_profile)){
    throw new Error("PROFILE_NOT_RELEASE_SUPPORTED: "+mapping.selected_profile);
  }
  const project=JSON.parse(ghFile(controlRepo,mapping.project_control,controlSha).toString("utf8"));
  const profile=JSON.parse(ghFile(controlRepo,"profiles/automated/single-repo-actions/project-profile.json",controlSha).toString("utf8"));
  const runtime=JSON.parse(ghFile(controlRepo,"profiles/automated/single-repo-actions/runtime.json",controlSha).toString("utf8"));
  const transportDefaults=JSON.parse(ghFile(controlRepo,"reference/profiles/single-repo-actions/profile.defaults.json",controlSha).toString("utf8"));
  return {
    repo,meta,defaultBranch,productSha,bootstrap,agents,marker,
    controlRepo,controlMeta,controlSha,registry,mapping,project,profile,runtime,transportDefaults
  };
}

function policyDetails(summary,repo){
  const path=summary?._links?.self?.href?apiPath(summary._links.self.href):"repos/"+repo+"/actions/policies/"+summary.id;
  return ghJson(["api",path]);
}
function inspectSelectedActions(scope,allowedActions,endpoint,requiredActions){
  if(!allowedActions||allowedActions==="all") return true;
  if(allowedActions==="local_only"){
    return {status:"WAIT",code:"WAITING_HUMAN_APPROVAL",detail:scope+" Actions policy allows local actions only; pinned external actions are required"};
  }
  if(allowedActions!=="selected"){
    return {status:"FAIL",code:"PLATFORM_CAPABILITY_UNAVAILABLE",detail:"unknown "+scope+" allowed_actions mode: "+allowedActions};
  }
  const selected=tryCall(()=>ghJson(["api",endpoint]));
  if(!selected.ok){
    return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:scope+" selected-actions policy is not inspectable"};
  }
  const blocked=requiredActions.filter(use=>!actionAllowedBySelectedPolicy(use,selected.value));
  if(blocked.length){
    return {status:"WAIT",code:"WAITING_HUMAN_APPROVAL",detail:scope+" policy does not prove required pinned actions allowed: "+blocked.join(", ")};
  }
  return true;
}
function inspectActionsPolicy(ctx,requiredActions,workflowEvents){
  const actions=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/actions/permissions"]));
  if(!actions.ok){
    return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"repository Actions permissions are not inspectable"};
  }
  const repoAllowed=inspectSelectedActions(
    "repository",actions.value.allowed_actions,
    "repos/"+ctx.repo+"/actions/permissions/selected-actions",
    requiredActions
  );
  if(repoAllowed!==true) return repoAllowed;

  if(ctx.meta?.owner?.type==="Organization"){
    const owner=ctx.repo.split("/")[0];
    const orgActions=tryCall(()=>ghJson(["api","orgs/"+owner+"/actions/permissions"]));
    if(!orgActions.ok){
      return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"organization Actions policy is not inspectable"};
    }
    const orgAllowed=inspectSelectedActions(
      "organization",orgActions.value.allowed_actions,
      "orgs/"+owner+"/actions/permissions/selected-actions",
      requiredActions
    );
    if(orgAllowed!==true) return orgAllowed;
  }

  const listed=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/actions/policies?has_parents=true&per_page=100"]));
  if(!listed.ok){
    return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"effective Actions event policies are not inspectable"};
  }
  const policies=[];
  for(const summary of listed.value?.policies??[]){
    const detail=tryCall(()=>policyDetails(summary,ctx.repo));
    if(!detail.ok){
      return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"effective Actions policy "+summary.id+" is not inspectable"};
    }
    policies.push(detail.value);
  }
  for(const [workflowPath,events] of Object.entries(workflowEvents)){
    for(const eventName of events){
      if(!eventPolicyAllows(policies,workflowPath,eventName)){
        return {status:"WAIT",code:"WAITING_HUMAN_APPROVAL",detail:"effective higher-level Actions policy blocks "+eventName+" for "+workflowPath};
      }
    }
  }
  return true;
}

function mergeField(method){
  return {squash:"allow_squash_merge",merge:"allow_merge_commit",rebase:"allow_rebase_merge"}[method];
}
function inspectRequiredChecks(ctx,desired){
  if(desired.required_checks.length===0) return true;
  const seen=new Set();
  const protection=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/branches/"+encodeURIComponent(ctx.defaultBranch)+"/protection/required_status_checks"]));
  if(protection.ok){
    for(const name of protection.value?.contexts??[]) seen.add(name);
    for(const check of protection.value?.checks??[]) if(check.context) seen.add(check.context);
  }
  const rulesets=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/rulesets?includes_parents=true&per_page=100"]));
  if(rulesets.ok){
    for(const summary of rulesets.value??[]){
      if(summary.enforcement&&summary.enforcement!=="active") continue;
      const detail=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/rulesets/"+summary.id+"?includes_parents=true"]));
      if(!detail.ok) continue;
      for(const rule of detail.value?.rules??[]){
        if(rule.type!=="required_status_checks") continue;
        for(const check of rule.parameters?.required_status_checks??[]){
          if(check.context) seen.add(check.context);
        }
      }
    }
  }
  const missing=desired.required_checks.filter(name=>!seen.has(name));
  return missing.length
    ? {status:"FAIL",code:"REQUIRED_CHECKS_DRIFT",detail:"required checks are not effectively enforced: "+missing.join(", ")}
    : true;
}
function rulesetComparable(actual){
  return {
    name:actual?.name,
    target:actual?.target,
    enforcement:actual?.enforcement,
    bypass_actors:actual?.bypass_actors??[],
    conditions:actual?.conditions??null,
    rules:actual?.rules??[]
  };
}
function rulesetMatches(actual,declared){
  const expected={
    name:declared.name,
    target:declared.target??"branch",
    enforcement:declared.enforcement??"active",
    bypass_actors:declared.bypass_actors??[],
    ...(declared.conditions!==undefined?{conditions:declared.conditions}:{}),
    rules:declared.rules??[]
  };
  return sameJson(rulesetComparable(actual),expected);
}
function inspectDeclaredRuleset(ctx,desired){
  const declared=desired.declared_ruleset;
  if(!declared) return true;
  const list=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/rulesets?includes_parents=true&per_page=100"]));
  if(!list.ok){
    return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"declared ruleset cannot be inspected"};
  }
  const summary=(list.value??[]).find(item=>item.name===declared.name);
  if(!summary) return {status:"FAIL",code:"RULESET_DRIFT",detail:"declared ruleset missing: "+declared.name};
  const detail=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/rulesets/"+summary.id+"?includes_parents=true"]));
  if(!detail.ok){
    return {status:"FAIL",code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"declared ruleset details cannot be inspected"};
  }
  return rulesetMatches(detail.value,declared)
    ? true
    : {status:"FAIL",code:"RULESET_DRIFT",detail:"declared ruleset differs from effective state: "+declared.name};
}
function normalizeBranchProtection(actual,declared){
  const out={};
  if(Object.hasOwn(declared,"required_status_checks")){
    out.required_status_checks=actual?.required_status_checks
      ? {
          strict:Boolean(actual.required_status_checks.strict),
          contexts:[...(actual.required_status_checks.contexts??[])].sort()
        }
      : null;
  }
  if(Object.hasOwn(declared,"enforce_admins")) out.enforce_admins=Boolean(actual?.enforce_admins?.enabled??actual?.enforce_admins);
  if(Object.hasOwn(declared,"required_pull_request_reviews")){
    const reviews=actual?.required_pull_request_reviews;
    out.required_pull_request_reviews=reviews
      ? {
          dismiss_stale_reviews:Boolean(reviews.dismiss_stale_reviews),
          require_code_owner_reviews:Boolean(reviews.require_code_owner_reviews),
          required_approving_review_count:Number(reviews.required_approving_review_count??0),
          require_last_push_approval:Boolean(reviews.require_last_push_approval??false)
        }
      : null;
  }
  if(Object.hasOwn(declared,"restrictions")){
    out.restrictions=actual?.restrictions
      ? {
          users:(actual.restrictions.users??[]).map(item=>item.login??item).sort(),
          teams:(actual.restrictions.teams??[]).map(item=>item.slug??item).sort(),
          apps:(actual.restrictions.apps??[]).map(item=>item.slug??item).sort()
        }
      : null;
  }
  for(const key of [
    "required_linear_history","allow_force_pushes","allow_deletions","block_creations",
    "required_conversation_resolution","lock_branch","allow_fork_syncing"
  ]){
    if(Object.hasOwn(declared,key)) out[key]=Boolean(actual?.[key]?.enabled??actual?.[key]);
  }
  return out;
}
function expectedBranchProtection(declared){
  const out={};
  if(Object.hasOwn(declared,"required_status_checks")){
    out.required_status_checks=declared.required_status_checks
      ? {
          strict:Boolean(declared.required_status_checks.strict),
          contexts:[...(declared.required_status_checks.contexts??[])].sort()
        }
      : null;
  }
  if(Object.hasOwn(declared,"enforce_admins")) out.enforce_admins=Boolean(declared.enforce_admins);
  if(Object.hasOwn(declared,"required_pull_request_reviews")){
    const reviews=declared.required_pull_request_reviews;
    out.required_pull_request_reviews=reviews
      ? {
          dismiss_stale_reviews:Boolean(reviews.dismiss_stale_reviews),
          require_code_owner_reviews:Boolean(reviews.require_code_owner_reviews),
          required_approving_review_count:Number(reviews.required_approving_review_count??0),
          require_last_push_approval:Boolean(reviews.require_last_push_approval??false)
        }
      : null;
  }
  if(Object.hasOwn(declared,"restrictions")){
    out.restrictions=declared.restrictions
      ? {
          users:[...(declared.restrictions.users??[])].sort(),
          teams:[...(declared.restrictions.teams??[])].sort(),
          apps:[...(declared.restrictions.apps??[])].sort()
        }
      : null;
  }
  for(const key of [
    "required_linear_history","allow_force_pushes","allow_deletions","block_creations",
    "required_conversation_resolution","lock_branch","allow_fork_syncing"
  ]){
    if(Object.hasOwn(declared,key)) out[key]=Boolean(declared[key]);
  }
  return out;
}
function inspectBranchProtection(ctx,desired){
  const declared=desired.branch_protection;
  if(!declared) return true;
  const current=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/branches/"+encodeURIComponent(ctx.defaultBranch)+"/protection"]));
  if(!current.ok){
    return {status:"FAIL",code:"BRANCH_PROTECTION_DRIFT",detail:"declared default-branch protection is missing or not inspectable"};
  }
  return sameJson(normalizeBranchProtection(current.value,declared),expectedBranchProtection(declared))
    ? true
    : {status:"FAIL",code:"BRANCH_PROTECTION_DRIFT",detail:"declared default-branch protection differs from effective state"};
}
function environmentMatches(actual,declared){
  if(!actual||actual.name!==declared.name) return false;
  if(declared.deployment_branch_policy!==undefined&&!sameJson(actual.deployment_branch_policy??null,declared.deployment_branch_policy)) return false;
  if(declared.wait_timer!==undefined){
    const wait=(actual.protection_rules??[]).find(rule=>rule.type==="wait_timer")?.wait_timer??0;
    if(Number(wait)!==Number(declared.wait_timer)) return false;
  }
  if(declared.reviewers!==undefined){
    const actualIds=(actual.protection_rules??[])
      .find(rule=>rule.type==="required_reviewers")?.reviewers
      ?.map(item=>Number(item.reviewer?.id??item.id)).sort((a,b)=>a-b)??[];
    const expectedIds=(declared.reviewers??[]).map(item=>Number(item.id)).sort((a,b)=>a-b);
    if(!sameJson(actualIds,expectedIds)) return false;
  }
  return true;
}
function inspectEnvironment(ctx,desired){
  const declared=desired.publish_environment;
  if(!declared) return true;
  const current=tryCall(()=>ghJson(["api","repos/"+ctx.repo+"/environments/"+encodeURIComponent(declared.name)]));
  if(!current.ok){
    return {status:"FAIL",code:"ENVIRONMENT_DRIFT",detail:"declared P environment missing or not inspectable: "+declared.name};
  }
  return environmentMatches(current.value,declared)
    ? true
    : {status:"FAIL",code:"ENVIRONMENT_DRIFT",detail:"declared P environment protection differs: "+declared.name};
}
function pointerStubsOk(ctx){
  for(const path of ["CLAUDE.md",".github/copilot-instructions.md"]){
    const bytes=ghFileOptional(ctx.repo,path,ctx.productSha);
    if(!bytes) continue;
    const text=bytes.toString("utf8");
    if(!/AGENTS\.md|agenti-control-plane/i.test(text)){
      return {status:"FAIL",code:"AUTHORITATIVE_TOOL_STUB",detail:path+" is not pointer-only/non-authoritative"};
    }
  }
  return true;
}
function noMutableLocalControl(ctx){
  for(const path of [".agenti-runtime",".agenti/project-profile.json",".agenti/single-repo-actions.json",".agenti/prompts"]){
    if(ghFileOptional(ctx.repo,path,ctx.productSha)){
      return {status:"FAIL",code:"LOCAL_CONTROL_AUTHORITY_PRESENT",detail:"obsolete mutable product-local control asset present: "+path};
    }
  }
  return true;
}
function inspectLabels(ctx,desired){
  const current=ghJson(["label","list","--repo",ctx.repo,"--limit","100","--json","name,color,description"]);
  const byName=new Map(current.map(label=>[label.name,label]));
  for(const expected of desired.labels){
    const actual=byName.get(expected.name);
    if(!actual||String(actual.color).toLowerCase()!==expected.color.toLowerCase()||actual.description!==expected.description){
      return {status:"FAIL",code:"LABEL_DRIFT",detail:"owned label missing/drifted: "+expected.name};
    }
  }
  return true;
}
function inspectVariables(ctx,desired){
  const current=ghJson(["variable","list","--repo",ctx.repo,"--json","name,value"]);
  const byName=new Map(current.map(item=>[item.name,String(item.value)]));
  for(const [name,value] of Object.entries(desired.variables)){
    if(byName.get(name)!==String(value)){
      return {status:"FAIL",code:"VARIABLE_DRIFT",detail:"repository variable missing/drifted: "+name};
    }
  }
  return true;
}
function inspectSecrets(ctx,desired){
  const names=new Set(ghJson(["secret","list","--repo",ctx.repo,"--json","name"]).map(item=>item.name));
  const missing=desired.required_secret_names.filter(name=>!names.has(name));
  return missing.length
    ? {status:"FAIL",code:"MISSING_REQUIRED_SECRET",detail:"required secret metadata missing: "+missing.join(", ")}
    : true;
}
function validateLauncherText(path,text,errors){
  if(path.endsWith("agenti-orchestrate.yml")){
    if(!/^\s{2}pull_request_target:/m.test(text)) errors.push("O launcher missing pull_request_target");
    if(/^\s{2}pull_request:/m.test(text)) errors.push("O launcher contains forbidden ordinary pull_request");
  }
  if(/agenti-role-|agenti-publish/.test(path)){
    if(!/^\s{2}workflow_dispatch:/m.test(text)) errors.push(path+" missing workflow_dispatch");
    if(/^\s{2}pull_request(?:_target)?:/m.test(text)) errors.push(path+" has forbidden PR trigger");
  }
  if(!text.includes("Trusted T0 bootstrap")&&!path.endsWith("agenti-reconcile.yml")){
    errors.push(path+" missing trusted T0");
  }
}
function inspectTransport(ctx,plan){
  let present=true;
  let integrity=true;
  let launcher=true;
  const launcherErrors=[];
  for(const item of plan.filter(item=>
    item.targetRel.includes(".github/workflows/")||
    item.targetRel.includes(".agenti-bootstrap/")||
    item.targetRel==="AGENTS.md"||
    item.targetRel===".agenti/bootstrap.json"
  )){
    let actual;
    try{actual=ghFile(ctx.repo,item.targetRel,ctx.productSha);}
    catch{present=false;continue;}
    if(sha256(actual)!==sha256(item.content)) integrity=false;
    if(item.targetRel.includes(".github/workflows/")){
      const before=launcherErrors.length;
      validateLauncherText(item.targetRel,actual.toString("utf8"),launcherErrors);
      if(launcherErrors.length!==before) launcher=false;
    }
  }
  return {present,integrity,launcher,launcherErrors};
}
function inspectReleaseProviderEvidence(ctx){
  const selected=new Set();
  for(const policy of ctx.profile?.execution_routing?.policies??[]){
    for(const candidate of policy.candidates??[]) selected.add(candidate);
  }
  if(!selected.has("claude-subscription")) return true;
  const principals=new Set((ctx.project?.human_principals??[]).map(item=>Number(item.actor_id)));
  const evidence=(ctx.project?.runner_evidence?.billing_safety??[])
    .filter(item=>item.runner_candidate_id==="claude-subscription")
    .sort((a,b)=>Date.parse(b.observed_at??0)-Date.parse(a.observed_at??0))[0];
  if(!evidence){
    return {status:"FAIL",code:"PROVIDER_BILLING_SAFETY_MISSING",detail:"current Claude no-paid-spillover project-control evidence is missing"};
  }
  if(evidence.status!=="VERIFIED_NO_PAID_SPILLOVER"){
    return {status:"FAIL",code:"PROVIDER_BILLING_SAFETY_INVALID",detail:"Claude billing-safety status is not VERIFIED_NO_PAID_SPILLOVER"};
  }
  if(evidence.source?.kind!=="ADMIN_POLICY_ATTESTATION"||evidence.source?.trust!=="EXTERNAL_CURRENT_EVIDENCE"){
    return {status:"FAIL",code:"PROVIDER_BILLING_SAFETY_INVALID",detail:"Claude billing-safety source is not trusted current admin-policy evidence"};
  }
  if(!principals.has(Number(evidence.attested_by?.actor_id))||!evidence.attested_by?.evidence_ref){
    return {status:"FAIL",code:"PROVIDER_BILLING_SAFETY_INVALID",detail:"Claude billing-safety attestation is not bound to a configured H principal and durable evidence"};
  }
  if(!evidence.valid_until||Date.parse(evidence.valid_until)<Date.now()){
    return {status:"FAIL",code:"PROVIDER_BILLING_SAFETY_EXPIRED",detail:"Claude billing-safety evidence is expired"};
  }
  return true;
}

function permissionSplitOk(ctx){
  const o=ghFile(ctx.repo,".github/workflows/agenti-orchestrate.yml",ctx.productSha).toString("utf8");
  const p=ghFile(ctx.repo,".github/workflows/agenti-publish.yml",ctx.productSha).toString("utf8");
  const oPermissions=o.slice(o.indexOf("permissions:"),o.indexOf("concurrency:"));
  if(!/contents:\s+read/.test(oPermissions)||/contents:\s+write/.test(oPermissions)) return false;
  const publishJob=p.slice(p.indexOf("\n  publish:"),p.indexOf("\n    steps:"));
  return /contents:\s+write/.test(publishJob)&&/pull-requests:\s+write/.test(publishJob);
}

export async function githubDoctor(args={}){
  const repo=args.repository??ghJson(["repo","view","--json","nameWithOwner"]).nameWithOwner;
  let ctx;
  try{ctx=trustedContext(repo);}
  catch(error){
    const evaluated=evaluateGithubSnapshot({
      repository_binding:{status:"FAIL",code:"TRUSTED_CONTEXT_UNREADABLE",detail:error.message}
    });
    return {repository:repo,...evaluated};
  }

  if(!ctx.mapping){
    const evaluated=evaluateGithubSnapshot({
      repository_binding:true,
      product_bootstrap_sha:true,
      trusted_locator:ctx.marker===ctx.controlRepo,
      control_plane_sha:true,
      registry_mapping:{status:"FAIL",code:"CONTROL_PLANE_MAPPING_MISSING",detail:"control-plane registry mapping missing for "+repo}
    });
    return {
      repository:repo,
      default_branch:ctx.defaultBranch,
      product_bootstrap_sha:ctx.productSha,
      control_plane_repository:ctx.controlRepo,
      control_plane_sha:ctx.controlSha,
      ...evaluated
    };
  }

  const plan=await sourcePlan();
  const desired=buildGithubDesiredState(ctx);
  const actionsUses=requiredActionUses(plan,ctx.runtime,ctx.profile);
  const workflowEvents=expectedWorkflowEvents(ctx.runtime,ctx.profile);
  const transport=inspectTransport(ctx,plan);
  const actionsState=tryCall(()=>ghJson(["api","repos/"+repo+"/actions/permissions"]));
  const workflowPermissions=tryCall(()=>ghJson(["api","repos/"+repo+"/actions/permissions/workflow"]));
  const compatibility=
    ctx.bootstrap?.schema_version===1&&
    ctx.registry?.schema_version===1&&
    ctx.project?.schema_version===1&&
    ctx.profile?.schema_version===1&&
    ctx.runtime?.schema_version===1&&
    ctx.runtime?.profile_id==="single-repo-actions"&&
    ctx.project?.repository===repo&&
    ctx.project?.project_id===ctx.mapping.project_id&&
    ctx.project?.selected_profile===ctx.mapping.selected_profile;

  const snapshot={
    repository_binding:Boolean(ctx.meta?.full_name===repo&&ctx.defaultBranch),
    product_bootstrap_sha:Boolean(ctx.productSha),
    trusted_locator:ctx.marker===ctx.controlRepo,
    pointer_stubs:pointerStubsOk(ctx),
    control_plane_sha:Boolean(ctx.controlSha),
    control_plane_revision_consistency:compatibility,
    registry_mapping:compatibility,
    no_local_mutable_authority:noMutableLocalControl(ctx),
    transport_present:transport.present,
    transport_integrity:transport.integrity,
    launcher_trust:transport.launcher
      ? true
      : {status:"FAIL",code:"TRUSTED_LAUNCHER_DRIFT",detail:transport.launcherErrors.join("; ")},
    candidate_not_authority:transport.launcher&&ctx.marker===ctx.controlRepo,
    issues:ctx.meta?.has_issues===true,
    actions:actionsState.ok&&actionsState.value?.enabled===true,
    actions_policy:inspectActionsPolicy(ctx,actionsUses,workflowEvents),
    workflow_permissions:workflowPermissions.ok&&workflowPermissions.value?.can_approve_pull_request_reviews===true
      ? true
      : {
          status:"FAIL",
          code:workflowPermissions.ok?"WORKFLOW_PERMISSION_DRIFT":"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",
          detail:"GitHub Actions PR creation/approval capability is not enabled or inspectable"
        },
    merge_method:ctx.meta?.[mergeField(desired.merge_method)]===true
      ? true
      : {status:"FAIL",code:"MERGE_METHOD_DRIFT",detail:"declared merge method is not enabled: "+desired.merge_method},
    required_checks:inspectRequiredChecks(ctx,desired),
    ruleset:(()=>{
      const ruleset=inspectDeclaredRuleset(ctx,desired);
      if(ruleset!==true) return ruleset;
      return inspectBranchProtection(ctx,desired);
    })(),
    environment:inspectEnvironment(ctx,desired),
    labels:inspectLabels(ctx,desired),
    variables:inspectVariables(ctx,desired),
    secrets:inspectSecrets(ctx,desired),
    permission_split:permissionSplitOk(ctx)
  };

  const evaluated=evaluateGithubSnapshot(snapshot);
  const providerEvidence=inspectReleaseProviderEvidence(ctx);
  const providerCheck=providerEvidence===true
    ? {id:"provider-billing-safety",title:"release-supported provider billing-safety evidence",status:"PASS",code:null,detail:null}
    : {id:"provider-billing-safety",title:"release-supported provider billing-safety evidence",...providerEvidence};
  const providerFailed=providerCheck.status==="FAIL";
  const finalStatus=providerFailed?"NOT_READY":evaluated.status;
  return {
    repository:repo,
    default_branch:ctx.defaultBranch,
    product_bootstrap_sha:ctx.productSha,
    control_plane_repository:ctx.controlRepo,
    control_plane_sha:ctx.controlSha,
    project_id:ctx.mapping.project_id,
    selected_profile:ctx.mapping.selected_profile,
    desired_state:{
      merge_method:desired.merge_method,
      required_checks:desired.required_checks,
      required_labels:desired.labels.map(item=>item.name),
      required_variables:desired.variables,
      required_secret_names:desired.required_secret_names,
      declared_ruleset:desired.declared_ruleset?.name??null,
      branch_protection:Boolean(desired.branch_protection),
      publish_environment:desired.publish_environment?.name??null,
      required_action_uses:actionsUses
    },
    ...evaluated,
    ok:evaluated.ok&&!providerFailed,
    status:finalStatus,
    errors:[
      ...evaluated.errors,
      ...(providerFailed?[(providerCheck.code?providerCheck.code+": ":"")+(providerCheck.detail??providerCheck.title)]:[])
    ],
    provider_checks:[providerCheck]
  };
}

function ownedEventPolicyBody(workflowEvents){
  return {
    name:"Agenti trusted workflow events",
    enforcement:"active",
    conditions:{
      workflow_path:{
        include:Object.keys(workflowEvents),
        exclude:[]
      }
    },
    rules:[{
      type:"restrict_action_events",
      parameters:{
        allowed_events:[...new Set(Object.values(workflowEvents).flat())].sort()
      }
    }]
  };
}
function ownedRequiredChecksRuleset(requiredChecks){
  return {
    name:"Agenti required checks",
    target:"branch",
    enforcement:"active",
    bypass_actors:[],
    conditions:{ref_name:{include:["~DEFAULT_BRANCH"],exclude:[]}},
    rules:[{
      type:"required_status_checks",
      parameters:{
        required_status_checks:requiredChecks.map(context=>({context})),
        strict_required_status_checks_policy:true
      }
    }]
  };
}
function serializePlan(plan){
  return plan.map(item=>({id:item.id,action:item.action,detail:item.detail}));
}
function rulesetBody(declared){
  return {
    name:declared.name,
    target:declared.target??"branch",
    enforcement:declared.enforcement??"active",
    bypass_actors:declared.bypass_actors??[],
    conditions:declared.conditions??null,
    rules:declared.rules??[]
  };
}

export async function setupGithub(args={}){
  const repo=args.repository??ghJson(["repo","view","--json","nameWithOwner"]).nameWithOwner;
  let ctx;
  try{ctx=trustedContext(repo);}
  catch(error){
    const output={repository:repo,status:"NOT_READY",code:"TRUSTED_CONTEXT_UNREADABLE",detail:error.message};
    console.log(JSON.stringify(output,null,2));
    process.exitCode=1;
    return output;
  }
  if(!ctx.mapping){
    const output={repository:repo,status:"NOT_READY",code:"CONTROL_PLANE_MAPPING_MISSING",detail:"control-plane registry mapping missing"};
    console.log(JSON.stringify(output,null,2));
    process.exitCode=1;
    return output;
  }

  const source=await sourcePlan();
  const desired=buildGithubDesiredState(ctx);
  const actionsUses=requiredActionUses(source,ctx.runtime,ctx.profile);
  const workflowEvents=expectedWorkflowEvents(ctx.runtime,ctx.profile);
  const plan=[];
  const humanInputs=[];
  const blockers=[];
  const add=(id,action,detail,apply)=>plan.push({id,action,detail,apply});

  if(ctx.meta.has_issues!==true){
    add("issues","ENABLE","Enable GitHub Issues",()=>ghApi("PATCH","repos/"+repo,{has_issues:true}));
  }

  const actionsResult=tryCall(()=>ghJson(["api","repos/"+repo+"/actions/permissions"]));
  if(!actionsResult.ok){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"repository Actions permissions are not inspectable"});
  } else if(!actionsResult.value.enabled){
    add("actions","ENABLE","Enable GitHub Actions without widening allowed-actions policy",()=>ghApi(
      "PUT","repos/"+repo+"/actions/permissions",{
        enabled:true,
        ...(actionsResult.value.allowed_actions?{allowed_actions:actionsResult.value.allowed_actions}:{}),
        ...(typeof actionsResult.value.sha_pinning_required==="boolean"
          ? {sha_pinning_required:actionsResult.value.sha_pinning_required}
          : {})
      }
    ));
  }

  const workflowPermissions=tryCall(()=>ghJson(["api","repos/"+repo+"/actions/permissions/workflow"]));
  if(!workflowPermissions.ok){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"workflow permission state is not inspectable"});
  } else if(!workflowPermissions.value.can_approve_pull_request_reviews){
    add("workflow-permissions","UPDATE","Enable Actions PR creation/approval capability while preserving default token mode",()=>ghApi(
      "PUT","repos/"+repo+"/actions/permissions/workflow",{
        default_workflow_permissions:workflowPermissions.value.default_workflow_permissions??"read",
        can_approve_pull_request_reviews:true
      }
    ));
  }

  const currentAllowed=inspectActionsPolicy(ctx,actionsUses,workflowEvents);
  if(currentAllowed!==true&&currentAllowed.status==="WAIT"){
    blockers.push(currentAllowed);
  } else if(currentAllowed!==true&&currentAllowed.code==="INSUFFICIENT_BOOTSTRAP_CREDENTIAL"){
    blockers.push(currentAllowed);
  }

  const mergeKey=mergeField(desired.merge_method);
  if(ctx.meta[mergeKey]!==true){
    add("merge-method","UPDATE","Enable declared "+desired.merge_method+" merge method without disabling alternatives",()=>ghApi(
      "PATCH","repos/"+repo,{[mergeKey]:true}
    ));
  }

  const labels=tryCall(()=>ghJson(["label","list","--repo",repo,"--limit","100","--json","name,color,description"]));
  if(!labels.ok){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"repository labels are not inspectable"});
  } else {
    const labelMap=new Map(labels.value.map(label=>[label.name,label]));
    for(const expected of desired.labels){
      const actual=labelMap.get(expected.name);
      if(!actual||String(actual.color).toLowerCase()!==expected.color.toLowerCase()||actual.description!==expected.description){
        add("label:"+expected.name,"UPSERT","Upsert owned label "+expected.name,()=>gh([
          "label","create",expected.name,"--repo",repo,"--force",
          "--color",expected.color,"--description",expected.description
        ]));
      }
    }
  }

  const variables=tryCall(()=>ghJson(["variable","list","--repo",repo,"--json","name,value"]));
  if(!variables.ok){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"repository variables are not inspectable"});
  } else {
    const variableMap=new Map(variables.value.map(item=>[item.name,String(item.value)]));
    for(const [name,value] of Object.entries(desired.variables)){
      if(variableMap.get(name)!==String(value)){
        add("variable:"+name,"UPSERT","Set owned repository variable "+name,()=>gh([
          "variable","set",name,"--repo",repo,"--body",String(value)
        ]));
      }
    }
  }

  const secrets=tryCall(()=>ghJson(["secret","list","--repo",repo,"--json","name"]));
  if(!secrets.ok){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"repository secret metadata is not inspectable"});
  } else {
    const secretNames=new Set(secrets.value.map(item=>item.name));
    for(const name of desired.required_secret_names){
      if(secretNames.has(name)) continue;
      const value=process.env[name];
      if(!value){
        humanInputs.push({kind:"SECRET_VALUE",name,code:"MISSING_REQUIRED_SECRET_INPUT"});
        continue;
      }
      add("secret:"+name,"UPLOAD","Upload required provider secret "+name+" from same-named process environment",()=>gh(
        ["secret","set",name,"--repo",repo],
        {input:value+"\n"}
      ));
    }
  }

  const repositoryPolicies=tryCall(()=>ghJson(["api","repos/"+repo+"/actions/policies?has_parents=false&per_page=100"]));
  const eventPolicyBody=ownedEventPolicyBody(workflowEvents);
  if(!repositoryPolicies.ok){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"repository Actions event policy is not inspectable/configurable"});
  } else {
    const policySummary=(repositoryPolicies.value?.policies??[]).find(item=>
      item.name===eventPolicyBody.name&&item.source_type==="Repository"
    );
    if(!policySummary){
      add("actions-event-policy","CREATE","Create Agenti-owned workflow-scoped Actions event policy",()=>ghApi(
        "POST","repos/"+repo+"/actions/policies",eventPolicyBody
      ));
    } else {
      const actual=tryCall(()=>policyDetails(policySummary,repo));
      if(!actual.ok){
        blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"Agenti Actions event policy details are not inspectable"});
      } else {
        const comparable={
          name:actual.value.name,
          enforcement:actual.value.enforcement,
          conditions:actual.value.conditions,
          rules:actual.value.rules
        };
        if(!sameJson(comparable,eventPolicyBody)){
          add("actions-event-policy","UPDATE","Reconcile Agenti-owned workflow-scoped Actions event policy",()=>ghApi(
            "PUT","repos/"+repo+"/actions/policies/"+policySummary.id,eventPolicyBody
          ));
        }
      }
    }
  }

  const repoRulesets=tryCall(()=>ghJson(["api","repos/"+repo+"/rulesets?includes_parents=false&per_page=100"]));
  if(!repoRulesets.ok&&(desired.required_checks.length||desired.declared_ruleset)){
    blockers.push({code:"INSUFFICIENT_BOOTSTRAP_CREDENTIAL",detail:"declared ruleset/check state is not inspectable/configurable"});
  } else if(repoRulesets.ok){
    if(desired.required_checks.length){
      const requiredBody=ownedRequiredChecksRuleset(desired.required_checks);
      const summary=(repoRulesets.value??[]).find(item=>item.name===requiredBody.name);
      if(!summary){
        add("required-checks-ruleset","CREATE","Create Agenti-owned required-check ruleset",()=>ghApi(
          "POST","repos/"+repo+"/rulesets",requiredBody
        ));
      } else {
        const actual=ghJson(["api","repos/"+repo+"/rulesets/"+summary.id]);
        if(!rulesetMatches(actual,requiredBody)){
          add("required-checks-ruleset","UPDATE","Reconcile Agenti-owned required-check ruleset",()=>ghApi(
            "PUT","repos/"+repo+"/rulesets/"+summary.id,requiredBody
          ));
        }
      }
    }

    if(desired.declared_ruleset){
      const declared=rulesetBody(desired.declared_ruleset);
      if(!/^agenti(?:\b|[-_: ])/i.test(declared.name)){
        blockers.push({code:"WAITING_HUMAN_APPROVAL",detail:"declared ruleset is not explicitly Agenti-owned: "+declared.name});
      } else {
        const summary=(repoRulesets.value??[]).find(item=>item.name===declared.name);
        if(!summary){
          add("declared-ruleset","CREATE","Create declared Agenti-owned ruleset "+declared.name,()=>ghApi(
            "POST","repos/"+repo+"/rulesets",declared
          ));
        } else {
          const actual=ghJson(["api","repos/"+repo+"/rulesets/"+summary.id]);
          if(!rulesetMatches(actual,declared)){
            add("declared-ruleset","UPDATE","Reconcile declared Agenti-owned ruleset "+declared.name,()=>ghApi(
              "PUT","repos/"+repo+"/rulesets/"+summary.id,declared
            ));
          }
        }
      }
    }
  }

  if(desired.branch_protection){
    const current=tryCall(()=>ghJson(["api","repos/"+repo+"/branches/"+encodeURIComponent(ctx.defaultBranch)+"/protection"]));
    if(!current.ok||!sameJson(
      normalizeBranchProtection(current.value,desired.branch_protection),
      expectedBranchProtection(desired.branch_protection)
    )){
      const declared=desired.branch_protection;
      const body={
        required_status_checks:Object.hasOwn(declared,"required_status_checks")?declared.required_status_checks:null,
        enforce_admins:Object.hasOwn(declared,"enforce_admins")?Boolean(declared.enforce_admins):false,
        required_pull_request_reviews:Object.hasOwn(declared,"required_pull_request_reviews")?declared.required_pull_request_reviews:null,
        restrictions:Object.hasOwn(declared,"restrictions")?declared.restrictions:null,
        ...Object.fromEntries([
          "required_linear_history","allow_force_pushes","allow_deletions","block_creations",
          "required_conversation_resolution","lock_branch","allow_fork_syncing"
        ].filter(key=>Object.hasOwn(declared,key)).map(key=>[key,Boolean(declared[key])]))
      };
      add("branch-protection","UPSERT","Create/update declared default-branch protection",()=>ghApi(
        "PUT","repos/"+repo+"/branches/"+encodeURIComponent(ctx.defaultBranch)+"/protection",body
      ));
    }
  }

  if(desired.publish_environment){
    const declared=desired.publish_environment;
    const current=tryCall(()=>ghJson(["api","repos/"+repo+"/environments/"+encodeURIComponent(declared.name)]));
    if(!current.ok||!environmentMatches(current.value,declared)){
      const body={
        ...(declared.wait_timer!==undefined?{wait_timer:Number(declared.wait_timer)}:{}),
        ...(declared.prevent_self_review!==undefined?{prevent_self_review:Boolean(declared.prevent_self_review)}:{}),
        ...(declared.reviewers!==undefined?{reviewers:declared.reviewers}:{}),
        ...(declared.deployment_branch_policy!==undefined?{deployment_branch_policy:declared.deployment_branch_policy}:{})
      };
      add("publish-environment","UPSERT","Create/update declared P environment "+declared.name,()=>ghApi(
        "PUT","repos/"+repo+"/environments/"+encodeURIComponent(declared.name),body
      ));
    }
  }

  const preview={
    repository:repo,
    product_bootstrap_sha:ctx.productSha,
    control_plane_sha:ctx.controlSha,
    project_id:ctx.mapping.project_id,
    mode:args.apply?"APPLY":"PLAN",
    plan:serializePlan(plan),
    human_inputs:humanInputs,
    blockers
  };

  if(!args.apply){
    const status=blockers.length
      ? (blockers.every(item=>item.code==="WAITING_HUMAN_APPROVAL")?"WAITING_HUMAN_APPROVAL":"NOT_READY")
      : (humanInputs.length?"WAITING_HUMAN_APPROVAL":"PLAN_READY");
    const output={...preview,status};
    console.log(JSON.stringify(output,null,2));
    return output;
  }

  for(const item of plan){
    try{item.apply();}
    catch(error){
      const output={
        ...preview,
        status:"NOT_READY",
        failed_action:item.id,
        code:"BOOTSTRAP_APPLY_FAILED",
        detail:error.message
      };
      console.log(JSON.stringify(output,null,2));
      process.exitCode=1;
      return output;
    }
  }

  const doctor=await githubDoctor(args);
  const output={...preview,status:doctor.status,doctor};
  console.log(JSON.stringify(output,null,2));
  if(!doctor.ok) process.exitCode=1;
  return output;
}
