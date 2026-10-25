#!/usr/bin/env node
// Trains the local classifier: prior-centred logistic regression on the seed corpus
// plus (optionally) your exported votes.   node tools/train.mjs [backup.json]
import { readFileSync, writeFileSync } from "node:fs";
import { SEED } from "../test/corpus-seed.mjs";
import { vec, fit } from "./ml.mjs";

const rows = SEED.map(([y, t]) => ({ x: vec(t), y }));
if (process.argv[2]) {
  const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
  for (const v of data.votes || []) if (v.text && v.label) for (let k = 0; k < 2; k++) rows.push({ x: vec(v.text), y: v.label === "slop" ? 1 : 0 });
  console.log(`+ ${(data.votes || []).length} votes (weighted x2)`);
}
const m = fit(rows);
writeFileSync(new URL("../src/lib/weights.json", import.meta.url), JSON.stringify({ ...m, trained: { n: rows.length, at: new Date().toISOString().slice(0, 10) } }, null, 1));
console.log(`trained on ${rows.length} rows -> src/lib/weights.json. Run \`npm run build\`.`);
