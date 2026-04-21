const Store = require("electron-store").default;

const store = new Store({
  name: "user-state",
  defaults: {
    theme: "system",
    favorites: [],
    history: [],
    lastPath: null,
    importedContentRoot: null
  }
});

function dedupeRecent(entries, limit = 100) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry || !entry.path || seen.has(entry.path)) {
      continue;
    }
    seen.add(entry.path);
    result.push(entry);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function getStore() {
  return store;
}

function addHistory(entry) {
  const current = store.get("history", []);
  store.set("history", dedupeRecent([entry, ...current]));
  store.set("lastPath", entry.path);
}

function toggleFavorite(entry) {
  const favorites = store.get("favorites", []);
  const exists = favorites.some((item) => item.path === entry.path);
  const next = exists
    ? favorites.filter((item) => item.path !== entry.path)
    : [entry, ...favorites].slice(0, 200);
  store.set("favorites", next);
  return !exists;
}

module.exports = {
  getStore,
  addHistory,
  toggleFavorite
};
