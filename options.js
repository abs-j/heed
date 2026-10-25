const $ = (id) => document.getElementById(id);
const PROV = {
  jev: { label: "OpenRouter API key", model: "", base: "", ph: "sk-or-v1-..." },
  anthropic: { label: "Anthropic API key", model: "claude-haiku-5-5", base: "https://api.anthropic.com/v1/messages", ph: "sk-ant-..." },
  openai: { label: "API key (leave empty for local servers)", model: "gpt-4.1-mini", base: "https://api.openai.com/v1/chat/completions", ph: "sk-..." }
};
let state = { keys: {}, jev: "", models: {}, bases: {}, prov: "jev" };
// Keep each provider's key/model/endpoint separate while the select changes.
function stash() {
  const k = $("apiKey").value.trim();
  if (state.prov === "jev") state.jev = k; else state.keys[state.prov] = k;
  if (state.prov !== "jev") { state.models[state.prov] = $("providerModel").value.trim(); state.bases[state.prov] = $("providerBase").value.trim(); }
}
function showProvider() {
  const p = $("provider").value, d = PROV[p];
  state.prov = p;
  $("keyLabel").textContent = d.label;
  $("apiKey").placeholder = d.ph;
  $("apiKey").value = p === "jev" ? state.jev : state.keys[p] || "";
  $("modelRow").hidden = $("baseRow").hidden = p === "jev";
  $("providerModel").value = state.models[p] || d.model;
  $("providerBase").value = state.bases[p] || d.base;
}
$("provider").addEventListener("focus", stash);
$("provider").addEventListener("change", showProvider);
const sv = () => ($("sv").textContent = $("sensitivity").value);

async function load() {
  const s = await chrome.storage.local.get(["enabled", "mode", "sensitivity", "apiKey", "sdStatus", "sdSpend", "dailyBudget", "profiles", "customRules", "acctInfluence", "provider", "providerModel", "providerBase", "providerKeys", "tierMode"]);
  const prov = PROV[s.provider] ? s.provider : "jev";
  $("provider").value = prov;
  $("tierMode").value = s.tierMode || "tiered";
  state = { keys: s.providerKeys || {}, jev: s.apiKey || "", prov,
    models: prov !== "jev" && s.providerModel ? { [prov]: s.providerModel } : {},
    bases: prov !== "jev" && s.providerBase ? { [prov]: s.providerBase } : {} };
  showProvider();
  $("enabled").checked = s.enabled ?? true;
  $("mode").value = s.mode || "blur";
  $("sensitivity").value = s.sensitivity ?? 60;
  $("dailyBudget").value = s.dailyBudget || 0;
  $("profiles").checked = s.profiles ?? true;
  $("acctInfluence").value = s.acctInfluence ?? 100;
  $("iv").textContent = $("acctInfluence").value;
  $("customRules").value = (s.customRules || []).join("\n");
  sv();
  $("status").textContent = s.sdStatus && !s.sdStatus.ok ? s.sdStatus.error : "";
  $("spend").textContent = `Approx. spend so far: $${(s.sdSpend || 0).toFixed(4)}`;
}

$("sensitivity").addEventListener("input", sv);
$("acctInfluence").addEventListener("input", () => ($("iv").textContent = $("acctInfluence").value));
$("save").addEventListener("click", async () => {
  stash();
  const prov = $("provider").value;
  // A custom endpoint on another host needs the user's permission (granted per origin).
  if (prov !== "jev") {
    try {
      const origin = new URL(state.bases[prov]).origin + "/*";
      if (!(await chrome.permissions.contains({ origins: [origin] })) && !(await chrome.permissions.request({ origins: [origin] }))) {
        $("msg").textContent = "Permission to reach that endpoint was declined.";
        return;
      }
    } catch { $("msg").textContent = "Endpoint URL is not valid."; return; }
  }
  await chrome.storage.local.set({
    provider: prov, providerModel: prov === "jev" ? "" : state.models[prov], providerBase: prov === "jev" ? "" : state.bases[prov],
    providerKeys: state.keys, tierMode: $("tierMode").value,
    enabled: $("enabled").checked,
    mode: $("mode").value,
    sensitivity: Number($("sensitivity").value),
    apiKey: state.jev,
    profiles: $("profiles").checked,
    acctInfluence: Number($("acctInfluence").value),
    customRules: $("customRules").value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5),
    dailyBudget: Math.max(0, Number($("dailyBudget").value) || 0)
  });
  await chrome.storage.local.remove("sdStatus");
  $("status").textContent = "";
  $("msg").textContent = "Saved.";
  setTimeout(() => ($("msg").textContent = ""), 1500);
});
$("clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear", votes: true });
  $("msg").textContent = "Cache and vote history cleared (reload X).";
  renderVotes();
});
load();

