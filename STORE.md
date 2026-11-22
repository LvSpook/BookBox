# Bookbox — store submission notes

Materials for listing Bookbox on the Chrome Web Store, Microsoft Edge Add-ons,
and Firefox's AMO (Firefox is a future port; see the end).

## Short description (132 characters max)

Your bookmarks, sorted. Search inside pages, tag, dedupe, and clean up — all local and free.

## Full description

Bookbox is a bookmark toolbox for people whose saved links have piled up.

It opens on your library instead of an empty search box. Type anything and it
looks in titles, addresses, tags, notes, and the text of saved pages, so a search
for "css grid" finds the five articles you saved months ago.

**Sort with proof, not guesswork.** Smart Local reads real page content and
proposes a two-level folder plan. You see every move in a preview and can untick
anything you disagree with. No account, no API key, no cost. If you want, you can
add a free Gemini, Groq, or OpenRouter key for AI sorting instead — or ask your
library a question in plain words.

**Rules always win.** A rule like "site is github.com → Development / Repos" files
those bookmarks the same way every time, no AI involved.

**Cleanup that never surprises you.** Duplicates, dead links, and pages you never
visit each get their own section. Nothing is deleted instantly: everything goes to
a 30-day trash, an undo toast appears, and a backup is saved before every change.

**Find the right copy.** Merging duplicates shows a diff first and carries over
tags and notes. Duplicate detection ignores `www`, `http` vs `https`, and tracking
parameters, so the same page saved twice is caught.

**Organise as you go.** Tags nest (`frontend/css`), drag one onto another to
restructure, and matching a parent tag also matches its children. Notes, a reader
view with a short summary, and read-later marks sit on each bookmark.

**Nothing leaves your computer** unless you turn it on. No analytics, no telemetry,
no ads, no account.

### Highlights

- Browse-first layout with fuzzy search and operators (`tag:`, `site:`, `is:unread`)
- Saved collections that update themselves
- Confidence score on every folder suggestion, with the reasons shown
- Dead-link checks aware of bot walls (403/429 pages are kept, not deleted)
- Redirect repair for pages that moved
- Optional scheduled link checks
- Import from a browser bookmarks HTML export; export to HTML, JSON, Markdown, CSV
- Cross-device sync for settings and tags (never your key or page text)
- Dark theme by default, with light and system options
- Keyboard shortcuts and a command palette (Ctrl/Cmd+K)

## Permission justifications

| Permission | Why Bookbox needs it |
| --- | --- |
| `bookmarks` | Read, move, tag, and clean up the user's bookmarks. This is the core function. |
| `storage` | Save tags, notes, rules, settings, backups, and the trash record. |
| `unlimitedStorage` | Hold the page-text search index, which can exceed the default 5 MB. |
| `history` | Show which saved pages the user actually visits, used to flag stale saves. |
| `tabs` | Open a bookmark and save the current page when asked. |
| `contextMenus` | Add the right-click "Save this page to Bookbox" action. |
| `alarms` | Run the optional scheduled dead-link check. |
| Host permission (all sites) | Fetch page text the user asks to index, test whether saved links still resolve, and call the AI provider the user configured with their own key. |

No permission is used for advertising, analytics, or tracking.

### AI features

AI is off until the user pastes their own free key. When they do, only the
bookmarks involved in the action they start are sent to that provider: the batch
being sorted, the pages behind an answer, or the one pair being compared. The key
is stored locally and never synced.

## Data disclosure answers

- Does the extension collect or use personally identifiable information? **No.**
- Does it collect health, financial, authentication, personal communications,
  location, web history, or user activity data? **No.** Web history is read on the
  device only and never transmitted.
- Does it sell or transfer data to third parties? **No.**
- Does it use data for purposes unrelated to its single purpose? **No.**
- Does it determine creditworthiness or lend money? **No.**

If asked about AI features: bookmark content is sent to the AI provider **only**
when the user pastes their own API key and chooses AI sorting or Ask your library.
The data goes directly from the browser to that provider under the user's own
account.

## Single purpose statement

Bookbox organises bookmarks: it reads the user's bookmarks and, when asked,
sorts them, tags them, removes duplicates and dead links, and helps find them again.

## Privacy policy

Host `privacy.html` (in this folder) at a public URL and paste that address in the
listing's privacy policy field. The same policy is readable inside the extension
under Settings → Privacy.

## Assets still needed

- Store icon 128×128 (present in `icons/`)
- Screenshots at 1280×800 or 640×400, at least one
- Small promotional tile 440×280 (optional)

## Review checklist

- [ ] `manifest.json` version bumped
- [ ] Extension loads unpacked without console errors
- [ ] Every permission above still matches the code
- [ ] Privacy policy URL live
- [ ] At least one screenshot uploaded
- [ ] Description has no unverified performance claims

## Firefox (future)

A Firefox build needs `browser_specific_settings`, a settings page instead of
`options_ui` where required, and a check that `chrome.*` calls map to `browser.*`
promises. Bookbox is not ready for AMO submission yet.
