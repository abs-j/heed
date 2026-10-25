# Chrome Web Store listing (sample)

Copy each block into the matching field in the Developer Dashboard.

## Store listing tab

**Name** (max 75): `Slop Detector for X`
> If you'd rather avoid the letter X in the title, use `Slop Detector: a feed filter`.

**Summary / short description** (max 132 characters): 
```
Quietly folds low-effort slop and rage bait on X. Works on your device, learns your taste. News and fresh opinions stay.
```
(121 characters)

**Category:** Productivity (alternative: Social & Communication)

**Language:** English

**Detailed description:**
```
Slop Detector reads each post on X as you scroll and folds the ones that aren't worth your time into a single quiet line, so you stay in control of your timeline instead of the algorithm.

WHAT IT DOES
• Folds slop: engagement bait ("like and follow for more"), stock hooks, recycled viral clips, generic reply filler, motivational filler.
• Folds rage bait: posts that exist only to provoke anger and add nothing new. News, announcements and fresh, reasoned opinions are NOT touched, even when they are angry or political.
• Leaves everything else completely alone.
• Hover a folded post to peek; hover any post to see its score, mark it as slop or rage bait, or undo.
• Click a score for a plain-English "why".
• Learns your taste on your device from the posts you mark, and shows how much better it agrees with you over time.

YOU STAY IN CONTROL
• Fold, hide, dim or just show scores.
• Strictness slider with a live preview.
• Always show or always fold specific accounts.
• Your own plain-language rules (for example "crypto shilling").
• Keyboard shortcuts: Alt+S slop, Alt+N not slop, Alt+R rage bait, Alt+U undo, Alt+P peek, Alt+W why.

PRIVATE BY DEFAULT
Works with no account and no key. Most posts are judged on your device and never leave your browser. Optionally add your own AI key (Anthropic, OpenAI-compatible, OpenRouter or a local model such as Ollama) for sharper judgement on borderline posts; only those posts' text is sent, to the provider you chose.

IMPORTANT
Scores are subjective quality judgements, not proof that a post was written by an AI. Not affiliated with X Corp.
```

**Screenshots** (1280×800, up to 5):
1. Timeline with one folded slop row and one folded RAGE row; a news post open between them. Caption: "Slop and rage bait fold. News stays."
2. The hover bar with **Mark slop** / **Rage bait** on a normal post. Caption: "Missed one? Teach it."
3. The "why" popover with the gauge. Caption: "See exactly why."
4. The toolbar popup dashboard. Caption: "Your feed, your threshold."
5. Settings → Insights → *Learning from your votes*. Caption: "Gets better at you."

**Small promo tile** (440×280): logo on dark, headline "Take back your timeline."

## Privacy practices tab

**Single purpose:**
> Detect and visually fold low-quality ("slop") and rage-bait posts on x.com, according to the user's settings.

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings, votes, cached scores and optional API key locally in the browser. |
| Content script on `x.com` / `twitter.com` | Reads the text of posts the user is viewing in order to score them, and draws the fold/score interface on them. |
| Host permission `openrouter.ai`, `api.anthropic.com`, `api.openai.com` | Only if the user enters their own key: sends the text of uncertain posts to the chosen AI provider for scoring. |
| Host permission `localhost`, `127.0.0.1` | Lets the user point the extension at a local model server (e.g. Ollama) so nothing leaves their computer. |
| Optional host permissions | Requested per site, at the moment the user enters a custom AI endpoint. |

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
- [ ] Zip contains only runtime files (manifest, `lib.js`, `content.js`, `background.js`, CSS/HTML/JS pages, `icons/`).
- [ ] Hover-card profile lookups default to **off** in the store build (it simulates mouse events on X's page; the riskiest feature for review).
- [ ] Consider narrowing `optional_host_permissions` (`https://*/*`) to a fixed provider list for the store build, to avoid a slow in-depth review.
- [ ] Screenshots show no real user's private information.
- [ ] Description makes no claim to detect AI-written content.
