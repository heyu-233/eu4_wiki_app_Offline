const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = process.env.EU4_SOURCE_ROOT || path.join(root, "www.eu4cn.com");
const checks = [
  path.join(sourceRoot, "首页.html"),
  path.join(sourceRoot, ".eu4offline", "content-pack-manifest.json"),
  path.join(sourceRoot, ".eu4offline", "content-manifest.json"),
  path.join(sourceRoot, ".eu4offline", "search-index.json")
];

const missing = checks.filter((target) => !fs.existsSync(target));
if (missing.length) {
  console.error("Missing required content files:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

const contentManifest = JSON.parse(fs.readFileSync(checks[2], "utf8"));
console.log(`Verified content package prerequisites. Indexed pages: ${contentManifest.length}`);
