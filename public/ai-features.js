// Pure helpers for the AI features: prompt building, response parsing, and the
// maths behind semantic search and tag consolidation. No DOM, no network, so
// every piece here can be unit-checked from Diagnostics.

/* ---------- vectors ---------- */

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Ranks embedded bookmarks against a query vector.
export function rankByVector(queryVector, items, { minScore = 0.35, limit = 20 } = {}) {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(queryVector, item.vector) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Text used to embed a bookmark. Title twice because it carries the gist.
export function embeddingText(bookmark) {
  const text = String(bookmark.content?.text || bookmark.indexText || '').slice(0, 1200);
  return `${bookmark.title || ''}\n${bookmark.title || ''}\n${bookmark.folderName || ''}\n${text}`.trim();
}

/* ---------- prompts ---------- */

export const PROMPTS = {
  summary:
    'Summarise this saved web page in one or two plain sentences for the person who bookmarked it. Say what it teaches or offers, and any specific technique, API, or version it covers. No preamble, no "this article".',
  tags:
    'You suggest tags for bookmarks. Choose ONLY from the allowed tag list, at most 3 per bookmark, and prefer the most specific tag. Reply with JSON: {"assignments":{"<bookmarkId>":["tag1","tag2"]}}. Omit bookmarks that fit none.',
  consolidate:
    'You clean up a tag list. Group tags that mean the same thing, including casing, plurals, and abbreviations. Pick the clearest existing tag as the survivor of each group. Reply with JSON: {"merges":[{"from":["js","JS"],"to":"javascript","reason":"same meaning"}]}. Only include real duplicates.',
  duplicatePair:
    'You judge whether two saved bookmarks are the same page or two distinct versions. Reply with JSON: {"verdict":"same|different","reason":"<one short sentence>"}. Reply "same" only when the reader gains nothing from keeping both.',
  folderName:
    'You name a folder. Given the bookmarks inside it, propose one clear two-level folder name in "Parent / Subfolder" form. Reply with JSON: {"name":"Parent / Subfolder","reason":"<one short sentence>"}.',
  stale:
    'You explain why saved bookmarks may be safe to archive. These pages were saved but rarely or never revisited. Reply with JSON: {"verdict":"archive|keep","reason":"<one short sentence naming the pattern>"}. Be concrete about what the pages are.',
  save:
    'You file a newly saved page. Given its title, address, and existing tags and folders, propose a tag from the allowed list and a folder. Reply with JSON: {"tag":"<tag or empty>","folder":"Parent / Subfolder"}.',
  rule:
    'You turn a plain sentence into one bookmark rule. The rule has a field of "domain", "title", or "url", a match string, and a folder. Reply with JSON: {"field":"domain|title|url","match":"<string>","folder":"Parent / Subfolder"}. Use "domain" when the sentence names a site.'
};

/* ---------- parsers ---------- */

// Keeps only ids that exist and tags that are in the allowed vocabulary.
export function sanitizeTagAssignments(raw, bookmarkIds, allowedTags) {
  const allowed = new Map(allowedTags.map((t) => [t.toLowerCase(), t]));
  const validIds = new Set(bookmarkIds);
  const out = {};
  const assignments = raw?.assignments || {};
  for (const [id, list] of Object.entries(assignments)) {
    if (!validIds.has(id)) continue;
    const picked = [];
    for (const tag of Array.isArray(list) ? list : []) {
      const canonical = allowed.get(String(tag).toLowerCase().trim());
      if (canonical && !picked.includes(canonical)) picked.push(canonical);
    }
    if (picked.length) out[id] = picked.slice(0, 3);
  }
  return out;
}

// Turns the model's merge list into a safe plan: no self-merges, no invented
// tags, and every "from" tag must exist.
export function buildMergePlan(raw, existingTags) {
  const lower = new Map(existingTags.map((t) => [t.toLowerCase(), t]));
  const plan = [];
  const claimed = new Set();
  for (const row of raw?.merges || []) {
    const target = lower.get(String(row?.to || '').toLowerCase().trim());
    if (!target) continue;
    const sources = (Array.isArray(row?.from) ? row.from : [])
      .map((t) => lower.get(String(t).toLowerCase().trim()))
      .filter((t) => t && t !== target && !claimed.has(t));
    if (sources.length === 0) continue;
    // A tag already merged away cannot be merged again.
    for (const source of sources) claimed.add(source);
    plan.push({ from: sources, to: target, reason: String(row?.reason || '').slice(0, 120) });
  }
  return plan;
}

// Applies a merge plan to a tag map, keeping families intact.
export function applyMergePlan(tagMap, plan) {
  const lookup = new Map();
  for (const row of plan) for (const source of row.from) lookup.set(source, row.to);

  const rename = (tag) => {
    const head = tag.split('/')[0];
    if (lookup.has(tag)) return lookup.get(tag);
    if (lookup.has(head)) return lookup.get(head) + tag.slice(head.length);
    return tag;
  };

  const next = {};
  for (const [key, tags] of Object.entries(tagMap || {})) {
    const mapped = [...new Set((tags || []).map(rename))];
    if (mapped.length) next[key] = mapped;
  }
  return next;
}

// The vocabulary a tag suggestion may draw from, parents included.
export function tagVocabulary(tagMap) {
  const set = new Set();
  for (const tags of Object.values(tagMap || {})) {
    for (const tag of tags || []) {
      set.add(tag);
      const parts = tag.split('/');
      for (let i = 1; i < parts.length; i += 1) set.add(parts.slice(0, i).join('/'));
    }
  }
  return [...set].sort();
}

// Sentences worth quoting as citations: those sharing words with the query.
export function pickCitation(text, query, { maxChars = 240 } = {}) {
  const words = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 24);
  if (sentences.length === 0) return '';
  const scored = sentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    const hits = words.filter((w) => lower.includes(w)).length;
    return { sentence, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const best = scored[0].hits > 0 ? scored[0].sentence : sentences[0];
  return best.length > maxChars ? `${best.slice(0, maxChars).trim()}…` : best;
}

// Turns a parsed rule reply into a rule the app can store.
export function normalizeRuleDraft(raw, id) {
  const field = ['domain', 'title', 'url'].includes(String(raw?.field)) ? String(raw.field) : '';
  const match = String(raw?.match || '').trim();
  const folder = String(raw?.folder || '').trim();
  if (!field || !match || !folder) return null;
  // Folders must be a clean two-level path.
  if (folder.split(' / ').length > 2) return null;
  return { id: id || `rule-${Date.now()}`, field, match, folder, enabled: true };
}

// Picks the pairs a model should judge: near-duplicates whose local reason is
// not already decisive.
export function uncertainPairs(nearGroups, { maxPairs = 6 } = {}) {
  const pairs = [];
  for (const group of nearGroups || []) {
    const head = group.nearBookmarks?.[0] || group.keep;
    for (const match of group.matches || []) {
      if (!head) continue;
      pairs.push({ keep: head, other: match.bookmark, localReason: match.reason });
      if (pairs.length >= maxPairs) return pairs;
    }
  }
  return pairs;
}

// Summarises what a folder contains, so the model can name it.
export function describeFolder(bookmarks, { maxItems = 8 } = {}) {
  return bookmarks
    .slice(0, maxItems)
    .map((bm) => `- ${bm.title || 'Untitled'} (${bm.folderName || 'no folder'})`)
    .join('\n');
}

// Compact listing of stale rows for the bulk explanation request.
export function describeStale(items, { maxItems = 12 } = {}) {
  return items
    .slice(0, maxItems)
    .map((row) => {
      const bm = row.bookmark || row;
      const visited = row.lastVisit ? new Date(row.lastVisit).toISOString().slice(0, 10) : 'never';
      return `- ${bm.title || 'Untitled'} [${bm.folderName || 'no folder'}] last opened: ${visited}`;
    })
    .join('\n');
}