async function renderVotes() {
  const { sdVotes = [] } = await chrome.storage.local.get("sdVotes");
  const list = $("votes");
  list.textContent = "";
  const slop = sdVotes.filter((v) => v.label === "slop").length;
  $("hcount").textContent = sdVotes.length
    ? `${sdVotes.length} votes: ${slop} slop, ${sdVotes.length - slop} not slop. Recent votes also steer future scoring.`
    : "No votes yet. Use the Slop / Not slop buttons under posts.";
  for (const v of [...sdVotes].reverse()) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const tag = document.createElement("span");
    tag.className = "tag " + v.label;
    tag.textContent = v.label === "slop" ? "Slop" : "Not slop";
    meta.append(tag, new Date(v.ts).toLocaleString());
    const txt = document.createElement("p");
    txt.className = "txt";
    txt.textContent = v.text;
    const flip = document.createElement("button");
    flip.className = "ghost";
    flip.textContent = v.label === "slop" ? "Switch to Not slop" : "Switch to Slop";
    flip.onclick = async () => {
      await chrome.runtime.sendMessage({ type: "feedback", key: v.key, text: v.text, label: v.label === "slop" ? "not_slop" : "slop" });
      renderVotes();
    };
    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Remove";
    del.onclick = async () => {
      await chrome.runtime.sendMessage({ type: "unvote", key: v.key });
      renderVotes();
    };
    li.append(meta, txt, flip, del);
    list.append(li);
  }
}
renderVotes();
chrome.storage.onChanged.addListener((ch) => { if (ch.sdVotes) renderVotes(); });

// ---- Creator rules ----
async function renderCreators() {
  const { sdCreators = {} } = await chrome.storage.local.get("sdCreators");
  const list = $("cList");
  list.textContent = "";
  const entries = Object.entries(sdCreators);
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "mute";
    li.textContent = "No manual rules yet.";
    list.append(li);
  }
  for (const [h, rule] of entries) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const tag = document.createElement("span");
    tag.className = "tag " + (rule === "mute" ? "slop" : "not_slop");
    tag.textContent = rule === "mute" ? "Always collapse" : "Always show";
    meta.append(tag, "@" + h);
    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Remove";
    del.onclick = async () => {
      delete sdCreators[h];
      await chrome.storage.local.set({ sdCreators });
    };
    li.append(meta, del);
    list.append(li);
  }
}
async function setCreator(handle, rule) {
  const h = String(handle).trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(h)) return false;
  const { sdCreators = {} } = await chrome.storage.local.get("sdCreators");
  sdCreators[h] = rule;
  await chrome.storage.local.set({ sdCreators });
  return true;
}
$("cAdd").addEventListener("click", async () => {
  if (await setCreator($("cHandle").value, $("cRule").value)) $("cHandle").value = "";
});
renderCreators();

