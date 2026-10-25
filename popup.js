const $ = (id) => document.getElementById(id);
const MODES = ["blur", "hide", "dim", "badge", "scores"];
const ENGINE = { tiered: "Tiered", llm: "AI model", local: "Local only" };
const PROVIDER = { jev: "Jev", anthropic: "Claude", openai: "OpenAI-compatible" };
const needsKey = (s) => (s.tierMode === "local" ? false
  : !s.provider || s.provider === "jev" ? !s.apiKey
  : !s.providerKeys?.[s.provider] && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(s.providerBase || ""));

function setMode(v) {
  document.querySelectorAll("#mode button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.v === v));
    b.tabIndex = b.dataset.v === v ? 0 : -1;
  });
}

// Histogram of recently shown scores with the part that the current sensitivity would flag.
function drawDist(scores, t) {
  const bins = new Array(20).fill(0);
  for (const s of scores) bins[Math.min(19, Math.floor(s / 5))]++;
  const max = Math.max(1, ...bins);
  const box = $("bars");
  box.textContent = "";
  bins.forEach((n, i) => {
    const b = document.createElement("i");
    b.style.height = `${Math.round((n / max) * 100)}%`;
    if (i * 5 >= t) b.className = "over";
    box.append(b);
  });
  $("preview").textContent = scores.length >= 10
    ? `~${Math.round((scores.filter((s) => s >= t).length / scores.length) * 100)}% of recent posts`
    : "needs more posts";
}

function drawSpark(stats) {
  const svg = $("spark");
  svg.textContent = "";
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const vals = days.map((d) => stats?.days?.[d]?.filtered || 0);
  const max = Math.max(1, ...vals);
  vals.forEach((v, i) => {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const h = v ? Math.max(3, (v / max) * 34) : 2;
    r.setAttribute("x", String(i * 32 + 2)); r.setAttribute("width", "26");
    r.setAttribute("y", String(36 - h)); r.setAttribute("height", String(h)); r.setAttribute("rx", "3");
    if (!v) r.setAttribute("class", "z");
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = `${days[i]}: ${v} folded`;
    r.append(t);
    svg.append(r);
  });
}

(async () => {
  const s = await chrome.storage.local.get(["enabled", "mode", "sensitivity", "apiKey", "provider", "providerKeys", "providerBase", "tierMode", "sdStatus", "sdHealth", "sdStats", "sdRecent"]);
  $("enabled").checked = s.enabled ?? true;
  setMode(MODES.includes(s.mode) ? s.mode : "blur");
  const sens = s.sensitivity ?? 60;
  $("sensitivity").value = sens;
  $("sv").textContent = sens;
  $("engine").textContent = `${ENGINE[s.tierMode] || ENGINE.tiered}${s.tierMode === "local" ? "" : " · " + (PROVIDER[s.provider] || "Jev")}`;

  const day = s.sdStats?.days?.[new Date().toISOString().slice(0, 10)] || {};
  $("tScanned").textContent = day.scanned || 0;
  $("tFolded").textContent = day.filtered || 0;
  const onDevice = (day.tier0 || 0) + (day.local || 0);
  $("tLocal").textContent = day.scanned ? Math.round((onDevice / day.scanned) * 100) + "%" : "–";
  drawSpark(s.sdStats);
  drawDist(s.sdRecent || [], sens);

  const msg = s.sdStatus && !s.sdStatus.ok ? { t: s.sdStatus.error, err: true }
    : needsKey(s) ? { t: "No AI key set. The on-device classifier is doing the work for now." }
    : s.sdHealth?.msg ? { t: s.sdHealth.msg } : null;
  if (msg) { $("status").textContent = msg.t; $("status").hidden = false; $("status").classList.toggle("err", !!msg.err); }

  $("sensitivity").oninput = (e) => {
    const t = Number(e.target.value);
    $("sv").textContent = t;
    drawDist(s.sdRecent || [], t);
    chrome.storage.local.set({ sensitivity: t });
  };
})();

$("enabled").onchange = (e) => chrome.storage.local.set({ enabled: e.target.checked });
$("mode").onclick = (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  setMode(b.dataset.v);
  chrome.storage.local.set({ mode: b.dataset.v });
};
$("mode").onkeydown = (e) => {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in keys)) return;
  const btns = [...document.querySelectorAll("#mode button")];
  const i = btns.findIndex((b) => b.getAttribute("aria-checked") === "true");
  const next = btns[(i + keys[e.key] + btns.length) % btns.length];
  e.preventDefault();
  next.click();
  next.focus();
};
$("opts").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
$("hist").onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("options.html#review") }); };
