importScripts("lib.js");
// Service worker: owns the API key, talks to OpenRouter, caches results.
const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";
const CACHE_KEY = "sdCache";
const CACHE_MAX = 3000;
const CACHE_TTL = 30 * 24 * 3600 * 1000;
const MAX_CONCURRENT = 2;

const PATTERNS = {
  engagement_farming: "Engagement farming",
  recycled_viral: "Recycled viral content",
  clickbait: "Clickbait / sensational hook",
  vaguepost: "Vagueposting",
  low_effort: "Repetitive low-effort content",
  authentic: "Specific, personal or original",
  // Legacy keys from earlier cached results.
  engagement_bait: "Engagement bait",
  generic_platitude: "Generic platitudes",
  hollow_listicle: "Hollow list / thread filler",
  formulaic_hook: "Formulaic hook-and-payoff template",
  buzzword_fluff: "Buzzword-heavy fluff"
};

const SCORE_LABELS = [
  "0-10: Genuine individual voice. Personal experience, opinion, conversation, original humour, news or specific, useful information",
  "11-30: Mostly authentic and substantive, with minor generic or promotional touches",
  "31-69: Mixed. Some real content alongside hooks, filler, recycling or ambiguous account behaviour",
  "70-89: Mostly slop. Engagement-farming account style, recycled viral material, clickbait, vagueposting or low-effort repetition",
  "90-100: Pure slop. Generic engagement channel, recycled viral video or sensational hook with nothing original or specific"
];

// Bumped when the prompt changes so old scores are re-evaluated.
const PROMPT_VERSION = "v2:";
const AUTHORS_KEY = "sdAuthors";
const AUTHORS_MAX = 400;


// ---- Local heuristics -------------------------------------------------------
// Free, instant signals (adapted from the patterns rule-based detectors use).
// Used as hints for Jev and as a fallback when the API is unavailable.
function localResult(text, key, why) {
  const { score, hits } = SD.localScore(text);
  const note = why === "budget" ? "daily budget reached" : why === "nokey" ? "no API key" : "API unavailable";
  return {
    score, pattern: "local", conf: 0, local: true, key, why: { hits, local: true },
    explanation: `Local check (${note})` + (hits.length ? `: ${hits.slice(0, 3).join(", ")}` : "")
  };
}

// ---- Creator rules ------------------------------------------------------------
// Manual rules (sdCreators) win; otherwise 3+ of your votes one way and none the
// other makes a creator trusted/muted automatically, with no API call.
const CREATOR_VOTES_NEEDED = 3;
async function creatorOverride(handle) {
  if (!handle) return null;
  const h = handle.toLowerCase();
  const { sdCreators = {}, sdVotes = [] } = await chrome.storage.local.get(["sdCreators", "sdVotes"]);
  const manual = sdCreators[h];
  if (manual === "mute") return { score: 100, pattern: "creator_muted", conf: 100, creator: true, explanation: `You always collapse @${handle}` };
  if (manual === "trust") return { score: 0, pattern: "creator_trusted", conf: 100, creator: true, explanation: `You always show @${handle}` };
  const mine = sdVotes.filter((v) => v.handle && v.handle.toLowerCase() === h);
  const slop = mine.filter((v) => v.label === "slop").length;
  const ok = mine.length - slop;
  if (slop >= CREATOR_VOTES_NEEDED && ok === 0) return { score: 100, pattern: "creator_muted", conf: 100, creator: true, explanation: `You marked ${slop} posts from @${handle} as slop` };
  if (ok >= CREATOR_VOTES_NEEDED && slop === 0) return { score: 0, pattern: "creator_trusted", conf: 100, creator: true, explanation: `You marked ${ok} posts from @${handle} as not slop` };
  return null;
}

// ---- Daily budget ---------------------------------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
async function overBudget() {
  const { dailyBudget = 0, sdSpendDay } = await chrome.storage.local.get(["dailyBudget", "sdSpendDay"]);
  return dailyBudget > 0 && sdSpendDay?.d === today() && sdSpendDay.usd >= dailyBudget;
}
async function addSpend(cost) {
  const { sdSpend = 0, sdSpendDay } = await chrome.storage.local.get(["sdSpend", "sdSpendDay"]);
  const day = sdSpendDay?.d === today() ? sdSpendDay : { d: today(), usd: 0 };
  await chrome.storage.local.set({ sdSpend: sdSpend + cost, sdSpendDay: { d: day.d, usd: day.usd + cost } });
  bumpStat("spend", cost);
}

