// Compares three ways of judging thirst traps with a real model: image description (alt text) only,
// the picture only, and both. Uses the extension's own prompt (lib.js), so results match the product.
//
//   EVAL_KEY=sk-... EVAL_MODEL=google/gemini-2.5-flash-lite \
//   EVAL_URL=https://openrouter.ai/api/v1/chat/completions node tools/eval-thirst.mjs items.json
//
// items.json: [{ "id": "a", "caption": "🥂🥂", "alt": "May be an image of ...", "image": "https://... or ./file.jpg",
//                "suggested": true, "label": true }]   (label = the reader wants it folded)
// The key is read from the environment only. Nothing is stored or printed.
import "../lib.js";
import { readFileSync } from "node:fs";

const { EVAL_KEY, EVAL_MODEL = "gpt-4.1-mini", EVAL_URL = "https://api.openai.com/v1/chat/completions", EVAL_PROVIDER = "openai" } = process.env;
const BAR = Number(process.env.EVAL_BAR || 55);
if (!EVAL_KEY) { console.error("Set EVAL_KEY (and optionally EVAL_MODEL, EVAL_URL, EVAL_PROVIDER=anthropic, EVAL_BAR)."); process.exit(1); }
const items = JSON.parse(readFileSync(process.argv[2] || "items.json", "utf8"));
const SD = globalThis.SD;
const cfg = { provider: EVAL_PROVIDER, model: EVAL_MODEL, baseUrl: EVAL_URL, apiKey: EVAL_KEY };

async function dataUrl(src) {
  if (!src) return undefined;
  const bytes = /^https?:/.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : readFileSync(src);
  return "data:image/jpeg;base64," + bytes.toString("base64");
}

async function judge(item, mode, image) {
  const state = {
    platform: "Instagram post", post: item.caption || "",
    ...(item.suggested ? { suggested_account: true } : {}),
    ...(mode !== "image" && item.alt ? { attached_media: [`1 image (image description: ${item.alt.replace(/^May be an image of /i, "")})`] } : {})
  };
  const req = SD.providers.buildRequest(cfg, state, [], mode === "alt" ? [] : [image].filter(Boolean));
  const t0 = performance.now();
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) return { error: `HTTP ${res.status}`, ms };
  const parsed = SD.providers.parseReply(SD.providers.replyText(cfg.provider, await res.json()), 0);
  return { score: parsed.thirst, ms };
}

const modes = ["alt", "image", "both"];
const tally = Object.fromEntries(modes.map((m) => [m, { right: 0, n: 0, ms: [] }]));
for (const item of items) {
  const image = await dataUrl(item.image).catch(() => undefined);
  const row = [String(item.id).padEnd(10), item.label ? "FOLD" : "keep"];
  for (const m of modes) {
    if (m !== "alt" && !image) { row.push(`${m}: n/a`); continue; }
    const r = await judge(item, m, image).catch((e) => ({ error: e.message, ms: 0 }));
    if (r.error || typeof r.score !== "number") { row.push(`${m}: ${r.error || "no score"}`); continue; }
    const t = tally[m]; t.n++; t.ms.push(r.ms); if ((r.score >= BAR) === !!item.label) t.right++;
    row.push(`${m}: ${String(r.score).padStart(3)} (${r.ms}ms)`);
  }
  console.log(row.join("  "));
}
console.log(`\nmodel ${EVAL_MODEL}, fold at thirst >= ${BAR}`);
for (const m of modes) {
  const t = tally[m]; const ms = t.ms.sort((a, b) => a - b);
  console.log(`${m.padEnd(6)} correct ${t.right}/${t.n}   median ${ms[Math.floor(ms.length / 2)] ?? "-"} ms   worst ${ms[ms.length - 1] ?? "-"} ms`);
}
