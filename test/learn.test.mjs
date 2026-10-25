import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";

const SD = globalThis.SD;

// A reader who finds a particular kind of post tedious even though it has no slop "template":
// token-launch / airdrop chatter. The shipped model knows nothing about that.
const SLOP = [
  "New token launch tonight, presale is live and the airdrop snapshot is tomorrow",
  "Airdrop snapshot confirmed for the new token, claim before the presale ends",
  "This token presale is going to run, airdrop for early wallets confirmed",
  "Presale wallets get the airdrop, token launch is Friday, whitelist closes soon",
  "New airdrop token just opened its presale, whitelist spots are filling",
  "Token launch update: presale allocation and airdrop snapshot details inside",
  "Whitelist for the token presale is open, airdrop snapshot taken at launch",
  "Another token presale live, airdrop wallets are being snapshotted this week",
];
const OK = [
  "Fixed the flaky integration test by seeding the random generator, CI is green again",
  "Walked the dog in the rain and got completely soaked, worth it for the quiet",
  "The council approved the new bus route, service starts in March with 12 stops",
  "Made a lemon cake from my grandmother's recipe and it collapsed in the middle",
  "Finished chapter nine, the translation of the dialogue is surprisingly hard",
  "My train was cancelled so I read half a novel on the platform, no complaints",
  "Benchmarked the new parser against the old one, about 8% faster on large files",
  "Spent the evening repotting plants and found a snail living in the fern",
];
const votes = [...SLOP.map((text) => ({ text, label: "slop" })), ...OK.map((text) => ({ text, label: "not_slop" }))];

test("refit learns a reader's own taste without any template match", () => {
  const probe = "Token presale opens tonight, airdrop snapshot for whitelist wallets";
  const before = SD.localScore(probe).score;
  const model = SD.learn.refit(votes);
  const after = SD.localScore(probe, model).score;
  assert.ok(after > before + 15, `before ${before}, after ${after}`);
  assert.ok(SD.localScore(probe, model).hits.some((h) => /you marked slop/.test(h)));
  assert.ok(SD.localScore("Rebuilt the deck and found rot under the old boards", model).score < 40);
});

test("a vote can not explain itself (leave-one-out) and sparse votes change nothing", () => {
  const few = SD.learn.refit(votes.slice(0, 2));
  assert.deepEqual(few.w.taste, SD.DEFAULT_WEIGHTS.w.taste ?? 1.2);
  const probe = "Spent the evening repotting plants and found a snail living in the fern";
  const base = SD.localScore(probe).score;
  assert.ok(Math.abs(SD.localScore(probe, few).score - base) <= 2);
});

test("cross-validated evaluation says personalised beats shipped on this reader", () => {
  const ev = SD.learn.evaluate(votes);
  assert.ok(ev, "evaluation available with 16 votes");
  assert.ok(ev.personal.acc > ev.shipped.acc, `personal ${ev.personal.acc} vs shipped ${ev.shipped.acc}`);
  assert.equal(SD.learn.evaluate(votes.slice(0, 6)), null);
});

test("weights stay within a bounded distance of the shipped model", () => {
  const model = SD.learn.refit(votes);
  for (const [id, w] of Object.entries(model.w)) {
    const base = SD.DEFAULT_WEIGHTS.w[id] ?? 1.2;
    assert.ok(Math.abs(w - base) <= 1.5001, `${id} moved ${w - base}`);
  }
});
