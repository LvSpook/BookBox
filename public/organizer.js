// Core engine: page-content analysis, hierarchical folders, near-duplicates, tags, and search.

import {
  tokenize,
  readingTime,
  evaluateRules,
  applyRules,
  scoreClassification,
  findTitleConflicts,
  findAgingFolders,
  findSimilar,
  tagLineage,
  tagMatches,
  renameTag,
  mergeTags,
  runCollection,
  parseBookmarksHtml,
  toNetscapeHtml,
  toMarkdown,
  toCsv,
  __registerScoringRules
} from './engine-extra.js';

export {
  tokenize,
  readingTime,
  evaluateRules,
  applyRules,
  scoreClassification,
  findTitleConflicts,
  findAgingFolders,
  findSimilar,
  tagLineage,
  tagMatches,
  renameTag,
  mergeTags,
  runCollection,
  parseBookmarksHtml,
  toNetscapeHtml,
  toMarkdown,
  toCsv
};

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid', 'igshid', 'si'
];

const HIERARCHICAL_RULES = [
  {
    path: 'Development / Frontend & CSS',
    domains: ['css-tricks.com', 'smashingmagazine.com', 'codepen.io', 'react.dev'],
    keywords: ['css', 'grid', 'flexbox', 'html', 'frontend', 'tailwind', 'responsive', 'layout', 'dom', 'animation', 'styling']
  },
  {
    path: 'Development / Docs & APIs',
    domains: ['developer.mozilla.org', 'typescriptlang.org', 'nodejs.org', 'python.org', 'rust-lang.org'],
    keywords: ['javascript', 'typescript', 'documentation', 'reference', 'mdn', 'api', 'sdk', 'syntax', 'async', 'promise', 'standard library']
  },
  {
    path: 'Development / Code & Repos',
    domains: ['github.com', 'gitlab.com', 'stackoverflow.com', 'npmjs.com', 'vercel.com', 'cloudflare.com'],
    keywords: ['repository', 'open source', 'commit', 'pull request', 'package', 'deploy', 'trending', 'git', 'framework', 'cli']
  },
  {
    path: 'AI & Research / APIs & Models',
    domains: ['aistudio.google.com', 'console.groq.com', 'openrouter.ai', 'openai.com', 'anthropic.com', 'huggingface.co'],
    keywords: ['gemini', 'llama', 'llm', 'inference', 'api key', 'prompt', 'language model', 'tokens', 'generative ai', 'free tier']
  },
  {
    path: 'Design & Creative / UI & Prototyping',
    domains: ['figma.com', 'dribbble.com', 'behance.net', 'awwwards.com', 'canva.com'],
    keywords: ['prototype', 'wireframe', 'interface design', 'ui design', 'ux', 'design system', 'collaborative design', 'vector']
  },
  {
    path: 'Design & Creative / Colors & Assets',
    domains: ['coolors.co', 'fonts.google.com', 'unsplash.com', 'lucide.dev'],
    keywords: ['color palette', 'palette', 'swatches', 'typography', 'fonts', 'icons', 'photography', 'hex', 'contrast']
  },
  {
    path: 'Productivity / Notes & Whiteboards',
    domains: ['notion.so', 'excalidraw.com', 'linear.app', 'trello.com', 'miro.com', 'airtable.com'],
    keywords: ['whiteboard', 'diagram', 'sketch', 'workspace', 'wiki', 'notes', 'tasks', 'project management', 'kanban', 'hand-drawn']
  },
  {
    path: 'Reading & Media / Tech News & Articles',
    domains: ['news.ycombinator.com', 'medium.com', 'substack.com', 'dev.to', 'theverge.com', 'arstechnica.com', 'wikipedia.org'],
    keywords: ['startup', 'hacker news', 'article', 'essay', 'newsletter', 'discussion', 'engineering blog', 'guide', 'news']
  },
  {
    path: 'Reading & Media / Video & Audio',
    domains: ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'spotify.com', 'soundcloud.com'],
    keywords: ['video', 'livestream', 'lo-fi', 'beats', 'music', 'study', 'podcast', 'watch', 'playlist', 'radio']
  },
  {
    path: 'Community / Forums & Discussions',
    domains: ['reddit.com', 'x.com', 'twitter.com', 'discord.com', 'linkedin.com', 'bsky.app'],
    keywords: ['subreddit', 'community', 'forum', 'thread', 'developers', 'share', 'discussion']
  },
  {
    path: 'Shopping / Deals & Stores',
    domains: ['amazon.com', 'ebay.com', 'etsy.com', 'bestbuy.com', 'shopify.com'],
    keywords: ['deal', 'promo', 'discount', 'shop', 'store', 'cart', 'price']
  }
];

