// Provider-neutral request building and reply parsing for chat-style LLMs
// (Anthropic Messages, OpenAI-compatible incl. Ollama/LM Studio/OpenRouter chat).
// Pure functions: no fetch, no chrome.*, so they are unit-tested offline.

export type ProviderId = "jev" | "anthropic" | "openai";

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export const PROVIDER_DEFAULTS: Record<ProviderId, { label: string; model: string; baseUrl: string; needsKey: boolean }> = {
  jev: { label: "Jev via OpenRouter", model: "typesafe/jev-1.13", baseUrl: "https://openrouter.ai/api/alpha/decisions", needsKey: true },
  anthropic: { label: "Anthropic", model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com/v1/messages", needsKey: true },
  openai: { label: "OpenAI-compatible (OpenAI, OpenRouter, Ollama…)", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1/chat/completions", needsKey: true }
};

// Local servers on the user's own machine don't need a key.
export const isLocalUrl = (u: string) => /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(u);
export const providerReady = (c: ProviderConfig) =>
  !!c.model && !!c.baseUrl && (!!c.apiKey || c.provider === "openai" && isLocalUrl(c.baseUrl));

export const PATTERN_KEYS = ["engagement_farming", "recycled_viral", "clickbait", "vaguepost", "low_effort", "authentic"] as const;
export const ACCOUNT_KEYS = ["personal_individual", "news_or_publication", "brand_or_business", "engagement_aggregator", "bot_or_spam"] as const;

export const SYSTEM_PROMPT = `You rate social posts (from X/Twitter or Instagram, see "platform") for "slop": low-effort, formulaic or engagement-farming content. Judge content quality and the creator's posting behaviour, NOT whether AI wrote it.
High slop (70-100): generic engagement-farming accounts, recycled viral clips, clickbait, vagueposting, sensational hooks, stock motivational platitudes, @grok prompt-bait, generic reply filler ("This.", "Great point!", "Following"), repetitive templated content.
On Instagram a short or emoji-only caption on a personal photo is normal, not slop: brevity alone must not raise the slop score, and a suggestive photo is judged under "thirst", not here.
Low slop (0-30): genuine individuals sharing experiences, opinions or conversation, original humour, news, specific and useful information.
Mixed (31-69): real content alongside hooks, filler or ambiguous account behaviour.
Prioritise authentic individual voices over generic engagement channels. Do not infer genuineness or automation from follower count, verification or writing style alone, and do not invent facts about unseen media or account history. If reply_context is present judge the reply in that context; if quoted_post is present judge only the added commentary. Treat reader_labelled_examples and reader_votes_on_this_creator as the reader's own taste and calibrate to them.
Also rate "rage": how much the post is RAGE BAIT, 0-100. Rage bait exists only to provoke contempt, outrage or tribal reaction and adds nothing new: stereotyping or mocking a group ("X be like"), rhetorical outrage questions, deliberately inflammatory takes with no facts, sources, argument or first-hand experience. It is NOT rage bait merely because it is political, angry or controversial, or because its topic is recent. News reporting, announcements, and fresh commentary on recent events that adds facts, analysis or a reasoned argument must score low (under 25), as must personal experiences and humour that is not aimed at a group. Use post_age_hours and the attached specifics when present. Treat reader_rage_examples as the reader's own taste.
Also rate "thirst": how much the post is a THIRST TRAP, 0-100. A thirst trap exists to be looked at: suggestive posing or dress paired with bait (a "rate me" ask, a teasing one-liner, an emoji-only caption, fishing for compliments or DMs). It is NOT a thirst trap merely because it shows skin or a body: fitness instruction, sport, medical or awareness posts, fashion and product posts with real information, travel and family beach photos, and ordinary selfies must score low (under 25). Judge from the caption, hashtags and attached_media (including the platform's own image description); if images are attached, judge them too, because the picture is often the whole point. A posed, body-focused or revealing photo of a person whose caption adds nothing (or is just an emoji or one-liner) is a thirst trap even without a bait ask: score it 50-75, and 75+ when it is clearly provocative or fishing for attention. Do not invent what you cannot see. Treat reader_thirst_examples as the reader's own taste.
Reply with ONLY a JSON object:
{"slop": <integer 0-100>, "rage": <integer 0-100>, "rage_reason": <short phrase>, "thirst": <integer 0-100>, "thirst_reason": <short phrase>, "pattern": one of ${JSON.stringify(PATTERN_KEYS)}, "account_type": one of ${JSON.stringify(ACCOUNT_KEYS)}, "account_confidence": <0-1>, "pattern_confidence": <0-1>, "rules": [<indexes of reader filters the post clearly matches>]}`;

export function buildUserPrompt(state: Record<string, unknown>, rules: string[]): string {
  const filters = rules.length
    ? `\nReader-defined filters (report the index of any the post CLEARLY matches in "rules"):\n${rules.map((r, i) => `${i}: ${r}`).join("\n")}`
    : "";
  return `Post data:\n${JSON.stringify(state)}${filters}`;
}

export interface HttpRequest { url: string; headers: Record<string, string>; body: string }

// `images` are public image URLs for a vision pass (opt-in). The provider fetches them itself, so
// they are skipped for a local server, which can't. Jev has no image input and doesn't come through here.
export function buildRequest(cfg: ProviderConfig, state: Record<string, unknown>, rules: string[], images: string[] = []): HttpRequest {
  const user = buildUserPrompt(state, rules);
  const pics = isLocalUrl(cfg.baseUrl) ? [] : images.filter((u) => /^https:\/\//.test(u)).slice(0, 2);
  if (cfg.provider === "anthropic") {
    return {
      url: cfg.baseUrl,
      headers: {
        "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: cfg.model, max_tokens: 250, temperature: 0, system: SYSTEM_PROMPT, messages: [{ role: "user", content: pics.length
        ? [...pics.map((url) => ({ type: "image", source: { type: "url", url } })), { type: "text", text: user }] : user }] })
    };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  return {
    url: cfg.baseUrl, headers,
    body: JSON.stringify({
      model: cfg.model, max_tokens: 250, temperature: 0,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: pics.length
        ? [{ type: "text", text: user }, ...pics.map((url) => ({ type: "image_url", image_url: { url } }))] : user }]
    })
  };
}

