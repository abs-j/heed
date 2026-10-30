// Thirst-trap scoring. A thirst trap is a post whose point is to be looked at: suggestive bait, a
// "rate me" ask, or a caption that is little more than an emoji next to a body. It is deliberately
// NOT "any post with a swimsuit, gym selfie or fitness content": a workout tutorial, a swim meet
// result, a travel photo or a fashion shoot with real information in it is pushed down by the
// counter-signals below. Conservative priors (a single weak signal never reaches the default line);
// the reader's own thirst votes refit them on-device.
//
// On Instagram the image carries most of the signal, so `alt` (the platform's own description of the
// photo, e.g. "May be an image of 1 person and bikini") is a first-class input. A vision model can
// look at the image itself when the reader has enabled that (see background.js).
import { makeCtx, type Ctx } from "./features";

export interface ThirstCtx extends Ctx { alt: string }
export interface ThirstFeature { id: string; label: string; prior: number; fn: (c: ThirstCtx) => number }

const sat = (n: number, k: number) => Math.min(1, n / k);
const count = (s: string, re: RegExp) => (s.match(re) || []).length;
const re = (r: RegExp, k = 1) => (c: ThirstCtx) => sat(count(c.text, r), k);

const ATTIRE = "bikinis?|swimsuits?|swimwear|lingerie|underwear|undies|thongs?|bras?|bralette|bodysuits?|shirtless|topless|crop top|cleavage|bare chest|bare back|sports bra|lace";