const QUEUE_MAX = 40;

// ---- Usage stats (last 30 days) ----------------------------------------------
let statChain = Promise.resolve();
function bumpStat(field, n = 1) {
  statChain = statChain.then(async () => {
    const { sdStats = { days: {} } } = await chrome.storage.local.get("sdStats");
    const d = today();
    const row = sdStats.days[d] || { scanned: 0, filtered: 0, local: 0, spend: 0 };
    row[field] = (row[field] || 0) + n;
    sdStats.days[d] = row;
    const keep = Object.keys(sdStats.days).sort().slice(-30);
    sdStats.days = Object.fromEntries(keep.map((k) => [k, sdStats.days[k]]));
    await chrome.storage.local.set({ sdStats });
  }).catch(() => {});
}

// Reader-defined plain-language filters (settings), at most 5 per request.
async function getRules() {
  const { customRules = [] } = await chrome.storage.local.get("customRules");
  return customRules.map((r) => String(r).trim().slice(0, 120)).filter(Boolean).slice(0, 5);
}

// ---- Creator profiles (bio / follower text captured from X's own pages) ------
const PROFILES_KEY = "sdProfiles";
const PROFILE_TTL = 7 * 24 * 3600 * 1000;
const PROFILES_MAX = 500;

const ACCOUNT_TYPES = SD.ACCOUNT_TYPES;

async function getProfileRecord(handle) {
  if (!handle) return null;
  const { [PROFILES_KEY]: all = {} } = await chrome.storage.local.get(PROFILES_KEY);
  return all[handle.toLowerCase()] || null;
}
async function patchProfile(handle, patch) {
  if (!handle) return;
  const { [PROFILES_KEY]: all = {} } = await chrome.storage.local.get(PROFILES_KEY);
  const k = handle.toLowerCase();
  all[k] = { ...(all[k] || {}), ...patch, seen: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > PROFILES_MAX) {
    keys.sort((a, b) => (all[b].seen || 0) - (all[a].seen || 0));
    for (const d of keys.slice(PROFILES_MAX)) delete all[d];
  }
  await chrome.storage.local.set({ [PROFILES_KEY]: all });
}
async function getProfile({ handle }) {
  const r = await getProfileRecord(handle);
  if (r?.raw && Date.now() - (r.ts || 0) < PROFILE_TTL) return { raw: r.raw, followers: r.followers, following: r.following, fresh: true };
  if (r?.failTs && Date.now() - r.failTs < 24 * 3600 * 1000) return { failed: true };
  return null;
}
async function profileFailed({ handle }) {
  await patchProfile(handle, { failTs: Date.now() });
  return {};
}
async function saveProfile({ handle, profile }) {
  if (!profile?.raw) return {};
  await patchProfile(handle, { raw: String(profile.raw).slice(0, 700), followers: profile.followers, following: profile.following, ts: Date.now() });
  return {};
}

let cache = null;          // { [id]: {score, pattern, conf, ts, fb?} }
let cacheLoaded = null;
let saveTimer = null;
const inflight = new Map(); // id -> Promise
const queue = [];
let active = 0;
let pausedUntil = 0;

function loadCache() {
  if (!cacheLoaded) {
    cacheLoaded = chrome.storage.local.get(CACHE_KEY).then((r) => {
      cache = r[CACHE_KEY] || {};
    });
  }
  return cacheLoaded;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const now = Date.now();
    let entries = Object.entries(cache).filter(([, v]) => now - v.ts < CACHE_TTL || v.fb);
    if (entries.length > CACHE_MAX) {
      entries.sort((a, b) => b[1].ts - a[1].ts);
      entries = entries.slice(0, CACHE_MAX);
    }
    cache = Object.fromEntries(entries);
    chrome.storage.local.set({ [CACHE_KEY]: cache });
  }, 1000);
}

