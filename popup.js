const $ = (id) => document.getElementById(id);
(async () => {
  const s = await chrome.storage.local.get(["enabled", "mode", "sensitivity", "apiKey", "sdStatus", "sdHealth"]);
  $("enabled").checked = s.enabled ?? true;
  $("mode").value = s.mode || "blur";
  $("sensitivity").value = s.sensitivity ?? 60;
  $("sv").textContent = $("sensitivity").value;
  $("status").textContent = !s.apiKey ? "Add your OpenRouter API key in settings."
    : s.sdStatus && !s.sdStatus.ok ? s.sdStatus.error
    : s.sdHealth?.msg ? s.sdHealth.msg : "";
})();
$("enabled").onchange = (e) => chrome.storage.local.set({ enabled: e.target.checked });
$("mode").onchange = (e) => chrome.storage.local.set({ mode: e.target.value });
$("sensitivity").oninput = (e) => {
  $("sv").textContent = e.target.value;
  chrome.storage.local.set({ sensitivity: Number(e.target.value) });
};
$("opts").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

$("hist").onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("options.html#history") }); };

chrome.storage.local.get("sdStats").then(({ sdStats }) => {
  const d = new Date().toISOString().slice(0, 10);
  const r = sdStats?.days?.[d];
  if (r) $("today").textContent = `Today: ${r.scanned || 0} scanned, ${r.filtered || 0} minimised.`;
});
