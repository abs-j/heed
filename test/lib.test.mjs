import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";

const SD = globalThis.SD;

test("engagement bait and stock hooks raise the local score", () => {
  const farm = "Here's the thing nobody talks about — success isn't luck, it's discipline.\n\nLike and follow for more.\n\n1. Wake up early\n2. Stay focused\n3. Never quit";
  const r = SD.localScore(farm);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.ok(r.hits.some((h) => /engagement bait/.test(h)));
});

test("casual first-person posts score low locally", () => {
  const r = SD.localScore("lol i just got stuck in the elevator at work for 40 mins, my coworker kept pressing every button. wtf");
  assert.ok(r.score <= 20, `score ${r.score}`);
  assert.deepEqual(r.hits, []);
});

test("local score stays within 0-100", () => {
  assert.ok(SD.localScore("").score >= 0);
  assert.ok(SD.localScore("like and retweet ".repeat(50)).score <= 100);
});

test("account adjustment scales with influence and clamps", () => {
  assert.equal(SD.finalScore(50, "engagement_aggregator", 0.9, true, 100), 72);
  assert.equal(SD.finalScore(50, "engagement_aggregator", 0.9, true, 50), 61);
  assert.equal(SD.finalScore(50, "engagement_aggregator", 0.9, true, 0), 50);
  assert.equal(SD.finalScore(90, "bot_or_spam", 0.9, true, 150), 100);
  assert.equal(SD.finalScore(5, "personal_individual", 0.9, true, 150), 0);
});

test("account adjustment is skipped without a handle or confidence", () => {
  assert.equal(SD.finalScore(50, "engagement_aggregator", 0.9, false), 50);
  assert.equal(SD.finalScore(50, "engagement_aggregator", 0.3, true), 50);
  assert.equal(SD.finalScore(50, "not_a_type", 0.9, true), 50);
  // Legacy cache entries had no confidence recorded.
  assert.equal(SD.finalScore(50, "bot_or_spam", undefined, true), 80);
});

test("scoredVotes drops votes cast with no model score", () => {
  const votes = [
    { label: "slop", score: 80, pattern: "clickbait" },
    { label: "slop", score: 100, pattern: "authentic", synthetic: true },
    { label: "not_slop", score: 0, pattern: "authentic" }, // legacy synthetic
    { label: "not_slop", score: 20, pattern: "authentic", synthetic: false }
  ];
  assert.equal(SD.scoredVotes(votes).length, 2);
});

test("bestThreshold picks the cut-off that agrees with the most votes", () => {
  const votes = [
    ...[85, 90, 70, 65].map((score) => ({ label: "slop", score })),
    ...[10, 20, 30, 40].map((score) => ({ label: "not_slop", score }))
  ];
  const b = SD.bestThreshold(votes, 60);
  assert.equal(b.a, 8);
  assert.ok(b.t > 40 && b.t <= 65);
  assert.equal(b.agreeAt(95), 4);
});
