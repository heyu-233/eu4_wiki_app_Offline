const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const MiniSearch = require("minisearch");

const root = path.resolve(__dirname, "..");
const sourceRoot = process.env.EU4_SOURCE_ROOT || path.join(root, "www.eu4cn.com");
const outDir = path.join(root, "scripts", "generated");
const generatedDirName = ".eu4offline";
const contentVersion = process.env.EU4_CONTENT_VERSION || "2024.11.11-snapshot.1";
const snapshotDate = process.env.EU4_SNAPSHOT_DATE || "2024-11-11";
const indexVersion = "1";
const HOME_FILE = "\u9996\u9875.html";

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Source snapshot not found: ${sourceRoot}`);
}

fs.mkdirSync(outDir, { recursive: true });

function walk(dir) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === ".idea" || item.name === generatedDirName) {
        continue;
      }
      if (dir !== sourceRoot || item.name !== "wiki") {
        continue;
      }
      entries.push(...walk(full));
      continue;
    }

    if (!item.isFile() || !item.name.endsWith(".html")) {
      continue;
    }

    if (dir === sourceRoot) {
      if (item.name === HOME_FILE) {
        entries.push(full);
      }
      continue;
    }

    if (dir === path.join(sourceRoot, "wiki")) {
      if (/^(Special|Talk|Template|User|Project|Category|File|MediaWiki)/i.test(item.name)) {
        continue;
      }
      entries.push(full);
    }
  }
  return entries;
}

function classifyNamespace(relativePath) {
  const fileName = relativePath.split(/[\\/]/).pop() || "";
  if (/^Special[_:]/i.test(fileName)) {
    return "special";
  }
  if (/^Template[_:]/i.test(fileName)) {
    return "template";
  }
  if (/^Talk[_:]/i.test(fileName)) {
    return "talk";
  }
  if (/^User[_:]/i.test(fileName)) {
    return "user";
  }
  if (/^Project[_:]/i.test(fileName)) {
    return "project";
  }
  return "article";
}

function decodeName(name) {
  return decodeURIComponent(name).replace(/_/g, " ");
}

function makeTitle(relativePath) {
  const fileName = relativePath.split("/").pop() || relativePath;
  return decodeName(fileName.replace(/\.html$/i, ""));
}

const htmlFiles = walk(sourceRoot);
const documents = htmlFiles.map((filePath) => {
  const relativePath = path.relative(sourceRoot, filePath).replaceAll("\\", "/");
  const namespace = classifyNamespace(relativePath);
  const title = makeTitle(relativePath);
  return {
    pageId: crypto.createHash("sha1").update(relativePath).digest("hex"),
    title,
    path: `/${relativePath}`,
    namespace,
    variant: "default",
    summary: namespace === "article" ? `Offline page: ${title}` : `${namespace} page: ${title}`,
    headings: [title],
    tags: [namespace, ...relativePath.split("/").filter(Boolean).slice(0, 4)]
  };
});

const miniSearch = new MiniSearch({
  idField: "pageId",
  fields: ["title", "summary", "headings", "tags"],
  storeFields: ["pageId", "title", "path", "namespace", "summary", "tags"],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2
  }
});
miniSearch.addAll(documents);

const generatedRoot = path.join(sourceRoot, generatedDirName);
fs.mkdirSync(generatedRoot, { recursive: true });
fs.writeFileSync(path.join(generatedRoot, "content-manifest.json"), JSON.stringify(documents, null, 2));
fs.writeFileSync(path.join(generatedRoot, "search-index.json"), JSON.stringify(miniSearch.toJSON()));

const contentPackManifest = {
  contentVersion,
  sourceSnapshotDate: snapshotDate,
  indexVersion,
  entryPage: `/${HOME_FILE}`,
  releaseChannel: "snapshot",
  generatedAt: new Date().toISOString(),
  checksum: crypto.createHash("sha1").update(JSON.stringify({ count: documents.length, contentVersion, snapshotDate })).digest("hex")
};
fs.writeFileSync(path.join(generatedRoot, "content-pack-manifest.json"), JSON.stringify(contentPackManifest, null, 2));
fs.writeFileSync(path.join(outDir, "content-build-summary.json"), JSON.stringify({
  contentVersion,
  snapshotDate,
  pageCount: documents.length,
  namespaceCounts: documents.reduce((acc, doc) => {
    acc[doc.namespace] = (acc[doc.namespace] || 0) + 1;
    return acc;
  }, {})
}, null, 2));
console.log(`Built content manifest and search index for ${documents.length} pages.`);
