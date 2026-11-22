// Central storage layer: one key map, quota-aware writes, and index pruning.
// Keys keep the historical "folio" prefix so existing user data survives renames.

export const STORAGE = {
  settings: 'folioSettings',
  tags: 'folioTags',
  index: 'folioIndex',
  indexMeta: 'folioIndexMeta',
  backup: 'folioBackup',
  history: 'folioHistory',
  trash: 'folioTrash',
  readLater: 'folioReadLater',
  notes: 'folioNotes',
  rules: 'folioRules',
  collections: 'folioCollections',
  protect: 'folioProtect',
  skipDomains: 'folioSkipDomains',
  pins: 'folioPins',
  recentSearches: 'folioRecentSearches',
  annotations: 'folioAnnotations'
};

export const STORAGE_KEYS = Object.keys(STORAGE);
export const STORAGE_NAMES = Object.values(STORAGE);

export const IS_EXTENSION =
  typeof chrome !== 'undefined' && Boolean(chrome.bookmarks && chrome.storage);

// Page-text index budget. Text is the only thing here that can grow without bound.
export const INDEX_CHAR_BUDGET = 2_500_000;

/* ---------- reads / writes ---------- */

export async function storageGet(keys) {
  const list = [].concat(keys);
  if (IS_EXTENSION) {
    try {
      return await chrome.storage.local.get(list);
    } catch {
      return {};
    }
  }
  const out = {};
  for (const key of list) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) out[key] = JSON.parse(raw);
    } catch {
      // A corrupt entry should not break loading.
    }
  }
  return out;
}

export async function storageSet(values) {
  if (IS_EXTENSION) {
    try {
      await chrome.storage.local.set(values);
    } catch {
      // Quota failures surface through storageUsage(), so keep running.
    }
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore: private-mode Safari and similar reject writes.
    }
  }
}

export async function storageRemove(keys) {
  const list = [].concat(keys);
  if (IS_EXTENSION) {
    try {
      await chrome.storage.local.remove(list);
    } catch {
      // ignore
    }
    return;
  }
  for (const key of list) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

/* ---------- cross-device sync (settings + tags only) ---------- */

// chrome.storage.sync is small (about 100 KB), so this only ever carries the
// two things worth carrying: preferences and the tag map. Page text, notes and
// history stay on the device.
export const SYNC_KEYS = { settings: 'syncFolioSettings', tags: 'syncFolioTags' };

export function isSyncAvailable() {
  return Boolean(IS_EXTENSION && chrome.storage.sync);
}

export async function syncGet(keys) {
  if (!isSyncAvailable()) return {};
  try {
    return await chrome.storage.sync.get([].concat(keys));
  } catch {
    return {};
  }
}

export async function syncSet(values) {
  if (!isSyncAvailable()) return false;
  try {
    await chrome.storage.sync.set(values);
    return true;
  } catch {
    return false;
  }
}

// The API key is deliberately never synced: it is the one secret in here.
export function settingsForSync(settings) {
  return {
    provider: settings.provider,
    model: settings.model,
    theme: settings.theme,
    autoCheck: settings.autoCheck,
    tourDone: settings.tourDone,
    syncEnabled: settings.syncEnabled
  };
}

/* ---------- quota accounting ---------- */

// Byte size of a value as it will be serialised, which is what the quota counts.
export function bytesOf(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(value || '').length * 2;
  }
}

// Total stored size plus the browser's limit, so Settings can show real numbers.
export async function storageUsage() {
  const stored = await storageGet(STORAGE_NAMES);
  let used = 0;
  const perKey = {};
  for (const [key, value] of Object.entries(stored)) {
    const size = bytesOf(value);
    perKey[key] = size;
    used += size;
  }

  // The extension requests unlimitedStorage, so there is no wall to hit there.
  // The preview has no unlimited quota, and localStorage sits at roughly 5 MB.
  let limit = null;
  if (IS_EXTENSION && chrome.storage.local.getBytesInUse) {
    try {
      const measured = await chrome.storage.local.getBytesInUse(null);
      if (typeof measured === 'number' && measured > 0) used = Math.max(used, measured);
    } catch {
      // keep the computed figure
    }
  } else {
    limit = 5 * 1024 * 1024;
  }
  return { used, limit, perKey };
}

export function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

/* ---------- index pruning ---------- */

// Keeps the newest entries within budget. `meta` maps id -> { savedAt }.
export function pruneIndex(index, meta, budget = INDEX_CHAR_BUDGET) {
  const entries = Object.entries(index || {});
  let total = entries.reduce((sum, [, text]) => sum + String(text || '').length, 0);
  if (total <= budget) return { index, meta, evicted: 0 };

  // Oldest first, so the most recently indexed pages are kept.
  entries.sort((a, b) => {
    const aAt = (meta && meta[a[0]] && meta[a[0]].savedAt) || 0;
    const bAt = (meta && meta[b[0]] && meta[b[0]].savedAt) || 0;
    return aAt - bAt;
  });

  const evicted = [];
  for (const [id, text] of entries) {
    if (total <= budget) break;
    total -= String(text || '').length;
    evicted.push(id);
    delete index[id];
    if (meta) delete meta[id];
  }
  return { index, meta, evicted: evicted.length };
}

/* ---------- theme bootstrap ---------- */

// Applied by a tiny inline script before first paint to avoid a light->dark flash.
export function resolveTheme(theme) {
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme === 'light' ? 'light' : 'dark';
}

// Called from the inline <head> script in each HTML shell.
export function applyStoredThemeSync() {
  let theme = 'dark';
  try {
    const raw = localStorage.getItem(STORAGE.settings);
    if (raw) theme = JSON.parse(raw).theme || 'dark';
  } catch {
    // default to dark
  }
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
}
