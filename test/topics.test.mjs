import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";

const { topics: T } = globalThis.SD;
const NEWS = "BREAKING: Officials confirmed a wildfire near the coast, police said evacuations began on Friday.";
const NEWS2 = "The announcement came after authorities reported the earthquake, according to a statement.";
const SPORT = "Spurs 82, Mavericks 80 with 4 minutes left in the third quarter, Wembanyama has 31 points in the playoffs.";
const day = 864e5;

test("posts are tagged by topic, with a short-post and a strong-marker allowance", () => {
  assert.equal(T.topicsOf(NEWS)[0], "news");
  assert.equal(T.topicsOf(SPORT)[0], "sports");
  assert.equal(T.topicsOf("Marathon week 9: 42 miles and one blister")[0], undefined);
  assert.deepEqual(T.topicsOf("airdrop tonight"), ["crypto"]);   // one keyword is enough in a very short post
});

test("two 👎 on news fold the topic; a later 👍 on a hidden news post brings it back", () => {
  const now = Date.now();
  let r = [{ text: NEWS, label: "less", ts: now - 3 * day }, { text: NEWS2, label: "less", ts: now - 2 * day }];
  let p = T.topicPrefs(r, {}, now);
  assert.ok(p.news.pref <= T.TOPIC_FOLD, `news ${p.news.pref}`);
  assert.equal(T.topicVerdict(NEWS, p).less, true);
  assert.equal(T.topicVerdict(SPORT, p).less, false);
  // the reader later changes their mind: three 👍 on hidden news posts
  r = [...r, ...[1, 2, 3].map((i) => ({ text: NEWS + " " + i, label: "more", ts: now - i * 1000 }))];
  p = T.topicPrefs(r, {}, now);
  assert.ok(p.news.pref > T.TOPIC_FOLD, `after likes ${p.news.pref}`);
});

test("one 👎 only nudges, old reactions fade, manual choices override", () => {
  const now = Date.now();
  assert.ok(T.topicPrefs([{ text: NEWS, label: "less", ts: now }], {}, now).news.pref > T.TOPIC_FOLD);
  const old = Array.from({ length: 3 }, (_, i) => ({ text: NEWS + i, label: "less", ts: now - 200 * day }));
  assert.ok(T.topicPrefs(old, {}, now).news.pref > T.TOPIC_FOLD, "200-day-old dislikes have faded");
  assert.ok(T.topicPrefs([], { news: "less" }, now).news.pref <= T.TOPIC_FOLD);
  assert.ok(T.topicPrefs(old, { news: "more" }, now).news.pref > 0.5);
});
