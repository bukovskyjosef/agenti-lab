#!/usr/bin/env node
import fs from "node:fs";

const statePath=process.env.FAKE_GH_STATE;
if(!statePath){
  process.stderr.write("FAKE_GH_STATE missing\n");
  process.exit(2);
}
const state=JSON.parse(fs.readFileSync(statePath,"utf8"));
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2)+"\n");
const output=value=>{
  if(value===undefined||value===null) return;
  process.stdout.write(typeof value==="string"?value:JSON.stringify(value));
};
const fail=message=>{
  process.stderr.write(String(message)+"\n");
  process.exit(1);
};
const stdin=()=>fs.readFileSync(0,"utf8");

function stripHeaders(args){
  const out=[];
  for(let i=0;i<args.length;i+=1){
    if(args[i]==="-H"||args[i]==="--header"){i+=1;continue;}
    out.push(args[i]);
  }
  return out;
}
function bodyFrom(args){
  const index=args.indexOf("--input");
  if(index>=0&&args[index+1]==="-"){
    const raw=stdin();
    return raw?JSON.parse(raw):{};
  }
  return null;
}
function methodAndPath(args){
  let method="GET";
  const m=args.indexOf("--method");
  if(m>=0) method=args[m+1];
  const clean=args.filter((value,index)=>(m<0||(index!==m&&index!==m+1))&&value!=="--input"&&args[index-1]!=="--input");
  const path=clean.find(value=>!value.startsWith("-"));
  return {method,path,body:bodyFrom(args)};
}
function repoState(repo){
  if(!state.repos?.[repo]) fail("repo not found: "+repo);
  return state.repos[repo];
}
function contents(repo,path){
  const value=state.contents?.[repo]?.[path];
  if(value===undefined) fail("content not found: "+repo+" "+path);
  return {content:Buffer.from(value,"utf8").toString("base64"),encoding:"base64"};
}
function policySummary(repo,policy){
  return {
    id:policy.id,
    name:policy.name,
    source_type:policy.source_type??"Repository",
    enforcement:policy.enforcement,
    _links:{self:{href:"https://api.github.com/repos/"+repo+"/actions/policies/"+policy.id}}
  };
}

let args=process.argv.slice(2);
const command=args.shift();

