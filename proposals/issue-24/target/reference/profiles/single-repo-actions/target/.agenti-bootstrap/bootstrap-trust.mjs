#!/usr/bin/env node
import { readFile, rm, mkdir, appendFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const API = "https://api.github.com";
const token = process.env.GITHUB_TOKEN;
const targetRepository = process.env.GITHUB_REPOSITORY;
const runnerTemp = process.env.RUNNER_TEMP;
if (!token) throw new Error("GITHUB_TOKEN is required");
if (!targetRepository || !targetRepository.includes("/")) throw new Error("GITHUB_REPOSITORY owner/name is required");
if (!runnerTemp) throw new Error("RUNNER_TEMP is required");

async function api(path) {
  const response = await fetch(API + path, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: "Bearer " + token,
      "x-github-api-version": "2022-11-28"
    }
  });
  if (!response.ok) throw new Error("GitHub API GET " + path + " failed " + response.status);
  return response.json();
}
function repoPath(repository, suffix = "") {
  const [owner, repo] = repository.split("/");
  return "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + suffix;
}
function exactSha(value, name) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? "")) throw new Error(name + " is not an exact SHA");
  return value.toLowerCase();
}
function run(command,args,opts={}) {
  const result=spawnSync(command,args,{encoding:"utf8",stdio:opts.capture?["ignore","pipe","pipe"]:"inherit"});
  if(result.status!==0) throw new Error(command+" "+args.join(" ")+" failed"+(result.stderr?": "+result.stderr:""));
  return result.stdout?.trim() ?? "";
}
async function env(name,value) {
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, name+"="+value+"\n");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, name.toLowerCase()+"="+value+"\n");
}

const targetMeta=await api(repoPath(targetRepository));
const defaultBranch=targetMeta.default_branch;
const targetBranch=await api(repoPath(targetRepository,"/branches/"+encodeURIComponent(defaultBranch)));
const productBootstrapSha=exactSha(targetBranch.commit.sha,"product_bootstrap_sha");

const githubSha=exactSha(process.env.GITHUB_SHA,"GITHUB_SHA");
if (githubSha !== productBootstrapSha) {
  throw new Error("TRUSTED_PRODUCT_SHA_DRIFT: running "+githubSha+" current default "+productBootstrapSha);
}
if (process.env.GITHUB_REF && process.env.GITHUB_REF !== "refs/heads/"+defaultBranch) {
  throw new Error("TRUSTED_PRODUCT_REF_MISMATCH: "+process.env.GITHUB_REF+" != refs/heads/"+defaultBranch);
}

const bootstrap=JSON.parse(await readFile(".agenti/bootstrap.json","utf8"));
const trustedAgents=await readFile("AGENTS.md","utf8");
const marker=trustedAgents.match(/<!--\s*agenti-control-plane:\s*([^\s]+)\s*-->/i)?.[1];
if (!marker || marker !== bootstrap.control_plane_repository) {
  throw new Error("TRUSTED_BOOTSTRAP_LOCATOR_MISMATCH");
}
const controlRepository=bootstrap.control_plane_repository;
if (!/^[^/]+\/[^/]+$/.test(controlRepository)) throw new Error("Invalid control_plane_repository");

const controlMeta=await api(repoPath(controlRepository));
const controlBranchName=controlMeta.default_branch;
const controlBranch=await api(repoPath(controlRepository,"/branches/"+encodeURIComponent(controlBranchName)));
const controlPlaneSha=exactSha(controlBranch.commit.sha,"control_plane_sha");

const controlRoot=join(runnerTemp,"agenti-control");
await rm(controlRoot,{recursive:true,force:true});
await mkdir(controlRoot,{recursive:true});
run("git",["init","-q",controlRoot]);
run("git",["-C",controlRoot,"remote","add","origin","https://github.com/"+controlRepository+".git"]);
run("git",["-C",controlRoot,"fetch","-q","--depth=1","origin",controlPlaneSha]);
run("git",["-C",controlRoot,"checkout","-q","--detach","FETCH_HEAD"]);

const registry=JSON.parse(await readFile(join(controlRoot,"projects","registry.yml"),"utf8"));
const mapping=registry.projects?.[targetRepository];
if (!mapping) throw new Error("CONTROL_PLANE_PROJECT_MAPPING_MISSING: "+targetRepository);
if (!mapping.project_id || !mapping.project_control || !mapping.selected_profile) {
  throw new Error("CONTROL_PLANE_PROJECT_MAPPING_INVALID");
}
const project=JSON.parse(await readFile(join(controlRoot,mapping.project_control),"utf8"));
if (project.repository !== targetRepository || project.project_id !== mapping.project_id) {
  throw new Error("CONTROL_PLANE_PROJECT_MAPPING_INCONSISTENT");
}

const trust={
  product_bootstrap_sha:productBootstrapSha,
  control_plane_repository:controlRepository,
  control_plane_sha:controlPlaneSha,
  project_id:mapping.project_id,
  profile_id:mapping.selected_profile
};
await writeFile(join(runnerTemp,"agenti-trust.json"),JSON.stringify(trust,null,2)+"\n");

for (const [name,value] of Object.entries({
  AGENTI_CONTROL_ROOT:controlRoot,
  AGENTI_TARGET_REPOSITORY:targetRepository,
  AGENTI_PRODUCT_BOOTSTRAP_SHA:productBootstrapSha,
  AGENTI_CONTROL_PLANE_REPOSITORY:controlRepository,
  AGENTI_CONTROL_PLANE_SHA:controlPlaneSha,
  AGENTI_PROJECT_ID:mapping.project_id,
  AGENTI_SELECTED_PROFILE:mapping.selected_profile,
  AGENTI_DEFAULT_BRANCH:defaultBranch
})) await env(name,value);

console.log("agenti trusted bootstrap: OK");
console.log("- product_bootstrap_sha: "+productBootstrapSha);
console.log("- control_plane_sha: "+controlPlaneSha);
console.log("- project/profile: "+mapping.project_id+"/"+mapping.selected_profile);
