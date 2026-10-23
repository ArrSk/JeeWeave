// Commit through the authoritative desktop bridge; retain the cache-only adapter.
export function writeTogether(storage, changes) {
  if (storage.transaction) { storage.transaction(changes); return; }
  const old = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
  const encoded = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, JSON.stringify(value)]));
  try { for (const [key, value] of Object.entries(encoded)) storage.setItem(key, value); }
  catch (error) {
    for (const [key, value] of Object.entries(old)) {
      if (storage.getItem(key) === value) continue;
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    }
    throw error;
  }
}
