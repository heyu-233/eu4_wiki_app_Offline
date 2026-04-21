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

if (!fs.existsSync(manifestPath)) {
  throw new Error("Missing content manifest. Run npm run build:content first.");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync(artifactsDir, { recursive: true });

const zipName = `eu4wiki-content-${manifest.contentVersion}.zip`;
const zipPath = path.join(artifactsDir, zipName);
if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}

if (fs.existsSync(sevenZipPath)) {
  const result = spawnSync(sevenZipPath, [
    "a",
    "-tzip",
    "-mx=0",
    zipPath,
    "."
  ], {
    cwd: sourceRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`7za failed with exit code ${result.status}`);
  }
} else {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceRoot);
  zip.writeZip(zipPath);
}

const fileBuffer = fs.readFileSync(zipPath);
const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
fs.writeFileSync(path.join(artifactsDir, "checksums.txt"), `${hash}  ${zipName}\n`, "utf8");
console.log(`Packed content archive: ${zipPath}`);
