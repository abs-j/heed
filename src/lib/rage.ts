// Rage-bait scoring. Rage bait is a post that exists to provoke contempt or tribal anger and
// contributes nothing new: no facts, no sources, no argument, no first-hand experience.
// It is deliberately NOT "political" or "angry" or "about a recent event": news, announcements
// and fresh commentary that adds specifics or reasoning are pushed down by the novelty
// features below. Hand-weighted priors; the reader's own rage votes refit them on-device.
import { makeCtx, type Ctx, type Feature } from "./features";

const GROUP = "muslims?|christians?|jews|jewish people|atheists?|white people|black people|whites|asians?|men|women|males?|females?|girls|guys|boys|feminists?|liberals?|conservatives?|republicans?|democrats?|leftists?|libs|maga|boomers?|millennials?|gen ?z|zoomers?|immigrants?|americans?|europeans?|indians?|chinese|russians?|vegans?|teachers?|landlords?|rich people|poor people|single moms?|truck drivers?|gamers?|cat people|dog people|android users|iphone users|remote workers|tourists?|gym bros?|rich kids";
const sat = (n: number, k: number) => Math.min(1, n / k);
const count = (s: string, re: RegExp) => (s.match(re) || []).length;
const re = (r: RegExp, k = 1) => (c: Ctx) => sat(count(c.text, r), k);