const TOPIC_SYNONYMS = {
  ai: ['llm', 'gemini', 'groq', 'openrouter', 'model', 'gpt', 'claude', 'inference', 'api'],
  llm: ['ai', 'gemini', 'groq', 'llama', 'model', 'prompt'],
  free: ['free tier', 'open source', 'no credit card', 'gratis'],
  css: ['grid', 'layout', 'styling', 'frontend', 'responsive', 'flexbox'],
  js: ['javascript', 'mdn', 'ecmascript', 'web', 'docs'],
  javascript: ['js', 'mdn', 'frontend', 'web', 'docs'],
  color: ['palette', 'swatches', 'coolors', 'hex', 'design'],
  colors: ['palette', 'swatches', 'coolors', 'hex', 'design'],
  design: ['ui', 'ux', 'figma', 'palette', 'prototype', 'wireframe'],
  draw: ['whiteboard', 'excalidraw', 'diagram', 'sketch'],
  diagram: ['whiteboard', 'excalidraw', 'sketch', 'flowchart'],
  music: ['lo-fi', 'beats', 'audio', 'youtube', 'focus', 'study'],
  focus: ['lo-fi', 'beats', 'study', 'music', 'ambient'],
  notes: ['notion', 'workspace', 'wiki', 'docs', 'productivity'],
  news: ['hacker news', 'articles', 'tech', 'startups', 'reading'],
  code: ['github', 'javascript', 'css', 'repository', 'developer', 'programming']
};

// Parsing a URL is comparatively expensive and normalizeUrl ends up called
// several times per row on every render (tag lookups, sorting, filtering). The
// result is a pure function of the input string, so it is safe to cache.
// Bounded so a huge library cannot grow it without limit.
const normalizeCache = new Map();
const NORMALIZE_CACHE_MAX = 5000;

export function normalizeUrl(rawUrl) {
  const cached = normalizeCache.get(rawUrl);
  if (cached !== undefined) return cached;

  let result;
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    parsed.hash = '';
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    const search = parsed.searchParams.toString();
    // http/https are the same page, so the scheme is deliberately dropped.
    result = `${parsed.hostname}${cleanPath}${search ? '?' + search : ''}`;
  } catch {
    result = (rawUrl || '').trim().toLowerCase();
  }

  if (normalizeCache.size >= NORMALIZE_CACHE_MAX) normalizeCache.clear();
  normalizeCache.set(rawUrl, result);
  return result;
}

export function getDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* ---------- Duplicates ---------- */

export function findDuplicates(bookmarks) {
  const groups = new Map();
  for (const bm of bookmarks) {
    if (!bm.url) continue;
    const key = normalizeUrl(bm.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bm);
  }

  const duplicateGroups = [];
  for (const [normalizedUrl, items] of groups.entries()) {
    if (items.length > 1) {
      const sorted = [...items].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      duplicateGroups.push({
        normalizedUrl,
        keep: sorted[0],
        duplicates: sorted.slice(1)
      });
    }
  }
  return duplicateGroups;
}

// Collapses mobile/AMP/print variants and index pages onto one key.
export function canonicalKey(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    host = host.replace(/^(m|amp|mobile|ww2)\./, '');

    let path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
    path = path
      .replace(/\/(amp|print|index\.html?|index\.php)$/, '')
      .replace(/\/+$/, '');

    const keep = ['v', 'id', 'p', 'q', 'page'];
    const params = [];
    for (const key of keep) {
      const value = parsed.searchParams.get(key);
      if (value) params.push(`${key}=${value}`);
    }

    return `${host}${path}${params.length ? '?' + params.join('&') : ''}`;
  } catch {
    return (rawUrl || '').toLowerCase();
  }
}

