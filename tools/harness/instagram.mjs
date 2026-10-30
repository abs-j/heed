// Renders tools/harness/instagram.html as https://www.instagram.com/ (no network) so the real
// content script's Instagram adapter runs against it, then screenshots the result.
// Usage: node tools/harness/instagram.mjs [out.png] [thirstMode]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const files = { "/": "tools/harness/instagram.html", "/lib.js": "lib.js", "/content.js": "content.js", "/content.css": "content.css" };
const type = { js: "text/javascript", css: "text/css", html: "text/html" };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 1400 } });
await page.route("https://www.instagram.com/**", (route) => {
  const f = files[new URL(route.request().url()).pathname];
  if (!f) return route.fulfill({ status: 404, body: "" });
  route.fulfill({ status: 200, contentType: type[f.split(".").pop()], body: readFileSync(new URL(f, root)) });
});
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`https://www.instagram.com/?thirst=${process.argv[3] || "fold"}`);
await page.waitForTimeout(1500);
const rows = await page.$$eval("article", (as) => as.map((a) => ({ user: a.querySelector("header a")?.textContent, sd: a.dataset.sd || null, folded: a.hasAttribute("data-sd-fold"), hidden: getComputedStyle(a).display === "none", h: Math.round(a.getBoundingClientRect().height) })));
console.log(JSON.stringify(rows, null, 1));
await page.screenshot({ path: process.argv[2] || "instagram-harness.png" });
await browser.close();
