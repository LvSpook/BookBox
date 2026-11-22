// Background service worker for Bookbox
// Handles dead-link checks, page content extraction, omnibox search, context-menu saving,
// and tab capture without the popup's CORS restrictions.

/* ---------- Lifecycle: context menu + omnibox ---------- */

const MENU_SAVE = 'bookbox-save-page';
const MENU_SAVE_TABS = 'bookbox-save-tabs';

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU_SAVE,
      title: 'Save this page to Bookbox',
      contexts: ['page', 'link']
    });
    chrome.contextMenus.create({
      id: MENU_SAVE_TABS,
      title: 'Save all open tabs to Bookbox',
      contexts: ['page']
    });
  } catch {
    // contextMenus unavailable in some builds; the popup still works
  }
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_SAVE) {
    const url = info.linkUrl || (tab && tab.url);
    if (!url) return;
    await stashPending([
      { url, title: info.linkUrl ? info.selectionText || url : (tab && tab.title) || url }
    ]);
  } else if (info.menuItemId === MENU_SAVE_TABS) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const items = tabs
      .filter((t) => isHttpUrl(t.url))
      .map((t) => ({ url: t.url, title: t.title || t.url }));
    await stashPending(items);
  }
});

// Keyboard shortcuts: Alt+Shift+S saves the current page without opening the popup.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'save-page') return;
  const tab = await chrome.tabs.query({ active: true, currentWindow: true });
  const current = tab && tab[0];
  if (!current || !isHttpUrl(current.url)) return;
  await stashPending([{ url: current.url, title: current.title || current.url }]);
});

// The popup drains this queue when it opens, so saving never needs the popup to be up first.
async function stashPending(items) {
  const { bookboxPending = [] } = await chrome.storage.local.get(['bookboxPending']);
  const merged = [...bookboxPending, ...items].slice(-200);
  await chrome.storage.local.set({ bookboxPending: merged });

  try {
    chrome.action.setBadgeText({ text: String(Math.min(merged.length, 99)) });
    chrome.action.setBadgeBackgroundColor({ color: '#6ea0ff' });
  } catch {
    // badge is cosmetic
  }
}

// Omnibox: type "bb css grid" and press Enter to open the organizer searching for that.
chrome.omnibox?.onInputChanged.addListener((text, suggest) => {
  const value = text.trim();
  suggest([
    {
      content: value ? `search:${value}` : 'search:',
      description: value ? `Search Bookbox for “${value}”` : 'Open Bookbox'
    }
  ]);
});

chrome.omnibox?.onInputEntered.addListener(async (text) => {
  const query = String(text || '').replace(/^search:/, '');
  await chrome.storage.local.set({ bookboxPendingSearch: query });
  try {
    await chrome.action.openPopup();
  } catch {
    // Older browsers can't open the popup programmatically; the query waits for the next open.
  }
});

/* ---------- Scheduled link checks ---------- */

const AUTO_CHECK_ALARM = 'bookbox-auto-check';

async function setAutoCheckSchedule(mode) {
  await chrome.alarms.clear(AUTO_CHECK_ALARM);
  if (mode === 'weekly' || mode === 'monthly') {
    // Chrome requires a period; 7 and 30 days match the two options exactly.
    await chrome.alarms.create(AUTO_CHECK_ALARM, {
      delayInMinutes: mode === 'weekly' ? 60 * 24 * 7 : 60 * 24 * 30,
      periodInMinutes: mode === 'weekly' ? 60 * 24 * 7 : 60 * 24 * 30
    });
  }
}

// Walks the tree and keeps only pages worth checking.
async function allBookmarkUrls() {
  const tree = await chrome.bookmarks.getTree();
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node.url) {
        if (isHttpUrl(node.url)) out.push({ id: node.id, url: node.url, title: node.title || node.url });
      } else if (Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return out;
}

// One pass over the library, storing only failures so the popup shows a ready result.
async function runScheduledCheck() {
  const items = await allBookmarkUrls();
  const domains = await chrome.storage.local.get(['bookboxSkipDomains']);
  const skip = new Set((domains.bookboxSkipDomains || []).map((d) => String(d).toLowerCase()));
  const targets = items.filter((item) => {
    try {
      return !skip.has(new URL(item.url).hostname.toLowerCase());
    } catch {
      return false;
    }
  });

  const dead = [];
  let index = 0;
  const workerCount = 4;
  async function worker() {
    while (index < targets.length) {
      const bm = targets[index++];
      const res = await checkUrlStatus(bm.url);
      if (!res.ok) dead.push({ bookmark: bm, ...res });
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, targets.length) }, worker));

  await chrome.storage.local.set({
    bookboxLastCheck: {
      at: Date.now(),
      checked: targets.length,
      dead: dead.map((d) => ({
        id: d.bookmark.id,
        title: d.bookmark.title,
        url: d.bookmark.url,
        reason: d.reason || 'Dead'
      }))
    }
  });

  // A quiet badge is the only notification — no popups, no permissions.
  try {
    if (dead.length) {
      chrome.action.setBadgeText({ text: String(Math.min(dead.length, 99)) });
      chrome.action.setBadgeBackgroundColor({ color: '#e4646b' });
    }
  } catch {
    // badge is cosmetic
  }
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_CHECK_ALARM) runScheduledCheck().catch(() => {});
});

