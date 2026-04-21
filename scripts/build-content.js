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
const indexVersion = "2";
const HOME_FILE = "首页.html";
const NOISE_NAMESPACES = new Set(["talk", "user"]);

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Source snapshot not found: ${sourceRoot}`);
}

fs.mkdirSync(outDir, { recursive: true });

function walk() {
  const acc = [];
  const rootEntries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  for (const item of rootEntries) {
    if (item.isFile() && item.name === HOME_FILE) {
      acc.push(path.join(sourceRoot, item.name));
    }
  }

  const wikiRoot = path.join(sourceRoot, "wiki");
  const wikiEntries = fs.readdirSync(wikiRoot, { withFileTypes: true });
  for (const item of wikiEntries) {
    if (!item.isFile() || !item.name.endsWith(".html")) {
      continue;
    }
    const namespace = classifyNamespace(item.name);
    if (["special", "template", "talk", "user", "mediawiki", "file"].includes(namespace)) {
      continue;
    }
    acc.push(path.join(wikiRoot, item.name));
  }

  return acc;
}

function classifyNamespace(relativePath) {
  const fileName = relativePath.split(/[\\/]/).pop() || "";
  if (/^Special[_:]/i.test(fileName)) return "special";
  if (/^Template[_:]/i.test(fileName)) return "template";
  if (/^Talk[_:]/i.test(fileName)) return "talk";
  if (/^User[_:]/i.test(fileName)) return "user";
  if (/^Project[_:]/i.test(fileName) || /^欧陆风云4百科_/i.test(fileName)) return "project";
  if (/^Category[_:]/i.test(fileName)) return "category";
  if (/^File[_:]/i.test(fileName)) return "file";
  if (/^MediaWiki[_:]/i.test(fileName)) return "mediawiki";
  return "article";
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripHtml(html) {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripInlineHtml(html) {
  return decodeEntities(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html, name) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
}

function extractTitle(html, fallback) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = titleMatch ? stripInlineHtml(titleMatch[1]) : fallback;
  return raw
    .replace(/\s+-\s+欧陆风云4百科.*$/i, "")
    .replace(/\s+-\s+.*wiki.*$/i, "")
    .trim() || fallback;
}

function extractHeadings(html) {
  return [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => stripInlineHtml(match[2]))
    .filter(Boolean)
    .slice(0, 8);
}

function extractPreview(html) {
  const paragraphMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (paragraphMatch) {
    return stripInlineHtml(paragraphMatch[1]).slice(0, 220);
  }
  return "";
}

function extractKeywords(relativePath, title, headings) {
  const pathBits = relativePath
    .replace(/\.html$/i, "")
    .split(/[\/_]/)
    .map((item) => decodeURIComponent(item))
    .filter(Boolean);

  const titleBits = title
    .split(/[()（）:：\-—,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set([...titleBits, ...headings, ...pathBits])].slice(0, 40);
}

function buildDocument(filePath) {
  const relativePath = path.relative(sourceRoot, filePath).replaceAll("\\", "/");
  const namespace = classifyNamespace(relativePath);
  const title = decodeURIComponent((relativePath.split("/").pop() || relativePath).replace(/\.html$/i, "")).replace(/_/g, " ");
  const headings = [title];
  const preview = `${namespace === "article" ? "词条" : "页面"}：${title}`;
  const summary = preview.slice(0, 220);
  const text = NOISE_NAMESPACES.has(namespace) ? "" : `${title} ${summary}`.trim();
  const keywords = extractKeywords(relativePath, title, headings);

  return {
    pageId: crypto.createHash("sha1").update(relativePath).digest("hex"),
    title,
    path: `/${relativePath}`,
    namespace,
    variant: /zh-(cn|hans|hant|hk|tw)/i.test(relativePath) ? RegExp.$1 : "default",
    summary,
    headings,
    keywords,
    preview: preview || summary,
    text
  };
}

const htmlFiles = walk();
const documents = htmlFiles.map(buildDocument);

const miniSearch = new MiniSearch({
  idField: "pageId",
  fields: ["title", "summary", "headings", "keywords", "text"],
  storeFields: ["pageId", "title", "path", "namespace", "summary", "keywords", "preview"],
  searchOptions: {
    prefix: true,
    fuzzy: 0.15,
    boost: {
      title: 8,
      keywords: 5,
      headings: 4,
      summary: 2,
      text: 1
    }
  }
});
miniSearch.addAll(documents);

const generatedRoot = path.join(sourceRoot, generatedDirName);
fs.mkdirSync(generatedRoot, { recursive: true });
fs.writeFileSync(path.join(generatedRoot, "content-manifest.json"), JSON.stringify(documents.map(({ text, ...doc }) => doc), null, 2));
fs.writeFileSync(path.join(generatedRoot, "search-index.json"), JSON.stringify(miniSearch.toJSON()));

const contentPackManifest = {
  contentVersion,
  sourceSnapshotDate: snapshotDate,
  indexVersion,
  entryPage: `/${HOME_FILE}`,
  releaseChannel: "snapshot",
  generatedAt: new Date().toISOString(),
  checksum: crypto.createHash("sha1").update(JSON.stringify({ count: documents.length, contentVersion, snapshotDate, indexVersion })).digest("hex")
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
