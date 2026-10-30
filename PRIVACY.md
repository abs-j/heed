# Heed: Privacy Policy

*Last updated: 26 October 2026 · Applies to Heed version 2.5.0 and later*

Heed is a browser extension that scores posts on x.com and instagram.com and folds the ones you'd rather not spend attention on. This policy says exactly what it does with data.

**Contact:** open an issue at <https://github.com/abs-j/heed/issues>.

## What stays on your device
Everything below is stored in your browser's extension storage and is never sent to me:

- Your settings.
- Your reactions (👍 / 👎), your topic preferences, and any account rules you set (always show / always fold).
- Cached scores for posts you've seen, and simple usage counts (for example "posts scanned today") used for the dashboard.
- A small model that learns your preferences from your reactions. It is trained and used entirely on your device.
- Your optional AI provider key.

I (the developer) run no servers for this extension. I do not receive your data, there is no analytics or tracking, and there is no account.

## What can leave your device
By default, nothing. If **you** choose to add an AI provider (Anthropic, an OpenAI-compatible service, OpenRouter, or a model server on your own computer), then for posts that the on-device check can't settle, the extension sends to **that provider**:

- the text of the post, the author's display name and handle, and whether the account has a verified badge, plus how old the post is;
- when present: a description of attached media (on Instagram, the photo's own description text), the post being replied to or quoted, a few earlier posts from the same author that you scrolled past, and a small number of your past reactions as examples;
- only if you turn on "Let the AI model look at the picture" (off by default) and the post is uncertain: up to two links to the post's image, which Anthropic or an OpenAI-compatible provider then fetches. Never sent to Jev or a local server.
- only if you turn on *Check creator profiles* (off by default): the author's bio and follower text shown on X.

That data goes directly from your browser to the provider you chose, under **their** privacy policy and terms. If you pick a model server on your own computer, it doesn't leave your machine. In *Local only* mode nothing is ever sent.

Heed only contacts: x.com / twitter.com / instagram.com (the pages it runs on), and, if you've added a key, openrouter.ai, api.anthropic.com or api.openai.com, or localhost. It does not contact any other site.

## What I don't do
No selling or sharing of data. No advertising. No profiling. No use of your data for anything other than scoring the posts you're viewing and learning your preferences on your device.

## Your control
- Export your reactions and settings, or erase everything, from **Settings → Data**.
- Remove your AI key at any time in **Settings → Detection**.
- Uninstalling the extension deletes everything it stored.

## Not affiliated
Heed is an independent project and is not affiliated with or endorsed by X Corp. "X" is a trademark of its owner.

## Changes
If this policy changes in a way that affects data, I'll update the date above and note it in the release notes.
