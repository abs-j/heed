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
