// Data health: finds tag, note, read-later, pin, and index records that no
// longer point at a bookmark. Kept separate from the app so it can be tested
// without a DOM.

// `bookmarks` should carry a precomputed `key` (see tagKey in organizer.js).
export function findOrphans(bookmarks, stores) {
  const live = new Set(bookmarks.map((b) => b.key).filter(Boolean));
  const liveIds = new Set(bookmarks.map((b) => b.id));
  const out = { tags: [], notes: [], readLater: [], pins: [], index: [] };

  const collect = (mapLike, bucket) => {
    for (const [key, value] of Object.entries(mapLike || {})) {
      if (live.has(key)) continue;
      const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0) || value === false;
      // Empty leftovers are harmless noise; only real content needs review.
      if (!isEmpty) out[bucket].push(key);
    }
  };

  collect(stores.tags, 'tags');
  collect(stores.notes, 'notes');
  collect(stores.readLater, 'readLater');

  // Pins and page text are keyed by bookmark id, not URL key.
  const collectIds = (mapLike, bucket) => {
    for (const [id, value] of Object.entries(mapLike || {})) {
      if (liveIds.has(id)) continue;
      const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0) || value === false;
      if (!isEmpty) out[bucket].push(id);
    }
  };
  collectIds(stores.indexText, 'index');

  for (const id of stores.pins || []) {
    if (!liveIds.has(String(id))) out.pins.push(id);
  }

  return out;
}

export function orphanCount(orphans) {
  return Object.values(orphans).reduce((sum, list) => sum + list.length, 0);
}

// Removes exactly the keys handed back by findOrphans. Returns new copies so
// callers can keep the old objects for an undo snapshot.
export function withoutOrphans(stores, orphans) {
  const drop = (mapLike, keys) => {
    const next = { ...(mapLike || {}) };
    for (const key of keys) delete next[key];
    return next;
  };
  return {
    tags: drop(stores.tags, orphans.tags),
    notes: drop(stores.notes, orphans.notes),
    readLater: drop(stores.readLater, orphans.readLater),
    indexText: drop(stores.indexText, orphans.index),
    pins: (stores.pins || []).filter((id) => !orphans.pins.includes(id))
  };
}

// Describes the orphan set in the words the dialog uses.
export function describeOrphans(orphans) {
  const parts = [];
  const labels = {
    tags: ['tagged record', 'tagged records'],
    notes: ['note', 'notes'],
    readLater: ['read-later entry', 'read-later entries'],
    pins: ['pin', 'pins'],
    index: ['page-text entry', 'page-text entries']
  };
  for (const [bucket, [one, many]] of Object.entries(labels)) {
    const count = (orphans[bucket] || []).length;
    if (count > 0) parts.push(`${count} ${count === 1 ? one : many}`);
  }
  return parts.length ? parts.join(', ') : 'nothing';
}
