# Slop Detector

Chrome (Manifest V3) extension that scores posts on X from 0–100 for "slop" using
Jev (`typesafe/jev-1.13`) via OpenRouter's Decisions API (`POST /api/alpha/decisions`).

> Scores are subjective content-quality assessments, **not** proof a post was AI-generated.

## Install
1. Create an API key at https://openrouter.ai/settings/keys (and add a few dollars of credit).
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this `slop-detector` folder.
4. Click the extension icon → **All settings & API key**, paste the key, **Save**.
5. Open https://x.com and scroll.

## Modes
Blur + SLOP sticker (default, click to reveal) · Hide · Dim · Warning badge · Scores only.
Sensitivity sets the score threshold at which a post counts as slop.

## How it works
- Visible posts (≥40 chars) are sent in the background worker to Jev with two questions:
  a 5-level slop score and a pattern classification, using a rubric that judges content quality and
  creator behaviour (engagement farming, recycled viral clips, clickbait, vagueposting vs. genuine
  individual voices). Each request also carries the creator's display name, handle and verified badge,
  attached media (image count/alt text, video, link card) and up to 4 earlier posts from the same
  creator that you've scrolled past. X's timeline doesn't expose bios, so none is sent. Jev returns probabilities, not prose, so the
  "explanation" is the detected pattern (e.g. "Engagement bait (82% match)").
- Results are cached 30 days by text hash (max 3000 entries) and duplicate in-flight requests are merged.
- Slop posts collapse to a compact one-row strip automatically; hover to peek (it opens smoothly and re-minimises when you leave; Enter/click on the strip also opens it). **Slop / Not slop** votes override that
  post, can be undone, and are listed under **Vote history** in settings (switch or remove any vote).
  Votes teach the model your taste: each request includes the 4 slop and 4 not-slop votes most similar
  to the post (matching wording, same creator, recency), plus how many of that creator's posts you've
  voted each way. Already-scored posts keep their score; new posts benefit from new votes.
- Errors (bad key, no credits, rate limits) pause requests and show in the popup/settings.

## Beyond the model
- **Creator rules:** always collapse / always show a creator (settings). Three votes the same way and
  none the other does this automatically, with no API call.
- **Local checks:** free pattern heuristics (em-dash density, "not X, it's Y", stock hooks, engagement
  bait, list formatting vs. slang/first-person/links) are sent to Jev as hints and used as a labelled
  fallback when there's no key, the API is down, the queue is long or the daily cap is hit. Local
  results are re-scored by the model after a minute.
- **Recently filtered:** the last 60 collapsed/hidden posts with reasons, where you can overrule them.
- **Daily spend cap** in settings.

## More features
- **Why this score:** click a score chip to see the model score, account-type adjustment, signals,
  profile text read and the votes that influenced it.
- **Replies, quotes, threads:** a reply is judged with the post it answers, a quote tweet by the added
  commentary, and a collapsed thread opener folds the author's consecutive follow-on posts.
- **Your own filters:** plain-language topics in settings ("crypto shilling") are asked in the same
  request and collapse matching posts.
- **Threshold tuning, stats, backup:** settings suggest the sensitivity that best agrees with your
  votes, show 7-day usage and the most slop-heavy creators, and export/import votes and rules.

## Measuring and tuning
- Results are cached per post (X status id), storing the raw model score separately from the
  account-type adjustment. The adjustment is applied when shown, so the **Account-type influence**
  setting and the sensitivity change take effect instantly with no re-scoring.
- Creator profiles are a second pass: a post is scored first, and only borderline posts (about 35-75)
  trigger the slower profile lookup and a re-score. Profiles you've already seen are used for free.
- `node tools/eval.mjs backup.json` replays your exported votes under different influence/threshold
  settings and lists the posts the model gets wrong. `node --test test/` runs the unit tests.
- The popup warns if X's layout seems to have changed (creator handles unreadable, or profile lookups
  returning nothing).

## Privacy
The API key lives in `chrome.storage.local` and is only used by the background worker. Text of
posts you view is sent to OpenRouter/TypeSafe for scoring. No other network access.

## Engines and providers (v2)
- **Tiered by default:** the on-device classifier settles clear-cut posts (score ≤ 20 or ≥ 90) with no network call; only uncertain posts go to the AI model. Choose "AI model for every post" or "Local only" in settings.
- **Providers:** Jev via OpenRouter (original), Anthropic (Claude), or any OpenAI-compatible endpoint (OpenAI, OpenRouter chat, Ollama, LM Studio; no key needed on localhost). Custom hosts ask for permission when you save. Spend cap currently only tracks Jev costs.

## New look (v2)
- Fine posts are left untouched. Slop folds into a one-row "receipt" (score, verdict, top reasons, Peek); a thin colour bar marks the edge of folded and borderline posts.
- Hover any post for a small dock: score chip (click for the **why** popover with a gauge against your threshold, and every signal), **Slop** / **Not slop** votes, **Undo**.
- Shortcuts, on the post under the pointer or with focus: <kbd>Alt</kbd>+<kbd>S</kbd> slop, <kbd>Alt</kbd>+<kbd>N</kbd> not slop, <kbd>Alt</kbd>+<kbd>U</kbd> undo, <kbd>Alt</kbd>+<kbd>P</kbd> peek, <kbd>Alt</kbd>+<kbd>W</kbd> why. <kbd>Esc</kbd> closes the popover.
- All injected UI lives in a closed shadow root (`src/content/ui.ts`), so X's CSS can't affect it.
- `tools/harness/index.html` renders the real content script against a fake timeline (serve the repo root, e.g. `python3 -m http.server`, and open `/tools/harness/index.html`).

## Development (v2 work in progress)
- `lib.js` and `content.js` are **generated** from `src/lib/*.ts` and `src/content/`: run `npm install && npm run build` after editing, then reload the extension.
- Local classifier: `src/lib/features.ts` (≈40 hand-weighted features) + `src/lib/weights.json` (trained). `npm run train [backup.json]` retrains, `npm run eval` compares it with the frozen v1.5 heuristic on the seed and held-out corpora, `npm test` builds and runs everything.
- The bundled corpora are synthetic and labelled by the author; use your own exported votes for real calibration. See REVAMP_PLAN.md.