// ---- Recently filtered ----
async function renderFiltered() {
  const { sdFiltered = [] } = await chrome.storage.local.get("sdFiltered");
  const list = $("fList");
  list.textContent = "";
  $("fcount").textContent = sdFiltered.length
    ? `Last ${sdFiltered.length} posts that were collapsed or hidden.`
    : "Nothing filtered yet. Posts that get collapsed or hidden appear here.";
  for (const f of sdFiltered) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const tag = document.createElement("span");
    tag.className = "tag slop";
    tag.textContent = `Slop · ${f.score}`;
    meta.append(tag, (f.handle ? "@" + f.handle + " · " : "") + new Date(f.ts).toLocaleString());
    const why = document.createElement("div");
    why.className = "mute";
    why.textContent = f.explanation || "";
    const txt = document.createElement("p");
    txt.className = "txt";
    txt.textContent = f.text;
    const ok = document.createElement("button");
    ok.className = "ghost";
    ok.textContent = "Not slop";
    ok.onclick = async () => {
      await chrome.runtime.sendMessage({ type: "feedback", key: f.key, text: f.text, label: "not_slop", handle: f.handle });
      const { sdFiltered: cur = [] } = await chrome.storage.local.get("sdFiltered");
      await chrome.storage.local.set({ sdFiltered: cur.filter((e) => e.key !== f.key) });
    };
    li.append(meta, why, txt, ok);
    if (f.handle) {
      const show = document.createElement("button");
      show.className = "ghost";
      show.textContent = `Always show @${f.handle}`;
      show.onclick = () => setCreator(f.handle, "trust");
      const mute = document.createElement("button");
      mute.className = "ghost";
      mute.textContent = `Always collapse @${f.handle}`;
      mute.onclick = () => setCreator(f.handle, "mute");
      li.append(show, mute);
    }
    list.append(li);
  }
}
renderFiltered();
chrome.storage.onChanged.addListener((ch) => {
  if (ch.sdCreators) renderCreators();
  if (ch.sdFiltered) renderFiltered();
});

// ---- Threshold tuning: pick the cut-off that best agrees with your votes ----
async function renderTuning() {
  const { sdVotes = [], sensitivity = 60 } = await chrome.storage.local.get(["sdVotes", "sensitivity"]);
  const real = SD.scoredVotes(sdVotes);
  const nSlop = real.filter((v) => v.label === "slop").length;
  const nOk = real.length - nSlop;
  const btn = $("tuneApply");
  btn.hidden = true;
  if (real.length < 8 || nSlop < 2 || nOk < 2) {
    $("tuneMsg").textContent = `Needs at least 8 votes on scored posts with 2+ of each kind (you have ${real.length}: ${nSlop} slop, ${nOk} not slop).`;
    return;
  }
  const best = SD.bestThreshold(real, sensitivity);
  const pct = (n) => Math.round((n / real.length) * 100);
  $("tuneMsg").textContent = best.t === sensitivity
    ? `Your sensitivity of ${sensitivity} already agrees with ${pct(best.a)}% of your ${real.length} votes. Nothing to change.`
    : `Sensitivity ${best.t} would agree with ${pct(best.a)}% of your ${real.length} votes; your current ${sensitivity} agrees with ${pct(best.agreeAt(sensitivity))}%.`;
  if (best.t !== sensitivity) {
    btn.hidden = false;
    btn.textContent = `Set sensitivity to ${best.t}`;
    btn.onclick = async () => {
      await chrome.storage.local.set({ sensitivity: best.t });
      $("sensitivity").value = best.t;
      sv();
      renderTuning();
    };
  }
}

// ---- Stats ----
async function renderStats() {
  const { sdStats = { days: {} }, sdAuthors = {} } = await chrome.storage.local.get(["sdStats", "sdAuthors"]);
  const days = Object.keys(sdStats.days).sort().slice(-7).reverse();
  const t = $("statTable");
  t.textContent = "";
  const row = (cells, head) => {
    const tr = document.createElement("tr");
    for (const c of cells) {
      const td = document.createElement(head ? "th" : "td");
      td.textContent = c;
      tr.append(td);
    }
    t.append(tr);
  };
  row(["Day", "Scanned", "Filtered", "On-device", "Spend"], true);
  if (!days.length) row(["No data yet", "", "", "", ""]);
  const tot = { scanned: 0, filtered: 0, tier0: 0, spend: 0 };
  for (const d of days) {
    const r = sdStats.days[d];
    for (const k of Object.keys(tot)) tot[k] += r[k] || 0;
    tot.tier0 += r.local || 0;
    const pct = r.scanned ? ` (${Math.round(((r.filtered || 0) / r.scanned) * 100)}%)` : "";
    row([d, r.scanned || 0, (r.filtered || 0) + pct, (r.tier0 || 0) + (r.local || 0), "$" + (r.spend || 0).toFixed(3)]);
  }
  if (days.length > 1) row(["Total", tot.scanned, tot.filtered, tot.tier0, "$" + tot.spend.toFixed(3)]);

  const list = $("offenders");
  list.textContent = "";
  const top = Object.entries(sdAuthors).filter(([, a]) => a.n >= 3)
    .map(([h, a]) => ({ h, n: a.n, avg: Math.round(a.sum / a.n) }))
    .sort((a, b) => b.avg - a.avg).slice(0, 5);
  if (!top.length) {
    const li = document.createElement("li");
    li.className = "mute";
    li.textContent = "Needs 3+ scored posts from a creator.";
    list.append(li);
  }
  for (const o of top) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `@${o.h} · average ${o.avg} over ${o.n} posts`;
    const b = document.createElement("button");
    b.className = "ghost";
    b.textContent = "Always collapse";
    b.onclick = () => setCreator(o.h, "mute");
    li.append(meta, b);
    list.append(li);
  }
}

