# Heed: project context for AI coding agents

Cursor, Claude Code and other agents read this file. Keep it current when decisions change.

## What this is
**Heed** (formerly "Slop Detector") is a Chrome MV3 extension for x.com and instagram.com: a personal attention filter. The user gives posts a 👍/👎; posts they'd rather not spend attention on **fold into a one-line row** (still one hover away). Verdicts: **SLOP**, **THIRST** (bait for looks; conservative, workout/sport/travel/fashion-credit posts are not flagged), **RAGE** (provocation with nothing new; news/fresh reasoned opinions are *not* flagged), **LESS** (disliked, resembles disliked, or a topic they've turned down). Scoring is on-device first; an optional LLM (Jev/OpenRouter, Anthropic, OpenAI-compatible/Ollama) judges only uncertain posts, and only if the user adds a key. It learns from reactions on-device. See `README.md` (users/devs) and `docs/launch/heed-overview.md` (product summary).

## Commands
```
npm install
npm run build      # src/lib -> lib.js, src/content -> content.js (GENERATED but committed: load-unpacked needs them)
npm test           # build + node --test test/ (53 tests, incl. background.js in a vm sandbox with fake chrome/fetch)
npm run typecheck  # tsc --noEmit (src/**/*.ts only; main.js, background.js, popup/options are plain JS)
npm run eval       # old heuristic vs new classifier on synthetic corpora
npm run pack       # dist/heed-<version>.zip for the Chrome Web Store, with sanity checks (permissions, description length, version sync)
npm run bench      # classifier speed budget (2 ms/post; actual ~11 µs)
```
Visual checks without X: serve the repo root (`python3 -m http.server 8765`), open `tools/harness/index.html` (fake timeline), `tools/harness/page.html?p=popup.html|options.html` (extension pages with sample data). Store screenshots are rendered headlessly from `tools/store/shot.html` (see git history of `docs/launch/SUBMIT.md`).

## Map
- `src/lib/*.ts`: pure logic, unit-tested. `features.ts` + `model.ts` (slop LR classifier, weights in `weights.json`), `rage.ts` (rage scorer, news/novelty guard), `topics.ts` (10 keyword topics, recency-weighted preferences), `interest.ts` + `learn.ts` (taste lexicon, refit, CV evaluation), `thirst.ts` (thirst scorer, takes caption + image alt text), `router.ts` (tiering), `providers.ts` (request/parse for chat providers), `scoring.ts`. Bundled to `lib.js` as `globalThis.SD`.
- `src/content/sites.js`: per-site DOM adapters (X, Instagram: selectors, text, context, tiles). Nothing else in the content script knows a site's markup.
- `src/content/main.js` (scan, request, render, reactions, keyboard, live refresh) and `src/content/ui.ts` (closed Shadow-DOM card: strip / dock / "why" popover). Bundled to `content.js`. `content.css` holds only page-level rules.
- `background.js`: service worker (queue, cache, providers, tier routing, rage/taste/topic state, stats, retraining). `popup.*`, `options.*`: extension pages.
- Storage keys (all `sd*`, unchanged by the rename): `sdVotes` (slop votes), `sdRageVotes`, `sdThirstVotes`, `sdTaste` (👍/👎 reactions), `sdModel`/`sdRageModel`/`sdThirstModel` (learned weights), `topicManual`, `sdCache`, `sdStats`, `sdRecent`, settings (`mode`, `sensitivity`, `rageMode`, `rageThreshold`, `thirstMode`, `thirstThreshold`, `thirstVision`, `tasteMode`, `provider*`, `tierMode`, `learn`, `profiles`).

## Hard-won gotchas
- **X's React rewrites `class` on articles.** Page-level state lives in `data-sd-*` *attributes* (`data-sd`, `data-sd-fold`, `data-sd-open`, `data-sd-why`, `data-sd-hidden`), never classes.
- X articles have `overflow:hidden` and each timeline cell is its own stacking context; the popover needs `article[data-sd-why]{overflow:visible}` and `cellInnerDiv:has(...)` z-index (see `content.css`).
- After changing code: `npm run build`, reload the extension at `chrome://extensions`, refresh X. `document.documentElement.dataset.sdVersion` shows the injected version (bump `manifest.json` **and** `package.json` per change).
- `lib.js`/`content.js` are build outputs: don't hand-edit; always rebuild before committing.
- Store build constraints (enforced by `npm run pack`): no broad/optional host permissions; custom endpoints limited to the manifest's hosts (`options.js` `ALLOWED_HOSTS`); creator-profile hover lookups default **off**.
- Reaction fan-out: 👎 on a post scoring ≥ 50 slop/rage also trains those; 👍 on a folded post corrects the verdict that folded it; precedence: own 👍 exempts everything > slop > rage > thirst > less/topic. 👎 on a post scoring ≥ 50 thirst also trains thirst.
- **Instagram**: the slop weights are X-fit, so `localScore(text, w, "instagram")` mutes hashtags/emoji/exclamations and shifts the bias (otherwise ordinary IG captions fold as slop). Posts are `article`; caption = longest `span[dir=auto]`; post id `ig_<shortcode>`; the photo's alt text is the main thirst signal. Explore tiles are scored on alt text only (`ctx.localOnly`, no model call) and blurred, no reactions. Vision (images to the provider) is opt-in, skipped for Jev and localhost.
- Don't present it as an "AI detector" or claim it changes X's algorithm (copy rule). Minutes-saved is an *estimate*.
- Test corpora (`test/corpus-*.mjs`, `test/rage-corpus.mjs`) are **synthetic**; perfect rage AUC means the negatives are too clean, not that it's solved.
- When testing on the user's real X account in a browser, undo any reactions you make.
- The Chrome Web Store dashboard cannot be automated (extension tools, computer use and the in-app browser are all blocked); submission is manual.

