# Heed: overview

*Facts below match the code as of v2.5.0.*

## What it is
**Heed is a Chrome extension for X (x.com) that lets you decide what deserves your attention.** You give every post a 👍 or 👎. Posts you'd rather not spend attention on fold into a single quiet line (still one hover away), so they cost you a glance instead of a read.

> **Tagline:** Decide what deserves your heed.
> **One-liner:** A personal attention filter for X that learns from your 👍 and 👎.

## What it does
- **Folds** posts into a one-line row with a verdict, the main reason, and a *Peek* control. Hover (or press Enter) to open; it closes when you leave.
- **Three verdicts**
  - **SLOP**: low-effort, engagement farming, vagueposting, recycled clips, generic reply filler, motivational filler.
  - **RAGE**: built only to provoke, with nothing new in it. News, announcements and fresh, reasoned opinions are *not* flagged for being angry or political.
  - **LESS**: posts you 👎'd, posts that closely resemble ones you did, and whole **topics** you've been turning down ("You've been seeing less sports").
- **Learns from one signal.** No reasons to choose: a 👎 teaches the right detector automatically, and a 👍 on a hidden post unfolds it and brings its topic back. Newer reactions count most.
- **Leaves everything else alone.** Fine posts are untouched; borderline ones get a thin amber edge.

## Features

| Area | What you get |
|---|---|
| **Reactions** | 👍 / 👎 dock on hover; Undo; keyboard Alt+L / Alt+D / Alt+U |
| **Topics** | 10 on-device topics (news, politics, sports, crypto, tech & AI, finance, entertainment, culture war, health, science); learned preference per topic; Less / Auto / More override in Settings |
| **Live updates** | After a reaction, other posts on screen are re-judged, so a topic can fold or return without a refresh |
| **Explainability** | Click the score for a "why" popover: gauge against your threshold, topic, signals, source (on-device / AI / your vote) |
| **Controls** | Modes: fold, hide, dim, chip, scores-only. Rage bait: fold / hide / off. Sensitivity slider with a live preview of how much of your recent feed it would fold. Always-show / always-fold accounts |
| **Dashboard** | Toolbar popup: posts scanned and folded today, a 7-day sparkline, estimated reading time saved, quick settings |
| **Settings app** | General, Detection, Filters & creators (topics, rules), Review & votes, Insights (stats, threshold tuning, learning agreement), Data (export/import/reset) |
| **Your own rules** | Plain-language topics ("crypto shilling"), checked in the AI request (needs an AI key) |
| **Accessibility** | Keyboard operable, focus management, labelled controls, ≥ 4.5:1 contrast on light and dark X themes, reduced-motion respected |

## How it works (plain version)
Heed reads each post as it scrolls past and scores it **on your device**. Clear-cut posts are decided right there. Only when it's unsure, and only if you've added your own AI key, is the post's text sent to the AI provider you chose (Claude, an OpenAI-compatible service, OpenRouter's Jev model, or a local model such as Ollama) for a second opinion. Everything it learns from your reactions stays in your browser.

## Privacy
- Works with **no account and no key**.
- Most posts never leave your browser; in *Local only* mode none do.
- No analytics, no tracking, nothing sold. Keys and reactions stay in browser storage; export or erase them in Settings → Data.

## What Heed is **not**
- **Not an AI detector.** It scores how much attention a post deserves, not who wrote it; detectors for short posts aren't reliable.
- **Doesn't change X's algorithm.** It changes what costs *you* attention on your screen.
- **Not a blocklist.** Nothing is deleted; folded posts are one hover away.

## Honest limits
- X only, Chrome desktop; not yet in the Chrome Web Store (loaded unpacked).
- Topic tagging is keyword-based and will miss and mislabel some posts.
- Accuracy numbers so far come from synthetic test sets; the real measure is the agreement score in Settings → Insights after you've reacted to a few dozen posts.
- X's layout changes can break things until an update.
- The daily spend cap only tracks one provider's costs.

## Who it's for
People who still want X but are tired of spending attention on engagement bait, vagueposting, rage bait and topics they've stopped caring about, and who'd rather teach a tool than keep curating by hand.

## Pitches

**10 seconds:** Heed folds the posts you don't want on X into one quiet line. Thumbs-up or thumbs-down and it learns your taste.

**30 seconds:** Your X feed spends your attention on posts that give nothing back: engagement bait, vague teasers, posts built to make you furious, topics you're tired of. Heed scores each post on your device and folds the ones you'd skip into a single line you can still peek at. You teach it with a 👍 or 👎: dislike a couple of news posts and news folds; like a hidden one later and it comes back. It doesn't change what X shows you, only what costs you attention.

## What's next
Rename in the code and docs; Chrome Web Store submission (unlisted first); AI-assisted topic tagging for uncertain posts; a "highlight what I like" side; a Firefox build.