// Same page behind a different-looking URL (AMP, print view, mobile subdomain, tracking junk).
export function findNearDuplicates(bookmarks) {
  const buckets = new Map();
  for (const bm of bookmarks) {
    if (!bm.url) continue;
    const key = canonicalKey(bm.url);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(bm);
  }

  const groups = [];
  for (const [key, items] of buckets.entries()) {
    if (items.length < 2) continue;
    // Pure exact duplicates are handled separately.
    const distinctExact = new Set(items.map((i) => normalizeUrl(i.url)));
    if (distinctExact.size < 2) continue;

    const sorted = [...items].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
    groups.push({
      canonicalKey: key,
      keep: sorted[0],
      matches: sorted.slice(1).map((bm) => ({
        bookmark: bm,
        reason: describeNearMatch(sorted[0], bm)
      }))
    });
  }
  return groups;
}

function describeNearMatch(keeper, other) {
  try {
    const a = new URL(keeper.url);
    const b = new URL(other.url);
    if (a.hostname !== b.hostname) return 'Mobile / AMP host';
    if (a.pathname !== b.pathname) return 'AMP / print variant';
    if (a.search !== b.search) return 'Extra URL parameters';
  } catch {
    // fall through
  }
  return 'Same page';
}

/* ---------- Page content ---------- */

export async function fetchAllPageContent(bookmarks, fetchFn, onProgress) {
  const concurrency = 4;
  let completed = 0;
  const contentMap = new Map();

  for (let i = 0; i < bookmarks.length; i += concurrency) {
    const batch = bookmarks.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (bm) => {
        const content = await fetchFn(bm);
        contentMap.set(bm.id, content || { description: '', headings: '', excerpt: '', text: '' });
        completed += 1;
        if (onProgress) onProgress(completed, bookmarks.length);
      })
    );
  }

  return contentMap;
}

export function formatContentSnippet(content) {
  if (!content) return '';
  return [content.description, content.headings, content.excerpt].filter(Boolean).join(' — ').slice(0, 320);
}

function searchableText(bookmark) {
  const parts = [
    bookmark.title || '',
    bookmark.url || '',
    bookmark.folderName || '',
    formatContentSnippet(bookmark.content),
    bookmark.indexText || ''
  ];
  return parts.join(' ').toLowerCase();
}

/* ---------- Sorting ---------- */

