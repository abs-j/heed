# Chrome Web Store listing (sample)

Copy each block into the matching field in the Developer Dashboard.

## Store listing tab

**Name** (max 75): `Heed` (the store takes the name from `manifest.json`; keep it to one word)
> Trademark check for "Heed" (USPTO, IP Australia) is still on the to-do list.

**Summary / short description** (max 132 characters): 
```
Decide what deserves your attention on X. 👍/👎 teaches it; slop, rage bait and topics you want less of fold into one line.
```
(125 characters)

**Category:** Productivity (alternative: Social & Communication)

**Language:** English

**Detailed description:**
```
Decide what deserves your attention on X. Tell it with a 👍 or 👎 what you liked and didn't, and posts you'd rather not spend attention on fold into a single quiet line, still one hover away.

WHAT IT DOES
• One signal from you: 👍 or 👎 on any post. No reasons to pick; it works out whether the cause was slop, rage bait, or just not your thing.
• Folds slop: engagement bait, stock hooks, vagueposting, recycled clips, generic reply filler.
• Folds rage bait: posts built only to provoke anger that add nothing new. News, announcements and fresh, reasoned opinions are NOT folded for being angry or political.
• Learns topics you want less of: 👎 a couple of news posts and news starts folding; 👍 a hidden one later and it comes back. Newer reactions count most, and Settings shows (and lets you override) what it learned.
• Leaves everything else alone. Hover a folded post to peek; click a score for a plain-English "why".
• Shows an estimate of the reading time you didn't spend.

YOU STAY IN CONTROL
• Fold, hide, dim or just show scores.
• Strictness slider with a live preview.
• Always show or always fold specific accounts; plain-language rules of your own.
• Keyboard: Alt+L 👍, Alt+D 👎, Alt+U undo, Alt+P peek, Alt+W why.

PRIVATE BY DEFAULT
Works with no account and no key. Most posts are judged on your device and never leave your browser; what it learns from you stays in your browser too. Optionally add your own AI key (Anthropic, OpenAI-compatible, OpenRouter or a local model such as Ollama) for sharper judgement on borderline posts; only those posts' text is sent, to the provider you chose.

IMPORTANT
It doesn't change what X shows you, only what takes your attention on your screen. Scores are subjective quality judgements, not proof a post was written by an AI. Not affiliated with X Corp.
```

**Screenshots** (1280×800, up to 5):
1. Timeline with a folded SLOP row, a folded RAGE row and a LESS row ("seeing less news"); a reasoned post open between them. Caption: "Decide what deserves your attention."
2. The hover bar with 👍 / 👎 on a normal post. Caption: "One tap teaches it."
3. The "why" popover with the gauge. Caption: "See exactly why."
4. The toolbar popup dashboard. Caption: "Your feed, your threshold."
5. Settings → Topics with the learned preference bars. Caption: "Change your mind any time."

**Small promo tile** (440×280): logo on dark, headline "Decide what deserves your attention."

## Privacy practices tab

**Single purpose:**
> Fold posts on x.com that the user doesn't want to spend attention on (low-quality, rage bait, or topics they've chosen to see less of), according to the user's own reactions and settings.

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings, reactions (👍/👎), cached scores and optional API key locally in the browser. |
| Content script on `x.com` / `twitter.com` | Reads the text of posts the user is viewing in order to score them, and draws the fold/score interface on them. |
| Host permission `openrouter.ai`, `api.anthropic.com`, `api.openai.com` | Only if the user enters their own key: sends the text of uncertain posts to the chosen AI provider for scoring. |
| Host permission `localhost`, `127.0.0.1` | Lets the user point the extension at a local model server (e.g. Ollama) so nothing leaves their computer. |

**Remote code:** No. All code is packaged with the extension.

**Data usage disclosures** (tick only what applies):
- *Website content* (text of posts): handled; sent to a third party (the user's chosen AI provider) **only if the user supplies a key**, and only for posts the on-device check is unsure about.
- *Authentication information* (API key the user types in): stored locally, only sent to that provider.
- Not collected: personally identifiable information, health, financial, location, web history, user activity beyond local settings.

**Certifications:** I do not sell or transfer user data to third parties outside the approved use cases; I do not use or transfer user data for purposes unrelated to the extension's single purpose; I do not use or transfer user data to determine creditworthiness or for lending.

**Privacy policy URL:** `https://abhayjhade.com/slop-detector/privacy` (publish [privacy-policy.md](privacy-policy.md) there)

## Distribution tab
- Visibility: **Unlisted** for the first submission (share by link), then **Public** once it has been approved and tried by a few people.
- Regions: all.

## Pre-submission checklist
- [x] Zip contains only runtime files: `npm run pack` builds `dist/heed-<version>.zip` (62 KB) and checks version, description length and permissions.
- [x] Hover-card profile lookups default to **off** (it simulates mouse events on X's page; the riskiest feature for review).
- [x] No broad or optional host permissions: only x.com/twitter.com, three AI providers and localhost; custom endpoints are limited to those hosts.
- [ ] Screenshots show no real user's private information.
- [ ] Description makes no claim to detect AI-written content.
