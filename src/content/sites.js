// Per-site DOM knowledge. main.js asks the adapter for "the posts on this page" and for each post's
// text and context; nothing else in the content script knows a site's markup.

// ---- X ---------------------------------------------------------------------
const xText = (a) => a.querySelector('[data-testid="tweetText"]')?.innerText.trim() || "";

// Creator, media and feed context available in the timeline DOM. Bios are not
// shown there, so none is collected.
const xHandle = (a) => {
  const link = [...(a.querySelector('[data-testid="User-Name"]')?.querySelectorAll("a") || [])]
    .find((n) => /^\/[A-Za-z0-9_]{1,15}$/.test(n.getAttribute("href") || ""));
  return link ? link.getAttribute("href").slice(1) : undefined;
};

function xContext(a) {
  const ctx = {};
  const user = a.querySelector('[data-testid="User-Name"]');
  if (user) {
    const link = [...user.querySelectorAll("a")].find((n) => /^\/[A-Za-z0-9_]{1,15}$/.test(n.getAttribute("href") || ""));
    if (link) ctx.handle = link.getAttribute("href").slice(1);
    const name = user.querySelector("span")?.innerText.trim();
    if (name) ctx.name = name.slice(0, 80);
    ctx.verified = !!user.querySelector('[data-testid="icon-verified"]');
  }
  const posted = a.querySelector("time")?.getAttribute("datetime");
  if (posted) ctx.postedAt = posted;
  const statusHref = a.querySelector('a[href*="/status/"] time')?.closest("a")?.getAttribute("href") || "";
  const pid = statusHref.match(/\/status\/(\d+)/);
  if (pid) ctx.postId = pid[1];
  const media = [];
  const photos = a.querySelectorAll('[data-testid="tweetPhoto"] img');
  if (photos.length) {
    const alts = [...photos].map((i) => i.alt).filter((t) => t && !/^(image|embedded video)$/i.test(t));
    media.push(`${photos.length} image${photos.length > 1 ? "s" : ""}` + (alts.length ? ` (alt text: ${alts.join(" | ").slice(0, 200)})` : ""));
    if (alts.length) ctx.alt = alts.join(" | ").slice(0, 300);
    const srcs = [...photos].map((i) => i.currentSrc || i.src).filter((u) => /^https:\/\/pbs\.twimg\.com\//.test(u));
    if (srcs.length) ctx.images = srcs.slice(0, 2);
  }
  if (a.querySelector('[data-testid="videoPlayer"], video')) {
    const dur = a.querySelector('[data-testid="videoPlayer"]')?.innerText.match(/\d+:\d{2}/)?.[0];
    media.push("video" + (dur ? ` (${dur})` : ""));
  }
  const card = a.querySelector('[data-testid="card.wrapper"]');
  if (card) media.push("link card: " + card.innerText.replace(/\s+/g, " ").slice(0, 160));
  if (media.length) ctx.media = media;
  const social = a.querySelector('[data-testid="socialContext"]')?.innerText.trim();
  if (social) ctx.context = social.slice(0, 80);

  // Reply and quote context.
  const rm = a.innerText.match(/Replying to\s+((?:@\w+(?:,?\s+(?:and\s+)?)?)+)/i);
  if (rm) {
    ctx.replyTo = rm[1].trim().slice(0, 80);
    const prev = a.closest('[data-testid="cellInnerDiv"]')?.previousElementSibling
      ?.querySelector('article[data-testid="tweet"]');
    const ph = prev && xHandle(prev);
    if (ph && ctx.replyTo.toLowerCase().includes("@" + ph.toLowerCase())) ctx.parent = xText(prev).slice(0, 300);
  }
  const texts = a.querySelectorAll('[data-testid="tweetText"]');
  if (texts.length > 1 && texts[1].closest('[role="link"]')) ctx.quoted = texts[1].innerText.trim().slice(0, 300);
  return ctx;
}

const x = {
  id: "x",
  postSelector: 'article[data-testid="tweet"]',
  minChars: 3,
  threads: true,     // a folded thread opener also folds the author's follow-on posts
  profiles: true,    // creator bios from X's hover cards
  textOf: xText,
  handleOf: xHandle,
  contextOf: xContext,
  hasContent: (a) => xText(a).length >= 3,
  cellOf: (a) => a.closest('[data-testid="cellInnerDiv"]')
};

// ---- Instagram ---------------------------------------------------------------
// Instagram's class names are generated and change often, so this relies only on what is stable:
// links to /<user>/ and /p/<code>/, <time datetime>, <img alt>, and `span[dir=auto]` for text.
// The photo's own alt text ("Photo by … May be an image of 1 person and bikini") is the strongest
// local signal, so it is collected for every post. Written against the public markup without a
// live account to test on: expect to adjust selectors, and rely on the self-check in the popup.
const IG_RESERVED = /^(?:explore|reels?|p|stories|direct|accounts|about|legal|developers|directory|web|challenge|emails|session|nametag|oauth|api|graphql|static)$/i;
const igUser = (href) => {
  const m = (href || "").match(/^\/([A-Za-z0-9._]{1,30})\/(?:\?.*)?$/);
  return m && !IG_RESERVED.test(m[1]) ? m[1] : undefined;
};
const igHandle = (a) => {
  for (const l of a.querySelectorAll("header a[href], a[href]")) {
    const u = igUser(l.getAttribute("href"));
    if (u) return u;
  }
  return undefined;
};
const igPhotos = (a) => [...a.querySelectorAll("img")].filter((i) => (i.naturalWidth || i.width || 0) >= 200 && !/profile picture/i.test(i.alt || ""));

function igCaption(a) {
  const handle = igHandle(a);
  let best = "";
  for (const s of a.querySelectorAll('span[dir="auto"], h1')) {
    if (s.closest("header, time, button, [role=button], a")) continue;
    if (s.querySelector("a[href*='/liked_by/'], a[href*='/reels/audio/'], a[href*='/explore/locations/']")) continue;
    let t = s.innerText.trim().replace(/(?:\s*(?:\.\.\.|\u2026)\s*|\s*\n\s*)more$/i, "").trim();
    if (/^(?:Liked by|Suggested for you|Sponsored|Ad$)/i.test(t)) continue;
    if (handle && t.toLowerCase().startsWith(handle.toLowerCase())) t = t.slice(handle.length).trim();
    if (/^[\d.,\sKMB]+(?:likes?|views?|comments?|plays?)?$/i.test(t) || t === handle || t.length < 2) continue;
    if (t.length > best.length) best = t;
  }
  return best.slice(0, 1500);
}

function igContext(a) {
  const ctx = { platform: "instagram" };
  const handle = igHandle(a);
  if (handle) { ctx.handle = handle; ctx.name = handle; }
  ctx.verified = !!a.querySelector('svg[aria-label="Verified"]');
  // "Suggested for you" sits under the name of accounts the reader does not follow.
  const top = (a.innerText || "").slice(0, 400);
  if (/^Suggested for you$/m.test(top)) ctx.suggested = true;
  // A followed account's post, photo or reel: no "Suggested for you" label, not an ad (sponsored
  // posts link out through /ads/ and are labelled), and no "Follow" button in its header (accounts
  // the reader does not follow get one, even on ordinary reels).
  const ad = /^(?:Ad|Sponsored)$/m.test(top) || !!a.querySelector('a[href*="/ads/"]');
  const followBtn = [...a.querySelectorAll('[role="button"], button')].some((b) => b.textContent.trim() === "Follow");
  if (!ctx.suggested && !ad && !followBtn) ctx.followed = true;
  const posted = a.querySelector("time[datetime]")?.getAttribute("datetime");
  if (posted) ctx.postedAt = posted;
  const code = a.querySelector('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute("href")?.match(/\/(?:p|reel)\/([\w-]+)/)?.[1];
  if (code) ctx.postId = "ig_" + code;
  const photos = igPhotos(a);
  const alts = photos.map((i) => (i.alt || "").replace(/^Photo by [^.]*\.\s*/i, "").trim()).filter(Boolean);
  const media = [];
  if (photos.length) {
    media.push(`${photos.length} image${photos.length > 1 ? "s" : ""}` + (alts.length ? ` (image description: ${alts.join(" | ").slice(0, 200)})` : ""));
    if (alts.length) ctx.alt = alts.join(" | ").slice(0, 300);
    const srcs = photos.map((i) => i.currentSrc || i.src).filter((u) => /^https:\/\//.test(u));
    if (srcs.length) ctx.images = srcs.slice(0, 2);
  }
  if (a.querySelector("video")) media.push("video");
  if (media.length) ctx.media = media;
  return ctx;
}

// A video post has no image URL, only a blob: stream, which is same-origin and so can be drawn to a
// canvas. Grab the current frame, downscaled, as a JPEG data URL for the model. Waits a moment for
// the first frame when the player has not decoded one yet.
async function igFrame(a) {
  const v = [...a.querySelectorAll("video")].find((x) => x.getBoundingClientRect().height > 0) || a.querySelector("video");
  if (!v) return undefined;
  if (v.readyState < 2) {
    await new Promise((res) => { const t = setTimeout(res, 1500); v.addEventListener("loadeddata", () => { clearTimeout(t); res(); }, { once: true }); });
  }
  if (v.readyState < 2 || !v.videoWidth) return undefined;
  try {
    const w = 384, h = Math.round((v.videoHeight / v.videoWidth) * w) || w;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(v, 0, 0, w, h);
    const url = c.toDataURL("image/jpeg", 0.6);
    return url.length > 1000 ? url : undefined;
  } catch { return undefined; }   // tainted or unreadable: the post is scored without a picture
}

const instagram = {
  id: "instagram",
  postSelector: "article",
  minChars: 0,
  threads: false,
  profiles: false,
  textOf: igCaption,
  handleOf: igHandle,
  contextOf: igContext,
  frameOf: igFrame,
  holdUntilChecked: true,
  // A photo post with no caption still has an image description worth scoring.
  hasContent: (a) => igCaption(a).length > 0 || igPhotos(a).some((i) => i.alt) || !!a.querySelector("video"),
  cellOf: (a) => a,
  // Explore and profile grids: bare thumbnails with an alt text, no caption. Scored on that alone.
  tiles: () => [...document.querySelectorAll('a[href^="/p/"], a[href^="/reel/"]')]
    .filter((t) => !t.closest("article") && t.querySelector("img[alt]")),
  tileContext(t) {
    const img = t.querySelector("img[alt]");
    const alt = (img?.alt || "").replace(/^Photo by [^.]*\.\s*/i, "").trim();
    const code = t.getAttribute("href").match(/\/(?:p|reel)\/([\w-]+)/)?.[1];
    return { text: "", ctx: { platform: "instagram", postId: code ? "ig_" + code : undefined, alt, localOnly: true } };
  }
};

// ig.localhost is the offline harness (tools/harness/instagram.html served locally); the manifest only
// injects on x.com and instagram.com, so this never matches on a real site.
export const siteFor = (host) => (/(^|\.)instagram\.com$|^ig\.localhost$/.test(host) ? instagram : x);
