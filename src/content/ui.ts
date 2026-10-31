// Shadow-DOM card injected into each post. X's CSS can't reach it and it never relies
// on X's class names. Three faces, one component:
//   strip  - the folded "receipt" row shown for slop (replaces the post until peeked)
//   dock   - a small score chip + vote buttons, visible on hover (or always, by mode)
//   why    - a popover with the score gauge and every signal behind the number
// Fine posts get a card with a dock only, so by default they look untouched.

export type PostState = "slop" | "rage" | "thirst" | "less" | "border" | "ok";

export interface View {
  state: PostState;
  score: number;
  threshold: number;
  title: string;                 // one-line explanation
  handle?: string;
  signals: string[];             // top reasons, shown as chips
  details: [string, string][];   // rows in the "why" popover
  folded: number;                // extra thread posts folded with this one
  strip: boolean;                // show the folded receipt row
  cover?: boolean;               // the post is blacked out in place (Instagram): the receipt is centred on the cover
  chipAlways: boolean;           // dock visible without hovering
  reaction?: "like" | "dislike";   // the reader's own thumb on this post
  whyOpen: boolean;
}

export interface Actions {
  react(label: "like" | "dislike"): void;
  unreact(): void;
  peek(): void;
  toggleWhy(viaKeyboard?: boolean): void;
}

export interface Card { host: HTMLElement; setOpen(open: boolean): void; focusPanel(): void; focusDot(): void; destroy(): void }