async function hashText(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function setStatus(status) {
  chrome.storage.local.set({ sdStatus: { ...status, ts: Date.now() } });
}

const words = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9']{3,}/g) || []);

// Picks the reader's past votes most relevant to this post: similar wording,
// same creator, and more recent. Balanced between slop and not-slop so the
// model sees both sides of the reader's taste.
async function getFeedbackExamples(text, handle) {
  const { sdVotes = [] } = await chrome.storage.local.get("sdVotes");
  if (!sdVotes.length) return { examples: [], creator: null };
  const w = words(text);
  const h = handle?.toLowerCase();
  const n = sdVotes.length;
  const scored = sdVotes.map((v, i) => {
    const vw = words(v.text);
    let inter = 0;
    for (const x of vw) if (w.has(x)) inter++;
    const jac = inter / (vw.size + w.size - inter || 1);
    const same = h && v.handle && v.handle.toLowerCase() === h;
    return { v, rel: jac * 3 + (same ? 1 : 0) + (i / n) * 0.3 };
  }).sort((a, b) => b.rel - a.rel);
  const pick = (label) => scored.filter((x) => x.v.label === label).slice(0, 4).map((x) => x.v);
  const examples = [...pick("slop"), ...pick("not_slop")].map((v) => ({
    text: v.text.slice(0, 240),
    ...(v.handle ? { creator: v.handle } : {}),
    user_label: v.label
  }));
  let creator = null;
  if (h) {
    const mine = sdVotes.filter((v) => v.handle && v.handle.toLowerCase() === h);
    if (mine.length) {
      creator = {
        marked_slop: mine.filter((v) => v.label === "slop").length,
        marked_not_slop: mine.filter((v) => v.label === "not_slop").length
      };
    }
  }
  return { examples, creator };
}

async function getAuthor(handle) {
  if (!handle) return null;
  const { [AUTHORS_KEY]: all = {} } = await chrome.storage.local.get(AUTHORS_KEY);
  return all[handle.toLowerCase()] || null;
}

async function recordAuthor(handle, text, score) {
  if (!handle) return;
  const { [AUTHORS_KEY]: all = {} } = await chrome.storage.local.get(AUTHORS_KEY);
  const k = handle.toLowerCase();
  const a = all[k] || { n: 0, sum: 0, recent: [] };
  a.n += 1; a.sum += score; a.ts = Date.now();
  a.recent = [...a.recent, { t: text.slice(0, 160), s: score }].slice(-4);
  all[k] = a;
  const keys = Object.keys(all);
  if (keys.length > AUTHORS_MAX) {
    keys.sort((x, y) => (all[y].ts || 0) - (all[x].ts || 0));
    for (const d of keys.slice(AUTHORS_MAX)) delete all[d];
  }
  await chrome.storage.local.set({ [AUTHORS_KEY]: all });
}

async function buildContext(text, ctx) {
  const { examples, creator: votedOn } = await getFeedbackExamples(text, ctx?.handle);
  const author = await getAuthor(ctx?.handle);
  const prevType = (await getProfileRecord(ctx?.handle))?.type;
  const rules = await getRules();
  const state = {
    platform: "X (Twitter) post",
    post: text.slice(0, 1500),
    ...(ctx?.handle || ctx?.name ? {
      creator: {
        ...(ctx.name ? { display_name: ctx.name } : {}),
        ...(ctx.handle ? { handle: ctx.handle } : {}),
        ...(ctx.verified ? { has_verified_badge: true } : {}),
        ...(ctx.profile?.raw
          ? { profile_card_text: ctx.profile.raw }
          : { profile: "not available" }),
        ...(prevType ? { previously_assessed_account_type: ACCOUNT_TYPES[prevType] } : {})
      }
    } : {}),
    ...(author && author.n > 1 ? {
      creator_posts_seen_by_reader: {
        count: author.n,
        average_slop_score_0_to_100: Math.round(author.sum / author.n),
        recent: author.recent.map((r) => r.t)
      }
    } : {}),
    ...(SD.localScore(text).hits.length ? { surface_signals_detected_locally: SD.localScore(text).hits } : {}),
    ...(ctx?.replyTo || ctx?.parent ? {
      reply_context: {
        ...(ctx.replyTo ? { replying_to: ctx.replyTo } : {}),
        ...(ctx.parent ? { parent_post: ctx.parent } : {})
      }
    } : {}),
    ...(ctx?.quoted ? { quoted_post: ctx.quoted } : {}),
    ...(votedOn ? { reader_votes_on_this_creator: votedOn } : {}),
    ...(ctx?.media?.length ? { attached_media: ctx.media } : {}),
    ...(ctx?.context ? { feed_context: ctx.context } : {}),
    ...(examples.length ? { reader_labelled_examples: examples } : {})
  };
  return { state, examples, votedOn, rules };
}

async function callJev(text, ctx, apiKey) {
  const { state, examples, votedOn, rules } = await buildContext(text, ctx);
  const body = {
    model: MODEL,
    state,
    questions: {
      slop: {
        type: "score",
        instructions:
          "Rate this X post's slop level from 0 to 100 based on content quality and the creator's posting behaviour, not on whether AI generated it. High slop (70-100): generic engagement-farming accounts, recycled viral videos, clickbait, vagueposting, sensational hooks and repetitive low-effort content. Low slop (0-30): genuine personal accounts sharing experiences, opinions or conversations, original humour, news, specific information and useful insights. Consider the creator: display name, handle, the account's profile_card_text (bio and follower counts, when present), the kind of account it is, and any posting history in creator_posts_seen_by_reader. A generic account that mostly reposts viral clips, memes or trending stories with a stock caption is an engagement channel even if the single post is specific. Prioritise authentic individual voices over generic engagement channels. Do not assume an account is genuine or automated from follower count, verification or writing style alone. Consider attached_media when present, but do not invent information about unseen content or account history. If reply_context is present this is a reply: judge it in that context, and treat generic reply-bait ('This.', 'Great point!', 'Following', 'Check your DMs') or promotional replies as slop. If quoted_post is present, judge the commentary added on top of it, not the quoted post itself. If reader_labelled_examples or reader_votes_on_this_creator are present, treat them as the reader's own taste and calibrate to it: posts like the ones they marked slop should score high, and posts like the ones they marked not slop should score low.",
        criteria: SCORE_LABELS
      },
      account_type: {
        type: "choice",
        instructions: "What kind of account posted this? Use the display name, handle, profile_card_text and any history. Do not assume from follower count, verification or writing style alone.",
        criteria: {
          personal_individual: "A real individual sharing their own experiences, opinions, work or conversations",
          news_or_publication: "A news outlet, journalist account or publication reporting information",
          brand_or_business: "A company, product, creator brand or marketing account promoting something",
          engagement_aggregator: "A generic channel that reposts viral videos, memes, trending stories or 'did you know' content, optimised for engagement rather than a personal voice",
          bot_or_spam: "Automated, spam, scam or mass-produced content account"
        }
      },
      ...Object.fromEntries(rules.map((rule, i) => [`rule_${i}`, {
        type: "choice",
        instructions: `Reader-defined filter: "${rule}". Does this post clearly match it? Answer match only if it clearly fits.`,
        criteria: {
          match: `The post clearly is an example of: ${rule}`,
          no_match: "The post does not clearly fit this filter"
        }
      }])),
      pattern: {
        type: "choice",
        instructions: "Which pattern best describes this post and its creator's behaviour?",
        criteria: {
          engagement_farming: "Generic engagement-farming account or post that begs for likes, replies, follows or reposts, or poses a hollow question to farm engagement",
          recycled_viral: "Recycled or reposted viral video, clip or meme presented with a generic caption and no original contribution",
          clickbait: "Clickbait or a sensational hook that promises more than it delivers",
          vaguepost: "Vagueposting: cryptic or teasing statements with no specifics",
          low_effort: "Repetitive, templated or padded low-effort content",
          authentic: "Specific, personal, original, newsworthy or genuinely informative, from an individual voice"
        }
      }
    }
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json())?.error?.message || ""; } catch {}
    const err = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get("retry-after")) || 0;
    throw err;
  }
  const data = await res.json();
  const s = data.answers?.slop;
  const p = data.answers?.pattern;
  if (!s || typeof s.score !== "number") throw new Error("Unexpected response from Jev");
  const score = Math.round(Math.min(1, Math.max(0, s.score / (SCORE_LABELS.length - 1))) * 100);
  const pattern = p?.choice in PATTERNS ? p.choice : "authentic";
  const patConf = p?.probabilities?.[pattern] ?? p?.confidence ?? 0;
  const t = data.answers?.account_type;
  const acct = t?.choice in ACCOUNT_TYPES ? t.choice : null;
  const acctConf = t?.probabilities?.[acct] ?? t?.confidence ?? 0;
  const matched = rules.filter((_, i) => {
    const a = data.answers?.[`rule_${i}`];
    return a?.choice === "match" && (a.probabilities?.match ?? 1) >= 0.6;
  });
  return finishResult({ score, pattern, patConf, acct, acctConf, matched, cost: data.usage?.cost || 0 }, text, ctx, { examples, votedOn, rules });
}

