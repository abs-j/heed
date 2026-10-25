import { FEATURES, extract } from "./features";
import { tasteOf, TASTE_PRIOR, refit, evaluate, type Weights } from "./learn";
import learned from "./weights.json";

export type { Weights };

const priors = (): Weights => ({ bias: -1.2, w: Object.fromEntries(FEATURES.map((f) => [f.id, f.prior])) });
export const DEFAULT_WEIGHTS: Weights = (learned as Weights)?.w && Object.keys((learned as Weights).w).length
  ? (learned as Weights) : priors();

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export interface LocalResult { score: number; p: number; hits: string[] }

export function localScore(text: string, weights: Weights = DEFAULT_WEIGHTS): LocalResult {
  const x = extract(text);
  let z = weights.bias;
  const contrib: [string, number][] = [];
  FEATURES.forEach((f, i) => {
    const v = (weights.w[f.id] ?? f.prior) * x[i];
    z += v;
    if (v > 0.35) contrib.push([f.label, v]);
  });
  const taste = tasteOf(text, weights.lex);
  if (taste) {
    const v = (weights.w.taste ?? TASTE_PRIOR) * taste;
    z += v;
    if (v > 0.35) contrib.push(["resembles posts you marked slop", v]);
  }
  const p = sigmoid(z);
  contrib.sort((a, b) => b[1] - a[1]);
  return { score: Math.round(p * 100), p, hits: contrib.slice(0, 5).map((c) => c[0]) };
}

// One online gradient step, used to nudge weights from a single vote on-device.
export function sgdStep(w: Weights, text: string, label: 0 | 1, lr = 0.15, l2 = 0.02): Weights {
  const x = extract(text);
  let z = w.bias;
  FEATURES.forEach((f, i) => { z += (w.w[f.id] ?? f.prior) * x[i]; });
  const err = sigmoid(z) - label;
  const next: Weights = { bias: w.bias - lr * err, w: { ...w.w } };
  FEATURES.forEach((f, i) => {
    const cur = next.w[f.id] ?? f.prior;
    next.w[f.id] = cur - lr * (err * x[i] + l2 * (cur - f.prior));
  });
  return next;
}

// Learning entry points bound to the shipped weights.
export const learn = {
  refit: (votes: { text: string; label: string }[]) => refit(votes, DEFAULT_WEIGHTS),
  evaluate: (votes: { text: string; label: string }[]) => evaluate(votes, DEFAULT_WEIGHTS, (t, w) => localScore(t, w).score)
};
