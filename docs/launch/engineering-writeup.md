# Building a feed filter that doesn't pretend to detect AI

*A Chrome extension that lets you decide what deserves your attention on X: a 👍/👎 that teaches an on-device model, an optional LLM for the hard cases, and posts you'd rather skip folded into one line. Notes on the design, how I measured it, and what broke.*

Repo: [github.com/abs-j/slop-detector]([repo link]) · Try it: [Chrome Web Store]([store link])

---

## 1. The problem

My timeline had filled with posts that aren't *wrong*, just a poor use of attention: "Here's the thing nobody talks about…", engagement bait, recycled clips with a stock caption, and posts whose only purpose is to make me angry. The platform's own controls (mute words, "not interested") are blunt and slow. I wanted a filter that I control, that explains itself, and that gets better at *my* taste.

## 2. Why this is not an "AI detector"

The obvious framing is "detect AI-written posts". I deliberately didn't, for three reasons:

- **It doesn't work well on short text.** Published results on single social posts show supervised detectors that score ~0.96 AUC in-distribution fall to ~0.71 on out-of-distribution bot content, and training-free methods land around 0.54–0.68 ([arXiv 2606.07219](https://arxiv.org/pdf/2606.07219)). Fine-tuned generators evade them ([ACL 2025](https://preview.aclanthology.org/new-sigs/2025.findings-acl.695/)).
- **The stylistic tells are model-dependent.** Em-dash rates differ from 0 to ~9 per 1,000 words across models ([arXiv 2603.27006](https://arxiv.org/abs/2603.27006), a preprint). A rule built on one model's habits is a rule about that model.
- **It isn't what annoys me.** A human can write slop and an AI can write something useful. The thing I want to filter is *low effort and manipulative intent*, so that's what gets scored: a 0–100 **quality score**, with the UI and copy saying so.

## 3. Architecture

```
 post (x.com DOM)
   │
   ▼  content script: find posts, read context (author, media, reply/quote, time)
   │
   ▼  background service worker
   ├─ on-device classifier ──▶ slop score        ┐
   ├─ on-device rage scorer ──▶ rage score       ├─ both sure? ─▶ answer locally (no network)
   │                                             ┘
   └─ unsure ─▶ AI model (Jev · Claude · OpenAI-compatible / Ollama)
                 + author, reply/quote, media, post age, your voted examples
   │
   ▼  result cached 30 days by post id, then…
   ▼  Shadow-DOM card: fold / dock / "why" popover
```

Pieces:

- **Manifest V3 service worker** owns API keys, the queue, caching, retries and stats. The content script never sees a key.
- **Pure TypeScript core** (`src/lib`): features, scorers, router, provider request/response code, learning. No DOM or `chrome.*`, so it unit-tests in plain Node. Bundled with esbuild into one `lib.js` that the worker, content script and settings page all share.
- **Tiered routing.** The on-device score settles clear-cut posts (≤ 20 or ≥ 90); only the uncertain middle goes to a model. When the rage filter is on, a post is only settled locally if the rage scorer is also sure. Defaults are conservative because a wrong silent decision is worse than a wasted API call.
- **Providers behind one interface**: Jev via OpenRouter (a multi-question "decisions" API), Anthropic Messages, and any OpenAI-compatible endpoint including a local Ollama. For chat-style providers the prompt asks for a strict JSON object, parsed defensively (fences, prose, unbalanced braces, clamped ranges, unknown enums).

## 4. The on-device classifier

A logistic regression over ~40 hand-built features, each mapped to [0, 1]:

- **Slop signals:** stock hooks, "not X, it's Y" reversals, calls to action, `@grok` prompt-bait, generic reply filler ("This.", "Great point!"), motivational platitudes, buzzwords, list/fragment cadence, hashtags, emoji.
- **Signs of a real voice (negative weights):** first-person narrative, specific numbers, named entities, technical detail, hedging, personal anecdotes.

Each feature has a **hand-set prior weight**. Training is *prior-centred* (L2 towards the priors, not zero), so a small dataset can adjust a weight but can't flip the sign of something sensible. Each post scores in about **11 µs** (81 µs for a 1,500-character post); the budget I set was 2 ms.

### Rage bait, and the news problem

Rage bait is a second, independent score. The hard requirement: **don't block news or fresh opinions.** So the scorer is built around *emptiness*, not topic or tone:

- Positive signals: sweeping claims about a group, "X be like" mockery, rhetorical outrage questions ("why are X so Y… or something?"), challenges ("fight me"), contempt words, us-vs-them framing.
- **Novelty features push it down:** source attribution ("according to", "officials said"), numbers, dates and time anchors, links, reasoning words, first-hand experience.
- **Freshness:** when the post's age is under 36 hours *and* it reads like reporting, it gets extra benefit of the doubt.
- The LLM prompt says it explicitly: a post is **not** rage bait because it is political, angry, controversial or about a recent event; judge whether it contributes anything.

## 5. One signal: 👍 / 👎

The first version had separate buttons: *Slop*, *Not slop*, *Rage bait*. It was accurate and tiresome. The better model of the user is that they only know whether they liked a post, not *why* it was bad. So there is one signal, and the system works out the cause:

- **👎 on a post that already scores like slop or rage bait (≥ 50)** also teaches that scorer. A 👎 on a post with neither signal is a pure preference.
- **👍 on a folded post** is a correction: it teaches the scorer that folded it that it was wrong.
- **Topic preferences.** Posts are tagged on-device with up to two of ten broad topics (news, politics, sports, crypto, tech & AI, finance, entertainment, culture war, health, science) by keyword lexicons that need two distinct hits (or one in a very short post, or a strong marker like "BREAKING"). Each topic's preference is a **recency-weighted, smoothed balance** of 👍 and 👎: weights halve every 45 days, and the smoothing means one 👎 only nudges (−0.4) while two fold the topic (−0.57). A 👍 on a hidden post later moves it back. The post is then folded as "seeing less news". Settings shows the learned values and lets you override them.
- **A taste lexicon.** Unigrams and bigrams that set liked posts apart from disliked ones, as smoothed log-odds. It's **leave-one-out**: a reaction's own words are subtracted when training, otherwise every vote would "explain itself". A token needs support from at least two reactions, and the lexicon is only used once both sides have two or more.
- **Quality model refit,** anchored to the shipped weights and clamped to ±1.5 per weight, with votes counting double.
- **The feed updates live.** After a reaction, other posts already on screen are re-judged (their analysis is cached), so a 👍 can bring a whole topic back without a refresh.

Precedence is deliberate: the reader's own 👍 exempts a post from everything; slop and rage verdicts outrank topic folding; a topic can only fold a post as "seeing less …". So a topic preference never silently overrides a verdict the reader gave.

The AI model also sees the reader's most similar reactions as examples. Retraining runs in the service worker a moment after any change. In Settings, **cross-validated** agreement (shipped vs. learned, on posts the model hasn't trained on) shows whether it's actually helping.

## 6. How I evaluated it, and the limits

I built two small synthetic corpora (97 posts for slop, 60 for rage bait, about half positive in each), plus **held-out sets (24 posts each) written after the features were frozen and never used for tuning**. Results:

| | v1.5 regex heuristic | New classifier |
|---|---|---|
| Seed set (5-fold CV) | AUC 0.83, caught 26% of slop at its default threshold | AUC 0.99, 86% recall, 98% precision |
| Held-out | AUC 0.65, caught none at default | AUC 0.99, 88% accuracy |

**Be careful with these numbers.** The corpora are synthetic and labelled by me, in the same style the features target. The rage scorer scores AUC 1.0 on both sets, which is a sign my negatives are *too clean*, not that the problem is solved. The honest claims are: the new scorer ranks far better than the old one on data it never saw, and the real accuracy on a live feed is unknown until it's measured against my own votes. That's what the in-app agreement metric is for, and why the repo has `npm run eval` against exported votes.

The tiered router resolved ~46% of the held-out posts locally with no mistakes, but that's 24 posts. Treat it as plausible, not proven.

## 7. The bug that taught me the most: React wipes your classes

My first UI folded a slop post by adding a CSS class (`sd-collapsed`) to X's `<article>`. In testing on a static fake timeline it worked. On real X, a few posts would show a giant empty red block with a tiny strip floating in the middle.

The cause: X's React app re-renders and **rewrites each article's `class` attribute**, erasing my class, while the shadow-DOM card I'd attached (a child element) survived. The card then stretched over a post that had silently un-collapsed.

Fix: keep all page-level state in **`data-sd-*` attributes**, which React doesn't manage. Related lessons from the same afternoon:

- X sets `overflow: hidden` on articles, which clipped my "why" popover on short posts. And each timeline cell is its own stacking context, so a high `z-index` inside a cell can't beat the next cell. The popover now temporarily sets `overflow: visible` and lifts its whole cell (`:has(article[data-sd-why])`).
- A *stale build* cost me an hour: the browser kept running the previous content script. I added a `data-sd-version` attribute on `<html>` and bumped the manifest version per change, so "which build is actually injected?" is a one-line check.

## 8. Performance

- The classifier is ~11 µs per post, so it's not the cost. Storage was: scoring a post used to read-modify-write storage twice. Counters and recent scores are now **buffered and flushed together** every 1.5 s.
- Local scores are **memoised by text** (a post is scored a few times per request: routing, hints, explanation).
- Theme detection (a forced style recalculation) runs at most every 3 s instead of on every DOM mutation burst.
- Network cost: ~half of clear-cut posts never reach the network in tiered mode; the rest are queued (max 2 concurrent), de-duplicated while in flight, and cached for 30 days by post id.

## 9. Accessibility

- Injected UI lives in a **closed shadow root**, so X's CSS can't break it and mine can't leak.
- **Contrast was wrong on light themes:** my red, amber and green were 3.4, 1.9 and 2.6 : 1 against white. Verdict colours now switch with the page theme and reach ≥ 4.5 : 1 (checked numerically).
- Folded rows are `role="button"` with `aria-expanded` and descriptive labels; the "why" popover is a labelled dialog; opening it by keyboard moves focus into it, and <kbd>Esc</kbd> returns focus to the trigger; every control has a visible focus ring; `prefers-reduced-motion` is respected.
- Extension pages ran through **axe-core**: it flagged three issues (no page heading, an unlabelled chart, an unlabelled select), all fixed, and I labelled a neighbouring input at the same time. (The card itself sits in a closed shadow root that axe can't scan, so that part I checked by hand.)
- Keyboard shortcuts use Alt chords because X already claims the bare letters.

## 10. Testing

42 automated tests: classifier and rage-scorer ranking gates on held-out data, leave-one-out and bounded-weight learning properties, provider request/response parsing, router decisions, and the **service worker itself** running in a Node `vm` sandbox with a fake `chrome.*` and `fetch` (tier routing, caching, rage-vote overrides, provider fallbacks). A local harness page runs the real content script against a fake timeline, and I verified behaviour by hand on live x.com.

## 11. What I'd do differently / what's next

- **Collect real labels first.** Everything above is measured on synthetic data; a week of real votes would have been a better foundation than my own corpora.
- **Spend tracking** only covers one provider; the others report cost 0.
- **It doesn't change X's algorithm, and I say so.** It changes what costs *you* attention. Fold decisions aren't signals X receives (though X may still observe how you scroll). The honest metric is estimated reading time avoided (words at ~238 wpm plus ~2 s per folded post), labelled as an estimate.
- **Topics are keyword-based.** That's fast and explainable but crude: "model" is both ML and a fashion model. The next step is letting the LLM return topic tags for the uncertain posts and learning keyword weights from reactions.
- **A positive side.** "Boost what I like" (highlighting, a digest of what scrolled past) is a natural extension, but X's virtualised timeline makes reordering fragile, so I'd highlight and summarise, not reshuffle.

---

*Code: [repo link] · Product page: [site link] · Questions: [email]*