// Turns a provider's parsed answer into the cache/UI result shape.
function finishResult(a, text, ctx, { examples, votedOn, rules }) {
  if (a.acct && ctx?.handle) patchProfile(ctx.handle, { type: a.acct, typeTs: Date.now() }).catch(() => {});
  const why = {
    acctConf: Math.round(a.acctConf * 100),
    hits: SD.localScore(text).hits, examples: examples.length, creatorVotes: votedOn || undefined,
    profile: ctx?.profile?.raw ? ctx.profile.raw.slice(0, 160) : undefined,
    reply: !!(ctx?.replyTo || ctx?.parent), quoted: !!ctx?.quoted,
    provider: a.provider
  };
  return {
    base: a.score, pattern: a.pattern, conf: Math.round(a.patConf * 100), cost: a.cost,
    acct: a.acct, acctConf: a.acctConf, adjOk: !!ctx?.handle, profiled: !!ctx?.profile?.raw,
    rules: a.matched, rulesSig: rules.join("|"), why
  };
}

// Chat-style providers (Anthropic, OpenAI-compatible incl. Ollama). Same context, JSON reply.
async function callChat(text, ctx, cfg) {
  const { state, examples, votedOn, rules } = await buildContext(text, ctx);
  const req = SD.providers.buildRequest(cfg, state, rules);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
  if (!res.ok) {
    let msg = "";
    try { const j = await res.json(); msg = j?.error?.message || j?.error || ""; } catch {}
    const err = new Error(typeof msg === "string" && msg ? msg : `HTTP ${res.status}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get("retry-after")) || 0;
    throw err;
  }
  const data = await res.json();
  const parsed = SD.providers.parseReply(SD.providers.replyText(cfg.provider, data), rules.length);
  return finishResult({
    score: parsed.score, pattern: parsed.pattern, patConf: parsed.patConf, acct: parsed.acct, acctConf: parsed.acctConf,
    matched: parsed.matched.map((i) => rules[i]), cost: 0, provider: cfg.provider
  }, text, ctx, { examples, votedOn, rules });
}

// ---- Provider + tier settings -------------------------------------------------
// Jev keeps its original `apiKey`; other providers store theirs in `providerKeys`.
async function getProviderConfig() {
  const s = await chrome.storage.local.get(["provider", "providerModel", "providerBase", "providerKeys", "apiKey"]);
  const id = SD.providers.PROVIDER_DEFAULTS[s.provider] ? s.provider : "jev";
  const d = SD.providers.PROVIDER_DEFAULTS[id];
  return {
    provider: id,
    model: (id === "jev" ? "" : s.providerModel) || d.model,
    baseUrl: (id === "jev" ? "" : s.providerBase) || d.baseUrl,
    apiKey: id === "jev" ? s.apiKey || "" : s.providerKeys?.[id] || ""
  };
}
async function getTier() {
  const s = await chrome.storage.local.get(["tierMode", "tierLow", "tierHigh"]);
  const D = SD.router.TIER_DEFAULTS;
  return { mode: ["local", "tiered", "llm"].includes(s.tierMode) ? s.tierMode : D.mode, low: s.tierLow ?? D.low, high: s.tierHigh ?? D.high };
}
const providerReady = (cfg) => cfg.provider === "jev" ? !!cfg.apiKey : SD.providers.providerReady(cfg);
const providerName = (cfg) => SD.providers.PROVIDER_DEFAULTS[cfg.provider].label;

// A post the on-device classifier is confident about never reaches the LLM.
function localConfident(text, key, reason) {
  const { score, hits } = SD.localScore(text);
  const list = hits.length ? `: ${hits.slice(0, 3).join(", ")}` : "";
  const explanation = reason === "confident-slop" ? `Clear slop pattern${list}`
    : reason === "confident-ok" ? "Specific, personal voice (no slop signals)"
    : `Local classifier${list}`;
  return { score, pattern: "local", conf: 0, key, tier: "local", why: { hits, local: true, tier: reason }, explanation };
}

function explain(r) {
  if (r.fb === "slop") return "You marked this as slop";
  if (r.fb === "not_slop") return "You marked this as not slop";
  if (r.rules?.length) return `Matches your filter: ${r.rules.join(", ")}`;
  const label = PATTERNS[r.pattern] || "Unclear";
  const base = r.pattern === "authentic" ? label : `${label} (${r.conf}% match)`;
  const acct = SD.confidentAcct(r.acct, r.acctConf);
  const flagged = acct === "engagement_aggregator" || acct === "bot_or_spam";
  return flagged ? `${base} · ${ACCOUNT_TYPES[acct]}` : base;
}

// A cache entry as the UI sees it: raw model score plus the account adjustment
// at the current "account influence", so retuning needs no re-scoring.
async function getInfluence() {
  const { acctInfluence = 100 } = await chrome.storage.local.get("acctInfluence");
  return Number(acctInfluence);
}
async function present(entry, key) {
  const score = typeof entry.base === "number"
    ? SD.finalScore(entry.base, entry.acct, entry.acctConf, entry.adjOk, await getInfluence())
    : entry.score;
  const out = { ...entry, score };
  out.explanation = explain(out);
  if (key) out.key = key;
  return out;
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length && Date.now() >= pausedUntil) {
    const job = queue.shift();
    active++;
    runJob(job).finally(() => { active--; pump(); });
  }
  if (queue.length && Date.now() < pausedUntil) {
    setTimeout(pump, pausedUntil - Date.now() + 50);
  }
}

async function runJob({ key, text, ctx, resolve, reject }) {
  let cfg = null;
  try {
    cfg = await getProviderConfig();
    if (!providerReady(cfg)) throw Object.assign(new Error("No API key set"), { status: 401 });
    const r = cfg.provider === "jev" ? await callJev(text, ctx, cfg.apiKey) : await callChat(text, ctx, cfg);
    cache[key] = {
      base: r.base, pattern: r.pattern, conf: r.conf, acct: r.acct, acctConf: r.acctConf, adjOk: r.adjOk,
      profiled: r.profiled, rules: r.rules, rulesSig: r.rulesSig, why: r.why, ts: Date.now()
    };
    const shown = await present(cache[key], key);
    recordAuthor(ctx?.handle, text, shown.score).catch(() => {});
    scheduleSave();
    setStatus({ ok: true });
    await addSpend(r.cost);
    resolve(shown);
  } catch (e) {
    const st = e.status;
    const who = cfg ? providerName(cfg) : "the provider";
    if (st === 401 || st === 403) setStatus({ ok: false, error: `Invalid or missing API key for ${who}.` });
    else if (st === 402) setStatus({ ok: false, error: `${who} credits exhausted.` });
    else if (st === 429) {
      pausedUntil = Date.now() + Math.max(15000, e.retryAfter * 1000);
      setStatus({ ok: false, error: `Rate limited by ${who}; pausing briefly.` });
    } else setStatus({ ok: false, error: `Request failed: ${e.message}` });
    if (st === 401 || st === 402 || st === 403) pausedUntil = Date.now() + 60000;
    reject(e);
  } finally {
    inflight.delete(key);
  }
}

async function analyzeInner({ text, ctx, refine }) {
  await loadCache();
  const norm = text.trim().toLowerCase();
  const textKey = PROMPT_VERSION + (await hashText(norm));
  // Scores belong to a specific post when X gives us its id, so a copied text from
  // another account is scored on its own.
  const key = ctx?.postId ? `${PROMPT_VERSION}id:${ctx.postId}` : textKey;
  // Votes made under an earlier key scheme still apply to the same post.
  if (!cache[key]?.fb) {
    const legacy = [textKey, await hashText(norm)].map((k) => cache[k]).find((e) => e?.fb);
    if (legacy) cache[key] = legacy;
  }
  let hit = cache[key];
  if (hit?.fb) return present(hit, key);
  const creator = await creatorOverride(ctx?.handle);
  if (creator) return { ...creator, key };
  // A cached score is stale once your custom filters change, or when asked to refine.
  const sig = (await getRules()).join("|");
  if (hit && (hit.rulesSig || "") === sig && !refine) return present(hit, key);
  const keepHit = hit;

  const cfg = await getProviderConfig();
  const ready = providerReady(cfg);
  if (!ready) {
    setStatus({ ok: false, error: `Add your ${providerName(cfg)} key in settings. Using the local classifier only.` });
    return localResult(text, key, "nokey");
  }
  // Tier 0: the on-device classifier answers on its own when it is confident (or when
  // the reader chose local-only), so those posts never cost an API call.
  const tier = await getTier();
  const rt = SD.router.route(SD.localScore(text).score, { ...tier, llmReady: ready });
  if (rt.use === "local") {
    if (refine && keepHit) return present(keepHit, key);
    if (!refine) bumpStat("tier0");
    return localConfident(text, key, rt.reason);
  }
  if (await overBudget()) return refine && keepHit ? present(keepHit, key) : localResult(text, key, "budget");
  if (Date.now() < pausedUntil || queue.length >= QUEUE_MAX) return refine && keepHit ? present(keepHit, key) : localResult(text, key, "error");
  if (!inflight.has(key)) {
    inflight.set(key, new Promise((resolve, reject) => {
      queue.push({ key, text, ctx, resolve, reject });
      pump();
    }));
  }
  try {
    return { ...(await inflight.get(key)), key };
  } catch {
    return refine && keepHit ? present(keepHit, key) : localResult(text, key, "error");
  }
}

async function analyze(m) {
  const r = await analyzeInner(m);
  if (!m.refine) {
    bumpStat("scanned");
    if (r.local) bumpStat("local");
  }
  return r;
}

async function logFiltered({ key, handle, text, score, explanation }) {
  const { sdFiltered = [] } = await chrome.storage.local.get("sdFiltered");
  const rest = sdFiltered.filter((e) => e.key !== key);
  if (rest.length === sdFiltered.length) bumpStat("filtered");
  rest.unshift({ key, handle, text: String(text).slice(0, 280), score, explanation, ts: Date.now() });
  await chrome.storage.local.set({ sdFiltered: rest.slice(0, 60) });
  return {};
}

async function feedback({ key, text, label, handle }) {
  await loadCache();
  const prev = cache[key] || { score: label === "slop" ? 100 : 0, pattern: "authentic", conf: 0, synthetic: true };
  const shown = await present(prev);
  cache[key] = { ...prev, fb: label, ts: Date.now() };
  scheduleSave();
  const { sdVotes = [] } = await chrome.storage.local.get("sdVotes");
  const votes = sdVotes.filter((v) => v.key !== key);
  votes.push({
    key, text: String(text).slice(0, 280), label, handle: handle || undefined,
    score: shown.score, pattern: prev.pattern, synthetic: !!prev.synthetic,
    // Raw inputs, so the eval script can replay votes under different adjustments.
    base: prev.base, acct: prev.acct, acctConf: prev.acctConf, adjOk: prev.adjOk, ts: Date.now()
  });
  await chrome.storage.local.set({ sdVotes: votes.slice(-500) });
  return present(cache[key], key);
}

async function unvote({ key }) {
  await loadCache();
  const hit = cache[key];
  let entry = null;
  if (hit) {
    if (hit.synthetic) delete cache[key];
    else { delete hit.fb; entry = await present(hit, key); }
    scheduleSave();
  }
  const { sdVotes = [] } = await chrome.storage.local.get("sdVotes");
  await chrome.storage.local.set({ sdVotes: sdVotes.filter((v) => v.key !== key) });
  return { key, entry };
}

async function clearAll({ votes }) {
  await loadCache();
  cache = {};
  clearTimeout(saveTimer);
  const rm = ["sdCache", "sdSpend", "sdSpendDay", "sdFiltered", "sdStats", AUTHORS_KEY, PROFILES_KEY];
  if (votes) rm.push("sdVotes");
  await chrome.storage.local.remove(rm);
  return {};
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const h = { analyze, feedback, unvote, clear: clearAll, logFiltered, getProfile, saveProfile, profileFailed }[msg?.type];
  if (!h) return false;
  h(msg).then(sendResponse, (e) => sendResponse({ error: String(e.message || e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(["mode", "sensitivity", "enabled"]);
  await chrome.storage.local.set({
    mode: cur.mode || "blur",
    sensitivity: cur.sensitivity ?? 60,
    enabled: cur.enabled ?? true
  });
});
