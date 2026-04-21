const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const AdmZip = require("adm-zip");
const { app } = require("electron");
const { getStore } = require("./store");
const { DEFAULT_ENTRY_PAGE, DEFAULT_COMPATIBILITY, getBundledManifestPath } = require("../config/defaults");

const HOME_FILE = "\u9996\u9875.html";

function readJsonIfExists(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function getUserDataDir() {
  return path.join(app.getPath("userData"), "content");
}

function getImportedContentRoot() {
  const store = getStore();
  const saved = store.get("importedContentRoot");
  if (saved && fs.existsSync(saved)) {
    return saved;
  }

  const devFallback = path.join(app.getAppPath(), "www.eu4cn.com");
  if (fs.existsSync(devFallback)) {
    return devFallback;
  }

  return null;
}

function getCompatibilityManifest() {
  const bundledPath = getBundledManifestPath(process.resourcesPath);
  const bundled = readJsonIfExists(bundledPath);
  return bundled || DEFAULT_COMPATIBILITY;
}

function getContentMetadata(contentRoot) {
  const generatedDir = path.join(contentRoot, ".eu4offline");
  const manifestPath = path.join(generatedDir, "content-pack-manifest.json");
  const contentManifestPath = path.join(generatedDir, "content-manifest.json");
  const searchIndexPath = path.join(generatedDir, "search-index.json");
  return {
    generatedDir,
    manifestPath,
    contentManifestPath,
    searchIndexPath,
    manifest: readJsonIfExists(manifestPath),
    contentManifest: readJsonIfExists(contentManifestPath)
  };
}

function calculateFileHash(targetPath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(targetPath));
  return hash.digest("hex");
}

function checkContentStatus() {
  const contentRoot = getImportedContentRoot();
  const compatibility = getCompatibilityManifest();
  if (!contentRoot) {
    return {
      ok: false,
      reason: "missing",
      message: "No content pack installed.",
      compatibility
    };
  }

  const metadata = getContentMetadata(contentRoot);
  const expectedFiles = [
    path.join(contentRoot, HOME_FILE),
    metadata.manifestPath,
    metadata.contentManifestPath,
    metadata.searchIndexPath
  ];
  const missingFiles = expectedFiles.filter((target) => !fs.existsSync(target));
  if (missingFiles.length) {
    return {
      ok: false,
      reason: "incomplete",
      message: "Installed content pack is incomplete.",
      contentRoot,
      compatibility,
      missingFiles
    };
  }

  const contentVersion = metadata.manifest?.contentVersion;
  const versionSupported = compatibility.supportedContentVersions.includes(contentVersion);
  return {
    ok: versionSupported,
    reason: versionSupported ? "ready" : "version-mismatch",
    message: versionSupported ? "Content pack ready." : "Content pack version is not supported by this app build.",
    contentRoot,
    compatibility,
    entryPage: metadata.manifest?.entryPage || DEFAULT_ENTRY_PAGE,
    contentVersion,
    sourceSnapshotDate: metadata.manifest?.sourceSnapshotDate,
    releaseChannel: metadata.manifest?.releaseChannel || "snapshot",
    manifestHash: calculateFileHash(metadata.manifestPath)
  };
}

function ensureUserContentDir() {
  const target = getUserDataDir();
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function validateContentRoot(candidateRoot) {
  const metadata = getContentMetadata(candidateRoot);
  const expectedFiles = [
    path.join(candidateRoot, HOME_FILE),
    metadata.manifestPath,
    metadata.contentManifestPath,
    metadata.searchIndexPath
  ];
  const missingFiles = expectedFiles.filter((target) => !fs.existsSync(target));
  if (missingFiles.length) {
    throw new Error(`Selected content folder is incomplete: ${missingFiles.join(", ")}`);
  }
  return metadata;
}

function importContentPack(zipPath) {
  const destinationRoot = ensureUserContentDir();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eu4-content-"));
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  const manifestPath = path.join(tempDir, ".eu4offline", "content-pack-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Selected file is not a valid content pack.");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const targetDir = path.join(destinationRoot, manifest.contentVersion);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(tempDir, { withFileTypes: true })) {
    const source = path.join(tempDir, entry.name);
    const dest = path.join(targetDir, entry.name);
    fs.cpSync(source, dest, { recursive: true });
  }

  getStore().set("importedContentRoot", targetDir);
  fs.rmSync(tempDir, { recursive: true, force: true });

  return checkContentStatus();
}

function importContentDirectory(contentRoot) {
  validateContentRoot(contentRoot);
  getStore().set("importedContentRoot", contentRoot);
  return checkContentStatus();
}

module.exports = {
  checkContentStatus,
  getImportedContentRoot,
  getContentMetadata,
  getCompatibilityManifest,
  importContentPack,
  importContentDirectory
};