export function classifyLocalHierarchical(bookmark) {
  const domain = getDomain(bookmark.url).toLowerCase();
  const titleText = (bookmark.title || '').toLowerCase();
  const contentText = searchableText(bookmark);

  let bestPath = 'Reference / General';
  let bestScore = 0;

  for (const rule of HIERARCHICAL_RULES) {
    let score = 0;
    if (rule.domains.some((d) => domain === d || domain.endsWith('.' + d))) score += 4;
    for (const kw of rule.keywords) {
      if (contentText.includes(kw)) score += 3;
      if (titleText.includes(kw)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPath = rule.path;
    }
  }

  return bestPath;
}

export function organizeLocally(bookmarks) {
  const assignments = new Map();
  for (const bm of bookmarks) {
    assignments.set(bm.id, classifyLocalHierarchical(bm));
  }
  return assignments;
}

export async function organizeWithAI(bookmarks, settings) {
  const { provider, apiKey, model } = settings;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Add an API key in Settings to use AI sorting, or switch to Smart Local mode.');
  }

  const compactList = bookmarks.map((b) => ({
    id: b.id,
    title: (b.title || 'Untitled').slice(0, 70),
    domain: getDomain(b.url),
    content: formatContentSnippet(b.content).slice(0, 220),
    tags: (b.tags || []).join(', ')
  }));

  const systemPrompt =
    'You are a bookmark librarian. Use each bookmark\'s actual page content (not just title/domain) to organize them into a clean 2-level folder hierarchy using "Parent / Subfolder" paths (e.g. "Development / Frontend & CSS", "AI & Research / Free APIs"). ' +
    'Use 3 to 6 top-level parents and 1 to 3 concise subfolders each. ' +
    'Return ONLY valid JSON in this exact format: {"folders":{"Parent / Subfolder":["id1","id2"]}}. Every bookmark id must appear once.';
  const userPrompt = `Organize these ${compactList.length} bookmarks using their page content:\n${JSON.stringify(compactList)}`;

  let rawText = '';

  if (provider === 'gemini') {
    const selectedModel = model || 'gemini-2.0-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 120) || 'Check your API key.'}`);
    }
    const data = await res.json();
    rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    const isGroq = provider === 'groq';
    const endpoint = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    const selectedModel = model || (isGroq ? 'llama-3.3-70b-versatile' : 'meta-llama/llama-3.3-70b-instruct:free');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    };
    if (!isGroq) {
      headers['HTTP-Referer'] = 'https://folio-bookmarks.local';
      headers['X-Title'] = 'Folio Bookmark Organizer';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: selectedModel,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${isGroq ? 'Groq' : 'OpenRouter'} API error (${res.status}): ${errText.slice(0, 120) || 'Check your API key.'}`);
    }
    const data = await res.json();
    rawText = data?.choices?.[0]?.message?.content || '';
  }

  const parsed = extractJsonObject(rawText);
  const foldersObj = parsed?.folders || parsed?.categories || parsed;
  if (!foldersObj || typeof foldersObj !== 'object') {
    throw new Error('AI returned an unexpected format. Try again or use Smart Local mode.');
  }

  const assignments = new Map();
  for (const [folderPath, ids] of Object.entries(foldersObj)) {
    if (!Array.isArray(ids)) continue;
    const cleanPath = normalizeFolderPath(folderPath);
    for (const id of ids) assignments.set(String(id), cleanPath);
  }

  for (const bm of bookmarks) {
    if (!assignments.has(bm.id)) assignments.set(bm.id, classifyLocalHierarchical(bm));
  }

  return assignments;
}

function normalizeFolderPath(rawPath) {
  const parts = String(rawPath || '')
    .split('/')
    .map((p) => p.trim().slice(0, 32))
    .filter(Boolean);
  if (parts.length === 0) return 'Reference / General';
  if (parts.length === 1) return `${parts[0]} / General`;
  return `${parts[0]} / ${parts[1]}`;
}

function extractJsonObject(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* ---------- Dead links ---------- */

// Per-domain pacing. A site that just answered gets a short cool-down before the
// next request to the same host, which keeps big runs from tripping rate limits.
export function createDomainGate(gapMs = 350) {
  const last = new Map();

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  return {
    async wait(url, signal) {
      if (!gapMs) return;
      const host = hostOf(url);
      if (!host) return;
      const since = Date.now() - (last.get(host) || 0);
      const remaining = gapMs - since;
      if (remaining > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, remaining);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('Cancelled', 'AbortError'));
            },
            { once: true }
          );
        });
      }
      last.set(host, Date.now());
    }
  };
}

// Runs checks with a fixed worker pool so one slow site can't stall the queue.
// Returns { results, cancelled, checked } where results is only the failures.
export async function checkDeadLinks(bookmarks, checkFn, onProgress, options = {}) {
  const concurrency = Math.max(1, options.concurrency || 5);
  const signal = options.signal || null;
  const gate = createDomainGate(options.perDomainGap ?? 300);
  const results = [];
  let completed = 0;
  let index = 0;
  let cancelled = false;

  async function worker() {
    while (index < bookmarks.length && !cancelled) {
      if (signal?.aborted) {
        cancelled = true;
        return;
      }
      const bm = bookmarks[index++];
      let res;
      try {
        await gate.wait(bm.url, signal);
        res = await checkFn(bm, { signal });
      } catch (err) {
        if (signal?.aborted) {
          cancelled = true;
          return;
        }
        res = { ok: false, category: 'dead', reason: 'Check failed' };
      }
      completed += 1;
      results.push({ bookmark: bm, ...res });
      if (onProgress) onProgress(completed, bookmarks.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, bookmarks.length) }, worker);
  await Promise.all(workers);

  return {
    // Failures plus healthy pages that moved: both need the user's attention.
    results: results.filter((r) => !r.ok || r.redirect),
    checked: results.length,
    cancelled: cancelled || Boolean(signal?.aborted)
  };
}

/* ---------- Plan ---------- */

export function buildChangePlan({ bookmarks, removeIds, removeReasons, folderAssignments }) {
  const removeSet = new Set(removeIds);
  const toRemove = [];
  const parentMap = new Map();
  let movedCount = 0;

  for (const bm of bookmarks) {
    if (removeSet.has(bm.id)) {
      toRemove.push({ ...bm, reason: removeReasons.get(bm.id) || 'Removed' });
      continue;
    }

    const targetPath = normalizeFolderPath(folderAssignments.get(bm.id) || bm.folderName);
    const [parentName, subName] = targetPath.split(' / ');

    if (!parentMap.has(parentName)) parentMap.set(parentName, new Map());
    const subMap = parentMap.get(parentName);
    if (!subMap.has(subName)) subMap.set(subName, []);

    const willMove = targetPath !== bm.folderName;
    if (willMove) movedCount += 1;

    subMap.get(subName).push({ ...bm, targetPath, willMove });
  }

  const tree = Array.from(parentMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([parentName, subMap]) => {
      const subfolders = Array.from(subMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([subName, items]) => ({ name: subName, path: `${parentName} / ${subName}`, items }));
      const totalCount = subfolders.reduce((sum, sf) => sum + sf.items.length, 0);
      return { name: parentName, totalCount, subfolders };
    });

  const subfolderCount = tree.reduce((sum, p) => sum + p.subfolders.length, 0);

  return {
    toRemove,
    tree,
    summary: {
      totalKept: bookmarks.length - toRemove.length,
      totalRemoved: toRemove.length,
      parentCount: tree.length,
      subfolderCount,
      movedCount
    }
  };
}

/* ---------- Stale bookmarks ---------- */

// mode: 'never' | 'days'
export function findStaleBookmarks(bookmarks, visits, mode, days) {
  const now = Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;

  return bookmarks.filter((bm) => {
    const last = visits.get(bm.id) || 0;
    if (mode === 'never') return last === 0;
    if (last === 0) return true; // never opened also counts as stale
    return now - last > threshold;
  });
}

export function describeLastVisit(lastVisit) {
  if (!lastVisit) return 'Never opened';
  const days = Math.floor((Date.now() - lastVisit) / 86400000);
  if (days <= 0) return 'Opened today';
  if (days === 1) return 'Opened yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.round(days / 365)}+ years ago`;
}