// ---- Export / import ----
$("export").addEventListener("click", async () => {
  const s = await chrome.storage.local.get(["sdVotes", "sdCreators", "customRules", "mode", "sensitivity", "dailyBudget", "profiles", "acctInfluence"]);
  const payload = {
    app: "slop-detector", version: 1, exported: new Date().toISOString(),
    votes: s.sdVotes || [], creators: s.sdCreators || {}, customRules: s.customRules || [],
    settings: { mode: s.mode, sensitivity: s.sensitivity, dailyBudget: s.dailyBudget, profiles: s.profiles, acctInfluence: s.acctInfluence }
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  a.download = "slop-detector-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
  $("bmsg").textContent = `Exported ${payload.votes.length} votes.`;
});
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d?.app !== "slop-detector" || !Array.isArray(d.votes)) throw new Error("Not a Slop Detector backup.");
    const cur = await chrome.storage.local.get(["sdVotes", "sdCreators"]);
    const byKey = new Map((cur.sdVotes || []).map((v) => [v.key, v]));
    for (const v of d.votes) {
      if (v && typeof v.key === "string" && (v.label === "slop" || v.label === "not_slop") && typeof v.text === "string") {
        byKey.set(v.key, { key: v.key, text: v.text.slice(0, 280), label: v.label, handle: v.handle, score: v.score, pattern: v.pattern, synthetic: v.synthetic, base: v.base, acct: v.acct, acctConf: v.acctConf, adjOk: v.adjOk, ts: v.ts || Date.now() });
      }
    }
    const creators = { ...(cur.sdCreators || {}) };
    for (const [h, r] of Object.entries(d.creators || {})) {
      if (/^[a-z0-9_]{1,15}$/.test(h) && (r === "mute" || r === "trust")) creators[h] = r;
    }
    const set = {
      sdVotes: [...byKey.values()].sort((a, b) => a.ts - b.ts).slice(-500),
      sdCreators: creators
    };
    if (Array.isArray(d.customRules)) set.customRules = d.customRules.map(String).slice(0, 5);
    const st = d.settings || {};
    if (["blur", "hide", "dim", "badge", "scores"].includes(st.mode)) set.mode = st.mode;
    if (typeof st.sensitivity === "number") set.sensitivity = Math.min(95, Math.max(10, st.sensitivity));
    if (typeof st.dailyBudget === "number") set.dailyBudget = Math.max(0, st.dailyBudget);
    if (typeof st.profiles === "boolean") set.profiles = st.profiles;
    if (typeof st.acctInfluence === "number") set.acctInfluence = Math.min(150, Math.max(0, st.acctInfluence));
    await chrome.storage.local.set(set);
    $("bmsg").textContent = `Imported ${d.votes.length} votes.`;
    load();
  } catch (e) {
    $("bmsg").textContent = "Import failed: " + e.message;
  }
});

renderTuning();
renderStats();
chrome.storage.onChanged.addListener((ch) => {
  if (ch.sdVotes || ch.sensitivity) renderTuning();
  if (ch.sdStats || ch.sdAuthors) renderStats();
});

// ---- Sections (hash routing) ----
const SECTIONS = ["general", "detection", "filters", "review", "insights", "data"];
const ALIAS = { history: "review", filtered: "review", creators: "filters", stats: "insights", tuning: "insights", backup: "data" };
function route() {
  let h = location.hash.slice(1);
  h = ALIAS[h] || (SECTIONS.includes(h) ? h : "general");
  document.querySelectorAll("[data-section]").forEach((s) => (s.hidden = s.id !== h));
  document.querySelectorAll("#nav a").forEach((a) => (a.dataset.s === h ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = `${h[0].toUpperCase() + h.slice(1)} · Slop Detector`;
}
addEventListener("hashchange", route);
route();
