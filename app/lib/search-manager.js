const fs = require("node:fs");
const MiniSearch = require("minisearch");
const { getImportedContentRoot, getContentMetadata } = require("./content-manager");

let cached = null;

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
  const miniSearch = MiniSearch.loadJSON(searchData, {
    idField: "pageId",
    fields: ["title", "summary", "headings", "tags"],
    storeFields: ["pageId", "title", "path", "namespace", "summary", "tags"]
  });

  cached = { contentRoot, miniSearch, documents };
  return cached;
}

function search(query, filters = {}) {
  const loaded = loadSearchIndex();
  if (!loaded || !query || !query.trim()) {
    return [];
  }

  const namespaceFilter = filters.namespace || "article";
  const includeNonArticle = Boolean(filters.includeNonArticle);
  const rawResults = loaded.miniSearch.search(query, {
    prefix: true,
    fuzzy: 0.2,
    boost: {
      title: 4,
      headings: 2,
      tags: 2,
      summary: 1.5
    }
  });

  return rawResults
    .filter((entry) => {
      if (includeNonArticle) {
        return true;
      }
      if (namespaceFilter === "all") {
        return true;
      }
      return (entry.namespace || "article") === namespaceFilter;
    })
    .slice(0, 50)
    .map((entry) => ({
      pageId: entry.pageId,
      title: entry.title,
      path: entry.path,
      namespace: entry.namespace,
      summary: entry.summary,
      tags: entry.tags,
      score: entry.score
    }));
}

module.exports = {
  search
};