export const RAGE_FEATURES: Feature[] = [
  // ---- provocation
  { id: "targets_group", label: "sweeping claim about a group", prior: 1.6,
    fn: re(new RegExp(`\\b(?:${GROUP})\\b(?:\\s+\\w+){0,2}\\s+(?:are|is|be|always|never|will|can'?t|just|really|only|actually|when|think|love|hate|literally|only care|out here)\\b`, "gi"), 2) },
  { id: "mockery", label: "'X be like' mockery template", prior: 1.9,
    fn: re(/\bbe like\b|\btell me you'?re\b|\bimagine being\b|\b(\w+):\s*["'“][^"'”]+["'”][^.?!]*\.?\s*(?:also|and)\s+\1:|\bwhen (?:you|they|someone|a (?:man|woman|guy|girl))\b[^:]{0,40}:\s*\p{Extended_Pictographic}/giu) },
  { id: "rhetorical", label: "rhetorical outrage question", prior: 1.9,
    fn: re(/\bwhy (?:are|do|does|is|would|can'?t)\s+(?:all |every |most |the |these |so many )?\w+(?:\s+\w+){0,3}\s+(?:so|always|only|never|even|just)\b|\b(?:or something|or what|or nah|am i wrong|am i the only one|can someone explain|explain (?:this|why)|genuinely asking)\b/gi) },
  { id: "challenge", label: "challenge to fight", prior: 1.8,
    fn: re(/\b(?:fight me|change my mind|prove me wrong|ratio\b|come at me|say it with me|cope harder|the cope|seethe|sorry not sorry|unfollow me|not a joke|and you know it|wake up|die on this hill|period\.)/gi, 2) },
  { id: "contempt", label: "contempt and name-calling", prior: 1.4,
    fn: re(/\b(?:stupid|dumb|idiots?|clowns?|braindead|brain dead|delusional|pathetic|insufferable|parasites?|leeches|bootlickers?|psychopaths?|morons?|trash|garbage|disgusting|mid|compensating|cope|meltdown|glorified)\b/gi, 2) },
  { id: "us_vs_them", label: "us-vs-them framing", prior: 1.2,
    fn: re(/\b(?:they|the (?:left|right|elites|media)) (?:want|hate|are lying|don'?t want|are hiding)\b|\bshare before\b|\bnobody is talking about\b|\bnot one politician\b|\bsheep\b|\bpart of the problem\b/gi) },
  { id: "anger_emoji", label: "anger emoji", prior: 0.9, fn: re(/[😡🤬😤🙄]/gu, 2) },
  { id: "absolutes", label: "absolutes (always / never / literally)", prior: 0.5,
    fn: re(/\b(?:literally|always|never|every single|all of them|nobody|everyone|only people)\b/gi, 3) },
  { id: "bare", label: "no facts, sources or specifics", prior: 0.8,
    fn: (c) => (c.words.length <= 45 && !/\d/.test(c.text) && !/https?:\/\//.test(c.text) ? 1 : 0) },

  // ---- novelty: news, specifics and reasoning pull the score down
  { id: "attribution", label: "sourced reporting", prior: -2.0,
    fn: re(/\b(?:according to|reported|reports?|announced|confirmed|spokes\w+|officials?|statement|ruling|court|senate|parliament|congress|bill|voted?|signed|filed|study|survey|poll|researchers?|police|authorities|briefing|usgs|union|deal|strikers?|election|minister|government|administration|museum|nominee|amendment)\b/gi, 3) },
  { id: "newsmark", label: "news framing", prior: -0.8, fn: re(/^\s*(?:breaking|just in|update|developing)\b|🚨/gi) },
  { id: "digits", label: "specific numbers", prior: -1.2, fn: (c) => sat(count(c.text, /\b\d[\d,.:%]*\b/g), 3) },
  { id: "timeanchor", label: "dated to a recent event", prior: -0.9,
    fn: re(/\b(?:today|yesterday|tonight|this (?:morning|week|afternoon)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}\s?(?:am|pm)|at \d)\b/gi, 2) },
  { id: "link", label: "link", prior: -0.8, fn: re(/https?:\/\/\S+/g) },
  { id: "reasoning", label: "argument or reasoning", prior: -1.2,
    fn: re(/\b(?:because|however|although|which means|so that|the reason|evidence|data|for example|e\.g\.|in fact|turns out|statute|policy|mostly|margin|retention|runoff)\b/gi, 3) },
  { id: "firsthand", label: "first-hand experience", prior: -1.3,
    fn: (c) => sat(c.words.filter((w) => /^(?:i|i'm|i’m|i've|i’ve|my|me|we|our|myself)$/.test(w)).length, 3) },
  { id: "personal", label: "personal anecdote", prior: -1.3,
    fn: re(/\bmy (?:dad|mom|mum|wife|husband|friend|friends|uncle|aunt|grandmother|grandfather|office|team|cat|dog|boss|kid|daughter|son|district)\b|\b(?:two|a) (?:\w+ )?friends? of mine\b/gi) },
  { id: "nuance", label: "hedged / reasoned opinion", prior: -0.9,
    fn: re(/\b(?:i think|honestly|i disagree|in my view|might|probably|seems|arguably|not sure|though|fine and)\b/gi, 2) },
  { id: "length", label: "length", prior: -0.5, fn: (c) => sat(Math.log10(Math.max(c.chars, 10)) - 1.7, 0.9) }
];

export interface RageWeights { bias: number; w: Record<string, number>; trained?: { n: number; at: string } }
export const RAGE_PRIOR: RageWeights = { bias: -1.0, w: Object.fromEntries(RAGE_FEATURES.map((f) => [f.id, f.prior])) };

export interface RageHints { ageHours?: number }
export interface RageResult { score: number; p: number; hits: string[]; news: number }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const rageVector = (text: string) => { const c = makeCtx(text); return RAGE_FEATURES.map((f) => f.fn(c)); };

export function localRage(text: string, hints: RageHints = {}, weights: RageWeights = RAGE_PRIOR): RageResult {
  const x = rageVector(text);
  let z = weights.bias;
  const contrib: [string, number][] = [];
  let news = 0;
  RAGE_FEATURES.forEach((f, i) => {
    const v = (weights.w[f.id] ?? f.prior) * x[i];
    z += v;
    if (v > 0.5) contrib.push([f.label, v]);
    if (f.id === "attribution") news += 0.5 * x[i];
    if (f.id === "timeanchor") news += 0.25 * x[i];
    if (f.id === "digits" || f.id === "newsmark") news += 0.125 * x[i];
  });
  // Fresh posts that carry reporting or specifics get extra benefit of the doubt.
  if (hints.ageHours !== undefined && hints.ageHours < 36 && news > 0.2) z -= 0.9 * Math.min(1, news);
  const p = sigmoid(z);
  contrib.sort((a, b) => b[1] - a[1]);
  return { score: Math.round(p * 100), p, hits: contrib.slice(0, 4).map((c) => c[0]), news: Math.min(1, news) };
}

// Refit from the reader's rage votes (label "rage" / "not_rage"), anchored to the priors.
export function refitRage(votes: { text: string; label: string }[], base: RageWeights = RAGE_PRIOR): RageWeights {
  const rows = votes.filter((v) => v.text && (v.label === "rage" || v.label === "not_rage"));
  const ids = RAGE_FEATURES.map((f) => f.id);
  const w0 = ids.map((id, i) => base.w[id] ?? RAGE_FEATURES[i].prior);
  let b = base.bias; const w = [...w0];
  if (rows.length >= 4) {
    const data = rows.map((v) => ({ x: rageVector(v.text), y: v.label === "rage" ? 1 : 0 }));
    const clampTo = (v: number, c: number) => Math.min(c + 1.5, Math.max(c - 1.5, v));
    for (let e = 0; e < 160; e++) {
      const gw = new Array(w.length).fill(0); let gb = 0;
      for (const { x, y } of data) {
        let z = b; for (let i = 0; i < w.length; i++) z += w[i] * x[i];
        const err = (sigmoid(z) - y) * 2;
        gb += err; for (let i = 0; i < w.length; i++) gw[i] += err * x[i];
      }
      b = clampTo(b - 0.2 * gb / data.length, base.bias);
      for (let i = 0; i < w.length; i++) w[i] = clampTo(w[i] - 0.2 * (gw[i] / data.length + 0.06 * (w[i] - w0[i])), w0[i]);
    }
  }
  return { bias: +b.toFixed(4), w: Object.fromEntries(ids.map((id, i) => [id, +w[i].toFixed(4)])), trained: { n: rows.length, at: new Date().toISOString().slice(0, 10) } };
}
