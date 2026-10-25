// FROZEN copy of the v1.5 heuristic, kept only as the baseline for `npm run eval`.
// Pure scoring logic shared by the service worker, content script, settings page
// and tests. No DOM or chrome.* access in here.
(() => {
  const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

  // ---- Local heuristics ---------------------------------------------------------
  // Free, instant surface signals. Used as hints for the model and as a fallback.
const AI_RULES = [
  [/[—–]/g, 6, "em dashes", 3],
  [/\b(?:it'?s|this is|that'?s|isn'?t|not) (?:not )?(?:just |only |about )?[^.\n]{2,40}[,;—-]\s*(?:it'?s|but|this is|that'?s) /i, 14, "'not X, it's Y' reversal"],
  [/\b(?:here'?s the thing|nobody (?:is )?talks? about|let that sink in|read that again|the truth is|plot twist|hot take|unpopular opinion|buckle up|game[- ]?chang(?:er|ing)|unlock(?:ing)? (?:the|your)|deep dive|in today'?s (?:fast|digital|world)|at the end of the day)\b/i, 12, "stock hook phrase"],
  [/\b(?:like (?:and|&) (?:retweet|repost|share)|(?:like|rt|retweet|repost|follow) (?:if|for)|follow (?:me )?for more|comment (?:below|\w+ to get)|bookmark this|drop a [^\s]+ (?:if|below)|who else|thoughts\?|agree\?|am i wrong\?|tag someone|save this (?:post|tweet))/i, 26, "engagement bait"],
  [/(?:^|\n)\s*(?:\d{1,2}[.)]|[-•→✅❌🔹▪️])\s+\S/g, 4, "list formatting", 3],
  [/🧵|\bthread\b[:\s]*$/im, 8, "thread hook"],
  [/(?:^|\s)#\w+/g, 4, "hashtags", 3],
  [/\b(?:synerg|leverag|paradigm|ecosystem|scalab|disrupt|10x|supercharge|skyrocket|elevate your|next level|ai[- ]powered)\w*/gi, 5, "buzzwords", 3]
];
const HUMAN_RULES = [
  [/\b(?:lol|lmao|lmfao|wtf|tbh|ngl|idk|smh|imo|bruh|fr fr|omg|ffs)\b/gi, -9, "casual slang", 2],
  [/\b(?:fuck|shit|damn|hell|ass|crap)\w*/gi, -6, "profanity", 2],
  [/\b(?:I|I'm|I've|I'd|I'll|my|me|we|our)\b/g, -3, "first-person voice", 3],
  [/\.{3}|…/g, -3, "ellipsis"],
  [/\bhttps?:\/\/\S+/g, -4, "link"],
  [/\b[A-Z]{4,}\b/g, -3, "caps emphasis"]
];

function localScore(text) {
  let score = 35;
  const hits = [];
  for (const rules of [AI_RULES, HUMAN_RULES]) {
    for (const [re, w, label, cap = 1] of rules) {
      const m = text.match(re.global ? re : new RegExp(re.source, re.flags + "g"));
      if (!m) continue;
      score += w * Math.min(m.length, cap);
      if (w > 0) hits.push(label);
    }
  }
  const lines = text.split(/\n+/).filter((l) => l.trim());
  if (lines.length >= 5 && lines.filter((l) => l.length < 70).length / lines.length > 0.8) {
    score += 10; hits.push("one-line-per-sentence formatting");
  }
  if (text === text.toLowerCase() && /[a-z]{5,}/.test(text)) score -= 6;
  return { score: Math.round(Math.min(100, Math.max(0, score))), hits };
}


  // ---- Account type -------------------------------------------------------------
  const ACCOUNT_TYPES = {
    personal_individual: "individual voice",
    news_or_publication: "news or publication",
    brand_or_business: "brand or business",
    engagement_aggregator: "viral-repost / engagement account",
    bot_or_spam: "bot or spam-like account"
  };
  // Nudges the raw model score by what kind of channel posted it. Applied when a
  // result is shown, scaled by the "account influence" setting, so it can be
  // retuned without re-scoring anything.
  const ACCOUNT_ADJ = {
    personal_individual: -8, news_or_publication: 0, brand_or_business: 5,
    engagement_aggregator: 22, bot_or_spam: 30
  };
  const ACCT_MIN_CONF = 0.5;

  // Legacy cache entries stored only confident account types and no confidence.
  const confidentAcct = (acct, conf) =>
    acct in ACCOUNT_TYPES && (conf === undefined || conf >= ACCT_MIN_CONF) ? acct : null;

  function finalScore(base, acct, conf, adjOk, influence = 100, adj = ACCOUNT_ADJ) {
    const a = confidentAcct(acct, conf);
    if (!a || !adjOk) return base;
    return Math.round(clamp(base + (adj[a] * influence) / 100));
  }

  // ---- Votes -----------------------------------------------------------------------
  // Votes on posts the model actually scored (not ones voted on with no score).
  function scoredVotes(votes) {
    return votes.filter((v) => typeof v.score === "number" && !v.synthetic &&
      !(v.synthetic === undefined && v.pattern === "authentic" && (v.score === 0 || v.score === 100)));
  }

  // The cut-off that agrees with the most votes (ties go to the one nearest `current`).
  function bestThreshold(scored, current = 60, scoreOf = (v) => v.score) {
    const agree = (t) => scored.filter((v) => (scoreOf(v) >= t) === (v.label === "slop")).length;
    let best = null;
    for (let t = 10; t <= 95; t += 5) {
      const a = agree(t);
      if (!best || a > best.a || (a === best.a && Math.abs(t - current) < Math.abs(best.t - current))) best = { t, a };
    }
    return { ...best, n: scored.length, agreeAt: agree };
  }

  globalThis.SD = {
    localScore, ACCOUNT_TYPES, ACCOUNT_ADJ, ACCT_MIN_CONF,
    confidentAcct, finalScore, scoredVotes, bestThreshold, clamp
  };
})();
