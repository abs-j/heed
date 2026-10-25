import assert from "node:assert/strict";
import { test } from "node:test";
import "../lib.js";

const { providers: P, router: R } = globalThis.SD;

test("parseReply tolerates fences and prose, clamps and validates", () => {
  const r = P.parseReply('Sure!\n```json\n{"slop": 140, "pattern": "clickbait", "account_type": "bot_or_spam", "account_confidence": 0.8, "pattern_confidence": "0.7", "rules": [0, 5, 0, "1"]}\n```', 2);
  assert.equal(r.score, 100);
  assert.equal(r.pattern, "clickbait");
  assert.equal(r.acct, "bot_or_spam");
  assert.equal(r.patConf, 0.7);
  assert.deepEqual(r.matched, [0, 1]);
});

test("parseReply falls back on unknown enums and rejects missing scores", () => {
  const r = P.parseReply('{"slop": 12, "pattern": "weird", "account_type": "alien"}', 0);
  assert.equal(r.pattern, "authentic");
  assert.equal(r.acct, null);
  assert.throws(() => P.parseReply("no json here", 0));
  assert.throws(() => P.parseReply('{"pattern":"clickbait"}', 0));
  assert.equal(P.parseReply('{"slop": 5, "note": "a } brace in a string"}', 0).score, 5);
});

test("requests are shaped per provider", () => {
  const cfg = { provider: "anthropic", model: "m", baseUrl: "https://api.anthropic.com/v1/messages", apiKey: "k" };
  const a = P.buildRequest(cfg, { post: "hi" }, ["crypto"]);
  assert.equal(a.headers["x-api-key"], "k");
  assert.equal(JSON.parse(a.body).system, P.SYSTEM_PROMPT);
  assert.match(JSON.parse(a.body).messages[0].content, /0: crypto/);
  const o = P.buildRequest({ ...cfg, provider: "openai", baseUrl: "http://localhost:11434/v1/chat/completions", apiKey: "" }, { post: "hi" }, []);
  assert.equal(o.headers.authorization, undefined);
  assert.equal(JSON.parse(o.body).messages[0].role, "system");
});

test("reply text extraction and readiness", () => {
  assert.equal(P.replyText("anthropic", { content: [{ text: "a" }, { text: "b" }] }), "ab");
  assert.equal(P.replyText("openai", { choices: [{ message: { content: "x" } }] }), "x");
  const local = { provider: "openai", model: "llama3", baseUrl: "http://localhost:11434/v1/chat/completions", apiKey: "" };
  assert.ok(P.providerReady(local));
  assert.ok(!P.providerReady({ ...local, baseUrl: "https://api.openai.com/v1/chat/completions" }));
});

test("router: tiered trusts only confident local scores", () => {
  const o = { mode: "tiered", low: 20, high: 90, llmReady: true };
  assert.equal(R.route(5, o).use, "local");
  assert.equal(R.route(95, o).use, "local");
  assert.equal(R.route(50, o).use, "llm");
  assert.equal(R.route(50, { ...o, llmReady: false }).use, "local");
  assert.equal(R.route(5, { ...o, mode: "llm" }).use, "llm");
  assert.equal(R.route(50, { ...o, mode: "local" }).use, "local");
});
