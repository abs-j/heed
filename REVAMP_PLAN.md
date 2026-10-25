# Slop Detector v2 — Revamp Plan

## 1. What I found

**Live on x.com (your browser, extension running):** every post shows a gray `OK · 32/35  Local check (API unavailable)  [Slop] [Not slop]` row. Two problems are visible at once:
- *Detection:* with no working API the local fallback scores nearly everything 32–35. It cannot tell slop from non-slop, so the "free" mode is effectively off.
- *Look:* the extension adds a pill + two buttons + text to **every** post. It adds noise even when a post is fine, and the "SLOP" sticker (red, rotated, white outline) is loud and dated.

**Code:** ~2,000 lines, vanilla JS, one 588-line `content.js` mixing DOM scraping, hover-probing of profile cards, state, and rendering. Detection = Jev via OpenRouter (network, paid, needs a key) + a small regex list in `lib.js`. UI is injected straight into X's DOM with class names, styled against X's colors.

**Research takeaways**
- Black-box AI-text detectors are unreliable on short social posts: supervised classifiers hit ~0.96 AUC in-distribution but ~0.71 on out-of-distribution bots; training-free methods ~0.54–0.68 ([arXiv 2606.07219](https://arxiv.org/pdf/2606.07219)); fine-tuned generators evade them ([ACL 2025](https://preview.aclanthology.org/new-sigs/2025.findings-acl.695/)). → Don't sell "AI-detected". Score **low-effort / formulaic / farming behaviour**, which is what users actually dislike (the repo already does this; keep and lean into it).
- Stylistic fingerprints are real but model-dependent: em-dash rate ranges 0–9.1 per 1k words across models ([arXiv 2603.27006](https://arxiv.org/abs/2603.27006), preprint); "delve"-type words spiked after ChatGPT ([ACL 2026](https://aclanthology.org/2026.stygenai-1.5.pdf)). → Use as weak features, never as proof; calibrate weights from user votes.
- Account/behaviour signals that bot detectors use: account age, follower/following ratio, posting cadence, near-duplicate text across replies, templated low-entropy text ([vendor summaries](https://chromewebstore.google.com/detail/dnmhjhbckegfgbgkhnggnoijdiikdgaa), unaudited). → Reply-swarm clustering and duplicate detection are cheap, local, and accurate on X.

## 2. Product direction

From "a score on every post" to **"a quiet filter that earns its pixels."** Fine posts look untouched. Slop gets a clear, tasteful treatment, and you can see why in one glance.

### Visual redesign (look & feel completely different)
1. **Shadow-DOM UI.** All injected UI lives in a closed shadow root per post → no clashes with X's CSS, no reliance on X's class names.
2. **Design language:** drop the red rotated sticker. New system: a thin left-edge **slop meter** (3px gradient bar: green→amber→red, height ∝ score), a small monogram badge, and monospace score. Inter/system font, 8px grid, theme tokens that follow X's Light/Dim/Lights-out.
3. **Fine posts: nothing** by default (optional ghost dot on hover). Borderline: amber edge only. Slop: **fold into a one-line "receipt"** — `▍ Slop 87 · engagement bait · @handle   Peek ▾` — with a spring-eased expand, and a "fold similar" affordance.
4. **Why-popover** (replaces the text panel): signal chips ("not-X-but-Y", "stock hook", "reply-bait", "recycled clip") with weights as a small stacked bar, model vs. local vs. your-votes contributions.
5. **Keyboard + gestures:** `j/k`-friendly, `s` mark slop, `n` not slop, `u` undo, `p` peek. Vote buttons appear on hover/focus, not permanently.
6. **Popup → mini dashboard:** big on/off, mode segmented control, sensitivity slider with live "N of last 50 posts would be folded" preview, today's tally ("142 scanned · 19 folded · ~3 min saved"), spend.
7. **Options page → sidebar-navigated app** (General / Detection / Creators / Filters / Votes & Training / Data) with proper cards and inline help; replaces the single long form.
8. **New icon + store art**, light/dark, reduced-motion respected.

### Detection quality
1. **Fix the fallback first.** Replace the 35-baseline regex scorer with a **local classifier**: ~60 features (n-gram/phrase lexicon for hooks, rhetorical templates, listicle structure, emoji/hashtag density, caps ratio, question-bait endings, link/media presence, length/entropy, type-token ratio) → logistic regression, weights shipped as JSON. Train/evaluate offline on the user's exported votes plus a labelled seed set; target ≥0.85 AUC vs. user labels with zero API calls.
2. **Cross-post signals (cheap, local):**
   - near-duplicate / template detection (MinHash on shingles) across the feed and within reply threads → reply-swarm flag;
   - creator-level rolling score (already stored) used as a prior, with exponential decay;
   - cadence: same author appearing N times with similar structure.
3. **Tiered pipeline:** local classifier → if uncertain (35–75) → LLM (Jev, or user-chosen provider incl. Anthropic/OpenAI-compatible endpoint, also local Ollama for free/private) → optional profile pass. 70–80% of posts resolved locally, cutting cost/latency.
4. **Personalization that actually learns:** votes retrain the local model's weights on-device (online logistic update + per-creator and per-phrase priors), instead of only being pasted into prompts. Show "agreement with your votes: 91% (n=212)".
5. **Eval harness in repo:** `tools/eval.mjs` extended with a fixed labelled corpus, precision/recall at threshold, confusion examples, CI via `node --test`. Every detector change must not regress the benchmark.
6. **Honesty in copy:** call it a *slop/quality score*, not an AI-detector; show confidence ("low/med/high"), not just a number.

### Engineering
- Split `content.js` into modules: `dom/x-adapter` (selectors, one place to fix when X changes), `scanner`, `scorer-client`, `ui/*` (shadow components), `state`. Build with esbuild (no framework); TypeScript for `lib`/scoring with unit tests.
- Replace the interval-based hover watcher with `IntersectionObserver` + pointer events; avoid the invisible hover-card probing where possible (fragile) — prefer profile data from visited pages/ API response intercept only if policy-safe; keep it optional.
- Use `chrome.storage.session` for hot state, IndexedDB for caches/votes (storage.local 10MB limit).
- Performance budget: <2ms per post main-thread, batched requests, no layout thrash (use `contain` + transform animations rather than max-height).
- A11y: roles/labels, focus rings, contrast ≥4.5, `prefers-reduced-motion`.

## 3. Phases
| # | Phase | Output | Verify |
|---|---|---|---|
| 0 | Baseline: build labelled corpus from your votes + 150 hand-labelled posts; record current AUC | `test/corpus.json`, baseline report | `node tools/eval.mjs` |
| 1 | Local classifier + dup/cadence signals | new `lib/` scoring, replaces 35-baseline | AUC ≥ 0.85 on corpus; beats old heuristic |
| 2 | Tiered pipeline + provider abstraction | cheaper, works w/o key | unit tests; cost per 100 posts |
| 3 | Shadow-DOM UI (meter, receipt, popover, shortcuts) | new look in feed | live check in x.com light/dim/dark |
| 4 | Popup dashboard + options app | new pages | manual + screenshots |
| 5 | On-device learning from votes | agreement metric in UI | eval before/after |
| 6 | Polish: icons, README, perf pass, a11y | v2.0.0 | Lighthouse-style checks, load test on long scroll |

## 4. Decisions I need from you
1. **Keep OpenRouter/Jev as the primary LLM**, or add providers (Anthropic, OpenAI-compatible, local Ollama)? (Recommend: add providers; keep Jev default.)
2. **Fine posts:** show nothing (recommended) or a subtle score dot?
3. **Build tooling:** OK to introduce esbuild + TypeScript (recommended), or stay zero-build vanilla?
4. **Training data:** are your exported votes enough, or should I hand-label a seed set from your feed (I'd need you to review it)?
5. Is the "API unavailable" state on your machine a missing key/credits? It's what's making today's detection look dead.
