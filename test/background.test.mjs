// Runs background.js in a sandbox with a fake chrome.* and fetch to check tiering and providers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import "../lib.js";

function boot(store, fetchImpl) {
  let listener;
  const chrome = {
    storage: { local: {
      get: async (k) => { const keys = k == null ? Object.keys(store) : [].concat(typeof k === "string" ? k : k); const o = {}; for (const x of keys) if (x in store) o[x] = store[x]; return o; },
      set: async (o) => { Object.assign(store, o); }, remove: async (ks) => { for (const k of [].concat(ks)) delete store[k]; }
    } },
    runtime: { onMessage: { addListener: (f) => { listener = f; } }, onInstalled: { addListener() {} } }
  };
  const ctx = vm.createContext({
    chrome, fetch: fetchImpl, console, crypto: globalThis.crypto, TextEncoder, setTimeout, clearTimeout, Date, Promise,
    importScripts: (f) => vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx)
  });
  vm.runInContext(readFileSync(new URL("../background.js", import.meta.url), "utf8"), ctx);
  return (msg) => new Promise((res) => listener(msg, null, res));
}
const calls = [];
const ok = (j) => async (...a) => { calls.push(a); return { ok: true, status: 200, headers: { get: () => null }, json: async () => j }; };
const anth = (o) => ok({ content: [{ text: JSON.stringify(o) }] });

const BAIT = "Hey @grok pick 10 giant companies that won't exist in 2050. No mercy. Like and follow for more 🚀 #ai";
const PERSONAL = "Shipped the fix for the race condition in our job scheduler today. Two workers claimed the same row.";
const MIDDLE = "Interesting take on where the housing market goes next, curious what people think";

test("tiered: confident local posts skip the API, uncertain ones call the provider", async () => {
  calls.length = 0;
  const send = boot({ provider: "anthropic", providerKeys: { anthropic: "k" } }, anth({ slop: 55, pattern: "low_effort", account_type: "personal_individual", account_confidence: 0.9, pattern_confidence: 0.6 }));
  const a = await send({ type: "analyze", text: BAIT, ctx: { postId: "1" } });
  assert.equal(a.tier, "local"); assert.ok(a.score >= 60);
  const b = await send({ type: "analyze", text: PERSONAL, ctx: { postId: "2" } });
  assert.equal(b.tier, "local"); assert.ok(b.score <= 30);
  assert.equal(calls.length, 0, "no API calls for confident posts");
  const c = await send({ type: "analyze", text: MIDDLE, ctx: { postId: "3" } });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /anthropic\.com/);
  assert.equal(calls[0][1].headers["x-api-key"], "k");
  assert.equal(c.base, 55); assert.equal(c.pattern, "low_effort");
});