export const THIRST_FEATURES: ThirstFeature[] = [
  // ---- bait asks and phrasing
  { id: "ask", label: "'rate me' / 'thoughts?' bait", prior: 1.8,
    fn: re(/\b(?:rate (?:me|this|my)|rate it|how (?:do|am) i look|do i pass|am i your type|be honest|what(?:'|’)?s my (?:score|number)|guess my age|tell me i(?:'|’)?m (?:pretty|cute|hot)|would you (?:date|take|hit|swipe|slide)|who(?:'|’)?s (?:up|awake)|thoughts\?|r(?:ate)? 1-10|out of 10|\/10\b)/gi, 2) },
  { id: "tease", label: "teasing caption", prior: 1.5,
    fn: re(/\b(?:feeling (?:cute|myself|spicy|good about)|caught in 4k|just a little|you(?:'|’)?re welcome|don(?:'|’)?t look|not for the faint|no caption needed|you know what (?:this|it) is|new pic|shower thought|private story|close friends|dm me|slide in|link in bio for more|exclusive content|only ?fans|fansly|spicy|naughty|nsfw|18\+|thirst|baddie|thicc|snack)\b/gi, 2) },
  { id: "body", label: "caption about a body", prior: 1.4,
    fn: re(/\b(?:sexy|hot (?:girl|guy|body|summer)|hottie|curves?|booty|abs|six[- ]?pack|legs|thighs?|cleavage|gorgeous body|drop[- ]dead|eye candy|body goals|bad (?:girl|bitch)|stunning)\b/gi, 2) },
  { id: "emoji", label: "suggestive emoji", prior: 0.9, fn: re(/[😏🥵😈🍑🍆💦😘😉🫦🔥]/gu, 2) },
  { id: "tags", label: "bait hashtags", prior: 1.6,
    fn: re(/#(?:thirsttrap|baddie|baddies|hotgirl|hotguy|hottie|sexy|sexygirl|sexyman|bikini|bikinimodel|bikinibody|lingerie|lingeriemodel|shirtless|instahot|instababe|babe|thicc|curvy|bodygoals|boudoir|swimsuit|swimwear|spicy|nsfw|onlyfans|fitgirl|gymgirl|gymcrush|abs|mirrorselfie|selfie)\b/gi, 2) },
  { id: "attire", label: "swimwear / underwear mentioned", prior: 0.9, fn: re(new RegExp(`\\b(?:${ATTIRE})\\b`, "gi"), 2) },
  { id: "alt", label: "photo shows swimwear / little clothing", prior: 1.5,
    fn: (c) => sat(count(c.alt, new RegExp(`\\b(?:${ATTIRE}|bare skin|midriff)\\b`, "gi")), 1) },
  // Instagram's own image description lists clothing and looks ("one or more people, makeup, dress
  // and text"). A dress or skirt next to a bare caption is the dressed-up-for-the-camera post.
  { id: "altdress", label: "photo shows a dress, skirt or glam outfit", prior: 2.0,
    fn: (c) => sat(count(c.alt, /\b(?:dress|gown|slip|miniskirt|skirt|sundress|chemise|corset|bodycon|fishnet|stockings|heels|crop top|bodysuit|jumpsuit|halter|sequins?|negligee|bralette)\b/gi), 1) },
  { id: "altglam", label: "photo shows makeup or styled hair", prior: 0.8,
    fn: (c) => sat(count(c.alt, /\b(?:makeup|lipstick|long hair|blonde hair|dark hair|curly hair|eyelashes|earrings|necklace|selfie)\b/gi), 1) },
  { id: "altperson", label: "photo of a person", prior: 0.5,
    fn: (c) => (/\b(?:person|people)\b/i.test(c.alt) ? 1 : 0) },
  { id: "altnight", label: "night-out photo", prior: 0.4,
    fn: (c) => (/\b(?:night|nightclub)\b/i.test(c.alt) ? 1 : 0) },
  { id: "bare", label: "almost no caption", prior: 1.0,
    fn: (c) => (c.alt && c.words.filter((w) => !w.startsWith("#")).length <= 4 ? 1 : 0) },

  // ---- counter-signals: information, craft or news pull the score down
  { id: "howto", label: "how-to or training content", prior: -1.6,
    fn: re(/\b(?:workout|exercise|reps?|sets?|routine|tutorial|how to|tips?|form|technique|stretch(?:ing)?|mobility|recipe|ingredients|macros|protein|programme|program|training plan|rehab|physio|coach(?:ing)?)\b/gi, 2) },
  { id: "event", label: "sport, event or news context", prior: -1.5,
    fn: re(/\b(?:wedding|bride|groom|graduation|prom|ceremony|congratulations|swim (?:meet|team|club|race|lessons?)|olympics?|championships?|tournament|medal|race|marathon|triathlon|lifeguard|according to|announced|breaking|study|research|surgery|cancer|awareness|fundraiser|charity)\b/gi, 2) },
  { id: "craft", label: "photo or fashion credit", prior: -0.9,
    fn: re(/\b(?:photograph(?:er|y)|shot by|photo by|styled by|wardrobe|collection|campaign|editorial|runway|lookbook|designer|brand|ad\b|sponsored|#ad\b)\b/gi, 2) },
  { id: "travel", label: "travel or place", prior: -0.8,
    fn: re(/\b(?:trip|travel|vacation|holiday|beach day|hike|sunset|resort|island|waves|surf(?:ing)?|diving|snorkel(?:ing)?|kayak)\b/gi, 2) },
  { id: "substance", label: "a real sentence of context", prior: -1.1,
    fn: (c) => sat(Math.max(0, c.words.filter((w) => !w.startsWith("#") && !w.startsWith("@")).length - 14), 24) },
  { id: "firsthand", label: "personal story", prior: -0.8,
    fn: (c) => sat(c.words.filter((w) => /^(?:my|we|our|i've|i’ve|because|after|when)$/.test(w)).length, 4) }
];

export interface ThirstWeights { bias: number; w: Record<string, number>; trained?: { n: number; at: string } }
export const THIRST_PRIOR: ThirstWeights = { bias: -2.3, w: Object.fromEntries(THIRST_FEATURES.map((f) => [f.id, f.prior])) };

export interface ThirstResult { score: number; p: number; hits: string[] }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const ctxOf = (text: string, alt = ""): ThirstCtx => ({ ...makeCtx(text), alt: alt.slice(0, 400) });
export const thirstVector = (text: string, alt = "") => { const c = ctxOf(text, alt); return THIRST_FEATURES.map((f) => f.fn(c)); };

export function localThirst(text: string, alt = "", weights: ThirstWeights = THIRST_PRIOR): ThirstResult {
  const x = thirstVector(text, alt);
  let z = weights.bias;
  const contrib: [string, number][] = [];
  THIRST_FEATURES.forEach((f, i) => {
    const v = (weights.w[f.id] ?? f.prior) * x[i];
    z += v;
    if (v > 0.5) contrib.push([f.label, v]);
  });
  const p = sigmoid(z);
  contrib.sort((a, b) => b[1] - a[1]);
  return { score: Math.round(p * 100), p, hits: contrib.slice(0, 4).map((c) => c[0]) };
}

export interface ThirstVote { text: string; label: string; alt?: string }

// Refit from the reader's thirst votes (label "thirst" / "not_thirst"), anchored to the priors.
export function refitThirst(votes: ThirstVote[], base: ThirstWeights = THIRST_PRIOR): ThirstWeights {
  const rows = votes.filter((v) => (v.text || v.alt) && (v.label === "thirst" || v.label === "not_thirst"));
  const ids = THIRST_FEATURES.map((f) => f.id);
  const w0 = ids.map((id, i) => base.w[id] ?? THIRST_FEATURES[i].prior);
  let b = base.bias; const w = [...w0];
  if (rows.length >= 4) {
    const data = rows.map((v) => ({ x: thirstVector(v.text || "", v.alt || ""), y: v.label === "thirst" ? 1 : 0 }));
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
