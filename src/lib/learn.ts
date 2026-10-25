// On-device learning from the reader's own votes. Two pieces:
//  1. a "taste" lexicon: words/bigrams that show up in posts you marked slop vs not slop
//     (smoothed log-odds, leave-one-out when training so a vote never explains itself);
//  2. a refit of the classifier weights, pulled towards the shipped weights so a handful of
//     votes can shift the model but never throw it away.
import { FEATURES, extract } from "./features";

export interface Lexicon { slop: Record<string, number>; ok: Record<string, number>; nSlop: number; nOk: number }
export interface Weights {
  bias: number; w: Record<string, number>; lex?: Lexicon;
  trained?: { n: number; at: string };
}
export interface VoteLike { text: string; label: string }

export const TASTE_PRIOR = 1.2;
const STOP = new Set("the and for are but not you your with this that have has was were from they them their its it's i'm i've don't can't just like about what when where who how all any one out get got will would could should there here then than too very also into over only some more most much many such been being does did doing our ours his her she him who whom why".split(" "));

export function tokens(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/https?:\/\/\S+|@\w+/g, " ");
  const words = clean.match(/[a-z$#][a-z0-9'’$#]{2,}/g) || [];
  const out = new Set<string>();
  let prev: string | null = null;
  for (const w of words) {
    if (STOP.has(w)) { prev = null; continue; }
    out.add(w);
    if (prev) out.add(prev + " " + w);
    prev = w;
  }
  return out;
}

export function buildLexicon(votes: VoteLike[]): Lexicon {
  const lex: Lexicon = { slop: {}, ok: {}, nSlop: 0, nOk: 0 };
  for (const v of votes) {
    const side = v.label === "slop" ? "slop" : "ok";
    if (side === "slop") lex.nSlop++; else lex.nOk++;
    for (const t of tokens(v.text)) lex[side][t] = (lex[side][t] || 0) + 1;
  }
  return lex;
}

// Taste in [-1, 1]: positive resembles posts you marked slop. `self` removes one vote's own
// contribution (leave-one-out) so training rows can't be explained by themselves.
export function tasteOf(text: string, lex: Lexicon | undefined, self?: "slop" | "not_slop"): number {
  if (!lex) return 0;
  const selfSlop = self === "slop" ? 1 : 0, selfOk = self === "not_slop" ? 1 : 0;
  const nS = lex.nSlop - selfSlop, nO = lex.nOk - selfOk;
  if (nS < 2 || nO < 2) return 0;
  const scored: number[] = [];
  for (const t of tokens(text)) {
    const cs = (lex.slop[t] || 0) - selfSlop, co = (lex.ok[t] || 0) - selfOk;
    if (cs + co < 2) continue;
    scored.push(Math.log((cs + 1) / (nS + 2)) - Math.log((co + 1) / (nO + 2)));
  }
  if (!scored.length) return 0;
  scored.sort((a, b) => Math.abs(b) - Math.abs(a));
  return Math.tanh(scored.slice(0, 6).reduce((a, b) => a + b, 0) / 3);
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const MAX_SHIFT = 1.5;

export interface RefitOptions { epochs?: number; lr?: number; lambda?: number; voteWeight?: number }

// Fits weights to the votes, regularised towards `base` (the shipped model).
export function refit(votes: VoteLike[], base: Weights, o: RefitOptions = {}): Weights {
  const { epochs = 160, lr = 0.2, lambda = 0.06, voteWeight = 2 } = o;
  const rows = votes.filter((v) => v.text && (v.label === "slop" || v.label === "not_slop"));
  const lex = buildLexicon(rows);
  const ids = FEATURES.map((f) => f.id);
  const b0 = base.bias, w0 = ids.map((id, i) => base.w[id] ?? FEATURES[i].prior), t0 = base.w.taste ?? TASTE_PRIOR;
  const data = rows.map((v) => ({
    x: [...extract(v.text), tasteOf(v.text, lex, v.label as "slop" | "not_slop")],
    y: v.label === "slop" ? 1 : 0
  }));
  let b = b0; const w = [...w0, t0]; const p0 = [...w0, t0];
  const clampTo = (v: number, c: number) => Math.min(c + MAX_SHIFT, Math.max(c - MAX_SHIFT, v));
  if (data.length >= 4) {
    for (let e = 0; e < epochs; e++) {
      const gw = new Array(w.length).fill(0); let gb = 0;
      for (const { x, y } of data) {
        let z = b; for (let i = 0; i < w.length; i++) z += w[i] * x[i];
        const err = (sigmoid(z) - y) * voteWeight;
        gb += err; for (let i = 0; i < w.length; i++) gw[i] += err * x[i];
      }
      const n = data.length;
      b = clampTo(b - lr * gb / n, b0);
      for (let i = 0; i < w.length; i++) w[i] = clampTo(w[i] - lr * (gw[i] / n + lambda * (w[i] - p0[i])), p0[i]);
    }
  }
  return {
    bias: +b.toFixed(4),
    w: { ...Object.fromEntries(ids.map((id, i) => [id, +w[i].toFixed(4)])), taste: +w[ids.length].toFixed(4) },
    lex: pruneLexicon(lex),
    trained: { n: rows.length, at: new Date().toISOString().slice(0, 10) }
  };
}

// Keeps the stored lexicon small: tokens seen once never matter (support >= 2).
export function pruneLexicon(lex: Lexicon): Lexicon {
  const keep = (m: Record<string, number>, other: Record<string, number>) =>
    Object.fromEntries(Object.entries(m).filter(([t, c]) => c + (other[t] || 0) >= 2));
  return { slop: keep(lex.slop, lex.ok), ok: keep(lex.ok, lex.slop), nSlop: lex.nSlop, nOk: lex.nOk };
}

export interface Evaluation {
  n: number; nSlop: number; nOk: number;
  shipped: { acc: number; auc: number }; personal: { acc: number; auc: number };
}

type Scorer = (text: string, w: Weights) => number; // 0-100

// Cross-validated: personal accuracy only ever scores votes the model did not train on.
export function evaluate(votes: VoteLike[], base: Weights, score: Scorer, k = 5): Evaluation | null {
  const rows = votes.filter((v) => v.text && (v.label === "slop" || v.label === "not_slop"));
  const nSlop = rows.filter((v) => v.label === "slop").length, nOk = rows.length - nSlop;
  if (rows.length < 10 || nSlop < 3 || nOk < 3) return null;
  const idx = rows.map((_, i) => i).sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
  const personal: { y: number; s: number }[] = new Array(rows.length);
  for (let f = 0; f < k; f++) {
    const test = idx.filter((_, j) => j % k === f), train = idx.filter((_, j) => j % k !== f).map((i) => rows[i]);
    const m = refit(train, base);
    for (const i of test) personal[i] = { y: rows[i].label === "slop" ? 1 : 0, s: score(rows[i].text, m) };
  }
  const shipped = rows.map((v) => ({ y: v.label === "slop" ? 1 : 0, s: score(v.text, base) }));
  const acc = (r: { y: number; s: number }[]) => r.filter((x) => (x.s >= 50) === !!x.y).length / r.length;
  const auc = (r: { y: number; s: number }[]) => {
    const pos = r.filter((x) => x.y), neg = r.filter((x) => !x.y);
    let s = 0; for (const p of pos) for (const n of neg) s += p.s > n.s ? 1 : p.s === n.s ? 0.5 : 0;
    return s / (pos.length * neg.length);
  };
  return { n: rows.length, nSlop, nOk, shipped: { acc: acc(shipped), auc: auc(shipped) }, personal: { acc: acc(personal), auc: auc(personal) } };
}
