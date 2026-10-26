# Heed: Privacy Policy

*Last updated: [date]. Contact: [email]*

Heed is a browser extension that scores posts on x.com and folds low-quality ones. This policy says exactly what it does with data.

## What stays on your device
Everything below is stored in your browser's extension storage and never sent to me:

- Your settings and your votes (Slop / Not slop / Rage bait).
- Cached scores for posts you've seen, and simple usage counts (for example "posts scanned today").
- A small model that learns your preferences from your votes. It is trained and used entirely on your device.
- Your optional AI provider key.

I (the developer) run no servers for this extension. I do not receive your data, I have no analytics or tracking, and there is no account.

## What can leave your device
By default, nothing. If **you** choose to add an AI provider (Anthropic, an OpenAI-compatible service, OpenRouter, or a local server), then for posts that the on-device check can't settle, the extension sends to **that provider**:

- the text of the post, the author's display name and handle, and whether the account has a verified badge;
- when present: a description of attached media, the post being replied to or quoted, a few earlier posts from the same author that you scrolled past, and a small number of your past votes as examples;
- if you turn on creator profiles: the author's bio and follower text shown on X.

That data goes directly from your browser to the provider you chose, under **their** privacy policy. If you pick a local server on your own computer, it doesn't leave your machine. In *Local only* mode nothing is ever sent.

## What I don't do
No selling or sharing of data; no advertising; no profiling; no use of your data for anything other than scoring the posts you're viewing.

## Your control
- Export your votes and settings, or erase everything, from **Settings → Data**.
- Remove your AI key at any time in **Settings → Detection**.
- Uninstalling the extension deletes everything it stored.

## Not affiliated
Heed is an independent project and is not affiliated with or endorsed by X Corp. "X" is a trademark of its owner.

## Changes
If this policy changes in a way that affects data, I'll update the date above and note it in the extension's release notes.