test("llm mode asks the provider even for confident posts; bad replies fall back locally", async () => {
  calls.length = 0;
  const send = boot({ provider: "openai", providerBase: "http://localhost:11434/v1/chat/completions", tierMode: "llm" },
    ok({ choices: [{ message: { content: "not json" } }] }));
  const r = await send({ type: "analyze", text: BAIT, ctx: { postId: "9" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers.authorization, undefined);
  assert.equal(r.local, true, "falls back to the local result on a parse failure");
});

test("no key: local classifier only, no network", async () => {
  calls.length = 0;
  const send = boot({}, ok({}));
  const r = await send({ type: "analyze", text: BAIT, ctx: { postId: "5" } });
  assert.equal(calls.length, 0); assert.ok(r.local); assert.ok(r.score >= 60);
});

test("a personalised sdModel in storage changes the local score used for routing", async () => {
  const { SD } = globalThis;
  const probe = "Token presale opens tonight, airdrop snapshot for whitelist wallets, claim early";
  const votes = [
    ...["New token launch tonight, presale is live and the airdrop snapshot is tomorrow", "Airdrop snapshot confirmed for the new token, claim before the presale ends", "This token presale is going to run, airdrop for early wallets confirmed", "Presale wallets get the airdrop, token launch is Friday, whitelist closes soon", "New airdrop token just opened its presale, whitelist spots are filling"].map((text) => ({ text, label: "slop" })),
    ...["Fixed the flaky integration test by seeding the random generator, CI is green again", "Walked the dog in the rain and got completely soaked, worth it for the quiet", "Made a lemon cake from my grandmother's recipe and it collapsed in the middle", "Finished chapter nine, the translation of the dialogue is surprisingly hard", "Benchmarked the new parser against the old one, about 8% faster on large files"].map((text) => ({ text, label: "not_slop" }))
  ];
  const shipped = await boot({}, ok({}))({ type: "analyze", text: probe, ctx: { postId: "70" } });
  const personal = await boot({ sdModel: SD.learn.refit(votes) }, ok({}))({ type: "analyze", text: probe, ctx: { postId: "71" } });
  assert.ok(personal.score > shipped.score + 10, `shipped ${shipped.score}, personal ${personal.score}`);
});

test("short posts are scored on-device (markable by hand) and never call the API", async () => {
  calls.length = 0;
  const send = boot({ provider: "anthropic", providerKeys: { anthropic: "k" }, tierMode: "llm" }, anth({ slop: 50 }));
  const r = await send({ type: "analyze", text: "Wild times", ctx: { postId: "88" } });
  assert.equal(calls.length, 0);
  assert.equal(r.tier, "local");
  assert.equal(typeof r.score, "number");
  assert.ok(r.key);
});

test("rage bait: scored on-device with no key, AI answer used when present, votes override both", async () => {
  const BAITY = 'Muslims be like "Ramadan is so hard" but its literally just skipping lunch for a month? Your "fast" only lasts like 10 hours!';
  const NEWS = "JUST IN: The Senate voted 52-48 to confirm the nominee, according to a statement from the majority leader's office.";
  const send = boot({}, ok({}));
  const a = await send({ type: "analyze", text: BAITY, ctx: { postId: "r1" } });
  assert.equal(a.rageSrc, "local"); assert.ok(a.rage >= 60, `rage ${a.rage}`);
  const n = await send({ type: "analyze", text: NEWS, ctx: { postId: "r2", postedAt: new Date(Date.now() - 3600e3).toISOString() } });
  assert.ok(n.rage < 30, `news rage ${n.rage}`);
  // a vote overrides the score and survives re-analysis
  await send({ type: "rageVote", key: n.key, text: NEWS, label: "rage" });
  assert.equal((await send({ type: "analyze", text: NEWS, ctx: { postId: "r2" } })).rage, 100);
  await send({ type: "rageUnvote", key: n.key });
  assert.ok((await send({ type: "analyze", text: NEWS, ctx: { postId: "r2" } })).rage < 30);
  // the AI model's rage answer wins over the on-device guess
  const withKey = boot({ provider: "anthropic", providerKeys: { anthropic: "k" }, tierMode: "llm" }, anth({ slop: 30, rage: 12, rage_reason: "reasoned reply" }));
  const m = await withKey({ type: "analyze", text: "Honestly I think the policy is wrong, and here is why: the numbers don't add up in the third year.", ctx: { postId: "r3" } });
  assert.equal(m.rage, 12); assert.equal(m.rageSrc, "model"); assert.equal(m.rageReason, "reasoned reply");
});

test("👎 on news twice makes news fold as a topic; a later 👍 brings it back; undo removes the reaction", async () => {
  const N1 = "BREAKING: Officials confirmed a wildfire near the coast, police said evacuations began on Friday.";
  const N2 = "The announcement came after authorities reported the earthquake, according to a statement released today.";
  const N3 = "JUST IN: Police arrested two suspects, officials said, according to a briefing this morning.";
  const send = boot({}, ok({}));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a1 = await send({ type: "analyze", text: N1, ctx: { postId: "t1" } });
  assert.equal(a1.topic?.less, false);
  await send({ type: "react", key: a1.key, text: N1, label: "dislike", score: a1.score, rage: a1.rage });
  const a2 = await send({ type: "analyze", text: N2, ctx: { postId: "t2" } });
  await send({ type: "react", key: a2.key, text: N2, label: "dislike", score: a2.score, rage: a2.rage });
  await wait(700);
  const a3 = await send({ type: "analyze", text: N3, ctx: { postId: "t3" } });
  assert.equal(a3.topic.id, "news");
  assert.equal(a3.topic.less, true, `pref after two dislikes: ${JSON.stringify(a3.topic)}`);
  assert.equal(a3.reaction, undefined);
  // reacted posts report their own reaction
  assert.equal((await send({ type: "analyze", text: N1, ctx: { postId: "t1" } })).reaction, "dislike");
  // three 👍 on hidden news posts bring the topic back
  for (const [i, t] of [[4, N3 + " a"], [5, N3 + " b"], [6, N3 + " c"]]) {
    const r = await send({ type: "analyze", text: t, ctx: { postId: "t" + i } });
    await send({ type: "react", key: r.key, text: t, label: "like", folded: ["less"] });
  }
  await wait(700);
  assert.equal((await send({ type: "analyze", text: N3 + " d", ctx: { postId: "t7" } })).topic.less, false);
  // undo drops the reaction
  await send({ type: "unreact", key: a1.key });
  assert.equal((await send({ type: "analyze", text: N1, ctx: { postId: "t1" } })).reaction, undefined);
});

const TEASE = "Rate me 1-10 😏 be honest";
const ALT = "May be an image of 1 person, bikini and beach";
const reply = (o) => anth({ slop: 45, pattern: "low_effort", account_type: "personal_individual", account_confidence: 0.9, pattern_confidence: 0.6, ...o });

test("thirst: scored on-device with no key, and the model's answer is used when asked", async () => {
  calls.length = 0;
  const offline = boot({}, ok({}));
  const a = await offline({ type: "analyze", text: TEASE, ctx: { platform: "instagram", postId: "ig_a", alt: ALT } });
  assert.ok(a.thirst >= 70 && a.thirstSrc === "local", `local thirst ${a.thirst}`);
  assert.ok(a.thirstHits.length);
  const send = boot({ provider: "anthropic", providerKeys: { anthropic: "k" } }, reply({ thirst: 12, thirst_reason: "ordinary selfie" }));
  const b = await send({ type: "analyze", text: "Rate my brunch 1-10, honestly thoughts? maybe", ctx: { platform: "instagram", postId: "ig_b" } });
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0][1].body);
  assert.match(sent.messages[0].content, /Instagram post/);
  assert.equal(b.thirst, 12); assert.equal(b.thirstSrc, "model"); assert.equal(b.thirstReason, "ordinary selfie");
});

