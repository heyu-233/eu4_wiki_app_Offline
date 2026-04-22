const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const AdmZip = require("adm-zip");

const root = path.resolve(__dirname, "..");
const sourceRoot = process.env.EU4_SOURCE_ROOT || path.join(root, "www.eu4cn.com");
const artifactsDir = path.join(root, "artifacts");
const manifestPath = path.join(sourceRoot, ".eu4offline", "content-pack-manifest.json");
const sevenZipPath = path.join(root, "node_modules", "7zip-bin", "win", "x64", "7za.exe");
const packMode = (process.env.EU4_PACK_MODE || "core").toLowerCase();
const planOnly = process.argv.includes("--plan");

if (!fs.existsSync(manifestPath)) {
  throw new Error("Missing content manifest. Run npm run build:content first.");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync(artifactsDir, { recursive: true });

const zipName = `eu4wiki-content-${manifest.contentVersion}-${packMode}.zip`;
const zipPath = path.join(artifactsDir, zipName);
const listFilePath = path.join(artifactsDir, `pack-list-${packMode}.txt`);
const planPath = path.join(artifactsDir, `pack-plan-${packMode}.json`);
const checksumsPath = path.join(artifactsDir, "checksums.txt");

function toPosix(relativePath) {
  return relativePath.replaceAll("\\", "/");
}

function pushIfExists(entries, relativePath) {
  const fullPath = path.join(sourceRoot, relativePath);
  if (fs.existsSync(fullPath)) {
    entries.push(toPosix(relativePath));
  }
}

function collectWikiFiles(entries) {
  const wikiRoot = path.join(sourceRoot, "wiki");
  for (const item of fs.readdirSync(wikiRoot, { withFileTypes: true })) {
    if (!item.isFile() || !item.name.endsWith(".html")) {
      continue;
    }

    const isNoise = /^(Special|Talk|Template|User|MediaWiki|File)/i.test(item.name);
    if (packMode === "core" && isNoise) {
      continue;
    }
    entries.push(`wiki/${item.name}`);
  }
}

function collectDirectory(entries, relativeDir, filterFn = () => true) {
  const dirPath = path.join(sourceRoot, relativeDir);
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      const rel = toPosix(path.relative(sourceRoot, full));
      if (item.isDirectory()) {
        if (filterFn(rel, true)) {
          stack.push(full);
        }
        continue;
      }
      if (filterFn(rel, false)) {
        entries.push(rel);
      }
    }
  }
}

function buildEntryList() {
  const entries = [];

  for (const name of [
    "首页.html",
    "all.css",
    "liberty.css",
    "liberty.js",
    "skin=liberty.js",
    "skinliberty.css",
    "v4-shims.css"
  ]) {
    pushIfExists(entries, name);
  }

  collectDirectory(entries, ".eu4offline");
  collectDirectory(entries, "resources");

  if (packMode === "core") {
    collectDirectory(entries, "images", (rel) => !rel.includes("/archive/"));
  } else {
    collectDirectory(entries, "images");
  }

  collectWikiFiles(entries);
  return [...new Set(entries)];
}

function getPlan(entries) {
  let totalBytes = 0;
  for (const relativePath of entries) {
    const fullPath = path.join(sourceRoot, relativePath);
    totalBytes += fs.statSync(fullPath).size;
  }
  return {
    contentVersion: manifest.contentVersion,
    packMode,
    fileCount: entries.length,
    totalBytes,
    totalGiB: Number((totalBytes / (1024 ** 3)).toFixed(3)),
    outputFile: zipName
  };
}

function writeChecksums(zipFile) {
  const fileBuffer = fs.readFileSync(zipFile);
  const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const existing = fs.existsSync(checksumsPath) ? fs.readFileSync(checksumsPath, "utf8") : "";
  const filtered = existing
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.includes(path.basename(zipFile)));
  filtered.push(`${hash}  ${path.basename(zipFile)}`);
  fs.writeFileSync(checksumsPath, `${filtered.join("\n")}\n`, "utf8");
}

const entries = buildEntryList();
const plan = getPlan(entries);
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

if (planOnly) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

fs.writeFileSync(listFilePath, entries.join("\n"));

if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}

if (fs.existsSync(sevenZipPath)) {
  const result = spawnSync(sevenZipPath, [
    "a",
    "-tzip",
    "-mx=0",
    zipPath,
    `@${listFilePath}`
  ], {
    cwd: sourceRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`7za failed with exit code ${result.status}`);
  }
} else {
  const zip = new AdmZip();
  for (const relativePath of entries) {
    const fullPath = path.join(sourceRoot, relativePath);
    zip.addLocalFile(fullPath, path.dirname(relativePath));
  }
  zip.writeZip(zipPath);
}

writeChecksums(zipPath);
console.log(`Packed content archive: ${zipPath}`);
