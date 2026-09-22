import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const issueDir=dirname(fileURLToPath(import.meta.url));
const labRoot=resolve(issueDir,"..","..");
const target=join(issueDir,"target");
const baseline="50cc7974ce9fe96237a0cf648e8a90df2f94dab0";
const agentiRepo="https://github.com/bukovskyjosef/agenti.git";

function run(command,args,cwd,{capture=false}={}){
  const r=spawnSync(command,args,{cwd,encoding:"utf8",maxBuffer:128*1024*1024,
    stdio:capture?["ignore","pipe","pipe"]:"inherit"});
  if(r.status!==0) throw new Error(command+" "+args.join(" ")+" failed with "+r.status+
    (capture?"\nstdout:\n"+(r.stdout??"")+"\nstderr:\n"+(r.stderr??""):""));
  return capture?(r.stdout??"").trim():"";
}
async function files(root){
  const out=[];
  async function walk(dir){
    for(const e of await readdir(dir,{withFileTypes:true})){
      const p=join(dir,e.name);
      if(e.isDirectory()) await walk(p); else if(e.isFile()) out.push(p);
    }
  }
  await walk(root); return out.sort();
}
async function same(a,b){
  const [aa,bb]=await Promise.all([readFile(a),readFile(b)]);
  return aa.equals(bb);
}

const remoteMain=run("git",["ls-remote",agentiRepo,"refs/heads/main"],labRoot,{capture:true}).split(/\s+/)[0];
if(remoteMain!==baseline) throw new Error("BASELINE_DRIFT: agenti/main="+remoteMain+" expected="+baseline);

const temp=await mkdtemp(join(tmpdir(),"agenti-issue24-"));
const publication=join(temp,"agenti");
try{
  run("git",["clone","-q",agentiRepo,publication],labRoot);
  run("git",["checkout","-q",baseline],publication);
  await cp(target,publication,{recursive:true,force:true});

  const targetFiles=await files(target);
  const allowed=new Set(targetFiles.map(p=>relative(target,p)));
  for(const rel of allowed){
    if(!await same(join(target,rel),join(publication,rel))) throw new Error("TARGET_COPY_MISMATCH: "+rel);
  }

  const status=run("git",["status","--porcelain=v1","--untracked-files=all"],publication,{capture:true})
    .split("\n").map(x=>x.trimEnd()).filter(Boolean);
  for(const line of status){
    const normalized = line.startsWith("?? ") ? line.slice(3) :
      (line.length >= 2 && line[1] === " " ? line.slice(2) :
      (line.length >= 3 && line[2] === " " ? line.slice(3) : line));
    const rel=normalized.trimStart().replace(/^"|"$/g,"");
    if(!allowed.has(rel)) throw new Error("PUBLICATION_SURFACE_ESCAPE: "+line+" -> "+rel);
    if(line.startsWith("D ")||line.startsWith(" D ")) throw new Error("UNDECLARED_DELETION: "+line);
  }
  console.log("Publication overlay surface: OK ("+allowed.size+" target files; "+status.length+" changed/new paths)");

  const reference=join(publication,"reference");
  for(const file of (await files(reference)).filter(x=>x.endsWith(".mjs"))){
    run(process.execPath,["--check",file],reference);
  }
  console.log("All publication .mjs syntax: OK");

  run("npm",["test"],reference);
  run("npm",["run","doctor","--","./conformance/fixtures/project-profile.valid.json"],reference);
  run("npm",["run","doctor","--","./conformance/fixtures/project-profile.routing.valid.json"],reference);
  for(const testFile of [
    "conformance/routing/static.test.mjs",
    "conformance/claims/static.test.mjs",
    "conformance/claims/recovery.test.mjs",
    "conformance/claims/cas-ambiguity.test.mjs",
    "conformance/claims/preflight-currentness.test.mjs",
    "conformance/claims/material-recovery.test.mjs",
    "conformance/single-repo-actions/static.test.mjs",
    "conformance/single-repo-actions/setup-doctor.test.mjs",
    "conformance/single-repo-actions/external-control.test.mjs",
    "conformance/single-repo-actions/local-e2e.test.mjs"
  ]) run(process.execPath,["--test",testFile],reference);

  run("npm",["test"],join(reference,"app","multi-repo-o"));

  const bootstrapTarget=join(temp,"bootstrap-target");
  run(process.execPath,[
    join(reference,"cli","agenti.mjs"),"bootstrap",
    "--target",bootstrapTarget,
    "--repository","bukovskyjosef/kvazi"
  ],publication);
  run(process.execPath,[
    join(reference,"cli","agenti.mjs"),"doctor","--target",bootstrapTarget
  ],publication);

  if(process.argv.includes("--docker")){
    run("docker",["build","-f",join(reference,"app","multi-repo-o","Dockerfile"),reference],publication);
  }

  console.log("ISSUE #24 DETERMINISTIC PUBLICATION VALIDATION: PASS");
  console.log("baseline="+baseline);
} finally {
  await rm(temp,{recursive:true,force:true});
}
