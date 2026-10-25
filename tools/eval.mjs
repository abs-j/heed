#!/usr/bin/env node
// Replays your exported votes under different settings to see what agrees best.
//
//   node tools/eval.mjs slop-detector-backup.json
//
// Export the backup from the settings page. Only votes cast on posts the model
// scored (and made after raw scores were recorded) can be replayed.
import { readFileSync } from "node:fs";
import "../lib.js";

const SD = globalThis.SD;
if (process.argv[2] === "--corpus") { await import("./eval-corpus.mjs"); process.exit(0); }
const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/eval.mjs <backup.json>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8"));
const votes = SD.scoredVotes(data.votes || []).filter((v) => typeof v.base === "number");
const slop = votes.filter((v) => v.label === "slop").length;
console.log(`${votes.length} replayable votes (${slop} slop, ${votes.length - slop} not slop).`);
if (votes.length < 8 || slop < 2 || votes.length - slop < 2) {
  console.log("Need at least 8 with 2+ of each kind. Keep voting and export again.");
  process.exit(0);
}

const current = data.settings?.sensitivity ?? 60;
const rows = [];
for (const influence of [0, 25, 50, 75, 100, 125, 150]) {
  const scoreOf = (v) => SD.finalScore(v.base, v.acct, v.acctConf, v.adjOk, influence);
  const best = SD.bestThreshold(votes, current, scoreOf);
  rows.push({ influence, threshold: best.t, agree: best.a, pct: Math.round((best.a / votes.length) * 100) });
}
console.log("\ninfluence  best threshold  agrees");
for (const r of rows) console.log(`${String(r.influence).padStart(6)}%  ${String(r.threshold).padStart(13)}  ${r.agree}/${votes.length} (${r.pct}%)`);
const top = rows.reduce((a, b) => (b.agree > a.agree ? b : a));
const none = rows.find((r) => r.influence === 0);
console.log(`\nBest: influence ${top.influence}% with sensitivity ${top.threshold} (${top.pct}%).`);
console.log(top.agree === none.agree
  ? "Account-type adjustment makes no measurable difference on your votes yet."
  : `Account-type adjustment adds ${top.agree - none.agree} correct calls over ignoring it.`);

// Where the model is most wrong, so you can look at those posts.
const scoreNow = (v) => SD.finalScore(v.base, v.acct, v.acctConf, v.adjOk, top.influence);
const wrong = votes.filter((v) => (scoreNow(v) >= top.threshold) !== (v.label === "slop"));
if (wrong.length) {
  console.log("\nDisagreements:");
  for (const v of wrong.slice(0, 10)) console.log(`  [${v.label} vs score ${scoreNow(v)}] ${v.handle ? "@" + v.handle + ": " : ""}${v.text.replace(/\s+/g, " ").slice(0, 100)}`);
}
