import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../github-app-manifest.template.json", import.meta.url), "utf8");
const publicBaseUrl = process.env.AGENTI_PUBLIC_BASE_URL;
if (!publicBaseUrl) throw new Error("AGENTI_PUBLIC_BASE_URL is required");
process.stdout.write(template.replaceAll("${PUBLIC_BASE_URL}", publicBaseUrl.replace(/\/$/, "")));
