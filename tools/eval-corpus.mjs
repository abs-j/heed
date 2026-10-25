// Compares the frozen v1.5 heuristic, the hand-weighted priors, and the trained model
// (5-fold CV so the trained number is out-of-sample).
import { SEED } from "../test/corpus-seed.mjs";
import { vec, fit, predict, priorW, auc, prf } from "./ml.mjs";
import { HOLDOUT } from "../test/corpus-holdout.mjs";
import "./legacy-lib.js";
const legacy = globalThis.SD.localScore;
const data = SEED.map(([y, t]) => ({ y, t, x: vec(t) }));

const rows = {
  "v1.5 heuristic": data.map((d) => ({ y: d.y, s: legacy(d.t).score })),
  "priors only": data.map((d) => ({ y: d.y, s: predict(priorW(), d.x) * 100 })),
};
const cv = new Array(data.length);
const K = 5, idx = data.map((_, i) => i).sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));
for (let k = 0; k < K; k++) {
  const test = idx.filter((_, j) => j % K === k), train = idx.filter((_, j) => j % K !== k);
  const m = fit(train.map((i) => data[i]));
  for (const i of test) cv[i] = { y: data[i].y, s: predict(m, data[i].x) * 100 };
}
rows["trained (5-fold CV)"] = cv;

// Held-out set: model trained on the seed only.
{
  const full = fit(data);
  const ho = HOLDOUT.map(([y, t]) => ({ y, t, x: vec(t) }));
  rows["HOLDOUT v1.5"] = ho.map((d) => ({ y: d.y, s: legacy(d.t).score }));
  rows["HOLDOUT priors"] = ho.map((d) => ({ y: d.y, s: predict(priorW(), d.x) * 100 }));
  rows["HOLDOUT trained"] = ho.map((d) => ({ y: d.y, s: predict(full, d.x) * 100 }));
  globalThis.__ho = { ho, full };
}
console.log(`corpus: ${data.length} posts (${data.filter((d) => d.y).length} slop)\n`);
console.log("detector              AUC    acc@50  prec   recall  F1");
for (const [name, r] of Object.entries(rows)) {
  const thr = name.endsWith("v1.5") ? 60 : 50;
  const m = prf(r, thr);
  console.log(`${name.padEnd(22)}${auc(r).toFixed(3)}  ${m.acc.toFixed(2)}    ${m.precision.toFixed(2)}   ${m.recall.toFixed(2)}    ${m.f1.toFixed(2)}`);
}
console.log("\n(v1.5 shown at its default sensitivity of 60; others at 50.)");
if (process.argv.includes("--errors")) {
  console.log("\nMisses (trained, CV):");
  cv.forEach((r, i) => { if ((r.s >= 50) !== !!r.y) console.log(`  [${r.y ? "slop" : "ok"} ${Math.round(r.s)}] ${data[i].t.replace(/\s+/g, " ").slice(0, 90)}`); });
}

if (process.argv.includes("--errors")) {
  const { ho, full } = globalThis.__ho;
  console.log("\nHoldout misses (trained):");
  ho.forEach((d) => { const s = predict(full, d.x) * 100; if ((s >= 50) !== !!d.y) console.log(`  [${d.y ? "slop" : "ok"} ${Math.round(s)}] ${d.t.replace(/\s+/g, " ").slice(0, 90)}`); });
}
