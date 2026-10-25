// Account-type adjustment and vote helpers (ported unchanged from lib.js v1.5).
export const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

export const ACCOUNT_TYPES: Record<string, string> = {
  personal_individual: "individual voice",
  news_or_publication: "news or publication",
  brand_or_business: "brand or business",
  engagement_aggregator: "viral-repost / engagement account",
  bot_or_spam: "bot or spam-like account"
};
export const ACCOUNT_ADJ: Record<string, number> = {
  personal_individual: -8, news_or_publication: 0, brand_or_business: 5,
  engagement_aggregator: 22, bot_or_spam: 30
};
export const ACCT_MIN_CONF = 0.5;

export const confidentAcct = (acct?: string, conf?: number) =>
  acct && acct in ACCOUNT_TYPES && (conf === undefined || conf >= ACCT_MIN_CONF) ? acct : null;

export function finalScore(base: number, acct?: string, conf?: number, adjOk?: boolean, influence = 100,
  adj: Record<string, number> = ACCOUNT_ADJ): number {
  const a = confidentAcct(acct, conf);
  if (!a || !adjOk) return base;
  return Math.round(clamp(base + (adj[a] * influence) / 100));
}

export interface Vote { label: string; score?: number; synthetic?: boolean; pattern?: string; [k: string]: unknown }

export function scoredVotes<T extends Vote>(votes: T[]): T[] {
  return votes.filter((v) => typeof v.score === "number" && !v.synthetic &&
    !(v.synthetic === undefined && v.pattern === "authentic" && (v.score === 0 || v.score === 100)));
}

export function bestThreshold<T extends Vote>(scored: T[], current = 60, scoreOf: (v: T) => number = (v) => v.score as number) {
  const agree = (t: number) => scored.filter((v) => (scoreOf(v) >= t) === (v.label === "slop")).length;
  let best: { t: number; a: number } | null = null;
  for (let t = 10; t <= 95; t += 5) {
    const a = agree(t);
    if (!best || a > best.a || (a === best.a && Math.abs(t - current) < Math.abs(best.t - current))) best = { t, a };
  }
  return { ...best!, n: scored.length, agreeAt: agree };
}
