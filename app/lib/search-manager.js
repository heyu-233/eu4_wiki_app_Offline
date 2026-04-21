const fs = require("node:fs");
const MiniSearch = require("minisearch");
const { getImportedContentRoot, getContentMetadata } = require("./content-manager");

let cached = null;

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[()（）:：,，.。'"!?！？\-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadSearchIndex() {
  const contentRoot = getImportedContentRoot();
  if (!contentRoot) {
    return null;
  }

  if (cached && cached.contentRoot === contentRoot) {
    return cached;
  }

  const metadata = getContentMetadata(contentRoot);
  if (!fs.existsSync(metadata.searchIndexPath) || !fs.existsSync(metadata.contentManifestPath)) {
    return null;
  }

  const searchData = JSON.parse(fs.readFileSync(metadata.searchIndexPath, "utf8"));
  const documents = JSON.parse(fs.readFileSync(metadata.contentManifestPath, "utf8"));
  const byId = new Map(documents.map((doc) => [doc.pageId, doc]));
  const miniSearch = MiniSearch.loadJSON(searchData, {
    idField: "pageId",
    fields: ["title", "summary", "headings", "keywords", "text"],
    storeFields: ["pageId", "title", "path", "namespace", "summary", "keywords", "preview"]
  });

  cached = { contentRoot, miniSearch, documents, byId };
  return cached;
}

function shouldKeep(entry, namespaceFilter, includeNonArticle) {
  if (includeNonArticle) {
    return true;
  }
  if (namespaceFilter === "all") {
    return !["talk", "user"].includes(entry.namespace || "article");
  }
  return (entry.namespace || "article") === namespaceFilter;
}

function mergeResults(resultSets, query) {
  const merged = new Map();
  const normalizedQuery = normalize(query);

  for (const set of resultSets) {
    for (const entry of set) {
      const prev = merged.get(entry.pageId);
      const titleNorm = normalize(entry.title);
      let score = entry.score || 0;
      if (titleNorm === normalizedQuery) score += 40;
      else if (titleNorm.includes(normalizedQuery)) score += 20;
      if ((entry.keywords || []).some((keyword) => normalize(keyword).includes(normalizedQuery))) {
        score += 8;
      }

      if (!prev || prev.score < score) {
        merged.set(entry.pageId, { ...entry, score });
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score);
}

function search(query, filters = {}) {
  const loaded = loadSearchIndex();
  if (!loaded || !query || !query.trim()) {
    return [];
  }

  const namespaceFilter = filters.namespace || "article";
  const includeNonArticle = Boolean(filters.includeNonArticle);
  const normalized = normalize(query);
  const tokens = normalized.split(" ").filter(Boolean).slice(0, 5);
  const searchOptions = {
    prefix: true,
    fuzzy: normalized.length >= 4 ? 0.2 : false,
    combineWith: "OR",
    boost: {
      title: 8,
      keywords: 5,
      headings: 3,
      summary: 2,
      text: 1
    }
  };

  const resultSets = [loaded.miniSearch.search(normalized, searchOptions)];
  if (tokens.length > 1) {
    for (const token of tokens) {
      resultSets.push(loaded.miniSearch.search(token, { ...searchOptions, fuzzy: token.length >= 4 ? 0.2 : false }));
    }
  }

  return mergeResults(resultSets, normalized)
    .filter((entry) => shouldKeep(entry, namespaceFilter, includeNonArticle))
    .slice(0, 60)
    .map((entry) => ({
      pageId: entry.pageId,
      title: entry.title,
      path: entry.path,
      namespace: entry.namespace,
      summary: entry.summary || entry.preview || entry.path,
      tags: entry.keywords || [],
      score: entry.score
    }));
}

module.exports = {
  search
};
