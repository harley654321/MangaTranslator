// Cache IndexedDB: un capitulo traducido se reabre al instante sin tocar GitHub.
const MT_CACHE = (() => {
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('manga-translator', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('chapters');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function withStore(mode, key, value) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', mode);
      const store = tx.objectStore('chapters');
      const req = mode === 'readonly' ? store.get(key) : store.put(value, key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  return {
    get: (key) => withStore('readonly', key, null).catch(() => null),
    put: (key, value) => withStore('readwrite', key, value),
  };
})();