test("thirst: images go to the provider only with the vision option on, never to a local server", async () => {
  const img = ["https://scontent.cdninstagram.com/a.jpg"];
  for (const [store, expectImage] of [[{}, false], [{ thirstVision: true }, true]]) {
    calls.length = 0;
    const send = boot({ provider: "anthropic", providerKeys: { anthropic: "k" }, ...store }, reply({ thirst: 80 }));
    await send({ type: "analyze", text: "Rate my brunch 1-10, honestly thoughts? maybe", ctx: { platform: "instagram", postId: "ig_c" + expectImage, images: img } });
    const content = JSON.parse(calls[0][1].body).messages[0].content;
    assert.equal(Array.isArray(content) && content.some((p) => p.type === "image" && p.source.url === img[0]), expectImage);
  }
  calls.length = 0;
  const local = boot({ provider: "openai", providerBase: "http://localhost:11434/v1/chat/completions", tierMode: "llm", thirstVision: true }, ok({ choices: [{ message: { content: JSON.stringify({ slop: 40, thirst: 20 }) } }] }));
  await local({ type: "analyze", text: "Rate my brunch 1-10, honestly thoughts? maybe", ctx: { platform: "instagram", postId: "ig_d", images: img } });
  assert.equal(typeof JSON.parse(calls[0][1].body).messages[1].content, "string");
});

test("thirst: 👎 on a thirsty post teaches it, 👍 on a folded one corrects it, undo clears both", async () => {
  const store = {};
  const send = boot(store, ok({}));
  const k1 = (await send({ type: "analyze", text: TEASE, ctx: { postId: "k1", alt: ALT } })).key;
  const k2 = (await send({ type: "analyze", text: TEASE, ctx: { postId: "k2", alt: ALT } })).key;
  const m = { type: "react", key: k1, text: TEASE, handle: "x", score: 10, rage: 0, thirst: 80, alt: ALT, folded: [] };
  await send({ ...m, label: "dislike" });
  assert.equal(store.sdThirstVotes[0].label, "thirst");
  await send({ ...m, key: k2, label: "like", thirst: 90, folded: ["thirst"] });
  assert.equal(store.sdThirstVotes.find((v) => v.key === k2).label, "not_thirst");
  const again = await send({ type: "analyze", text: TEASE, ctx: { postId: "k2", alt: ALT } });
  assert.equal(again.thirst, 0); assert.equal(again.thirstSrc, "you");
  await send({ type: "unreact", key: k2 });
  assert.equal(store.sdThirstVotes.some((v) => v.key === k2), false);
});

test("Instagram: grid thumbnails (localOnly) and platform captions are scored without calling the model", async () => {
  calls.length = 0;
  const send = boot({ provider: "anthropic", providerKeys: { anthropic: "k" } }, reply({ thirst: 5 }));
  // A thumbnail has no caption, so swimwear in the image description alone is a weak signal: it is
  // scored locally (no call) but stays under the default line, and an explicit bait ask in it crosses.
  const t = await send({ type: "analyze", text: "", ctx: { platform: "instagram", postId: "ig_tile", alt: "May be an image of 1 person, bikini and beach", localOnly: true } });
  assert.equal(calls.length, 0);
  assert.ok(t.thirst >= 30 && t.thirst < 70, `thumbnail thirst ${t.thirst}`);
  const c = await boot({}, ok({}))({ type: "analyze", text: "Golden hour ✨ #photography #sunset #travel #nature", ctx: { platform: "instagram", postId: "ig_cap" } });
  assert.ok(c.score < 40, `caption slop ${c.score}`);
});

test("thirst vision: a harmless caption on an image post still goes to the model in tiered mode", async () => {
  const img = ["https://scontent.cdninstagram.com/a.jpg"];
  const run = async (store) => {
    calls.length = 0;
    const send = boot({ provider: "anthropic", providerKeys: { anthropic: "k" }, ...store }, reply({ thirst: 80, thirst_reason: "posed photo" }));
    const r = await send({ type: "analyze", text: "Sunday ✨", ctx: { platform: "instagram", postId: "ig_v" + JSON.stringify(store), images: img } });
    return { r, n: calls.length };
  };
  const off = await run({});
  assert.equal(off.n, 0);
  const on = await run({ thirstVision: true });
  assert.equal(on.n, 1); assert.equal(on.r.thirst, 80);
});