## Status (v2.8.2)
- Built: everything above; popup dashboard; settings app (General, Detection, Filters & creators incl. Topics, Review & votes, Insights, Data); export/import; launch kit in `docs/launch/`; `PRIVACY.md`.
- 2.6.0 added thirst traps (X + Instagram) and the Instagram adapter. Live-verified on a real logged-in Instagram home feed at 2.6.2/2.6.3: adapter runs, THIRST/SLOP folds render correctly in the article, Peek opens and closes, Explore and Reels are left alone. Real markup differs from the public markup: articles have **no `<header>`**, ad profile links carry `?hl=…`, and "Liked by", location and audio lines are `span[dir=auto]` too (fixed in 2.6.3). Most home-feed posts are videos with `blob:` sources and no poster, so the picture option sees nothing for them.
- 2.7.0 (built and unit-tested, **not yet checked live**): wildcard creator rules in `sdCreators` (`*basketball*`, `santacruz*`; trust beats slop/thirst, no model call), suggested-account posts fold at thirst threshold minus 15 and tell the model `suggested_account`, video posts send a downscaled canvas frame (data URL, `ctx.frame`) to the model when the picture option is on, queue is newest-first with 4 concurrent calls, scoring starts 1200px ahead of the viewport, images are sent with `detail: low`.
- 2.8.2: re-measured live on 34 checked posts: 8 blank on screen (0.2 to 2.6 s), p90 4.4 s, max 5.3 s. No clear gain over 2.8.1 (4 of 44 blank); run-to-run noise is as large as the change. Instagram only mounts a few articles ahead, so scoring cannot start earlier than that; the model is the remaining lever.
- 2.8.2 changes: 6 concurrent model calls, 12 s request timeout (AbortSignal), 429 pause min 4 s (was 15 s), shorter model output (reasons under 7 words, max_tokens 160). Latency source was never measured inside the worker; the model itself (gpt-4.1-mini via OpenRouter) is the likely floor.
- 2.8.1: prefetch margin 2600px (was 1200), frame wait 1.5 s. Re-measured live at 2.8.1 on 44 checked posts: 4 were blank on screen (gaps 0.2 to 4.8 s), down from 11 of 33; p90 3.4 s, max 9.7 s. Measured live at 2.8.0 on 33 checked posts: median 0.7 s from check start to verdict, p90 5.1 s, max 5.9 s; 11 of 33 were still blank on screen for 0.15 to 3.2 s (hence the larger margin). Video verdicts: model reasons on caption-less videos describe pose/body, so pictures are reaching it, but whether the canvas frame (vs the cover image) changed any verdict is not proven.
- 2.8.0: Instagram posts that will be checked get `data-sd-pending` (CSS `visibility:hidden`, keeps layout) until the verdict arrives, or 8 s, so folds are in place before the reader scrolls to them.
- 2.7.1: Instagram "always show accounts I follow" (setting `igShowFollowed`, default on): photo/carousel posts that are not suggested, not ads and not reels (no `<video>`, no `/reels/` link) are never scored; suggested posts, ads and reels are. Verified live at 2.7.0 that the creator-rule list works only for exact handles the reader added (the reader had added mikerholland, monashmemes_, santacruzmedicinals; no wildcard rule existed yet). 2.7.1 untested live.
- 2.6.4 (prompt tweak: short/emoji-only Instagram captions are not slop) is built and tested offline but **not re-checked live**. Not verified: light theme, popup health warning, the "why" popover on misses, provider-side fetching of Instagram image URLs, Explore tiles (real tiles have no alt text, so nothing is scored). Known layout issue: the hover dock can cover Instagram's Follow button on suggested posts.
- Verified live on x.com up to 2.4.1 (dock, LESS fold, topic folding, live updates, undo). 2.5.0 (rename/hardening) is covered by tests and rendered screenshots but not re-tested on live X.
- Pushed. Remote is public `abs-j/heed` (`origin` → `https://github.com/abs-j/heed.git`). Privacy policy loads signed-out at `https://github.com/abs-j/heed/blob/main/PRIVACY.md`.

## Next steps
1. Trademark search for "Heed" (USPTO, IP Australia) before or alongside the first submission.
2. Submit to the Chrome Web Store (unlisted first) using `~/Desktop/Heed-store/PASTE-THESE.txt` and `docs/launch/SUBMIT.md`; then public + launch posts per `docs/launch/README.md`.
4. Product: collect real reactions and measure agreement (Settings → Insights); LLM-assisted topic tags for uncertain posts; "highlight what I like"/digest; spend tracking for non-Jev providers; Firefox build.

## Conventions
Match surrounding style; comments explain *why* (X quirks, trade-offs). New behaviour needs a test (`test/`), including `background.js` paths via `test/background.test.mjs`. Keep user-facing copy plain (no jargon) and honest about limits.