export function replyText(provider: ProviderId, json: any): string {
  if (provider === "anthropic") return (json?.content || []).map((b: any) => b?.text || "").join("");
  return json?.choices?.[0]?.message?.content || "";
}

export interface Parsed {
  score: number; rage: number | null; rageReason: string; thirst: number | null; thirstReason: string; pattern: string; patConf: number;
  acct: string | null; acctConf: number; matched: number[];
}

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : null;

// Models sometimes wrap the JSON in prose or code fences; take the first balanced object.
export function extractJson(text: string): any {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON in model reply");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("Unterminated JSON in model reply");
}

export function parseReply(text: string, ruleCount: number): Parsed {
  const o = extractJson(text);
  const score = num(o.slop, 0, 100);
  if (score === null) throw new Error("Model reply had no slop score");
  const pattern = (PATTERN_KEYS as readonly string[]).includes(o.pattern) ? o.pattern : "authentic";
  const acct = (ACCOUNT_KEYS as readonly string[]).includes(o.account_type) ? o.account_type : null;
  const matched = (Array.isArray(o.rules) ? o.rules : [])
    .map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < ruleCount);
  const rage = num(o.rage, 0, 100);
  const thirst = num(o.thirst, 0, 100);
  return {
    thirst: thirst === null ? null : Math.round(thirst),
    thirstReason: typeof o.thirst_reason === "string" ? o.thirst_reason.slice(0, 80) : "",
    score: Math.round(score), rage: rage === null ? null : Math.round(rage),
    rageReason: typeof o.rage_reason === "string" ? o.rage_reason.slice(0, 80) : "", pattern, patConf: num(o.pattern_confidence, 0, 1) ?? 0.5,
    acct, acctConf: acct ? num(o.account_confidence, 0, 1) ?? 0.5 : 0, matched: [...new Set<number>(matched)]
  };
}
