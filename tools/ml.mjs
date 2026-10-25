// Shared by train.mjs and eval.mjs: tiny logistic regression centred on the priors.
import "../lib.js";
const SD = globalThis.SD;
export const F = SD.FEATURES;

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const priorW = () => ({ bias: -1.2, w: Object.fromEntries(F.map((f) => [f.id, f.prior])) });

// Features come from the built lib via a ctx; recompute through localScore's extractor.
export function vec(text) {
  // SD exposes FEATURES with fn(ctx); rebuild a ctx the same way features.ts does.
  const t = text.replace(/\r/g, "").trim();
  const ctx = {
    text: t, lower: t.toLowerCase(),
    words: t.toLowerCase().match(/[a-z0-9@#'’]+/g) || [],
    sentences: t.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean),
    lines: t.split(/\n+/).map((l) => l.trim()).filter(Boolean), chars: t.length
  };
  return F.map((f) => f.fn(ctx));
}

export function fit(rows, { epochs = 400, lr = 0.2, lambda = 0.08 } = {}) {
  const w = priorW();
  const p0 = F.map((f) => f.prior);
  const wv = [...p0];
  let b = w.bias;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(F.length).fill(0); let gb = 0;
    for (const { x, y } of rows) {
      let z = b; for (let i = 0; i < wv.length; i++) z += wv[i] * x[i];
      const err = sigmoid(z) - y;
      gb += err; for (let i = 0; i < wv.length; i++) gw[i] += err * x[i];
    }
    const n = rows.length;
    b -= lr * gb / n;
    for (let i = 0; i < wv.length; i++) wv[i] -= lr * (gw[i] / n + lambda * (wv[i] - p0[i]));
  }
  return { bias: b, w: Object.fromEntries(F.map((f, i) => [f.id, +wv[i].toFixed(3)])) };
}

export const predict = (m, x) => { let z = m.bias; F.forEach((f, i) => { z += m.w[f.id] * x[i]; }); return sigmoid(z); };

export function auc(scored) { // [{s, y}]
  const pos = scored.filter((r) => r.y === 1), neg = scored.filter((r) => r.y === 0);
  let sum = 0;
  for (const p of pos) for (const n of neg) sum += p.s > n.s ? 1 : p.s === n.s ? 0.5 : 0;
  return sum / (pos.length * neg.length);
}
export function prf(scored, thr) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of scored) { const pred = r.s >= thr; if (pred && r.y) tp++; else if (pred) fp++; else if (r.y) fn++; else tn++; }
  const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
  return { precision: p, recall: r, f1: 2 * p * r / (p + r || 1), acc: (tp + tn) / scored.length };
}
