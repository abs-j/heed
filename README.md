# Slop Detector

A Chrome (Manifest V3) extension that quietly folds low-effort, formulaic and engagement-farming
posts on X, and leaves everything else alone.

> Scores are subjective **content-quality** judgements, not proof that a post was written by an AI.
> Detectors for short social posts are unreliable at that, so this one doesn't claim to do it.

<p align="center"><img src="icons/128.png" width="96" alt="Slop Detector icon: three rising bars, green, amber and red"></p>

## What it does

- **Fine posts look untouched.** Posts near your threshold get a thin amber edge.
- **Slop folds into a one-line receipt**: score, verdict, the main reasons and a *Peek* control. Hover (or press <kbd>Enter</kbd>) to open it; it closes again when you leave.
- **Hover any post** for a small dock: score chip and votes, **Undo**. A post that looks fine shows one obvious button, **Mark slop**, so you can teach it what it missed (short posts get this too: they're scored on-device only). Click the score for the *why* popover: a gauge against your threshold plus every signal, the model score, account type and what it learned from you.
- **Learns your taste on-device.** Your votes retrain the local classifier; Settings shows how much better it agrees with you.

### Rage bait
A second verdict, separate from slop: posts that exist only to provoke contempt or tribal anger and add nothing new ("X be like" mockery, sweeping claims about a group, rhetorical outrage questions). **News, announcements and fresh commentary that adds facts or an argument are left alone**, even when angry or political, and fresh posts with sources or numbers get extra benefit of the doubt. Folded as an orange *RAGE* row (or hidden, or off: your choice in the popup/settings). Scored on-device (`src/lib/rage.ts`) and by the AI model, which is told explicitly not to flag topics, only emptiness; your *Rage bait / Not rage bait* votes override both and retrain the on-device scorer.

### Modes
Fold (default) · Hide · Dim · Chip (score chip on slop only) · Scores (chip on every post, no filtering).

### Keyboard (on the post under the pointer, or the focused one)
| Keys | Action |
|---|---|
| <kbd>Alt</kbd>+<kbd>S</kbd> / <kbd>Alt</kbd>+<kbd>N</kbd> | mark slop / not slop |
| <kbd>Alt</kbd>+<kbd>R</kbd> | mark / unmark rage bait |
| <kbd>Alt</kbd>+<kbd>U</kbd> | undo your vote |
| <kbd>Alt</kbd>+<kbd>P</kbd> | peek / close a folded post |
| <kbd>Alt</kbd>+<kbd>W</kbd>, <kbd>Esc</kbd> | open / close the *why* popover |

(Alt chords, because X already owns the bare letter keys.)

## Install
1. `npm install && npm run build` (generates `lib.js` and `content.js` from `src/`).
2. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, choose this folder.
3. Optional: open the extension's **Settings → Detection** and add an AI provider key. Without one the on-device classifier works on its own.
4. Open <https://x.com> and scroll. After rebuilding, click the reload icon on the extension card and refresh X (content scripts attach on page load). `document.documentElement.dataset.sdVersion` on x.com tells you which build is injected.

## How detection works

```
 post ─▶ on-device classifier ──▶ score ≤ 20 or ≥ 90 ──▶ answer locally (no network)
            ~40 features + your                │
            taste lexicon, logistic regression │ uncertain
                                               ▼
                                    AI model (Jev · Claude · OpenAI-compatible/Ollama)
                                    + creator, reply/quote, media, your voted examples
```

- **Local classifier** (`src/lib/features.ts`, `model.ts`): hooks, "not X, it's Y" reversals, engagement bait, @grok prompt-bait, generic reply filler, motivational platitudes, buzzwords, list/fragment cadence, hashtags/emoji; offset by signs of a real voice (first person, narrative, numbers, named entities, technical detail, hedging). ~10 µs per post.
- **Tiered routing** (`src/lib/router.ts`): clear-cut posts never reach the network. Modes: *Tiered* (default), *AI for every post*, *Local only*.
- **Providers** (`src/lib/providers.ts`): Jev via OpenRouter, Anthropic, or any OpenAI-compatible endpoint (OpenAI, OpenRouter chat, Ollama, LM Studio; no key on localhost). Custom hosts ask for permission when you save. The daily spend cap currently tracks Jev costs only.
- **Account context**: creator display name, handle and verified badge, media, replies/quotes, up to 4 earlier posts from the same creator, and (for borderline posts only) the bio and follower text from X's own hover card, read invisibly for a moment. Results are cached per post for 30 days.
- **Learning** (`src/lib/learn.ts`): a taste lexicon of words and phrases that recur in posts you marked slop vs kept (leave-one-out, so a vote never explains itself) plus a refit of the feature weights, pulled towards the shipped model and capped at ±1.5 per weight. Needs 6 votes to start, 10 (3+ of each kind) to measure. Settings → Insights shows cross-validated agreement. Votes are also sent to the AI model as examples.
- **Your rules** always win: per-creator *always fold / always show* (three same-way votes set one automatically), and plain-language filters ("crypto shilling") checked in the same AI request.

## Settings
**General** (enable, mode, sensitivity) · **Detection** (engine, provider, account-type influence, creator profiles, spend cap) · **Filters & creators** · **Review & votes** (recently filtered, vote history) · **Insights** (7-day stats, threshold tuning, learning) · **Data** (export/import, reset). The popup is a dashboard: today's counts, a 7-day sparkline, mode, and sensitivity drawn over the distribution of your recent scores.

## Development
```bash
npm install
npm run build      # esbuild: src/lib -> lib.js, src/content -> content.js (both committed, so unpacked loading works)
npm test           # builds, then runs node --test (classifier, learning, providers, background in a sandbox)
npm run typecheck  # tsc --noEmit
npm run eval       # frozen v1.5 heuristic vs the local classifier on the seed and held-out corpora
npm run train      # retrain shipped weights from the seed corpus (+ optional votes backup)
npm run bench      # classifier speed (budget: 2 ms/post)
npm run icons      # regenerate icons/
```
- `src/lib/*.ts`: scoring, routing, providers, learning (pure, unit-tested). `src/content/`: DOM adapter, scanner, and the Shadow-DOM card (`ui.ts`). `background.js`: service worker (API calls, cache, queue, stats, retraining). `popup.*`, `options.*`: extension pages.
- Fold/open/dim state lives in `data-sd-*` attributes, not classes: X's React re-renders rewrite class names and would wipe them.
- `tools/harness/index.html` runs the real content script against a fake timeline; `tools/harness/page.html?p=popup.html` (or `options.html`) opens the extension pages with sample data. Serve the repo root (`python3 -m http.server`).
- The bundled corpora in `test/` are **synthetic**, labelled by the author. Use your own exported votes for real calibration: `node tools/eval.mjs backup.json`.

## Privacy
Keys live in `chrome.storage.local` and are only used by the service worker. Text of posts you view is sent to the AI provider you choose, only for posts the on-device classifier can't settle (never, in *Local only*). Learning happens on your device. No analytics, no other network access. Votes, cache and stats can be exported or wiped from Settings → Data.

See `REVAMP_PLAN.md` for the v2 design notes and research.
