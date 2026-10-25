import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";
import { RAGE_SEED, RAGE_HOLDOUT } from "./rage-corpus.mjs";

const SD = globalThis.SD;
const score = (t, hints) => SD.rage.localRage(t, hints).score;
const auc = (rows) => {
  const pos = rows.filter((r) => r.y), neg = rows.filter((r) => !r.y);
  let s = 0; for (const p of pos) for (const n of neg) s += p.s > n.s ? 1 : p.s === n.s ? 0.5 : 0;
  return s / (pos.length * neg.length);
};

test("rage scorer ranks rage bait above everything else (seed and held-out)", () => {
  for (const [name, set] of [["seed", RAGE_SEED], ["holdout", RAGE_HOLDOUT]]) {
    const a = auc(set.map(([y, t]) => ({ y, s: score(t) })));
    assert.ok(a >= 0.9, `${name} AUC ${a.toFixed(3)}`);
  }
});

test("news and reasoned commentary are not rage bait, even when angry or political", () => {
  assert.ok(score("JUST IN: The Senate voted 52-48 to confirm the nominee, according to a statement from the majority leader's office.") < 30);
  assert.ok(score("This ruling is outrageous. The statute only covers contracts signed after 2022, and the opinion skips that entirely.") < 40);
  assert.ok(score("Furious about the layoffs today: the company posted $2B profit and still cut 12% of staff, per the memo.") < 40);
});

test("mockery of a group with nothing new is rage bait", () => {
  assert.ok(score('Muslims be like "Ramadan is so hard" but its literally just skipping lunch for a month? Your "fast" only lasts like 10 hours!') >= 60);
  assert.ok(score("why are white people so afraid of becoming a minority? does the US treat minorities poorly or something?") >= 60);
});

test("a fresh post with reporting gets extra benefit of the doubt", () => {
  const t = "Government announces new border policy, officials say it starts Monday and they are furious about it";
  assert.ok(score(t, { ageHours: 2 }) <= score(t, { ageHours: 500 }));
});

test("router asks the AI model when rage is unsure, and settles locally when sure", () => {
  const o = { mode: "tiered", low: 20, high: 90, llmReady: true };
  assert.equal(SD.router.route(5, { ...o, rage: { on: true, score: 50 } }).use, "llm");
  assert.equal(SD.router.route(5, { ...o, rage: { on: true, score: 10 } }).use, "local");
  assert.equal(SD.router.route(5, { ...o, rage: { on: false, score: 50 } }).use, "local");
});

test("rage votes refit the scorer within bounds and parse() carries the rage field", () => {
  const votes = [
    ...["Gamers be like I'm a sigma lol", "Streamers be like I'm so humble", "Cyclists be like I'm saving the planet", "Runners be like I'm fine"].map((text) => ({ text, label: "rage" })),
    ...["Tested the new build on Linux, boot time dropped to 9s", "Marathon week 9 done, 42 miles", "Council approved the bus route, starts March", "Fixed the flaky test with a seed"].map((text) => ({ text, label: "not_rage" })),
  ];
  const m = SD.rage.refitRage(votes);
  for (const [id, w] of Object.entries(m.w)) assert.ok(Math.abs(w - SD.rage.RAGE_PRIOR.w[id]) <= 1.5001, id);
  const r = SD.providers.parseReply('{"slop": 20, "rage": 88, "rage_reason": "mocks a group"}', 0);
  assert.equal(r.rage, 88);
  assert.equal(r.rageReason, "mocks a group");
  assert.equal(SD.providers.parseReply('{"slop": 20}', 0).rage, null);
});
