const $ = (id) => document.getElementById(id);
// Mirrors host_permissions in manifest.json.
const ALLOWED_HOSTS = ["openrouter.ai", "api.anthropic.com", "api.openai.com", "localhost", "127.0.0.1"];
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
  const s = await chrome.storage.local.get(["enabled", "mode", "sensitivity", "apiKey", "sdStatus", "sdSpend", "dailyBudget", "profiles", "customRules", "acctInfluence", "provider", "providerModel", "providerBase", "providerKeys", "tierMode", "rageMode", "rageThreshold", "thirstMode", "thirstThreshold", "thirstVision", "igShowFollowed", "tasteMode"]);
  $("tasteMode").value = s.tasteMode === "off" ? "off" : "fold";
  $("rageMode").value = ["fold", "hide", "off"].includes(s.rageMode) ? s.rageMode : "fold";
  $("rageThreshold").value = s.rageThreshold ?? 70;
  $("rv").textContent = $("rageThreshold").value;
  $("thirstMode").value = ["fold", "hide", "off"].includes(s.thirstMode) ? s.thirstMode : "fold";
  $("thirstThreshold").value = s.thirstThreshold ?? 70;
  $("tv").textContent = $("thirstThreshold").value;
  $("thirstVision").checked = s.thirstVision === true;
  $("igShowFollowed").checked = s.igShowFollowed !== false;
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
  $("profiles").checked = s.profiles ?? false;
  $("acctInfluence").value = s.acctInfluence ?? 100;
  $("iv").textContent = $("acctInfluence").value;
  $("customRules").value = (s.customRules || []).join("\n");
  sv();
  $("status").textContent = s.sdStatus && !s.sdStatus.ok ? s.sdStatus.error : "";
  $("spend").textContent = `Approx. spend so far: $${(s.sdSpend || 0).toFixed(4)}`;
}

