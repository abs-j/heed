#!/usr/bin/env node
// Builds the Chrome Web Store zip: only the files the extension needs at runtime, with
// manifest.json at the root. Checks a few things the store would otherwise reject later.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";

execFileSync("node", ["tools/build.mjs"], { stdio: "inherit" });

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const FILES = ["manifest.json", "background.js", "content.js", "content.css", "lib.js",
  "popup.html", "popup.js", "popup.css", "options.html", "options.js", "options.css", "icons"];

const problems = [];
if (manifest.version !== pkg.version) problems.push(`manifest version ${manifest.version} != package.json ${pkg.version}`);
if (manifest.description.length > 132) problems.push(`description is ${manifest.description.length} chars (max 132)`);
if (manifest.name.length > 75) problems.push(`name is ${manifest.name.length} chars (max 75)`);
for (const f of FILES) if (!existsSync(f)) problems.push(`missing ${f}`);
for (const i of ["16", "48", "128"]) if (!existsSync(`icons/${i}.png`)) problems.push(`missing icons/${i}.png`);
for (const p of [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])]) {
  if (/^(?:https?|\*):\/\/(?:\*|\*\.\w+)\/\*$/.test(p) || p === "<all_urls>") problems.push(`broad host permission ${p}`);
}
if (problems.length) { console.error("Not packing:\n - " + problems.join("\n - ")); process.exit(1); }

mkdirSync("dist", { recursive: true });
const out = `dist/heed-${manifest.version}.zip`;
if (existsSync(out)) rmSync(out);
execFileSync("zip", ["-r", "-q", out, ...FILES, "-x", "*.DS_Store"], { stdio: "inherit" });
console.log(execFileSync("unzip", ["-l", out]).toString().trim().split("\n").slice(-12).join("\n"));
console.log(`\n${out}  (${(statSync(out).size / 1024).toFixed(0)} KB)`);
