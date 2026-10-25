#!/usr/bin/env node
// Micro-benchmark of the on-device classifier: how long scoring one post takes.
import "../lib.js";
import { SEED } from "../test/corpus-seed.mjs";
import { HOLDOUT } from "../test/corpus-holdout.mjs";
const SD = globalThis.SD;
const texts = [...SEED, ...HOLDOUT].map((r) => r[1]);
const long = texts.join(" ").slice(0, 1500);
for (let i = 0; i < 200; i++) SD.localScore(texts[i % texts.length]); // warm up
const run = (label, list, reps) => {
  const t0 = performance.now();
  for (let r = 0; r < reps; r++) for (const t of list) SD.localScore(t);
  const ms = (performance.now() - t0) / (reps * list.length);
  console.log(`${label.padEnd(26)} ${(ms * 1000).toFixed(0).padStart(5)} µs/post`);
  return ms;
};
const typical = run("typical post (~140 chars)", texts, 20);
run("long post (1500 chars)", [long], 200);
console.log(typical < 2 ? "within the 2 ms/post budget" : "OVER the 2 ms/post budget");
process.exit(typical < 2 ? 0 : 1);
