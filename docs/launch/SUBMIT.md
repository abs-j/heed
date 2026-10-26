# Submitting Heed to the Chrome Web Store: step by step

Everything is prepared. The dashboard can't be automated, so these ~15 minutes are manual. Open <https://chrome.google.com/webstore/devconsole> signed in to the Google account you registered with.

## Files you need (already built)
| What | Where |
|---|---|
| Extension zip | `dist/heed-2.5.0.zip` (`npm run pack` rebuilds it) |
| 5 screenshots, 1280×800 | `dist/store/heed-screenshot-1.png` … `-5.png` |
| Small promo tile, 440×280 | `dist/store/heed-promo-440x280.png` |
| Store icon, 128×128 | `icons/128.png` |
| All listing text | `docs/launch/store-listing.md` |
| Privacy policy | `PRIVACY.md` (its URL is in the next section) |

## Before you start: two things only you can do
1. **Publish the privacy policy (one-time, GitHub).** It's `PRIVACY.md` at the repo root; the contact line points to the repo's Issues page, so no personal email is published. Then, from the project folder:
   1. On GitHub, open the repo's **Settings → General**, rename it from `x-slop-detector` to `heed`, and under **Danger Zone** change visibility to **Public**.
   2. Point your local copy at the new name, then push:
      - `git remote set-url origin https://github.com/abs-j/heed.git`
      - `git push -u origin main`
   3. Check that this opens when you're **signed out** (private window): **https://github.com/abs-j/heed/blob/main/PRIVACY.md** — this is your privacy policy URL.
2. **Trademark check** for "Heed" (USPTO, IP Australia) if you haven't already.

## In the dashboard
1. **Add new item** → upload `dist/heed-2.5.0.zip`.
2. **Store listing tab**
   - Description: paste the *Detailed description* block from `store-listing.md`.
   - Category: Productivity. Language: English.
   - Store icon: `icons/128.png`. Screenshots: upload the five PNGs in order. Small promo tile: the 440×280 PNG.
   - The name and 126-character summary come from `manifest.json` (**Heed** / "Decide what deserves your attention on X…"); check they show correctly.
3. **Privacy tab** (all text is in `store-listing.md`)
   - Single purpose statement.
   - Permission justifications: `storage`; content script on x.com / twitter.com; host permissions for `openrouter.ai`, `api.anthropic.com`, `api.openai.com`, `localhost`, `127.0.0.1`.
   - Remote code: **No**.
   - Data usage: tick **Website content** and **Authentication information** only (see the notes in `store-listing.md`); tick the three certifications only if they're true for you.
   - Privacy policy URL: `https://github.com/abs-j/heed/blob/main/PRIVACY.md`
4. **Distribution tab**: visibility **Unlisted** for the first submission (shareable link only), all regions.
   - If the dashboard asks whether you're a *trader* (EU consumer law): a free, non-commercial hobby project is usually "non-trader". Check the wording and decide yourself.
5. **Submit for review.** Review typically takes days; it can take longer. After approval and a quick test by a couple of people, switch visibility to **Public**.

## After approval
- Test install from the store link, and check the version shows 2.5.0.
- Post per `docs/launch/README.md`.
- For each later update: bump `version` in `manifest.json` and `package.json`, run `npm run pack`, upload the new zip, resubmit.

## If review comes back with a rejection
The most likely reasons: a permission that isn't justified, a data-use answer that doesn't match what the extension does, or the privacy policy URL not loading. All three are covered above; reply to the review email with what you changed.
