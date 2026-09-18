import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function loadApprovedCore(env = process.env) {
  const moduleUrl = env.AGENTI_CORE_MODULE ? pathToFileURL(resolve(env.AGENTI_CORE_MODULE)).href : new URL("../../../core/index.mjs", import.meta.url).href;
  const transitionsUrl = env.AGENTI_TRANSITIONS_PATH ? pathToFileURL(resolve(env.AGENTI_TRANSITIONS_PATH)) : new URL("../../../core/transitions.json", import.meta.url);
  const core = await import(moduleUrl);
  const transitionTable = JSON.parse(await readFile(transitionsUrl, "utf8"));
  return { core, transitionTable };
}
