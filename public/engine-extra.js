// Bookbox extra engine: rules, confidence, conflicts, aging, similarity, and search v2.
// Imported by organizer.js and re-exported so the app only needs one import site.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'be',
  'this', 'that', 'it', 'as', 'at', 'by', 'from', 'your', 'you', 'we', 'our', 'can', 'how',
  'what', 'why', 'all', 'not', 'but', 'if', 'so', 'do', 'does', 'use', 'using', 'about'
]);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/* ---------- Reading time ---------- */

export function readingTime(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (words < 40) return '';
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

/* ---------- Rules engine ---------- */

// rule: { id, field: 'domain'|'title'|'url', match: string, folder: 'Parent / Sub', enabled }
export function evaluateRules(bookmark, rules) {
  const active = (rules || []).filter((r) => r && r.enabled !== false && r.match && r.folder);
  const domain = getDomain(bookmark.url).toLowerCase();
  const title = (bookmark.title || '').toLowerCase();
  const url = (bookmark.url || '').toLowerCase();

  for (const rule of active) {
    const needle = String(rule.match).toLowerCase().trim();
    if (!needle) continue;
    let hit = false;
    if (rule.field === 'domain') hit = domain === needle || domain.endsWith('.' + needle);
    else if (rule.field === 'title') hit = title.includes(needle);
    else if (rule.field === 'url') hit = url.includes(needle);
    if (hit) return { rule, folder: rule.folder };
  }
  return null;
}

export function applyRules(bookmarks, rules) {
  const map = new Map();
  for (const bm of bookmarks) {
    const result = evaluateRules(bm, rules);
    if (result) map.set(bm.id, result.folder);
  }
  return map;
}

/* ---------- Confidence ---------- */

// Returns the winning folder plus a 0-100 confidence and the signals behind it.
export function scoreClassification(bookmark, rules) {
  const domain = getDomain(bookmark.url).toLowerCase();
  const titleText = (bookmark.title || '').toLowerCase();
  const contentText = searchableTextFor(bookmark);

  const breakdown = [];
  let bestPath = 'Reference / General';
  let bestScore = 0;
  let runnerUp = 0;

  for (const rule of HIERARCHICAL_RULES_FOR_SCORING) {
    let score = 0;
    const signals = [];
    if (rule.domains.some((d) => domain === d || domain.endsWith('.' + d))) {
      score += 4;
      signals.push(`known site ${domain}`);
    }
    for (const kw of rule.keywords) {
      if (contentText.includes(kw)) {
        score += 3;
        signals.push(`page mentions “${kw}”`);
      }
      if (titleText.includes(kw)) {
        score += 2;
        signals.push(`title says “${kw}”`);
      }
    }
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      bestPath = rule.path;
      breakdown.length = 0;
      breakdown.push(...signals.slice(0, 3));
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  const ruleHit = evaluateRules(bookmark, rules);
  if (ruleHit) {
    return {
      folder: ruleHit.folder,
      confidence: 100,
      signals: [`matched your rule “${ruleHit.rule.match}”`]
    };
  }

  if (bestScore === 0) {
    return { folder: bestPath, confidence: 15, signals: ['no strong signals — filed as general'] };
  }

  const margin = bestScore - runnerUp;
  const confidence = Math.max(20, Math.min(96, Math.round((bestScore / (bestScore + 6)) * 100 + margin * 2)));
  return { folder: bestPath, confidence, signals: breakdown };
}

// Avoids a circular import: organizer.js sets this once at load time.
let HIERARCHICAL_RULES_FOR_SCORING = [];
let searchableTextFor = () => '';

export function __registerScoringRules(rules, searchableTextFn) {
  HIERARCHICAL_RULES_FOR_SCORING = rules;
  searchableTextFor = searchableTextFn;
}

/* ---------- Conflicts ---------- */

// Same page saved under two different titles.
export function findTitleConflicts(bookmarks) {
  const byKey = new Map();
  for (const bm of bookmarks) {
    if (!bm.url) continue;
    const key = normalizeUrlLocal(bm.url);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(bm);
  }
  const conflicts = [];
  for (const [, items] of byKey) {
    const titles = new Set(items.map((i) => (i.title || '').trim().toLowerCase()));
    if (items.length > 1 && titles.size > 1) {
      conflicts.push({ normalizedUrl: items[0].url, items });
    }
  }
  return conflicts;
}

/* ---------- Folder aging ---------- */

export function findAgingFolders(bookmarks, months, now = Date.now()) {
  const cutoff = now - months * 30 * 86400000;
  const groups = new Map();
  for (const bm of bookmarks) {
    const folder = bm.folderName || 'Uncategorized';
    if (!groups.has(folder)) groups.set(folder, { folder, count: 0, newest: 0, lastVisit: 0 });
    const g = groups.get(folder);
    g.count += 1;
    g.newest = Math.max(g.newest, bm.dateAdded || 0);
    g.lastVisit = Math.max(g.lastVisit, bm.lastVisit || 0);
  }
  return [...groups.values()]
    .filter((g) => g.newest && g.newest < cutoff && g.lastVisit < cutoff)
    .sort((a, b) => a.newest - b.newest);
}

/* ---------- Similar bookmarks ---------- */

// Cheap cosine similarity over token frequency — good enough for "more like this".
export function findSimilar(bookmark, bookmarks, limit = 5) {
  const vec = new Map();
  const add = (text, weight) => {
    for (const token of tokenize(text)) vec.set(token, (vec.get(token) || 0) + weight);
  };
  add(bookmark.title, 2);
  add(bookmark.url, 1);
  add(bookmark.content ? formatContentLocal(bookmark.content) : '', 1);
  add(bookmark.indexText || '', 1);
  if (vec.size === 0) return [];

  const results = [];
  for (const other of bookmarks) {
    if (other.id === bookmark.id) continue;
    const otherVec = new Map();
    const addOther = (text, weight) => {
      for (const token of tokenize(text)) otherVec.set(token, (otherVec.get(token) || 0) + weight);
    };
    addOther(other.title, 2);
    addOther(other.url, 1);
    addOther(other.content ? formatContentLocal(other.content) : '', 1);
    addOther(other.indexText || '', 1);
    if (otherVec.size === 0) continue;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [token, weight] of vec) {
      normA += weight * weight;
      const match = otherVec.get(token);
      if (match) dot += weight * match;
    }
    for (const weight of otherVec.values()) normB += weight * weight;
    const score = dot / Math.sqrt(normA * normB || 1);
    if (score > 0.12) results.push({ bookmark: other, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------- Tag hierarchy ---------- */

// "frontend/css" also matches a filter for "frontend".
export function tagLineage(tag) {
  const parts = String(tag || '').split('/').filter(Boolean);
  const out = [];
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    out.push(current);
  }
  return out;
}

export function tagMatches(owned, wanted) {
  const lineage = new Set();
  for (const tag of owned || []) {
    for (const ancestor of tagLineage(tag)) lineage.add(ancestor);
  }
  return (wanted || []).every((w) => lineage.has(w));
}

export function renameTag(tagMap, from, to) {
  const next = {};
  const clean = String(to || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!clean) return tagMap;
  for (const [key, tags] of Object.entries(tagMap || {})) {
    next[key] = Array.from(new Set((tags || []).map((t) => (t === from ? clean : t))));
  }
  return next;
}

export function mergeTags(tagMap, from, into) {
  const next = {};
  for (const [key, tags] of Object.entries(tagMap || {})) {
    const merged = (tags || []).map((t) => (t === from ? into : t));
    next[key] = Array.from(new Set(merged));
  }
  return next;
}

/* ---------- Smart collections ---------- */

// collection: { id, name, query, folder, domain, addedWithin, visitedWithin, tags, rulesOnly }
export function runCollection(bookmarks, collection, ctx = {}) {
  const { tagMap = {}, visits = new Map(), rules = [] } = ctx;

  return bookmarks.filter((bm) => {
    if (collection.rulesOnly) {
      const hit = evaluateRules(bm, rules);
      if (!hit) return false;
    }
    if (collection.folder && collection.folder !== 'all') {
      if ((bm.folderName || '').split(' / ')[0] !== collection.folder) return false;
    }
    if (collection.domain && collection.domain !== 'all' && getDomain(bm.url) !== collection.domain) return false;
    if (collection.tags && collection.tags.length) {
      const owned = tagMap[tagKeyLocal(bm)] || [];
      if (!tagMatches(owned, collection.tags)) return false;
    }
    if (collection.addedWithin && Number(collection.addedWithin) > 0) {
      if (Date.now() - (bm.dateAdded || 0) > Number(collection.addedWithin) * 86400000) return false;
    }
    if (collection.visitedWithin && collection.visitedWithin !== 'any') {
      const last = visits.get(bm.id) || bm.lastVisit || 0;
      if (collection.visitedWithin === 'never' && last) return false;
      if (collection.visitedWithin !== 'never') {
        if (!last || Date.now() - last > Number(collection.visitedWithin) * 86400000) return false;
      }
    }
    if (collection.query) {
      // Collections use the same operators as the search box, so
      // "site:github.com tag:code" means the same thing in both places.
      const parsed = parseQueryLocal(collection.query);
      if (parsed.operators.length) {
        if (!passesOperatorsLocal(bm, parsed.operators, { tagMap, notes: ctx.notes || {} })) return false;
      }
      const tokens = tokenize(parsed.text);
      if (tokens.length) {
        const text = [
          bm.title,
          bm.url,
          bm.folderName,
          bm.indexText || '',
          bm.content ? formatContentLocal(bm.content) : '',
          (tagMap[tagKeyLocal(bm)] || []).join(' ')
        ]
          .join(' ')
          .toLowerCase();
        if (!tokens.every((t) => text.includes(t))) return false;
      }
    }
    return true;
  });
}

/* ---------- Collection query operators ---------- */

// Minimal local copies so this module has no circular import with search-plus.js.
function collectTagsDeep(tagMap, bookmark) {
  const key = tagKeyLocal(bookmark);
  const tags = tagMap[key] || [];
  // Matching a parent tag should also match its children.
  const out = new Set(tags);
  for (const tag of Object.values(tagMap || {}).flat()) {
    for (const own of tags) {
      if (tag.startsWith(`${own}/`)) out.add(tag);
    }
  }
  return [...out];
}

function parseQueryLocal(raw) {
  const operators = [];
  const words = [];
  const source = String(raw || '').trim();
  const parts = source.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (const part of parts) {
    const bare = part.replace(/^"|"$/g, '');
    const match = bare.match(/^(-?)([a-z]+):(.*)$/i);
    if (!match) {
      words.push(bare);
      continue;
    }
    const [, negate, key, value] = match;
    const name = key.toLowerCase();
    const val = value.replace(/^"|"$/g, '').toLowerCase();
    if (!val) continue;
    if (name === 'tag' || name === 'has' || name === 'is' || name === 'folder' || name === 'in' || name === 'site' || name === 'domain') {
      operators.push({ key: name, value: val, negate: Boolean(negate) });
    } else if (name === 'before' || name === 'after') {
      operators.push({ key: name, value: val, negate: Boolean(negate) });
    } else {
      words.push(bare);
    }
  }
  return { operators, text: words.join(' ') };
}

function passesOperatorsLocal(bm, operators, { tagMap, notes }) {
  const tags = collectTagsDeep(tagMap, bm);
  const note = notes[tagKeyLocal(bm)] || '';
  const domain = getDomainLocal(bm.url);
  for (const op of operators) {
    let hit = false;
    const value = op.value;
    switch (op.key) {
      case 'tag':
        hit = tags.some((t) => t === value || t.startsWith(`${value}/`));
        break;
      case 'folder':
      case 'in':
        hit = String(bm.folderName || '').toLowerCase().includes(value);
        break;
      case 'site':
      case 'domain':
        hit = domain === value || domain.endsWith(`.${value}`);
        break;
      case 'has':
        if (value === 'note') hit = Boolean(note);
        else if (value === 'tags') hit = tags.length > 0;
        else if (value === 'text') hit = Boolean(bm.indexText);
        break;
      case 'is': {
        // "is:unread" / "is:read" refer to the read-later queue, which the app owns.
        const readLater = Boolean(ctx_readLater(bm));
        if (value === 'unread' || value === 'readlater') hit = readLater;
        else if (value === 'read') hit = !readLater;
        break;
      }
      case 'before':
      case 'after': {
        const when = Date.parse(value);
        if (!Number.isNaN(when) && bm.dateAdded) {
          hit = op.key === 'before' ? bm.dateAdded < when : bm.dateAdded > when;
        }
        break;
      }
      default:
        hit = true;
    }
    if (op.negate ? hit : !hit) return false;
  }
  return true;
}

// Read-later lives in app state; the engine only sees a flag passed in ctx.
function ctx_readLater(bm) {
  return bm.readLater || false;
}

function getDomainLocal(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/* ---------- Import / export ---------- */

// Parses a Netscape bookmarks HTML export into { title, url, folderName }.
export function parseBookmarksHtml(html) {
  const items = [];
  const stack = [];
  const re = /<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/A>|<\/DL>/gi;
  let match;
  while ((match = re.exec(html))) {
    if (match[1] !== undefined) {
      stack.push(decodeEntities(stripTags(match[1])).trim());
    } else if (match[2] !== undefined) {
      const url = decodeEntities(match[2]);
      if (!/^https?:/i.test(url)) continue;
      items.push({
        title: decodeEntities(stripTags(match[3] || url)).trim() || url,
        url,
        folderName: stack.slice(-2).join(' / ') || 'Imported'
      });
    } else if (stack.length) {
      stack.pop();
    }
  }
  return items;
}

export function toNetscapeHtml(bookmarks) {
  const byFolder = new Map();
  for (const bm of bookmarks) {
    const folder = bm.folderName || 'Bookmarks';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(bm);
  }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const groups = [...byFolder.entries()]
    .map(
      ([folder, items]) => `
    <DT><H3>${esc(folder)}</H3>
    <DL><p>
${items.map((bm) => `      <DT><A HREF="${esc(bm.url)}">${esc(bm.title)}</A>`).join('\n')}
    </DL><p>`
    )
    .join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>${groups}
</DL><p>`;
}

export function toMarkdown(bookmarks) {
  const byFolder = new Map();
  for (const bm of bookmarks) {
    const folder = bm.folderName || 'Bookmarks';
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(bm);
  }
  const lines = ['# Bookmarks', ''];
  for (const [folder, items] of [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${folder}`, '');
    for (const bm of items) {
      const note = bm.note ? ` — ${bm.note}` : '';
      lines.push(`- [${bm.title}](${bm.url})${note}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function toCsv(bookmarks, tagMap = {}) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['title', 'url', 'folder', 'tags', 'added', 'lastVisit', 'note'].join(',')];
  for (const bm of bookmarks) {
    rows.push(
      [
        esc(bm.title),
        esc(bm.url),
        esc(bm.folderName),
        esc((tagMap[tagKeyLocal(bm)] || []).join(' ')),
        esc(bm.dateAdded ? new Date(bm.dateAdded).toISOString() : ''),
        esc(bm.lastVisit ? new Date(bm.lastVisit).toISOString() : ''),
        esc(bm.note || '')
      ].join(',')
    );
  }
  return rows.join('\r\n');
}

/* ---------- local helpers (kept here to avoid cycles) ---------- */

function normalizeUrlLocal(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    parsed.hash = '';
    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.hostname}${cleanPath}`;
  } catch {
    return String(rawUrl || '').toLowerCase();
  }
}

function tagKeyLocal(bookmark) {
  return normalizeUrlLocal(bookmark.url || '');
}

function getDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatContentLocal(content) {
  if (!content) return '';
  return [content.description, content.headings, content.excerpt].filter(Boolean).join(' ');
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
