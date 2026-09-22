#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { githubDoctor as effectiveGithubDoctor, setupGithub as effectiveSetupGithub } from "./github-setup.mjs";

const SELF=fileURLToPath(import.meta.url);
const REFERENCE_ROOT=resolve(dirname(SELF),"..");
const CONTROL_ROOT=resolve(REFERENCE_ROOT,"..");
const PROFILE_ID="single-repo-actions";
const TARGET_TEMPLATE=join(REFERENCE_ROOT,"profiles",PROFILE_ID,"target");

function parseArgs(argv){
  const out={_:[]};
  const flags=new Set(["dry-run","force-generated","github","apply"]);
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
async function githubDoctor(args){ return effectiveGithubDoctor(args); }
async function setupGithub(args){ return effectiveSetupGithub(args); }
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