/* ---------- Tags ---------- */

export function tagKey(bookmark) {
  return normalizeUrl(bookmark.url || '');
}

export function collectTags(tagMap) {
  const all = new Set();
  for (const list of Object.values(tagMap || {})) {
    for (const tag of list || []) all.add(tag);
  }
  return Array.from(all).sort((a, b) => a.localeCompare(b));
}

/** Fuzzy-ish search with filters for folder, domain, date added, last visit, and tags. */
export function searchBookmarks(bookmarks, options = {}) {
  const {
    query = '',
    folder = 'all',
    domain = 'all',
    addedWithin = 0,
    visitedWithin = 'any',
    tags = [],
    tagMap = {},
    visits = new Map(),
    notes = {}
  } = options;

  const q = String(query || '').trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const now = Date.now();

  const expanded = new Set();
  for (const token of tokens) {
    for (const syn of TOPIC_SYNONYMS[token] || []) expanded.add(syn);
  }

  const matchesFilters = (bm) => {
    if (folder !== 'all') {
      const parent = (bm.folderName || '').split(' / ')[0];
      if (parent !== folder) return false;
    }
    if (domain !== 'all' && getDomain(bm.url) !== domain) return false;
    if (addedWithin > 0 && now - (bm.dateAdded || 0) > addedWithin * 86400000) return false;
    if (visitedWithin !== 'any') {
      const last = visits.get(bm.id) || 0;
      if (visitedWithin === 'never') {
        if (last !== 0) return false;
      } else {
        const limit = Number(visitedWithin);
        if (!last || now - last > limit * 86400000) return false;
      }
    }
    if (tags.length > 0) {
      const owned = tagMap[tagKey(bm)] || [];
      if (!tagMatches(owned, tags)) return false;
    }
    return true;
  };

  const candidates = bookmarks.filter(matchesFilters);

  if (!q) {
    return candidates
      .map((bm) => ({
        bookmark: bm,
        score: 1,
        matchReason: bm.folderName || 'Bookmark',
        snippet: formatContentSnippet(bm.content).slice(0, 120),
        tags: tagMap[tagKey(bm)] || []
      }))
      .sort((a, b) => (b.bookmark.dateAdded || 0) - (a.bookmark.dateAdded || 0));
  }

  const scored = [];

  for (const bm of candidates) {
    // Lowercasing the same strings on every keystroke was the hot path when
    // typing. Compute it once per bookmark object and reuse it; the object is
    // rebuilt on every scan, so the cache cannot go stale.
    const lc = bm._lc || (bm._lc = {
      title: (bm.title || '').toLowerCase(),
      url: (bm.url || '').toLowerCase(),
      folder: (bm.folderName || '').toLowerCase(),
      content: formatContentSnippet(bm.content).toLowerCase(),
      deep: (bm.indexText || '').toLowerCase()
    });
    const title = lc.title;
    const url = lc.url;
    const folderName = lc.folder;
    const content = lc.content;
    const deepText = lc.deep;
    // Notes are edited without a rescan, so this one is read fresh each time.
    const noteText = String(notes[tagKey(bm)] || '').toLowerCase();

    let score = 0;
    let matchReason = '';

    if (title.includes(q)) {
      score += 12;
      matchReason = 'Matched in title';
    } else if (noteText.includes(q)) {
      score += 11;
      matchReason = 'Matched in your note';
    } else if (content.includes(q)) {
      score += 10;
      matchReason = 'Matched in page summary';
    } else if (deepText.includes(q)) {
      score += 9;
      matchReason = 'Matched in full page text';
    } else if (folderName.includes(q)) {
      score += 8;
      matchReason = 'Matched in folder';
    } else if (url.includes(q)) {
      score += 6;
      matchReason = 'Matched in URL';
    }

    for (const token of tokens) {
      if (title.includes(token)) {
        score += 5;
        if (!matchReason) matchReason = 'Matched in title';
      }
      if (content.includes(token)) {
        score += 4;
        if (!matchReason) matchReason = 'Matched in page summary';
      }
      if (deepText.includes(token)) {
        score += 3.5;
        if (!matchReason) matchReason = 'Matched in full page text';
      }
      if (folderName.includes(token)) {
        score += 3;
        if (!matchReason) matchReason = 'Matched in folder';
      }
      if (url.includes(token)) {
        score += 2;
        if (!matchReason) matchReason = 'Matched in URL';
      }
    }

    for (const syn of expanded) {
      if (content.includes(syn) || title.includes(syn) || folderName.includes(syn) || deepText.includes(syn)) {
        score += 2.5;
        if (!matchReason) matchReason = 'Related topic';
      }
    }

    if (score > 0) {
      const snippetSource =
        formatContentSnippet(bm.content) ||
        (bm.indexText ? bm.indexText.slice(0, 160) : '') ||
        getDomain(bm.url);
      scored.push({
        bookmark: bm,
        score,
        matchReason,
        snippet: snippetSource.slice(0, 160),
        tags: tagMap[tagKey(bm)] || []
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

/* ---------- Cross-module registration ---------- */

// engine-extra needs the rule table and the same searchable-text builder.
__registerScoringRules(HIERARCHICAL_RULES, searchableText);

export { HIERARCHICAL_RULES };
