// Paste into the browser console on instagram.com (home feed), scroll a while, then run
// copy(JSON.stringify(window.__items, null, 1)) and save the result as items.json. Add "label": true/false
// to each by looking at the photo. Image URLs expire after a day or so.
window.__items = window.__items || [];
const seen = new Set(window.__items.map((i) => i.id));
setInterval(() => {
  for (const a of document.querySelectorAll("article")) {
    const id = a.querySelector('a[href^="/p/"]')?.getAttribute("href");
    const img = [...a.querySelectorAll("img")].find((i) => i.naturalWidth >= 300 && !/profile picture/i.test(i.alt || ""));
    if (!id || !img || seen.has(id)) continue;
    seen.add(id);
    const cap = [...a.querySelectorAll("span[dir=auto]")].filter((s) => !s.closest("a,time,button") && !s.querySelector("a") && s.innerText.length > 1 && !/^(Liked by|Suggested|Ad$|•)/.test(s.innerText))
      .map((s) => s.innerText.replace(/\s*\n?more$/, "")).sort((x, y) => y.length - x.length)[0] || "";
    window.__items.push({ id, caption: cap, alt: img.alt, image: img.currentSrc || img.src, suggested: /^Suggested for you$/m.test(a.innerText.slice(0, 400)), label: null });
  }
}, 1000);
