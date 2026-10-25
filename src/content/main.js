// Content script: finds posts, requests scores, applies the filter mode.
import { mountCard } from "./ui";

(() => {
  // Any post with a little text gets a card so it can be marked by hand; the background
  // only sends posts of 40+ characters to an AI model (shorter ones are scored locally).
  const MIN_CHARS = 3;
  const settings = { enabled: true, mode: "blur", sensitivity: 60, profiles: true, acctInfluence: 100, rageMode: "fold", rageThreshold: 70 };
  // Only borderline posts get the (slower) creator-profile second pass.
  const BORDER = [35, 75];

  // Runtime self-check: counts how often the DOM selectors we depend on work, so a
  // change to X's markup shows up in the popup instead of silently hurting accuracy.
  const health = { articles: 0, handles: 0, probes: 0, probesOk: 0, noted: "" };
  function reportHealth() {
    const notes = [];
    if (health.articles >= 10 && health.handles / health.articles < 0.5) notes.push("Couldn't read creator handles on most posts. X's layout may have changed.");
    if (health.probes >= 5 && health.probesOk === 0) notes.push("Creator profile lookup isn't returning anything, so scoring uses posts only.");
    const msg = notes.join(" ");
    if (msg !== health.noted) {
      health.noted = msg;
      chrome.storage.local.set({ sdHealth: msg ? { msg, ts: Date.now() } : null }).catch(() => {});
    }
  }
  const results = new Map();   // article -> result
  const seen = new WeakSet();
  const MODES = ["blur", "hide", "dim", "badge", "scores"];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.unobserve(e.target); request(e.target); }
    }
  }, { rootMargin: "300px" });

  const textOf = (a) => a.querySelector('[data-testid="tweetText"]')?.innerText.trim() || "";

  // Creator, media and feed context available in the timeline DOM. Bios are not
  // shown there, so none is collected.
  const handleOf = (a) => {
    const link = [...(a.querySelector('[data-testid="User-Name"]')?.querySelectorAll("a") || [])]
      .find((n) => /^\/[A-Za-z0-9_]{1,15}$/.test(n.getAttribute("href") || ""));
    return link ? link.getAttribute("href").slice(1) : undefined;
  };

  function contextOf(a) {
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
      const ph = prev && handleOf(prev);
      if (ph && ctx.replyTo.toLowerCase().includes("@" + ph.toLowerCase())) ctx.parent = textOf(prev).slice(0, 300);
    }
    const texts = a.querySelectorAll('[data-testid="tweetText"]');
    if (texts.length > 1 && texts[1].closest('[role="link"]')) ctx.quoted = texts[1].innerText.trim().slice(0, 300);
    return ctx;
  }


  // ---- Creator profiles ------------------------------------------------------
  // Bios and follower counts are not in the timeline, so they are read from X's
  // own hover card (opened invisibly for a moment) or from a profile page you
  // visit. Cached for a week in the background worker.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const profMem = new Map(); // handle -> { prof, ts }
  let probeChain = Promise.resolve();

  const countOf = (text, label) => {
    const m = text.match(new RegExp("([\\d.,]+\\s?[KMB]?)\\s+" + label, "i"));
    return m ? m[1].replace(/\s/g, "") : undefined;
  };
  const profileFrom = (text) => {
    const raw = text.replace(/\s+/g, " ").trim().slice(0, 700);
    return raw.length > 15
      ? { raw, followers: countOf(raw, "Followers"), following: countOf(raw, "Following") }
      : null;
  };

  async function probeHoverCard(article, handle) {
    const target = article.querySelector('[data-testid="Tweet-User-Avatar"]')
      || article.querySelector('[data-testid="User-Name"] a');
    if (!target || !article.isConnected) return null;
    const fire = (types) => types.forEach((t) => {
      const Ev = t.startsWith("pointer") ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Ev(t, { bubbles: !/enter|leave/.test(t), cancelable: true, view: window }));
    });
    const mine = (c) => [...c.querySelectorAll("a")].some((a) => (a.getAttribute("href") || "").toLowerCase() === "/" + handle.toLowerCase());
    document.documentElement.classList.add("sd-probing");
    try {
      fire(["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]);
      for (let i = 0; i < 20; i++) {
        await sleep(100);
        const card = [...document.querySelectorAll('[data-testid="HoverCard"]')].find(mine);
        if (card && card.innerText.length > 25) {
          await sleep(150);
          return profileFrom(card.innerText);
        }
      }
      return null;
    } finally {
      fire(["pointermove", "pointerout", "pointerleave", "mouseout", "mouseleave"]);
      setTimeout(() => document.documentElement.classList.remove("sd-probing"), 400);
    }
  }

  // Cheap: memory, then the background store. Never opens a hover card.
  async function cachedProfile(handle) {
    if (!handle || !settings.profiles) return null;
    const hit = profMem.get(handle);
    if (hit?.prof) return hit.prof;
    let r = null;
    try { r = await chrome.runtime.sendMessage({ type: "getProfile", handle }); } catch {}
    if (r?.raw) { profMem.set(handle, { prof: r, ts: Date.now() }); return r; }
    return null;
  }

  // Slow: opens the hover card, one at a time. Used only for borderline posts.
  function probeProfile(article, handle) {
    if (!handle || !settings.profiles) return Promise.resolve(null);
    const hit = profMem.get(handle);
    if (hit && (hit.prof || Date.now() - hit.ts < 10 * 60 * 1000)) return Promise.resolve(hit.prof);
    const p = probeChain.then(async () => {
      const again = profMem.get(handle);
      if (again?.prof) return again.prof;
      let known = null;
      try { known = await chrome.runtime.sendMessage({ type: "getProfile", handle }); } catch {}
      if (known?.raw) { profMem.set(handle, { prof: known, ts: Date.now() }); return known; }
      if (known?.failed) { profMem.set(handle, { prof: null, ts: Date.now() }); return null; }
      health.probes++;
      const prof = await probeHoverCard(article, handle);
      if (prof) {
        health.probesOk++;
        chrome.runtime.sendMessage({ type: "saveProfile", handle, profile: prof }).catch(() => {});
      } else {
        chrome.runtime.sendMessage({ type: "profileFailed", handle }).catch(() => {});
      }
      reportHealth();
      profMem.set(handle, { prof: prof?.raw ? prof : null, ts: Date.now() });
      return prof?.raw ? prof : null;
    }).catch(() => null);
    probeChain = p;
    return p;
  }

  // Visiting a profile page records its bio for free.
  const RESERVED = /^\/(?:home|explore|notifications|messages|i|settings|search|compose|login|tos|privacy)(?:\/|$)/;
  let harvested = "";
  function harvestProfilePage() {
    if (!settings.profiles || RESERVED.test(location.pathname)) return;
    const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (!m || harvested === m[1]) return;
    const bio = document.querySelector('[data-testid="UserDescription"]');
    const name = document.querySelector('[data-testid="UserName"]');
    if (!bio && !name) return;
    const parts = [name?.innerText, bio?.innerText,
      document.querySelector('[data-testid="UserProfileHeader_Items"]')?.innerText,
      ...[...document.querySelectorAll('a[href$="/following"], a[href$="/verified_followers"], a[href$="/followers"]')].map((a) => a.innerText)];
    const prof = profileFrom(parts.filter(Boolean).join(" "));
    if (!prof) return;
    harvested = m[1];
    profMem.set(m[1], { prof, ts: Date.now() });
    chrome.runtime.sendMessage({ type: "saveProfile", handle: m[1], profile: prof }).catch(() => {});
  }

  function scan() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
      if (seen.has(a)) return;
      if (textOf(a).length < MIN_CHARS) return;
      seen.add(a);
      io.observe(a);
    });
  }

  // Final score = raw model score + account-type nudge at the current influence.
  const scoreOf = (r) => (typeof r.base === "number" && !r.fb && !r.local && !r.creator
    ? SD.finalScore(r.base, r.acct, r.acctConf, r.adjOk, settings.acctInfluence)
    : r.score);
  function accept(article, r, text) {
    r.text = text;
    r.score = scoreOf(r);
    results.set(article, r);
    render(article);
  }

  async function ask(text, ctx, refine) {
    try { return await chrome.runtime.sendMessage({ type: "analyze", text, ctx, refine }); }
    catch { return { error: "ext" }; }
  }

  async function request(article) {
    if (!settings.enabled || !article.isConnected) { seen.delete(article); return; }
    const text = textOf(article);
    if (!text) return;
    const ctx = contextOf(article);
    health.articles++;
    if (ctx.handle) health.handles++;
    if (health.articles % 5 === 0) reportHealth();

    // Pass 1: the post, plus a creator profile only if we already have one for free.
    const known = await cachedProfile(ctx.handle);
    if (known) ctx.profile = known;
    const r = await ask(text, ctx, false);
    if (!r || r.error) { seen.delete(article); return; }
    accept(article, r, text);

    // Local-only results are provisional: try the model again later.
    if (r.local) {
      setTimeout(() => {
        if (article.isConnected && !results.get(article)?.fb) { seen.delete(article); scan(); }
      }, 60000);
      return;
    }

    // Pass 2: only borderline posts are worth reading the creator's profile for.
    const borderline = r.score >= BORDER[0] && r.score <= BORDER[1];
    if (!borderline || known || r.fb || r.creator || r.tier === "local" || r.profiled || !ctx.handle || !settings.profiles) return;
    const prof = await probeProfile(article, ctx.handle);
    if (!prof || !article.isConnected || results.get(article)?.fb) return;
    const r2 = await ask(text, { ...ctx, profile: prof }, true);
    if (r2 && !r2.error && !r2.local) accept(article, r2, text);
  }

  const logged = new Set();
  function logFiltered(article, r) {
    if (!r.key || logged.has(r.key)) return;
    logged.add(r.key);
    chrome.runtime.sendMessage({
      type: "logFiltered", key: r.key, handle: contextOf(article).handle,
      text: r.text, score: r.score, explanation: r.explanation
    }).catch(() => {});
  }

  function clearDecor(article) {
    article.removeAttribute("data-sd-fold");
    article.removeAttribute("data-sd-dim");
    article.removeAttribute("data-sd-open");
    article.style.maxHeight = "";
    article.style.overflow = "";
    article._sdCard?.destroy();
    article._sdCard = null;
    article.removeAttribute("data-sd");
    article.closest('[data-testid="cellInnerDiv"]')?.removeAttribute("data-sd-hidden");
    (article._sdFolded || []).forEach((c) => c.removeAttribute("data-sd-folded"));
    article._sdFolded = [];
  }

  // A collapsed thread opener also folds the author's consecutive follow-on posts.
  const THREAD_RE = /(?:^|\s)1\s*\/\s*\d{1,2}\b|🧵|\bthread\b/i;
  function foldThread(article) {
    article._sdFolded = [];
    if (!THREAD_RE.test(textOf(article))) return 0;
    const handle = handleOf(article);
    if (!handle) return 0;
    let cell = article.closest('[data-testid="cellInnerDiv"]')?.nextElementSibling;
    while (cell && article._sdFolded.length < 15) {
      const a = cell.querySelector('article[data-testid="tweet"]');
      if (!a || handleOf(a) !== handle) break;
      cell.setAttribute("data-sd-folded", "");
      article._sdFolded.push(cell);
      cell = cell.nextElementSibling;
    }
    return article._sdFolded.length;
  }

  // Rage bait is a second verdict. "scores only" mode never filters, and slop wins when both apply.
  const rageActive = () => settings.rageMode !== "off" && settings.mode !== "scores";
  const isRage = (r) => rageActive() && typeof r.rage === "number" && r.rage >= settings.rageThreshold && !r.rageFb?.startsWith?.("not");
  const rageTitle = (r) => "Rage bait" + (r.rageReason ? `: ${r.rageReason}` : " · nothing new in this post");
  const keepRage = (r) => ({ rage: r.rage, rageSrc: r.rageSrc, rageHits: r.rageHits, rageNews: r.rageNews, rageReason: r.rageReason, rageFb: r.rageFb });
  const isSlop = (r) => (r.fb ? r.fb === "slop" : !!r.rules?.length || r.score >= settings.sensitivity);

  const BORDER_BAND = 15;
  function render(article) {
    const r = results.get(article);
    if (!r) return;
    const wasCollapsed = article.hasAttribute("data-sd-fold");
    const wasOpen = article.hasAttribute("data-sd-open");
    const fullHeight = article.offsetHeight;
    clearDecor(article);
    if (!settings.enabled) return;
    const slop = isSlop(r);
    const revealed = article.dataset.sdRevealed === "1";

    if (slop && !revealed) {
      if (settings.mode === "blur") {
        collapse(article, r, { wasCollapsed, wasOpen, fullHeight });
        logFiltered(article, r);
        return;
      }
      if (settings.mode === "hide") {
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        if (cell) { cell.setAttribute("data-sd-hidden", ""); foldThread(article); logFiltered(article, r); return; }
      }
      if (settings.mode === "dim") article.setAttribute("data-sd-dim", "");
    }
    if (!slop && isRage(r)) {
      if (settings.rageMode === "hide") {
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        if (cell) { cell.setAttribute("data-sd-hidden", ""); logFiltered(article, { ...r, score: r.rage, explanation: rageTitle(r) }); return; }
      }
      collapse(article, r, { wasCollapsed, wasOpen, fullHeight });
      logFiltered(article, { ...r, score: r.rage, explanation: rageTitle(r) });
      return;
    }
    mount(article, r, { strip: false, folded: 0 });
  }

  const stateOf = (r, slop) => (slop ? "slop" : isRage(r) ? "rage" : r.score >= settings.sensitivity - BORDER_BAND ? "border" : "ok");

  function mount(article, r, { strip, folded }) {
    const slop = isSlop(r);
    const state = stateOf(r, slop);
    article.dataset.sd = state;
    article._sdCard = mountCard(article, {
      state, score: state === "rage" ? r.rage : r.score, threshold: state === "rage" ? settings.rageThreshold : settings.sensitivity,
      title: state === "rage" ? rageTitle(r) : r.explanation || "",
      rageOn: rageActive(), rageVoted: r.rageFb,
      handle: strip ? handleOf(article) : undefined,
      signals: state === "rage" ? (r.rageHits || []) : r.rules?.length ? r.rules : (r.why?.hits || []),
      details: detailsOf(r), folded, strip,
      // Scores-only mode and badge mode keep the chip on screen; otherwise it appears on hover.
      chipAlways: settings.mode === "scores" || (settings.mode === "badge" && slop),
      voted: r.fb, whyOpen: article.dataset.sdWhy === "1"
    }, {
      vote: (label) => vote(article, r, label),
      undo: () => undo(article, r),
      rage: (label) => rageVote(article, r, label),
      rageUndo: () => rageUndo(article, r),
      peek: () => openPost(article),
      toggleWhy: (viaKeyboard) => {
        if (article.dataset.sdWhy === "1") delete article.dataset.sdWhy; else article.dataset.sdWhy = "1";
        render(article);
        // Keyboard users land in the popover (or back on its trigger when it closes).
        if (viaKeyboard) article._sdCard?.[article.dataset.sdWhy === "1" ? "focusPanel" : "focusDot"]();
      }
    });
  }

  // ---- Minimise / peek ---------------------------------------------------------
  // Slop collapses to a one-row strip on its own. Hovering opens it smoothly and
  // leaving closes it again; the post is never "revealed" permanently.
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastScroll = 0;
  addEventListener("scroll", () => { lastScroll = Date.now(); }, { passive: true, capture: true });

  function collapse(article, r, { wasCollapsed, wasOpen, fullHeight }) {
    // Start the transition from the post's current height so it glides shut.
    const animate = !wasCollapsed && !reduceMotion && fullHeight > 90 && article.getBoundingClientRect().bottom > 0;
    if (animate) article.style.maxHeight = fullHeight + "px";
    article.setAttribute("data-sd-fold", "");
    mount(article, r, { strip: true, folded: foldThread(article) });
    if (animate) {
      void article.offsetHeight;
      article.style.maxHeight = "";
    }
    if (wasOpen) {
      article.setAttribute("data-sd-open", "");
      article._sdCard?.setOpen(true);
      openPosts.add(article);
      watch();
      article.style.maxHeight = "none";
      article.style.overflow = "visible";
    }
    bindHover(article);
  }

  // Pointer position is tracked directly so a post always closes once the
  // pointer is outside it, even if X swallows or reorders mouseleave events.
  let px = -1, py = -1;
  addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; }, { passive: true, capture: true });
  const inside = (a) => {
    const r = a.getBoundingClientRect();
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  };
  const openPosts = new Set();
  let watchT = null;
  function watch() {
    if (watchT || !openPosts.size) return;
    watchT = setInterval(() => {
      for (const a of [...openPosts]) {
        if (!a.isConnected || !a.hasAttribute("data-sd-open")) { openPosts.delete(a); continue; }
        if (inside(a)) { a._sdSeen = true; continue; }
        // Opened by keyboard with the pointer elsewhere: leave it until the pointer has visited.
        if (a._sdSeen) closePost(a);
      }
      if (!openPosts.size) { clearInterval(watchT); watchT = null; }
    }, 120);
  }
  document.documentElement.addEventListener("mouseleave", () => { px = py = -1; });
  addEventListener("blur", () => { px = py = -1; });

  function openPost(article) {
    if (!article.hasAttribute("data-sd-fold") || article.hasAttribute("data-sd-open")) return;
    article.setAttribute("data-sd-open", "");
    article._sdCard?.setOpen(true);
    article._sdSeen = inside(article);
    openPosts.add(article);
    watch();
    article.style.maxHeight = article.scrollHeight + "px";
    const settle = () => {
      if (!article.hasAttribute("data-sd-open")) return;
      article.style.maxHeight = "none";
      article.style.overflow = "visible";
    };
    if (reduceMotion) settle(); else setTimeout(settle, 320);
  }

  function closePost(article, force = false) {
    if (!article.hasAttribute("data-sd-open") || (!force && inside(article))) return;
    openPosts.delete(article);
    article.style.overflow = "hidden";
    article.style.maxHeight = article.offsetHeight + "px";
    void article.offsetHeight;
    article.removeAttribute("data-sd-open");
    article._sdCard?.setOpen(false);
    article.style.maxHeight = "";
    setTimeout(() => { if (!article.hasAttribute("data-sd-open")) article.style.overflow = ""; }, 320);
  }

  function bindHover(article) {
    if (article._sdBound) return;
    article._sdBound = true;
    let openT, closeT;
    const tryOpen = (n = 0) => {
      if (!inside(article)) return;
      // Posts sliding under a still pointer while scrolling should not pop open.
      if (Date.now() - lastScroll < 150 && n < 8) { openT = setTimeout(() => tryOpen(n + 1), 120); return; }
      openPost(article);
    };
    article.addEventListener("mouseenter", () => {
      clearTimeout(closeT);
      clearTimeout(openT);
      openT = setTimeout(tryOpen, 130);
    });
    article.addEventListener("mouseleave", () => {
      clearTimeout(openT);
      clearTimeout(closeT);
      closeT = setTimeout(() => closePost(article), 200);
    });
  }

  async function vote(article, r, label) {
    const res = await chrome.runtime.sendMessage({ type: "feedback", key: r.key, text: r.text, label, handle: contextOf(article).handle });
    if (!res || res.error) return;
    results.set(article, { ...res, ...keepRage(r), text: r.text });
    delete article.dataset.sdPeek;
    // Marking a post slop folds it, but keep it open until the pointer leaves so the
    // confirmation and Undo are visible.
    if (label === "slop" && settings.mode === "blur") article.setAttribute("data-sd-open", "");
    if (label === "not_slop") article.dataset.sdRevealed = "1";
    else delete article.dataset.sdRevealed;
    render(article);
  }

  async function rageVote(article, r, label) {
    const res = await chrome.runtime.sendMessage({ type: "rageVote", key: r.key, text: r.text, label, handle: contextOf(article).handle });
    if (!res || res.error) return;
    results.set(article, { ...r, rage: label === "rage" ? 100 : 0, rageSrc: "you", rageFb: label });
    delete article.dataset.sdPeek;
    // Like marking slop: stay open until the pointer leaves so the confirmation and Undo are visible.
    if (label === "rage" && settings.rageMode === "fold") article.setAttribute("data-sd-open", "");
    render(article);
  }

  async function rageUndo(article, r) {
    await chrome.runtime.sendMessage({ type: "rageUnvote", key: r.key });
    results.delete(article);
    clearDecor(article);
    request(article);
  }

  async function undo(article, r) {
    const res = await chrome.runtime.sendMessage({ type: "unvote", key: r.key });
    delete article.dataset.sdRevealed;
    delete article.dataset.sdPeek;
    if (res?.entry) {
      results.set(article, { ...res.entry, text: r.text });
      render(article);
    } else {
      results.delete(article);
      clearDecor(article);
      request(article);
    }
  }

  const ACCT = {
    personal_individual: "an individual voice", news_or_publication: "a news or publication account",
    brand_or_business: "a brand or business", engagement_aggregator: "a viral-repost / engagement account",
    bot_or_spam: "a bot or spam-like account"
  };

  // Rows for the "why this score" popover, from what the background worker recorded.
  function detailsOf(r) {
    const rows = [];
    const line = (label, value) => rows.push([label, value]);
    const w = r.why || {};
    if (r.fb) line("Your vote", r.fb === "slop" ? "Slop (overrides the model)" : "Not slop (overrides the model)");
    if (r.creator) line("Source", "your rule for this creator, no AI call");
    else if (r.tier === "local") line("Source", "on-device classifier, confident enough to skip the AI model");
    else if (r.local || w.local) line("Source", "on-device classifier only, the AI model was not used");
    else if (typeof r.base === "number") {
      const adj = r.score - r.base;
      line("Model", `${r.base}/100` + (w.provider ? ` via ${w.provider}` : "") + (adj ? `, ${adj > 0 ? "+" : ""}${adj} for the account type` : ""));
    }
    const acct = SD.confidentAcct(r.acct, r.acctConf);
    if (acct) line("Account", `${ACCT[acct] || acct}${w.acctConf ? ` (${w.acctConf}% sure)` : ""}`);
    if (r.profiled) line("Second pass", "re-scored with the creator's profile");
    if (r.rules?.length) line("Your filters", r.rules.join(", "));
    if (rageActive() && typeof r.rage === "number") {
      const who = r.rageSrc === "you" ? "your vote" : r.rageSrc === "model" ? "the AI model" : "on-device";
      line("Rage bait", `${r.rage}/100 (${who})` + (r.rageReason && r.rageSrc !== "you" ? `: ${r.rageReason}` : ""));
      if (r.rageNews >= 0.3) line("Novelty", "reads like reporting (sources, numbers or dates), so it is given the benefit of the doubt");
    }
    if (w.profile) line("Profile read", w.profile);
    else if (!r.local && !r.creator && r.tier !== "local") line("Profile", "not available; judged from the post and handle");
    if (w.reply) line("Context", "judged as a reply");
    if (w.quoted) line("Context", "includes a quoted post");
    if (w.examples) line("Learned from you", `${w.examples} similar votes used` +
      (w.creatorVotes ? `; this creator: ${w.creatorVotes.marked_slop} slop / ${w.creatorVotes.marked_not_slop} not` : ""));
    if (!rows.length) line("Details", "none recorded for this older result");
    return rows;
  }

  function rerenderAll() {
    for (const a of [...results.keys()]) {
      if (!a.isConnected) { results.delete(a); continue; }
      const r = results.get(a);
      r.score = scoreOf(r);
      render(a);
    }
    scan();
  }

  // Match X's current theme (light / dim / lights out) from the page itself.
  function applyTheme() {
    const cs = getComputedStyle(document.body);
    const root = document.documentElement;
    const bg = cs.backgroundColor;
    const m = bg.match(/\d+/g);
    const lum = m ? 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2] : 255;
    root.dataset.sdTheme = lum < 140 ? "dark" : "light";
    root.style.setProperty("--sd-bg", bg);
    root.style.setProperty("--sd-fg", cs.color);
  }

  // Alt+S slop, Alt+N not slop, Alt+U undo, Alt+P peek, Alt+W why. Alt-chords because X
  // already owns the bare letter keys. Acts on the post under the pointer or with focus.
  let hovered = null;
  addEventListener("pointerover", (e) => { hovered = e.target.closest?.('article[data-testid="tweet"]') || null; }, { passive: true, capture: true });
  addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName)) return;
    const article = (document.activeElement?.closest?.('article[data-testid="tweet"]')) || (hovered?.isConnected ? hovered : null);
    const r = article && results.get(article);
    if (!r) return;
    const k = e.code;
    if (k === "KeyS" && !r.fb) vote(article, r, "slop");
    else if (k === "KeyN" && !r.fb) vote(article, r, "not_slop");
    else if (k === "KeyU" && r.fb) undo(article, r);
    else if (k === "KeyR" && rageActive()) { if (r.rageFb) rageUndo(article, r); else rageVote(article, r, "rage"); }
    else if (k === "KeyP") { if (article.hasAttribute("data-sd-open")) closePost(article, true); else openPost(article); }
    else if (k === "KeyW") {
      if (article.dataset.sdWhy === "1") delete article.dataset.sdWhy; else article.dataset.sdWhy = "1";
      render(article);
      article._sdCard?.[article.dataset.sdWhy === "1" ? "focusPanel" : "focusDot"]();
    }
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);

  // Click anywhere outside a card (its own clicks never bubble out) or press Escape to close popovers.
  function closeWhy() {
    document.querySelectorAll('article[data-sd-why="1"]').forEach((a) => { delete a.dataset.sdWhy; if (results.has(a)) render(a); });
  }
  function closeWhyAndRefocus() {
    const a = document.querySelector('article[data-sd-why="1"]');
    closeWhy();
    a?._sdCard?.focusDot();
  }
  addEventListener("click", closeWhy);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeWhyAndRefocus(); }, true);

  async function init() {
    const s = await chrome.storage.local.get(["enabled", "mode", "sensitivity", "profiles", "acctInfluence", "rageMode", "rageThreshold"]);
    if (["fold", "hide", "off"].includes(s.rageMode)) settings.rageMode = s.rageMode;
    if (typeof s.rageThreshold === "number") settings.rageThreshold = s.rageThreshold;
    if (s.profiles !== undefined) settings.profiles = s.profiles;
    if (typeof s.acctInfluence === "number") settings.acctInfluence = s.acctInfluence;
    if (s.enabled !== undefined) settings.enabled = s.enabled;
    if (MODES.includes(s.mode)) settings.mode = s.mode;
    if (typeof s.sensitivity === "number") settings.sensitivity = s.sensitivity;
    applyTheme();
    // Lets you (and tooling) confirm from the page which build is actually injected.
    document.documentElement.dataset.sdVersion = chrome.runtime.getManifest().version;
    scan();
    let t;
    // Theme is re-read at most every few seconds: reading computed style forces a style recalc.
    let themeAt = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (Date.now() - themeAt > 3000) { themeAt = Date.now(); applyTheme(); }
        scan(); harvestProfilePage();
      }, 150);
    })
      .observe(document.body, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local") return;
      let dirty = false;
      if (ch.enabled) { settings.enabled = ch.enabled.newValue; dirty = true; }
      if (ch.mode && MODES.includes(ch.mode.newValue)) { settings.mode = ch.mode.newValue; dirty = true; }
      if (ch.sensitivity) { settings.sensitivity = ch.sensitivity.newValue; dirty = true; }
      if (ch.rageMode && ["fold", "hide", "off"].includes(ch.rageMode.newValue)) { settings.rageMode = ch.rageMode.newValue; dirty = true; }
      if (ch.rageThreshold) { settings.rageThreshold = Number(ch.rageThreshold.newValue) || 70; dirty = true; }
      if (ch.profiles) settings.profiles = ch.profiles.newValue;
      if (ch.acctInfluence) { settings.acctInfluence = Number(ch.acctInfluence.newValue); dirty = true; }
      if (dirty) {
        document.querySelectorAll("[data-sd-revealed]").forEach((n) => { delete n.dataset.sdRevealed; delete n.dataset.sdPeek; });
        rerenderAll();
      }
    });
  }
  init();
})();
