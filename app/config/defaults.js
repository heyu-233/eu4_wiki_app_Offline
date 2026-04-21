const path = require("node:path");

const APP_ID = "eu4-wiki-offline";
const APP_NAME = "EU4 Wiki Offline";
const DEFAULT_ENTRY_PAGE = "/%E9%A6%96%E9%A1%B5.html";
const DEFAULT_COMPATIBILITY = {
  appVersion: "0.1.0",
  supportedContentVersions: ["2024.11.11-snapshot.1"],
  minContentVersion: "2024.11.11-snapshot.1",
  buildDate: new Date().toISOString()
};

function getBundledManifestPath(processResourcesPath) {
  return path.join(processResourcesPath, "manifests", "app-manifest.json");
}

module.exports = {
  APP_ID,
  APP_NAME,
  DEFAULT_ENTRY_PAGE,
  DEFAULT_COMPATIBILITY,
  getBundledManifestPath
};
