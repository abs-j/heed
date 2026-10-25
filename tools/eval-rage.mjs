// Rage-bait scorer on the synthetic seed and held-out corpora (priors only, no training).
import "../lib.js";
import { RAGE_SEED, RAGE_HOLDOUT } from "../test/rage-corpus.mjs";
const SD = globalThis.SD;
const auc = (r) => { const pos = r.filter((x) => x.y), neg = r.filter((x) => !x.y); let s = 0; for (const p of pos) for (const n of neg) s += p.s > n.s ? 1 : p.s === n.s ? 0.5 : 0; return s / (pos.length * neg.length); };
for (const [name, set] of [["seed", RAGE_SEED], ["holdout", RAGE_HOLDOUT]]) {
  const rows = set.map(([y, t]) => ({ y, t, s: SD.rage.localRage(t).score }));
  const at = (thr) => { const tp = rows.filter((r) => r.y && r.s >= thr).length, fp = rows.filter((r) => !r.y && r.s >= thr).length, fn = rows.filter((r) => r.y && r.s < thr).length; return `thr ${thr}: precision ${(tp / (tp + fp || 1)).toFixed(2)} recall ${(tp / (tp + fn || 1)).toFixed(2)} (fp ${fp}, fn ${fn})`; };
  console.log(`${name}: AUC ${auc(rows).toFixed(3)} | ${at(60)} | ${at(70)}`);
  if (process.argv.includes("--errors")) for (const r of rows) if ((r.s >= 60) !== !!r.y) console.log(`   [${r.y ? "rage" : "ok"} ${r.s}] ${r.t.slice(0, 90)}`);
}
