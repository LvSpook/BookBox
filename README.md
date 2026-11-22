# Bookbox

A bookmark toolbox for Chrome, Edge, and Brave. It opens on your library instead
of an empty search box, searches inside saved pages, and sorts, tags, and cleans
up without sending your data anywhere.

## What it does

- **Browse first.** Search titles, addresses, tags, notes, and page text in one
  box. Fuzzy matching, filters, operators (`tag:`, `site:`, `is:unread`), saved
  collections, and a command palette.
- **Sort with proof.** Smart Local reads real page content and proposes a
  two-level folder plan. You see every move before it happens and can untick
  anything. Rules always win over both local and AI sorting.
- **Clean up safely.** Duplicates, dead links, redirects, and stale saves each
  have their own section. Everything goes to a 30-day trash, an undo toast
  appears, and a backup is saved before every change.
- **Tag and annotate.** Nested tags (`frontend/css`), notes, a reader view with a
  short summary, and read-later marks.
- **Optional AI.** Paste a free Gemini, Groq, or OpenRouter key to unlock ten
  extras: AI sorting, answers with quoted passages and follow-ups, per-page
  summaries, tag suggestions from your own vocabulary, duplicate-tag cleanup with
  a diff, a near-duplicate tie-breaker, folder renaming, a plain-language reason
  for stale saves, tag-and-file on save, and turning a sentence into a rule.

  AI controls stay hidden until a key is set, so nothing sits there as a dead
  button. With no key, local sorting, local summaries, and local answers all
  still work. Meaning search needs an embedding model, so it only appears on
  Gemini.

  Every AI action is optional per feature, and tag-and-file can be switched off
  in Settings.

## Install (unpacked)

Bookbox is not on the Chrome Web Store yet, so you load it directly from the
source. You only need to do this once per browser profile.

### Option A — clone with Git (needed for updates)

```bash
git clone https://github.com/LvSpook/bookbox.git
```

Then:

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the **`public`** folder inside the cloned repo — not the repo root.

To update later, run `git pull` inside the repo and click the circular
**Reload** arrow on the Bookbox card.

### Option B — download a ZIP (no Git)

1. On the GitHub repo page, click **Code → Download ZIP**.
2. Unzip it. Keep the folder somewhere permanent — if you delete it, the
   extension stops loading.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and select the **`public`** folder.

Downloading a new ZIP replaces the old one: unzip over the same location
(or unload the old copy first) so you don't end up with two Bookbox cards.

### After installing

Pin the Bookbox icon from the puzzle-piece menu. On first run a short tour
opens; you can replay it from Settings → **Show me around**. Your bookmarks are
read from the browser itself, so the library fills in immediately.

### Note on the demo page

Opening `public/index.html` directly in a browser runs the interactive demo with
23 sample bookmarks. It is a preview only — the real toolbar popup and settings
page only work once the extension is loaded.

## Project layout

Everything that ships lives in `public/`. The page you load into the browser is
`public/`, so the repo layout mirrors the extension exactly.

| File | Purpose |
| --- | --- |
| `index.html` | Interactive preview page (demo bookmarks) |
| `popup.html` | Toolbar popup |
| `options.html` | Full-page settings tab |
| `app.js` | UI state and wiring |
| `ui.js` | Shared markup: tabs, panels, dialogs |
| `organizer.js` | Core engine: duplicates, sorting, search, link checks |
| `engine-extra.js` | Rules, confidence, similarity, collections, export parsers |
| `search-plus.js` | Fuzzy search, operators, match context, grouping |
| `ai.js` | AI provider client, embeddings, token estimate, local fallbacks |
| `ai-features.js` | Pure helpers for the AI features: prompts, parsers, cosine ranking |
| `data-health.js` | Leftover (orphan) detection and removal |
| `storage.js` | Storage keys, quota helpers, sync helpers |
| `ui-kit.js` | Modal, toast, focus trap, formatting helpers |
| `background.js` | Service worker: context menus, omnibox, scheduled checks |

## Data and privacy

Everything stays in your browser. Cross-device sync (optional) carries only
settings and tag names. Your API key never leaves the device. Adding a key sends
the bookmarks you sort or ask about to that provider; nothing else leaves the
browser. See `privacy.html` for the full policy.

## Tests

Open Settings → Diagnostics → **Run self-check**. It exercises the engine
helpers (URL normalisation, duplicates, HTML import, CSV escaping, leftover
detection) and the AI helpers (vector similarity ranking, tag-merge planning,
citation picking, rule parsing, duplicate-pair selection), then reports storage
health.

## Store submission

See `STORE.md` for permission justifications, data-disclosure answers, and the
review checklist.