// Restore the alarm after a browser restart, since alarms do not survive updates.
chrome.runtime.onStartup?.addListener(async () => {
  const stored = await chrome.storage.local.get(['folioSettings']);
  const mode = stored?.folioSettings?.autoCheck;
  if (mode && mode !== 'off') setAutoCheckSchedule(mode).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SET_SCHEDULE') {
    setAutoCheckSchedule(message.mode)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'CHECK_LINK' && message.url) {
    checkUrlStatus(message.url)
      .then(sendResponse)
      .catch(() => sendResponse({ url: message.url, status: 0, ok: false, reason: 'Unreachable' }));
    return true;
  }
  if (message?.type === 'FETCH_PAGE_CONTENT' && message.url) {
    fetchPageContent(message.url)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, description: '', headings: '', excerpt: '', text: '' }));
    return true;
  }
  if (message?.type === 'GET_VISITS' && Array.isArray(message.urls)) {
    getVisitMap(message.urls)
      .then(sendResponse)
      .catch(() => sendResponse({ visits: {} }));
    return true;
  }
  if (message?.type === 'OPEN_URL' && message.url) {
    // Opening needs the tabs API, which the popup cannot use directly with only host permissions.
    chrome.tabs.create({ url: message.url })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'GET_OPEN_TABS') {
    chrome.tabs.query({}).then((tabs) => {
      const byWindow = new Map();
      for (const tab of tabs) {
        if (!isHttpUrl(tab.url)) continue;
        const key = tab.windowId;
        if (!byWindow.has(key)) byWindow.set(key, []);
        byWindow.get(key).push({ id: tab.id, url: tab.url, title: tab.title || tab.url, windowId: key });
      }
      sendResponse({ windows: [...byWindow.entries()].map(([windowId, items]) => ({ windowId, items })) });
    }).catch(() => sendResponse({ windows: [] }));
    return true;
  }
  if (message?.type === 'LOOKUP_ARCHIVE' && message.url) {
    lookupArchive(message.url)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'DRAIN_PENDING') {
    chrome.storage.local.get(['bookboxPending', 'bookboxPendingSearch']).then((stored) => {
      chrome.storage.local.remove(['bookboxPending', 'bookboxPendingSearch']);
      try {
        chrome.action.setBadgeText({ text: '' });
      } catch {
        // cosmetic
      }
      sendResponse({
        pending: stored.bookboxPending || [],
        search: stored.bookboxPendingSearch || ''
      });
    });
    return true;
  }
});


// Last-visit timestamps for stale detection, keyed by normalized URL.
async function getVisitMap(rawUrls) {
  const visits = {};
  const MAX = 900;

  for (const raw of rawUrls.slice(0, MAX)) {
    if (!isHttpUrl(raw)) continue;
    try {
      const results = await chrome.history.getVisits({ url: raw });
      if (results && results.length > 0) {
        visits[raw] = results.reduce((latest, v) => Math.max(latest, v.visitTime || 0), 0);
      }
    } catch {
      // History entry missing or access denied; treat as never visited
    }
  }

  return { visits };
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Categorized link check: "dead", "blocked" (bot protection — probably alive), or "ok".
async function checkUrlStatus(url) {
  // Never flag browser-internal URLs or bookmarklets (javascript:, chrome://, file://, etc.) as dead
  if (!isHttpUrl(url)) {
    return { url, status: 200, ok: true, category: 'ok', reason: 'Local/Script' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    });

    if (response.status === 405 || response.status === 403 || response.status === 400) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal
      });
    }

    clearTimeout(timeoutId);
    const status = response.status;

    // 401/403/429 mean a bot wall or rate limit, not a missing page. Never delete these.
    if (status === 401 || status === 403 || status === 429) {
      return { url, status, ok: true, category: 'blocked', reason: `HTTP ${status} (bot wall)` };
    }

    const dead = status === 404 || status === 410 || status >= 500;
    // fetch follows redirects, so a final URL that differs from the original
    // means the saved address is out of date. Offer to repair rather than delete.
    let redirect = null;
    if (!dead && response.url && response.url !== url) {
      const normalizedOriginal = url.replace(/#.*$/, '');
      const normalizedFinal = response.url.replace(/#.*$/, '');
      if (normalizedFinal !== normalizedOriginal) {
        redirect = response.url;
      }
    }
    return {
      url,
      status,
      ok: !dead,
      category: dead ? 'dead' : 'ok',
      reason: dead ? `HTTP ${status}` : 'Active',
      redirect
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err && err.name === 'AbortError';
    return {
      url,
      status: 0,
      ok: false,
      category: 'dead',
      reason: isTimeout ? 'Timed out' : 'DNS or network failure'
    };
  }
}

// Oldest snapshot of a dead link, so it can be replaced instead of lost.
async function lookupArchive(url) {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      redirect: 'follow'
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;
    if (snapshot && snapshot.url) {
      return { ok: true, archiveUrl: snapshot.url, timestamp: snapshot.timestamp || '' };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function fetchPageContent(url) {
  if (!isHttpUrl(url)) {
    return { ok: true, description: '', headings: '', excerpt: '', text: '' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { ok: false, description: '', headings: '', excerpt: '', text: '' };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { ok: true, description: '', headings: '', excerpt: '', text: '' };
    }

    // Read up to 250KB so the full-page index has real body text to search.
    const html = (await response.text()).slice(0, 250000);
    return { ok: true, ...extractReadableMetadata(html) };
  } catch {
    clearTimeout(timeoutId);
    return { ok: false, description: '', headings: '', excerpt: '', text: '' };
  }
}

function extractReadableMetadata(html) {
  const metaDescMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const description = cleanText(metaDescMatch ? metaDescMatch[1] : '').slice(0, 260);

  const headingMatches = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => cleanText(m[1]))
    .filter(Boolean)
    .slice(0, 4);
  const headings = headingMatches.join(' · ').slice(0, 220);

  const bodyOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const fullText = cleanText(bodyOnly);

  return {
    description,
    headings,
    excerpt: fullText.slice(0, 420),
    // Search-only payload; trimmed so storage stays reasonable per bookmark.
    text: fullText.slice(0, 6000)
  };
}

function cleanText(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
