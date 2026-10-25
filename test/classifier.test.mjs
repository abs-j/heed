import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";
import { SEED } from "./corpus-seed.mjs";
import { HOLDOUT } from "./corpus-holdout.mjs";

const SD = globalThis.SD;
const auc = (rows) => {
  const pos = rows.filter((r) => r.y), neg = rows.filter((r) => !r.y);
  let s = 0; for (const p of pos) for (const n of neg) s += p.s > n.s ? 1 : p.s === n.s ? 0.5 : 0;
  return s / (pos.length * neg.length);
};

// Regression gate: the shipped weights must keep ranking slop above non-slop.
test("local classifier ranks the held-out set well (AUC >= 0.9)", () => {
  const a = auc(HOLDOUT.map(([y, t]) => ({ y, s: SD.localScore(t).score })));
  assert.ok(a >= 0.9, `holdout AUC ${a.toFixed(3)}`);
});

test("local classifier ranks the seed corpus well (AUC >= 0.95)", () => {
  const a = auc(SEED.map(([y, t]) => ({ y, s: SD.localScore(t).score })));
  assert.ok(a >= 0.95, `seed AUC ${a.toFixed(3)}`);
});

test("grok bait and reply filler are flagged with a reason", () => {
  const r = SD.localScore("Hey @grok pick 10 companies that won't exist in 2050. No mercy.");
  assert.ok(r.score >= 60, `score ${r.score}`);
  assert.ok(r.hits.length > 0);
  assert.ok(SD.localScore("Great point! Thanks for sharing 🙌").score >= 60);
});

test("specific personal posts stay low", () => {
  const r = SD.localScore("Shipped the fix for the race condition in our job scheduler today. Two workers were claiming the same row.");
  assert.ok(r.score <= 30, `score ${r.score}`);
});

test("one vote nudges the weights toward the label", () => {
  const t = "Quiet mornings and strong coffee are my love language";
  const before = SD.localScore(t).p;
  let w = SD.DEFAULT_WEIGHTS;
  for (let i = 0; i < 5; i++) w = SD.sgdStep(w, t, 1);
  assert.ok(SD.localScore(t, w).p > before);
});
