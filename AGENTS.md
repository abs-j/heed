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

## Status (v2.6.2)
- Built: everything above; popup dashboard; settings app (General, Detection, Filters & creators incl. Topics, Review & votes, Insights, Data); export/import; launch kit in `docs/launch/`; `PRIVACY.md`.
- 2.6.0 adds thirst traps (X + Instagram) and the Instagram adapter. **Not tested on live Instagram** (selectors written from public markup; only the offline harness `tools/harness/instagram.mjs` and unit tests ran). Needs a real-feed pass and a store-listing/privacy update for the new host before submission.
- Verified live on x.com up to 2.4.1 (dock, LESS fold, topic folding, live updates, undo). 2.5.0 (rename/hardening) is covered by tests and rendered screenshots but not re-tested on live X.
- Pushed. Remote is public `abs-j/heed` (`origin` → `https://github.com/abs-j/heed.git`). Privacy policy loads signed-out at `https://github.com/abs-j/heed/blob/main/PRIVACY.md`.

## Next steps
1. Trademark search for "Heed" (USPTO, IP Australia) before or alongside the first submission.
2. Submit to the Chrome Web Store (unlisted first) using `~/Desktop/Heed-store/PASTE-THESE.txt` and `docs/launch/SUBMIT.md`; then public + launch posts per `docs/launch/README.md`.
4. Product: collect real reactions and measure agreement (Settings → Insights); LLM-assisted topic tags for uncertain posts; "highlight what I like"/digest; spend tracking for non-Jev providers; Firefox build.

## Conventions
Match surrounding style; comments explain *why* (X quirks, trade-offs). New behaviour needs a test (`test/`), including `background.js` paths via `test/background.test.mjs`. Keep user-facing copy plain (no jargon) and honest about limits.