const CSS = `
:host { all: initial; position: absolute; inset: 0; z-index: 5; pointer-events: none; display: block;
  --slop: var(--sd-slop, #f2545b); --rage: var(--sd-rage, #f0883e); --thirst: var(--sd-thirst, #e0609e); --less: var(--sd-less, #8fa3c8); --warn: var(--sd-warn, #eeb23a); --ok: var(--sd-ok, #2fb67c);
  font: 400 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Inter, Roboto, sans-serif;
  color: var(--sd-fg, #0f1419); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; padding: 0; }
button:focus-visible, .strip:focus-visible { outline: 2px solid var(--c, var(--slop)); outline-offset: 2px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }

.meter { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 0 3px 3px 0;
  background: var(--c); opacity: .9; }
.state-ok .meter { display: none; }

/* ---- folded receipt ---- */
.strip { position: absolute; inset: 6px 12px auto 12px; height: 52px; box-sizing: border-box; display: none; align-items: center; gap: 14px;
  padding: 0 14px 0 16px; border-radius: 12px; pointer-events: auto; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--c) 35%, var(--sd-border, #cfd9de));
  background: color-mix(in srgb, var(--c) 7%, var(--sd-bg, #fff));
  box-shadow: 0 1px 0 color-mix(in srgb, var(--c) 18%, transparent) inset;
  transition: opacity .18s ease, transform .18s cubic-bezier(.2,.8,.2,1), background .18s ease; }
.has-strip .strip { display: flex; }
.open .strip { opacity: 0; transform: translateY(-4px); pointer-events: none; }
.strip:hover { background: color-mix(in srgb, var(--c) 12%, var(--sd-bg, #fff)); }
.score { flex: none; display: grid; justify-items: center; line-height: 1; min-width: 38px; }
.score b.ico svg { width: 22px; height: 22px; }
.score b { font-size: 22px; font-weight: 700; color: var(--c); letter-spacing: -.02em; }
.score i { font-style: normal; font-size: 9px; letter-spacing: .14em; font-weight: 700; color: var(--c); margin-top: 3px; opacity: .85; }
.sep { flex: none; width: 1px; align-self: stretch; margin: 12px 0; background: color-mix(in srgb, var(--c) 25%, transparent); }
.info { flex: 1 1 auto; min-width: 0; display: grid; gap: 3px; }
.title { font-weight: 650; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { display: flex; gap: 6px; align-items: center; min-width: 0; color: var(--sd-mute, #536471); font-size: 12px; overflow: hidden; white-space: nowrap; }
.sub .h { flex: none; }
.chip { flex: none; padding: 1px 7px; border-radius: 999px; font-size: 11px; line-height: 16px;
  background: color-mix(in srgb, var(--c) 12%, transparent); color: color-mix(in srgb, var(--c) 80%, var(--sd-fg, #000)); }
.peek { flex: none; display: inline-flex; gap: 4px; align-items: center; font-weight: 600; font-size: 12px;
  color: var(--sd-mute, #536471); padding: 5px 10px; border-radius: 999px; }
.strip:hover .peek { color: var(--sd-fg, #0f1419); background: color-mix(in srgb, var(--sd-fg, #000) 8%, transparent); }
.peek svg { width: 12px; height: 12px; transition: transform .2s ease; }
.strip:hover .peek svg { transform: translateY(1px); }

/* ---- cover: a blacked-out post keeps its height, so the receipt is centred on a dark panel ---- */
.cover { --sd-fg: #f4f4f7; --sd-mute: #9d9dad; --sd-bg: #121217; --sd-border: #2c2c36; }
.cover .meter { display: none; }
.cover .strip { inset: 50% auto auto 50%; transform: translate(-50%, -54%); width: min(340px, calc(100% - 48px)); height: auto;
  flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 30px 26px 24px; border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
  background: radial-gradient(130% 90% at 50% 0%, color-mix(in srgb, var(--c) 16%, #17171d), #121217 72%);
  box-shadow: 0 18px 48px rgba(0,0,0,.45), 0 1px 0 color-mix(in srgb, var(--c) 30%, transparent) inset; }
.cover .strip:hover { background: radial-gradient(130% 90% at 50% 0%, color-mix(in srgb, var(--c) 22%, #1b1b22), #15151b 72%); }
.cover .score { min-width: 0; gap: 2px; }
.cover .score b { font-size: 54px; line-height: 1; }
.cover .score b.ico svg { width: 40px; height: 40px; }
.cover .score i { font-size: 11px; margin-top: 6px; }
.cover .sep { display: none; }
.cover .info { justify-items: center; gap: 8px; }
.cover .title { white-space: normal; overflow: visible; font-size: 15px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.cover .sub { justify-content: center; flex-wrap: wrap; white-space: normal; }
.cover .peek { margin-top: 4px; padding: 9px 20px; font-size: 13px; color: var(--sd-fg);
  background: color-mix(in srgb, var(--c) 18%, transparent); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
.cover .strip:hover .peek { background: color-mix(in srgb, var(--c) 30%, transparent); }

/* ---- dock ---- */
.dock { position: absolute; top: 8px; right: 84px; display: none; align-items: center; gap: 2px; padding: 2px;
  border-radius: 999px; pointer-events: auto; transform: translateY(-2px);
  border: 1px solid var(--sd-border, #cfd9de);
  background: color-mix(in srgb, var(--sd-bg, #fff) 94%, transparent); backdrop-filter: blur(8px);
  box-shadow: 0 2px 10px rgba(0,0,0,.18);
  opacity: var(--dock-o, 0); transition: opacity .14s ease, transform .14s ease; }
.has-dock .dock { display: inline-flex; }
.hot .dock, .always .dock, .open .dock, .why-open .dock, .dock:focus-within { opacity: 1; transform: none; }
.has-strip:not(.open) .dock { display: none; }
.dot { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 7px; border-radius: 999px; font-weight: 700; font-size: 12px; }
.dot::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.dot:hover { background: color-mix(in srgb, var(--sd-fg, #000) 8%, transparent); }
.act { padding: 3px 9px; border-radius: 999px; font-weight: 650; font-size: 12px; color: var(--sd-mute, #536471); }
.act:hover { background: color-mix(in srgb, var(--sd-fg, #000) 9%, transparent); color: var(--sd-fg, #0f1419); }
.act.thumb { display: inline-grid; place-items: center; padding: 4px 8px; }
.act.thumb svg { width: 15px; height: 15px; }
.act.thumb.like:hover { color: var(--ok); } .act.thumb.dislike:hover { color: var(--slop); } .act.n:hover { color: var(--ok); }
.voted { padding: 3px 8px 3px 10px; font-size: 12px; color: var(--sd-mute, #536471); }
.voted b { color: var(--sd-fg, #0f1419); font-weight: 650; }

/* ---- why popover ---- */
.why { position: absolute; top: 40px; right: 12px; width: min(330px, calc(100% - 24px)); display: none; pointer-events: auto;
  padding: 14px; border-radius: 14px; border: 1px solid var(--sd-border, #cfd9de);
  background: var(--sd-bg, #fff); box-shadow: 0 10px 34px rgba(0,0,0,.32); }
.why-open .why { display: block; animation: pop .16s cubic-bezier(.2,.8,.2,1); }
@keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
.why h4 { margin: 0 0 2px; font-size: 14px; font-weight: 700; }
.why .lead { margin: 0 0 10px; color: var(--sd-mute, #536471); font-size: 12px; }
.gauge { position: relative; height: 8px; border-radius: 99px; margin: 14px 0 6px;
  background: linear-gradient(90deg, var(--ok), var(--warn) 55%, var(--slop)); }
.gauge .pin { position: absolute; top: -4px; width: 4px; height: 16px; border-radius: 2px; margin-left: -2px; background: var(--sd-fg, #000); box-shadow: 0 0 0 2px var(--sd-bg, #fff); }
.gauge .thr { position: absolute; top: -2px; width: 1px; height: 12px; margin-left: -.5px; background: var(--sd-fg, #000); opacity: .5; }
.scale { display: flex; justify-content: space-between; font-size: 10px; color: var(--sd-mute, #536471); margin-bottom: 10px; }
.rows { display: grid; gap: 6px; margin: 0; }
.row { display: grid; grid-template-columns: 92px 1fr; gap: 8px; font-size: 12px; }
.row dt { color: var(--sd-mute, #536471); } .row dd { margin: 0; overflow-wrap: anywhere; }
.sigs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 10px; }
.foot { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--sd-border, #cfd9de); font-size: 11px; color: var(--sd-mute, #536471); }
kbd { font: 600 10px ui-monospace, Menlo, monospace; padding: 1px 4px; border-radius: 4px; border: 1px solid var(--sd-border, #cfd9de); }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

const THUMB_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>';
const THUMB_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>';
const SVG_CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';

const colorOf = (v: View) => (v.state === "slop" ? "var(--slop)" : v.state === "rage" ? "var(--rage)" : v.state === "thirst" ? "var(--thirst)" : v.state === "less" ? "var(--less)" : v.state === "border" ? "var(--warn)" : "var(--ok)");
const verdict = (v: View) => (v.state === "slop" ? "SLOP" : v.state === "rage" ? "RAGE" : v.state === "thirst" ? "THIRST" : v.state === "less" ? "LESS" : v.state === "border" ? "UNSURE" : "OK");

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function marginLabel(v: View) {
  const d = Math.abs(v.score - v.threshold);
  const side = v.score >= v.threshold ? "over" : "under";
  return d >= 25 ? `clear (${d} ${side} the line)` : d >= 10 ? `moderate (${d} ${side})` : `borderline (${d} ${side})`;
}

export function mountCard(article: HTMLElement, initial: View, act: Actions): Card {
  const host = document.createElement("sd-card");
  const root = host.attachShadow({ mode: "closed" });
  const style = h("style"); style.textContent = CSS;
  const wrap = h("div");
  root.append(style, wrap);
  let open = false;
  let view = initial;
  let dotEl: HTMLElement | null = null;
  let whyEl: HTMLElement | null = null;

  // Clicks inside the card must not reach X's own "open this post" handler.
  for (const t of ["click", "mousedown", "pointerdown", "dblclick"]) wrap.addEventListener(t, (e) => e.stopPropagation());

  const btn = (cls: string, label: string, fn: () => void, title?: string) => {
    const b = h("button", cls, label); b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", (e) => { e.preventDefault(); fn(); });
    return b;
  };

  function draw() {
    const v = view;
    wrap.textContent = "";
    wrap.className = [`state-${v.state}`, v.strip ? "has-strip" : "", v.cover ? "cover" : "", v.chipAlways ? "always" : "", open ? "open" : "", v.whyOpen ? "why-open" : "", "has-dock"].filter(Boolean).join(" ");
    wrap.style.setProperty("--c", colorOf(v));
    // An open popover must paint above the posts below it.
    host.style.zIndex = v.whyOpen ? "40" : "";
    const meterBar = h("div", "meter");
    meterBar.style.opacity = String(0.45 + Math.min(1, v.score / 100) * 0.55);
    wrap.append(meterBar);

    // Receipt strip
    const strip = h("div", "strip");
    strip.setAttribute("role", "button");
    strip.tabIndex = 0;
    strip.setAttribute("aria-label", `Folded post, ${v.state === "rage" ? "rage bait" : v.state === "thirst" ? "thirst trap" : v.state === "less" ? "not for you" : "slop"} score ${v.score}. ${v.title}. Press Enter to peek.`);
    strip.setAttribute("aria-expanded", String(open));
    const score = h("div", "score mono");
    const big = h("b", undefined, v.state === "less" ? "" : String(v.score));
    if (v.state === "less") { big.insertAdjacentHTML("beforeend", THUMB_DOWN); big.classList.add("ico"); }
    score.append(big, h("i", undefined, verdict(v)));
    const info = h("div", "info");
    const sub = h("div", "sub");
    if (v.handle) sub.append(h("span", "h", "@" + v.handle));
    for (const s of v.signals.slice(0, 2)) sub.append(h("span", "chip", s));
    if (v.folded) sub.append(h("span", undefined, `+${v.folded} thread post${v.folded > 1 ? "s" : ""}`));
    info.append(h("div", "title", v.title), sub);
    const peek = h("span", "peek"); peek.append("Peek "); peek.insertAdjacentHTML("beforeend", SVG_CHEVRON);
    strip.append(score, h("div", "sep"), info, peek);
    strip.addEventListener("click", () => act.peek());
    strip.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act.peek(); } });
    wrap.append(strip);

    // Dock
    const dock = h("div", "dock");
    const dot = btn("dot mono", v.state === "less" ? "less" : String(v.score), () => {}, v.state === "thirst" || v.state === "rage" ? `${verdict(v)} score ${v.score}. Click to see why.` : `Slop score ${v.score}. Click to see why. A quality score, not proof of AI generation.`);
    dot.addEventListener("click", (e) => act.toggleWhy(e.detail === 0));
    dot.setAttribute("aria-label", v.state === "less" ? "Why this post was folded" : `Slop score ${v.score} out of 100. Show why.`);
    dot.setAttribute("aria-haspopup", "dialog");
    dot.setAttribute("aria-expanded", String(v.whyOpen));
    dotEl = dot;
    dock.append(dot);
    if (v.reaction) {
      const vt = h("span", "voted"); vt.append(h("b", undefined, v.reaction === "like" ? "Liked" : "Disliked"));
      dock.append(vt, btn("act", "Undo", () => act.unreact(), "Undo (Alt+U)"));
    } else {
      const thumb = (kind: "like" | "dislike") => {
        const b = btn("act thumb " + kind, "", () => act.react(kind),
          kind === "like" ? "I liked this (Alt+L)" : "I didn't like this (Alt+D). It will count for less next time.");
        b.setAttribute("aria-label", kind === "like" ? "I liked this post" : "I didn't like this post");
        b.insertAdjacentHTML("beforeend", kind === "like" ? THUMB_UP : THUMB_DOWN);
        return b;
      };
      dock.append(thumb("like"), thumb("dislike"));
    }
    wrap.append(dock);

    // Why popover
    const why = h("div", "why");
    why.setAttribute("role", "dialog");
    why.setAttribute("aria-label", "Why this score");
    why.tabIndex = -1;
    whyEl = why;
    why.append(h("h4", undefined, `${v.state === "slop" ? "Slop" : v.state === "rage" ? "Rage bait" : v.state === "thirst" ? "Thirst trap" : v.state === "less" ? "Not for you" : v.state === "border" ? "Unsure" : "Looks fine"} · ${v.score}/100`),
      h("p", "lead", `${v.title}. Margin: ${marginLabel(v)}.`));
    const gauge = h("div", "gauge");
    const pin = h("div", "pin"); pin.style.left = `${v.score}%`;
    const thr = h("div", "thr"); thr.style.left = `${v.threshold}%`;
    gauge.append(thr, pin);
    const scale = h("div", "scale mono"); scale.append(h("span", undefined, "0 genuine"), h("span", undefined, `line ${v.threshold}`), h("span", undefined, v.state === "thirst" ? "100 thirst trap" : v.state === "rage" ? "100 rage" : "100 slop"));
    if (v.state !== "less") why.append(gauge, scale);
    if (v.signals.length) { const sg = h("div", "sigs"); for (const s of v.signals) sg.append(h("span", "chip", s)); why.append(sg); }
    const rows = h("dl", "rows");
    for (const [k, val] of v.details) { const r = h("div", "row"); r.append(h("dt", undefined, k), h("dd", undefined, val)); rows.append(r); }
    why.append(rows);
    const foot = h("div", "foot"); foot.append("Shortcuts ", h("kbd", undefined, "⌥L"), " 👍 ", h("kbd", undefined, "⌥D"), " 👎 ", h("kbd", undefined, "⌥U"), " undo ", h("kbd", undefined, "⌥P"), " peek");
    why.append(foot);
    wrap.append(why);
  }

  draw();
  article.append(host);
  return {
    host,
    setOpen(o) {
      if (o !== open) { open = o; wrap.classList.toggle("open", o); wrap.querySelector(".strip")?.setAttribute("aria-expanded", String(o)); }
    },
    focusPanel() { whyEl?.focus({ preventScroll: true }); },
    focusDot() { dotEl?.focus({ preventScroll: true }); },
    destroy() { host.remove(); }
  };
}