$("sensitivity").addEventListener("input", sv);
$("rageThreshold").addEventListener("input", () => ($("rv").textContent = $("rageThreshold").value));
$("thirstThreshold").addEventListener("input", () => ($("tv").textContent = $("thirstThreshold").value));
$("acctInfluence").addEventListener("input", () => ($("iv").textContent = $("acctInfluence").value));
$("save").addEventListener("click", async () => {
  stash();
  const prov = $("provider").value;
  // The extension can only reach hosts declared in its manifest (least privilege), so a custom
  // endpoint must be one of them: the providers below, or a model server on this computer.
  if (prov !== "jev") {
    let host = "";
    try { host = new URL(state.bases[prov]).hostname; } catch { $("msg").textContent = "Endpoint URL is not valid."; return; }
    if (!ALLOWED_HOSTS.includes(host)) {
      $("msg").textContent = `This endpoint isn't allowed. Use one of: ${ALLOWED_HOSTS.join(", ")}.`;
      return;
    }
  }
  await chrome.storage.local.set({
    provider: prov, providerModel: prov === "jev" ? "" : state.models[prov], providerBase: prov === "jev" ? "" : state.bases[prov],
    providerKeys: state.keys, tierMode: $("tierMode").value,
    rageMode: $("rageMode").value, rageThreshold: Number($("rageThreshold").value),
    thirstMode: $("thirstMode").value, thirstThreshold: Number($("thirstThreshold").value), thirstVision: $("thirstVision").checked, igShowFollowed: $("igShowFollowed").checked, tasteMode: $("tasteMode").value,
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
  if (!/^[a-z0-9_.*]{1,30}$/.test(h)) return false;
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
  const s = await chrome.storage.local.get(["sdVotes", "sdCreators", "customRules", "mode", "sensitivity", "dailyBudget", "profiles", "acctInfluence", "sdTaste", "sdRageVotes", "sdThirstVotes", "topicManual", "rageMode", "rageThreshold", "thirstMode", "thirstThreshold", "tasteMode"]);
  const payload = {
    app: "heed", version: 1, exported: new Date().toISOString(),
    votes: s.sdVotes || [], reactions: s.sdTaste || [], rageVotes: s.sdRageVotes || [], thirstVotes: s.sdThirstVotes || [], topicManual: s.topicManual || {},
    creators: s.sdCreators || {}, customRules: s.customRules || [],
    settings: { mode: s.mode, sensitivity: s.sensitivity, dailyBudget: s.dailyBudget, profiles: s.profiles, acctInfluence: s.acctInfluence, rageMode: s.rageMode, rageThreshold: s.rageThreshold, thirstMode: s.thirstMode, thirstThreshold: s.thirstThreshold, tasteMode: s.tasteMode }
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
    if (!["heed", "slop-detector"].includes(d?.app) || !Array.isArray(d.votes)) throw new Error("Not a Heed backup.");
    const cur = await chrome.storage.local.get(["sdVotes", "sdCreators"]);
    const byKey = new Map((cur.sdVotes || []).map((v) => [v.key, v]));
    for (const v of d.votes) {
      if (v && typeof v.key === "string" && (v.label === "slop" || v.label === "not_slop") && typeof v.text === "string") {
        byKey.set(v.key, { key: v.key, text: v.text.slice(0, 280), label: v.label, handle: v.handle, score: v.score, pattern: v.pattern, synthetic: v.synthetic, base: v.base, acct: v.acct, acctConf: v.acctConf, adjOk: v.adjOk, ts: v.ts || Date.now() });
      }
    }
    const creators = { ...(cur.sdCreators || {}) };
    for (const [h, r] of Object.entries(d.creators || {})) {
      if (/^[a-z0-9_.*]{1,30}$/.test(h) && (r === "mute" || r === "trust")) creators[h] = r;
    }
    const set = {
      sdVotes: [...byKey.values()].sort((a, b) => a.ts - b.ts).slice(-500),
      sdCreators: creators
    };
    const keyed = (arr, ok) => { const m = new Map(); for (const v of Array.isArray(arr) ? arr : []) if (v && typeof v.key === "string" && typeof v.text === "string" && ok(v.label)) m.set(v.key, { key: v.key, text: v.text.slice(0, 280), label: v.label, handle: v.handle, ts: v.ts || Date.now() }); return m; };
    if (Array.isArray(d.reactions)) {
      const cur2 = await chrome.storage.local.get(["sdTaste", "sdRageVotes", "sdThirstVotes"]);
      const merge = (old, add) => { const m = new Map((old || []).map((v) => [v.key, v])); for (const [k, v] of add) m.set(k, v); return [...m.values()].sort((a, b) => a.ts - b.ts); };
      set.sdTaste = merge(cur2.sdTaste, keyed(d.reactions, (l) => l === "less" || l === "more")).slice(-400);
      set.sdRageVotes = merge(cur2.sdRageVotes, keyed(d.rageVotes, (l) => l === "rage" || l === "not_rage")).slice(-300);
      set.sdThirstVotes = merge(cur2.sdThirstVotes, keyed(d.thirstVotes, (l) => l === "thirst" || l === "not_thirst")).slice(-300);
    }
    if (d.topicManual && typeof d.topicManual === "object") {
      set.topicManual = Object.fromEntries(Object.entries(d.topicManual).filter(([k, v]) => SD.topics.TOPICS.some((t) => t.id === k) && (v === "less" || v === "more")));
    }
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
  document.title = `${h[0].toUpperCase() + h.slice(1)} · Heed`;
}
addEventListener("hashchange", route);
route();

// ---- Learning from votes ----
async function renderLearning() {
  const { sdVotes = [], sdModel, learn } = await chrome.storage.local.get(["sdVotes", "sdModel", "learn"]);
  $("learn").checked = learn !== false;
  const box = $("learnStats");
  box.textContent = "";
  const stat = (value, label, cls) => {
    const d = document.createElement("div");
    d.className = "stat";
    const b = document.createElement("b");
    b.textContent = value;
    if (cls) b.className = cls;
    const s = document.createElement("span");
    s.textContent = label;
    d.append(b, s);
    box.append(d);
  };
  const ev = SD.learn.evaluate(sdVotes);
  if (learn === false) {
    $("learnMsg").textContent = "Learning is off. The shipped classifier is used as is.";
  } else if (!ev) {
    const slop = sdVotes.filter((v) => v.label === "slop").length;
    $("learnMsg").textContent = `Needs at least 10 votes with 3+ of each kind to measure learning (you have ${sdVotes.length}: ${slop} slop, ${sdVotes.length - slop} not slop). Until then it keeps using the shipped classifier.`;
    stat(String(sdVotes.length), "votes so far");
  } else {
    const pct = (x) => Math.round(x * 100) + "%";
    const d = Math.round((ev.personal.acc - ev.shipped.acc) * 100);
    stat(pct(ev.shipped.acc), "shipped classifier agrees with your votes");
    stat(pct(ev.personal.acc), "after learning (cross-validated)", d > 0 ? "up" : d < 0 ? "down" : "");
    stat(String(sdModel?.trained?.n ?? 0), "votes in the current model");
    $("learnMsg").textContent = d > 0
      ? `Learning from your votes improves agreement by ${d} points on posts it has not trained on (on-device classifier only, at a score of 50).`
      : d < 0 ? "Learning does not help yet; more varied votes will. The model stays close to the shipped one either way."
      : "No measurable difference yet. More votes will tell.";
  }
}
$("learn").addEventListener("change", async (e) => { await chrome.storage.local.set({ learn: e.target.checked }); renderLearning(); });
$("retrain").addEventListener("click", async () => {
  $("learnMsg").textContent = "Retraining…";
  await chrome.storage.local.set({ learn: true });
  const { sdVotes = [] } = await chrome.storage.local.get("sdVotes");
  if (sdVotes.length >= 6) await chrome.storage.local.set({ sdModel: SD.learn.refit(sdVotes) });
  renderLearning();
});
renderLearning();
chrome.storage.onChanged.addListener((ch) => { if (ch.sdVotes || ch.sdModel || ch.learn) renderLearning(); });

// ---- Topics ----
async function renderTopics() {
  const { sdTaste = [], topicManual = {} } = await chrome.storage.local.get(["sdTaste", "topicManual"]);
  const prefs = SD.topics.topicPrefs(sdTaste, topicManual);
  const list = $("topicList");
  list.textContent = "";
  for (const t of SD.topics.TOPICS) {
    const p = prefs[t.id];
    const li = document.createElement("li");
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = t.label;
    const small = document.createElement("small");
    small.className = "mute";
    small.textContent = p.manual ? `set by you` : p.likes + p.dislikes > 0 ? `${p.likes} 👍 · ${p.dislikes} 👎` : "no reactions yet";
    nm.append(small);
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${t.label} preference ${p.pref > 0.15 ? "more" : p.pref < -0.15 ? "less" : "neutral"}`);
    const mark = document.createElement("i");
    mark.style.left = `${50 + p.pref * 50}%`;
    bar.append(mark);
    const seg = document.createElement("div");
    seg.className = "seg3";
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", `${t.label}: set preference`);
    for (const [val, label] of [["less", "Less"], ["", "Auto"], ["more", "More"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute("aria-pressed", String((p.manual || "") === val));
      b.onclick = async () => {
        const next = { ...topicManual };
        if (val) next[t.id] = val; else delete next[t.id];
        await chrome.storage.local.set({ topicManual: next });
      };
      seg.append(b);
    }
    li.append(nm, bar, seg);
    list.append(li);
  }
}
renderTopics();
chrome.storage.onChanged.addListener((ch) => { if (ch.sdTaste || ch.topicManual) renderTopics(); });
