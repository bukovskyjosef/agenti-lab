#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";

const SELF=fileURLToPath(import.meta.url);
const REFERENCE_ROOT=resolve(dirname(SELF),"..");
const CONTROL_ROOT=resolve(REFERENCE_ROOT,"..");
const PROFILE_ID="single-repo-actions";
const TARGET_TEMPLATE=join(REFERENCE_ROOT,"profiles",PROFILE_ID,"target");

function parseArgs(argv){
  const out={_:[]};
  const flags=new Set(["dry-run","force-generated","github","apply","event-policy-confirmed"]);
  for(let i=0;i<argv.length;i+=1){
    const arg=argv[i];
    if(!arg.startsWith("--")){out._.push(arg);continue;}
    const key=arg.slice(2);
    if(flags.has(key)){out[key]=true;continue;}
    out[key]=argv[++i];
  }
  return out;
}
async function exists(path){try{await stat(path);return true;}catch{return false;}}
function sha256(bytes){return "sha256:"+createHash("sha256").update(bytes).digest("hex");}
async function listFiles(root){
  const out=[];
  async function walk(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isDirectory()) await walk(path); else if(entry.isFile()) out.push(path);
    }
  }
  await walk(root); return out.sort();
}
async function readJson(path){return JSON.parse(await readFile(path,"utf8"));}
function sh(command,args,{capture=true,cwd=process.cwd()}={}){
  return execFileSync(command,args,{cwd,encoding:"utf8",stdio:capture?["ignore","pipe","inherit"]:"inherit"}).trim();
}
function gh(args){return sh("gh",args);}
function sourceVersion(){
  if(process.env.AGENTI_SOURCE_VERSION) return process.env.AGENTI_SOURCE_VERSION;
  try{return sh("git",["rev-parse","HEAD"],{cwd:CONTROL_ROOT});}catch{return "unbound-source";}
}
async function sourcePlan(){
  const out=[];
  for(const source of await listFiles(TARGET_TEMPLATE)){
    out.push({source,targetRel:relative(TARGET_TEMPLATE,source),content:await readFile(source),kind:"trusted-transport"});
  }
  return out;
}
async function previousManifest(targetRoot){
  const p=join(targetRoot,".agenti","installed-manifest.json");
  return await exists(p)?readJson(p):null;
}
async function bootstrap(args){
  const targetRoot=resolve(args.target??process.cwd());
  const repository=args.repository??null;
  const plan=await sourcePlan();
  const prior=await previousManifest(targetRoot);
  const priorMap=new Map((prior?.files??[]).map(x=>[x.path,x.sha256]));
  const conflicts=[],writes=[];
  for(const item of plan){
    const target=join(targetRoot,item.targetRel);
    const next=sha256(item.content);
    if(await exists(target)){
      const current=sha256(await readFile(target));
      const owned=priorMap.get(item.targetRel);
      if(current!==next && (!owned || current!==owned) && !args["force-generated"]){conflicts.push(item.targetRel);continue;}
      if(current===next) continue;
    }
    writes.push({...item,target,sha256:next});
  }
  if(conflicts.length) throw new Error("Refusing to overwrite unowned/locally modified transport files:\n- "+conflicts.join("\n- "));
  const manifest={
    schema_version:2,
    profile:PROFILE_ID,
    source_version:sourceVersion(),
    ownership:"stable-transport-only",
    files:plan.map(x=>({path:x.targetRel,sha256:sha256(x.content),kind:x.kind})).sort((a,b)=>a.path.localeCompare(b.path))
  };
  if(!args["dry-run"]){
    for(const item of writes){await mkdir(dirname(item.target),{recursive:true});await writeFile(item.target,item.content);}
    const mp=join(targetRoot,".agenti","installed-manifest.json");
    await mkdir(dirname(mp),{recursive:true});await writeFile(mp,JSON.stringify(manifest,null,2)+"\n");
  }
  const registry=await readJson(join(CONTROL_ROOT,"projects","registry.yml"));
  const mapping=repository?registry.projects?.[repository]:null;
  const projectId=args["project-id"]??repository?.split("/").at(-1);
  const selectedProfile=args.profile??"automated";
  const humanPrincipal =
    args["human-login"] && args["human-actor-id"]
      ? { login: args["human-login"], actor_id: Number(args["human-actor-id"]) }
      : null;
  const billingAttestation =
    selectedProfile==="automated" &&
    args["claude-no-paid-spillover-until"] &&
    args["billing-attestation-ref"] &&
    humanPrincipal
      ? {
          runner_candidate_id:"claude-subscription",
          status:"VERIFIED_NO_PAID_SPILLOVER",
          observed_at:args["billing-observed-at"]??new Date().toISOString(),
          valid_until:args["claude-no-paid-spillover-until"],
          source:{kind:"ADMIN_POLICY_ATTESTATION",trust:"EXTERNAL_CURRENT_EVIDENCE"},
          attested_by:{
            actor_id:humanPrincipal.actor_id,
            evidence_ref:args["billing-attestation-ref"]
          }
        }
      : null;
  const registration=repository&&!mapping?{
    repository,
    required_control_plane_candidate:{
      project_id:projectId,
      project_control:"projects/"+projectId+"/project.yml",
      selected_profile:selectedProfile
    },
    project_control_candidate:{
      schema_version:1,
      project_id:projectId,
      repository,
      selected_profile:selectedProfile,
      human_principals:humanPrincipal?[humanPrincipal]:[],
      ...(billingAttestation?{runner_evidence:{billing_safety:[billingAttestation]}}:{})
    },
    missing_human_inputs:[
      ...(!humanPrincipal?["human principal login + actor id"]:[]),
      ...(selectedProfile==="automated"&&!billingAttestation
        ? ["current Claude no-paid-spillover attestation + validity + durable evidence ref"]
        : [])
    ],
    status:"WAITING_CONTROL_PLANE_ENROLLMENT"
  }:null;
  console.log(JSON.stringify({
    command:"bootstrap",target:targetRoot,dry_run:Boolean(args["dry-run"]),
    write_count:writes.length,file_count:plan.length,source_version:manifest.source_version,
    registry_status:mapping?"REGISTERED":registration?.status??"REPOSITORY_NOT_SUPPLIED",
    registration_candidate:registration
  },null,2));
  if(!args["dry-run"]) console.log("Next: review/commit the generated stable transport candidate, complete any control-plane enrollment, then run doctor --github from the trusted default branch.");
}
function decodeGhContent(payload){return Buffer.from(payload.content.replace(/\n/g,""),"base64");}
function ghJson(args){return JSON.parse(gh(args));}
function ghFile(repository,path,ref){
  return decodeGhContent(ghJson(["api","repos/"+repository+"/contents/"+path+"?ref="+encodeURIComponent(ref)]));
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
  if(!text.includes("Trusted T0 bootstrap") && !path.endsWith("agenti-reconcile.yml")) errors.push(path+" missing trusted T0");
}
async function localDoctor(targetRoot){
  const errors=[];
  const manifest=await previousManifest(targetRoot);
  if(!manifest) errors.push("installed manifest missing");
  for(const item of manifest?.files??[]){
    const p=join(targetRoot,item.path);
    if(!await exists(p)){errors.push("installed transport missing: "+item.path);continue;}
    if(sha256(await readFile(p))!==item.sha256) errors.push("local transport drift: "+item.path);
  }
  for(const forbidden of [".agenti-runtime",".agenti/project-profile.json",".agenti/single-repo-actions.json",".agenti/prompts"]){
    if(await exists(join(targetRoot,forbidden))) errors.push("obsolete mutable product-local control asset present: "+forbidden);
  }
  const agents=join(targetRoot,"AGENTS.md");
  if(await exists(agents) && !(await readFile(agents,"utf8")).includes("agenti-control-plane:")) errors.push("trusted AGENTS locator marker missing");
  for(const p of (manifest?.files??[]).filter(x=>x.path.includes(".github/workflows/"))){
    validateLauncherText(p.path,(await readFile(join(targetRoot,p.path),"utf8")),errors);
  }
  return {ok:errors.length===0,errors,manifest};
}
async function githubDoctor(args){
  const errors=[],warnings=[];
  const repo=args.repository??ghJson(["repo","view","--json","nameWithOwner"]).nameWithOwner;
  const meta=ghJson(["api","repos/"+repo]);
  const defaultBranch=meta.default_branch;
  const productSha=ghJson(["api","repos/"+repo+"/branches/"+encodeURIComponent(defaultBranch)]).commit.sha;
  const bootstrap=JSON.parse(ghFile(repo,".agenti/bootstrap.json",productSha).toString("utf8"));
  const agents=ghFile(repo,"AGENTS.md",productSha).toString("utf8");
  const marker=agents.match(/<!--\s*agenti-control-plane:\s*([^\s]+)\s*-->/i)?.[1];
  if(!marker || marker!==bootstrap.control_plane_repository) errors.push("trusted bootstrap locator mismatch");
  const controlRepo=bootstrap.control_plane_repository;
  const controlMeta=ghJson(["api","repos/"+controlRepo]);
  const controlSha=ghJson(["api","repos/"+controlRepo+"/branches/"+encodeURIComponent(controlMeta.default_branch)]).commit.sha;
  const registry=JSON.parse(ghFile(controlRepo,"projects/registry.yml",controlSha).toString("utf8"));
  const mapping=registry.projects?.[repo];
  if(!mapping) errors.push("control-plane registry mapping missing for "+repo);
  let project=null;
  if(mapping){
    project=JSON.parse(ghFile(controlRepo,mapping.project_control,controlSha).toString("utf8"));
    if(project.repository!==repo||project.project_id!==mapping.project_id) errors.push("project-control mapping inconsistent");
  }
  const actions=ghJson(["api","repos/"+repo+"/actions/permissions"]);
  if(!actions.enabled) errors.push("GitHub Actions disabled");
  let workflowPermissions=null;
  try{
    workflowPermissions=ghJson(["api","repos/"+repo+"/actions/permissions/workflow"]);
    if(!workflowPermissions.can_approve_pull_request_reviews){
      errors.push("GitHub Actions cannot create/approve pull requests; enable repository workflow PR permission");
    }
  }catch(error){
    errors.push("GitHub Actions workflow PR permission not inspectable: "+error.message);
  }
  if(mapping?.selected_profile==="automated" || mapping?.selected_profile==="single-repo-actions"){
    const expected=await sourcePlan();
    for(const item of expected.filter(x=>x.targetRel.includes(".github/workflows/")||x.targetRel.includes(".agenti-bootstrap/")||x.targetRel==="AGENTS.md"||x.targetRel===".agenti/bootstrap.json")){
      let actual;
      try{actual=ghFile(repo,item.targetRel,productSha);}catch{errors.push("trusted transport missing on default branch: "+item.targetRel);continue;}
      if(sha256(actual)!==sha256(item.content)) errors.push("trusted transport drift: "+item.targetRel);
      if(item.targetRel.includes(".github/workflows/")) validateLauncherText(item.targetRel,actual.toString("utf8"),errors);
    }
    const runtime=JSON.parse(ghFile(controlRepo,"profiles/automated/single-repo-actions/runtime.json",controlSha).toString("utf8"));
    const secretNames=new Set(ghJson(["secret","list","--repo",repo,"--json","name"]).map(x=>x.name));
    for(const name of runtime.runner?.required_secret_names??[]){
      if(!secretNames.has(name)) errors.push("required provider secret metadata missing: "+name);
    }
    const principals=new Set((project?.human_principals??[]).map(x=>Number(x.actor_id)));
    const claudeSafety=(project?.runner_evidence?.billing_safety??[])
      .filter(x=>x.runner_candidate_id==="claude-subscription")
      .sort((a,b)=>Date.parse(b.observed_at??0)-Date.parse(a.observed_at??0))[0];
    if(!claudeSafety){
      errors.push("current Claude no-paid-spillover project-control attestation missing");
    } else {
      if(claudeSafety.status!=="VERIFIED_NO_PAID_SPILLOVER") errors.push("Claude billing-safety status is not VERIFIED_NO_PAID_SPILLOVER");
      if(claudeSafety.source?.kind!=="ADMIN_POLICY_ATTESTATION"||claudeSafety.source?.trust!=="EXTERNAL_CURRENT_EVIDENCE") errors.push("Claude billing-safety source is not trusted admin policy evidence");
      if(!principals.has(Number(claudeSafety.attested_by?.actor_id))) errors.push("Claude billing-safety attestor is not a configured H principal");
      if(!claudeSafety.attested_by?.evidence_ref) errors.push("Claude billing-safety durable attestation ref missing");
      if(!claudeSafety.valid_until||Date.parse(claudeSafety.valid_until)<Date.now()) errors.push("Claude billing-safety attestation expired");
    }
    if(!args["event-policy-confirmed"]){
      warnings.push("effective organization/enterprise pull_request_target policy not proven by repository Actions permissions endpoint");
      errors.push("EVENT_POLICY_NOT_INSPECTABLE: rerun only after authorized policy confirmation or with an integration that can inspect effective higher-level policy");
    }
  }
  return {ok:errors.length===0,errors,warnings,repository:repo,default_branch:defaultBranch,product_bootstrap_sha:productSha,control_plane_repository:controlRepo,control_plane_sha:controlSha,project_id:mapping?.project_id??null,selected_profile:mapping?.selected_profile??null};
}
async function setupGithub(args){
  const repo=args.repository??ghJson(["repo","view","--json","nameWithOwner"]).nameWithOwner;
  const actions=ghJson(["api","repos/"+repo+"/actions/permissions"]);
  if(!actions.enabled) throw new Error("NOT_READY: GitHub Actions disabled");
  const workflowPermissions=ghJson(["api","repos/"+repo+"/actions/permissions/workflow"]);
  if(!workflowPermissions.can_approve_pull_request_reviews){
    try{
      gh([
        "api","--method","PUT","repos/"+repo+"/actions/permissions/workflow",
        "-f","default_workflow_permissions="+(workflowPermissions.default_workflow_permissions??"read"),
        "-F","can_approve_pull_request_reviews=true"
      ]);
    }catch(error){
      throw new Error(
        "HUMAN_ADMIN_BOUNDARY: cannot enable GitHub Actions PR creation/approval permission for "+
        repo+". Enable Settings > Actions > General > Workflow permissions > Allow GitHub Actions to create and approve pull requests. "+
        error.message
      );
    }
  }
  const labels={
    "agenti:managed":"1d76db","agenti:waiting-human":"fbca04","agenti:release-approval":"d93f0b",
    "agenti:blocked":"b60205","agenti:stopped":"5319e7","agenti:done":"0e8a16"
  };
  for(const [name,color] of Object.entries(labels)){
    gh(["label","create",name,"--repo",repo,"--force","--color",color,"--description","Agenti durable state projection"]);
  }
  gh(["variable","set","AGENTI_TEST_MODE","--repo",repo,"--body","false"]);
  console.log(JSON.stringify({repository:repo,status:"AUTO_SETUP_APPLIED",human_boundary:"Confirm effective org/enterprise Actions policy permits trusted pull_request_target; configure required secret values out-of-band."},null,2));
}
async function enroll(args){
  const issue=Number(args.issue??args._[0]);
  if(!Number.isInteger(issue)||issue<=0) throw new Error("enroll requires --issue N");
  const repo=args.repository??ghJson(["repo","view","--json","nameWithOwner"]).nameWithOwner;
  const item=ghJson(["issue","view",String(issue),"--repo",repo,"--json","number,state,title,labels,body"]);
  const pulls=ghJson(["pr","list","--repo",repo,"--state","all","--json","number,headRefOid,baseRefName,title"]);
  const report={
    repository:repo,issue:item.number,state:item.state,title:item.title,
    current_labels:item.labels.map(x=>x.name),
    candidate_prs:pulls.filter(x=>String(x.title).includes("#"+issue)),
    inferred_lifecycle:item.state==="OPEN"?"NEEDS_RECONSTRUCTION":"CLOSED",
    evidence_boundary:"Existing review/check evidence is reusable only when exact candidate/contract dependencies can be bound; otherwise it is unverified/stale.",
    action:args.apply?"APPLY_MANAGED_LABEL":"DRY_RUN"
  };
  console.log(JSON.stringify(report,null,2));
  if(args.apply) gh(["issue","edit",String(issue),"--repo",repo,"--add-label","agenti:managed"]);
}
async function main(){
  const [command="doctor",...rest]=process.argv.slice(2); const args=parseArgs(rest);
  const target=resolve(args.target??process.cwd());
  if(["bootstrap","install","update"].includes(command)) return bootstrap(args);
  if(command==="setup-github") return setupGithub(args);
  if(command==="enroll") return enroll(args);
  if(command==="doctor"){
    const result=args.github?await githubDoctor(args):await localDoctor(target);
    console.log(JSON.stringify({command:"doctor",...result},null,2));
    if(!result.ok) process.exitCode=1;
    return;
  }
  throw new Error("Commands: bootstrap|update|doctor [--github]|setup-github|enroll --issue N [--apply]");
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
