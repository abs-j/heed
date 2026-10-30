# Heed

A Chrome (Manifest V3) extension that lets **you** decide what deserves your attention on X and Instagram. Tell it with a 👍 or 👎 what you liked and didn't; posts you'd rather not spend attention on, from slop and rage bait to whole topics you want less of, **fold into a one-line row**. They're still one hover away, they just cost you a glance instead of a read.

> It doesn't change what X serves you. It changes what costs *you* attention.
> Scores are subjective content-quality judgements, not proof that a post was written by an AI; detectors for short social posts aren't reliable at that, so this one doesn't claim to do it.

<p align="center"><img src="icons/128.png" width="96" alt="Icon: three rising bars, green, amber and red"></p>

## What it does

- **Good posts look untouched.** Posts near your threshold get a thin amber edge.
- **One signal from you: 👍 / 👎.** Hover any post. 👎 means "I didn't like this": it folds, and the extension learns from it. 👍 on a *hidden* post means "that was fine": it unfolds and the preference changes. No reasons to pick; it works out whether the cause was slop, rage bait, or just not your thing.
- **Folded posts are a one-line row** (verdict, main reason, *Peek*). Hover or press <kbd>Enter</kbd> to open; it closes again when you leave. Verdicts: **SLOP** (low-effort, engagement farming, vagueposting), **RAGE** (built to provoke, nothing new), **LESS** (you've been seeing less of this).
- **Topics you want less of.** 👎 two news posts and news starts folding as "seeing less news"; 👍 a hidden one later and it comes back. Newer reactions count more. Settings → Filters shows what it learned per topic (news, politics, sports, crypto, tech & AI, finance, entertainment, culture war, health, science) and lets you override it by hand.
- **Learns on-device.** Reactions retrain the local classifiers; Settings shows how much better it agrees with you. The popup shows an *estimated* reading time saved.
- **Click the score** for the *why* popover: a gauge against your threshold plus every signal, the topic, and what it learned from you.

### Rage bait
Posts that exist only to provoke contempt or tribal anger and add nothing new ("X be like" mockery, sweeping claims about a group, rhetorical outrage questions). **News, announcements and fresh commentary that adds facts or an argument are left alone**, even when angry or political, and fresh posts with sources or numbers get extra benefit of the doubt. Folded as an orange *RAGE* row (or hidden, or off). Scored on-device (`src/lib/rage.ts`) and by the AI model, which is told explicitly not to flag topics, only emptiness.

### Thirst traps
Posts made to be looked at: a "rate me" ask, a teasing one-liner, an emoji-only caption next to a body. Folded as a pink *THIRST* row (or hidden, or off). Deliberately conservative: workout tutorials, sport, travel, fashion credits and ordinary selfies score low, and one weak signal never reaches the default line. Scored on-device (`src/lib/thirst.ts`: caption, hashtags, the photo's alt text) and by the AI model; an optional, off-by-default setting lets a vision-capable provider look at the image on uncertain posts. 👎 on a thirst-looking post trains it, 👍 on a folded one corrects it. Precedence: own 👍 > slop > rage > thirst > less.

### Instagram
The same verdicts, reactions and learning work in the Instagram home feed (`src/content/sites.js`). The slop classifier is told hashtags and emoji are normal there. Explore / profile grid thumbnails have no caption, so only an obvious thirst-trap image description blurs a thumbnail (until hovered). Instagram's markup is generated and changes often; the adapter relies on links, `<time>`, `<img alt>` and `span[dir=auto]`. Preview offline: `node tools/harness/instagram.mjs out.png`.

### Modes
Fold (default) · Hide · Dim · Chip (score chip on slop only) · Scores (chip on every post, no filtering).

### Keyboard (on the post under the pointer, or the focused one)
| Keys | Action |
|---|---|
| <kbd>Alt</kbd>+<kbd>L</kbd> / <kbd>Alt</kbd>+<kbd>D</kbd> | 👍 liked this / 👎 didn't like this |
| <kbd>Alt</kbd>+<kbd>U</kbd> | undo your reaction |
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
- **Learning from 👍 / 👎.** One reaction fans out to three learners, so you never choose a reason: (1) **topic preferences** (`src/lib/topics.ts`): posts are tagged on-device with up to two of ten broad topics; each topic's preference is a recency-weighted (45-day half-life), smoothed like/dislike balance, so one 👎 nudges (−0.4), two fold (−0.57), and later 👍s bring it back; (2) a **taste lexicon** (`interest.ts`, `learn.ts`): words and phrases that set liked posts apart from disliked ones, leave-one-out so a reaction never explains itself; (3) the **quality models**: a 👎 on a post that already scores like slop or rage bait (≥ 50) also teaches those scorers, and a 👍 on a folded post corrects the verdict that folded it. Weights are anchored to the shipped model and capped at ±1.5. Needs 6 reactions to start and 10 (3+ of each kind) to measure agreement in Settings → Insights. Reactions are also sent to the AI model as examples.
- **Your rules** always win: per-creator *always fold / always show* (three same-way votes set one automatically), and plain-language filters ("crypto shilling") checked in the same AI request.

## Settings
**General** (enable, mode, sensitivity, rage bait, your 👍/👎) · **Detection** (engine, provider, account-type influence, creator profiles, spend cap) · **Filters & creators** (topics, your rules, creators) · **Review & votes** (recently filtered, vote history) · **Insights** (7-day stats, threshold tuning, learning) · **Data** (export/import, reset). The popup is a dashboard: today's counts, a 7-day sparkline, mode, and sensitivity drawn over the distribution of your recent scores.

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
npm run pack       # build dist/heed-<version>.zip for the Chrome Web Store (runtime files only, with sanity checks)
```
- `src/lib/*.ts`: scoring, routing, providers, learning (pure, unit-tested). `src/content/`: DOM adapter, scanner, and the Shadow-DOM card (`ui.ts`). `background.js`: service worker (API calls, cache, queue, stats, retraining). `popup.*`, `options.*`: extension pages.
- Fold/open/dim state lives in `data-sd-*` attributes, not classes: X's React re-renders rewrite class names and would wipe them.
- `tools/harness/index.html` runs the real content script against a fake timeline; `tools/harness/page.html?p=popup.html` (or `options.html`) opens the extension pages with sample data. Serve the repo root (`python3 -m http.server`).
- The bundled corpora in `test/` are **synthetic**, labelled by the author. Use your own exported votes for real calibration: `node tools/eval.mjs backup.json`.

## Privacy
Keys live in `chrome.storage.local` and are only used by the service worker. Text of posts you view is sent to the AI provider you choose, only for posts the on-device classifier can't settle (never, in *Local only*). Learning happens on your device. No analytics, no other network access. Votes, cache and stats can be exported or wiped from Settings → Data.

See `REVAMP_PLAN.md` for the v2 design notes and research.