if(command==="api"){
  args=stripHeaders(args);
  const {method,path,body}=methodAndPath(args);
  if(!path) fail("api path missing");

  let match=path.match(/^repos\/([^/]+\/[^/]+)\/contents\/(.+?)(?:\?ref=.*)?$/);
  if(method==="GET"&&match){
    output(contents(match[1],decodeURIComponent(match[2])));
    process.exit(0);
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/branches\/([^/?]+)$/);
  if(method==="GET"&&match){
    const repo=match[1];
    output({name:decodeURIComponent(match[2]),commit:{sha:state.branches[repo]}});
    process.exit(0);
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/actions\/permissions\/workflow$/);
  if(match){
    const repo=match[1];
    state.workflowPermissions??={};
    if(method==="GET"){output(state.workflowPermissions[repo]??{default_workflow_permissions:"read",can_approve_pull_request_reviews:false});process.exit(0);}
    if(method==="PUT"){state.workflowPermissions[repo]={...(state.workflowPermissions[repo]??{}),...body};save();output({});process.exit(0);}
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/actions\/permissions\/selected-actions$/);
  if(method==="GET"&&match){
    output(state.selectedActions?.[match[1]]??{github_owned_allowed:true,verified_allowed:false,patterns_allowed:[]});
    process.exit(0);
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/actions\/permissions$/);
  if(match){
    const repo=match[1];
    state.actions??={};
    if(method==="GET"){output(state.actions[repo]??{enabled:true,allowed_actions:"all"});process.exit(0);}
    if(method==="PUT"){state.actions[repo]={...(state.actions[repo]??{}),...body};save();output({});process.exit(0);}
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/actions\/policies(?:\?([^#]+))?$/);
  if(match){
    const repo=match[1];
    state.policies??={};
    state.parentPolicies??={};
    state.policies[repo]??=[];
    if(method==="GET"){
      const params=new URLSearchParams(match[2]??"");
      const includeParents=params.get("has_parents")!=="false";
      const all=[...state.policies[repo],...(includeParents?(state.parentPolicies[repo]??[]):[])];
      output({total_count:all.length,policies:all.map(policy=>policySummary(repo,policy))});
      process.exit(0);
    }
    if(method==="POST"){
      const next=Math.max(0,...state.policies[repo].map(item=>Number(item.id)))+1;
      const policy={...body,id:next,source_type:"Repository"};
      state.policies[repo].push(policy);
      save();
      output(policy);
      process.exit(0);
    }
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/actions\/policies\/(\d+)$/);
  if(match){
    const repo=match[1],id=Number(match[2]);
    const list=[...(state.policies?.[repo]??[]),...(state.parentPolicies?.[repo]??[])];
    const index=list.findIndex(item=>Number(item.id)===id);
    if(index<0) fail("policy not found");
    if(method==="GET"){output(list[index]);process.exit(0);}
    if(method==="PUT"){
      const own=state.policies?.[repo]??[];
      const ownIndex=own.findIndex(item=>Number(item.id)===id);
      if(ownIndex<0) fail("cannot mutate parent policy");
      own[ownIndex]={...own[ownIndex],...body,id,source_type:"Repository"};
      save();
      output(own[ownIndex]);
      process.exit(0);
    }
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/rulesets(?:\?[^#]+)?$/);
  if(match){
    const repo=match[1];
    state.rulesets??={};
    state.rulesets[repo]??=[];
    if(method==="GET"){output(state.rulesets[repo].map(item=>({id:item.id,name:item.name,enforcement:item.enforcement})));process.exit(0);}
    if(method==="POST"){
      const next=Math.max(0,...state.rulesets[repo].map(item=>Number(item.id)))+1;
      const item={...body,id:next};
      state.rulesets[repo].push(item);save();output(item);process.exit(0);
    }
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/rulesets\/(\d+)(?:\?[^#]+)?$/);
  if(match){
    const repo=match[1],id=Number(match[2]);
    const list=state.rulesets?.[repo]??[];
    const index=list.findIndex(item=>Number(item.id)===id);
    if(index<0) fail("ruleset not found");
    if(method==="GET"){output(list[index]);process.exit(0);}
    if(method==="PUT"){list[index]={...body,id};save();output(list[index]);process.exit(0);}
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/branches\/([^/]+)\/protection\/required_status_checks$/);
  if(method==="GET"&&match){
    const repo=match[1];
    const bp=state.branchProtection?.[repo];
    if(!bp?.required_status_checks) fail("required status checks not configured");
    output(bp.required_status_checks);
    process.exit(0);
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/branches\/([^/]+)\/protection$/);
  if(match){
    const repo=match[1];
    state.branchProtection??={};
    if(method==="GET"){
      if(!state.branchProtection[repo]) fail("branch protection missing");
      output(state.branchProtection[repo]);process.exit(0);
    }
    if(method==="PUT"){state.branchProtection[repo]=body;save();output(body);process.exit(0);}
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)\/environments\/(.+)$/);
  if(match){
    const repo=match[1],name=decodeURIComponent(match[2]);
    state.environments??={};
    state.environments[repo]??={};
    if(method==="GET"){
      if(!state.environments[repo][name]) fail("environment missing");
      output(state.environments[repo][name]);process.exit(0);
    }
    if(method==="PUT"){
      state.environments[repo][name]={name,...body,protection_rules:body.protection_rules??[]};
      save();output(state.environments[repo][name]);process.exit(0);
    }
  }

  match=path.match(/^repos\/([^/]+\/[^/]+)$/);
  if(match){
    const repo=match[1];
    if(method==="GET"){output(repoState(repo));process.exit(0);}
    if(method==="PATCH"){
      state.repos[repo]={...repoState(repo),...body};
      save();output(state.repos[repo]);process.exit(0);
    }
  }

  fail("unsupported fake api: "+method+" "+path);
}

if(command==="label"){
  const sub=args.shift();
  const repo=args[args.indexOf("--repo")+1];
  state.labels??={};state.labels[repo]??=[];
  if(sub==="list"){output(state.labels[repo]);process.exit(0);}
  if(sub==="create"){
    const name=args.shift();
    const color=args[args.indexOf("--color")+1];
    const description=args[args.indexOf("--description")+1];
    const existing=state.labels[repo].find(item=>item.name===name);
    if(existing){existing.color=color;existing.description=description;}
    else state.labels[repo].push({name,color,description});
    save();process.exit(0);
  }
}

if(command==="variable"){
  const sub=args.shift();
  const repo=args[args.indexOf("--repo")+1];
  state.variables??={};state.variables[repo]??={};
  if(sub==="list"){
    output(Object.entries(state.variables[repo]).map(([name,value])=>({name,value:String(value)})));
    process.exit(0);
  }
  if(sub==="set"){
    const name=args.shift();
    const value=args[args.indexOf("--body")+1];
    state.variables[repo][name]=value;save();process.exit(0);
  }
}

if(command==="secret"){
  const sub=args.shift();
  const repo=args[args.indexOf("--repo")+1];
  state.secrets??={};state.secrets[repo]??=[];
  if(sub==="list"){output(state.secrets[repo].map(name=>({name})));process.exit(0);}
  if(sub==="set"){
    const name=args.shift();
    const value=stdin();
    if(!value) fail("secret stdin empty");
    if(!state.secrets[repo].includes(name)) state.secrets[repo].push(name);
    state.secret_upload_count=(state.secret_upload_count??0)+1;
    save();process.exit(0);
  }
}

if(command==="repo"&&args[0]==="view"){
  const repo=process.env.FAKE_GH_REPOSITORY??"example/product";
  output({nameWithOwner:repo});
  process.exit(0);
}

fail("unsupported fake gh command: "+command+" "+args.join(" "));
