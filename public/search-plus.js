// Search upgrades layered on top of organizer.searchBookmarks.
// Kept separate so the core engine stays readable: fuzzy matching, query
// operators, match context, a blended "most useful" score, and result grouping.

/* ---------- Fuzzy matching ---------- */

// Damerau-Levenshtein for short strings: counts inserts, deletes, swaps, and
// substitutions. Transpositions matter — "reakt" for "react" is one swap, not
// two edits, and a skip-only matcher would miss it.
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, (_, i) => {
    const row = new Array(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) grid[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost
      );
      // Transposition: "ab" vs "ba".
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1);
      }
    }
  }
  return grid[rows - 1][cols - 1];
}

// Word-level fuzzy test. Longer words tolerate two edits, short ones only one,
// so "reakt" finds "react" without "cat" matching every "cart".
export function fuzzyIncludes(hay, needle) {
  if (!hay || !needle) return false;
  const target = needle.toLowerCase().trim();
  if (!target) return false;
  const text = hay.toLowerCase();
  if (text.includes(target)) return true;
  if (target.length < 4) return false;

  const allowed = target.length >= 7 ? 2 : 1;
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of words) {
    if (Math.abs(word.length - target.length) > allowed) continue;
    if (editDistance(word, target) <= allowed) return true;
  }
  return false;
}

/* ---------- Query operators ---------- */

const OPERATOR_ALIASES = {
  tag: 'tag',
  '#': 'tag',
  folder: 'folder',
  in: 'folder',
  site: 'site',
  domain: 'site',
  has: 'has',
  is: 'has',
  before: 'before',
  after: 'after',
  title: 'title',
  url: 'url',
  note: 'note'
};

// Splits "react tag:css site:github.com" into operators plus free text.
export function parseQuery(raw) {
  const text = String(raw || '');
  const operators = { tag: [], folder: [], site: [], has: [], before: null, after: null, title: [], url: [], note: [] };
  const words = [];

  // Quoted phrases stay together; everything else splits on whitespace.
  const parts = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  for (const part of parts) {
    const cleaned = part.replace(/^["']|["']$/g, '');
    const colon = cleaned.indexOf(':');
    if (colon > 0) {
      const rawKey = cleaned.slice(0, colon).toLowerCase();
      const key = OPERATOR_ALIASES[rawKey];
      const value = cleaned.slice(colon + 1).trim();
      if (key && value) {
        if (key === 'before' || key === 'after') {
          const day = parseDay(value);
          if (day) operators[key] = day;
        } else {
          operators[key].push(value.toLowerCase());
        }
        continue;
      }
    }
    if (cleaned) words.push(cleaned);
  }

  return { text: words.join(' '), words, operators };
}

// Accepts 2024, 2024-05, or 2024-05-17 and returns a timestamp.
function parseDay(value) {
  const v = value.trim();
  let m = /^(\d{4})$/.exec(v);
  if (m) return new Date(Number(m[1]), 0, 1).getTime();
  m = /^(\d{4})-(\d{2})$/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime();
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const loose = Date.parse(v);
  return Number.isFinite(loose) ? loose : null;
}

export function hasOperators(raw) {
  return Boolean(parseQuery(raw) && Object.keys(parseQuery(raw).operators).some((k) => {
    const v = parseQuery(raw).operators[k];
    return Array.isArray(v) ? v.length > 0 : v !== null;
  }));
}

// True when the bookmark satisfies every operator in the query.
export function passesOperators(bookmark, operators, { tagMap, notes, tagKey, matches }) {
  const owned = tagMap[tagKey(bookmark)] || [];
  for (const tag of operators.tag) {
    if (!matches(owned, [tag])) return false;
  }
  if (operators.folder.length) {
    const folder = (bookmark.folderName || '').toLowerCase();
    if (!operators.folder.every((f) => folder.includes(f))) return false;
  }
  if (operators.site.length) {
    let host = '';
    try {
      host = new URL(bookmark.url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      host = '';
    }
    if (!operators.site.every((s) => host.includes(s))) return false;
  }
  for (const flag of operators.has) {
    if (flag === 'note' && !(notes[tagKey(bookmark)] || '').trim()) return false;
    if (flag === 'tags' && owned.length === 0) return false;
    if (flag === 'text' && !(bookmark.indexText || '').trim()) return false;
    if (flag === 'unread' && bookmark.lastVisit) return false;
  }
  const added = bookmark.dateAdded || 0;
  if (operators.before && added >= operators.before) return false;
  if (operators.after && added <= operators.after) return false;
  return true;
}

/* ---------- Match context ---------- */

// Pulls the sentence around the first hit so results explain themselves.
export function matchContext(text, needle, radius = 70) {
  if (!text || !needle) return '';
  const hay = text.toLowerCase();
  const at = hay.indexOf(needle.toLowerCase());
  if (at === -1) return '';
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  let slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) slice = '…' + slice;
  if (end < text.length) slice = slice + '…';
  return slice;
}

/* ---------- Blended usefulness ---------- */

// One score blending relevance, recency, and how often the page is opened.
export function usefulnessScore(item, visits = new Map()) {
  const bm = item.bookmark;
  const base = Number(item.score) || 1;
  const added = bm.dateAdded || 0;
  const daysOld = added ? (Date.now() - added) / 86400000 : 3650;
  // Freshness fades over roughly two years.
  const freshness = Math.max(0, 1 - daysOld / 730);
  const opens = Number(visits.get(bm.id) || bm.visitCount || 0);
  const use = Math.log2(1 + opens) / 4;
  return base * (1 + freshness * 0.35 + Math.min(use, 1) * 0.5);
}

/* ---------- Grouping ---------- */

// Groups results by folder or domain for the "Group by" control.
export function groupResults(results, mode, getDomain) {
  if (mode === 'none') return null;
  const groups = new Map();
  for (const item of results) {
    const bm = item.bookmark;
    let key;
    if (mode === 'domain') key = getDomain(bm.url) || 'Other sites';
    else key = (bm.folderName || 'Unsorted').split(' / ')[0] || 'Unsorted';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/* ---------- Direct URL opening ---------- */

// If what was typed looks like a domain or URL, offer to open it directly.
export function looksLikeUrl(query) {
  const q = String(query || '').trim();
  if (!q || /\s/.test(q)) return null;
  if (/^https?:\/\/\S+$/i.test(q)) return { url: q, label: q };
  // A bare domain with a known-ish TLD, or localhost:port.
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(q)) return { url: `http://${q}`, label: q };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(q) && /\.(com|org|net|dev|io|co|app|ai|xyz|edu|gov|me|sh|so|to|gg|info|uk|de|fr|ca|au|jp)$/i.test(q.split('/')[0])) {
    return { url: `https://${q}`, label: q };
  }
  return null;
}
