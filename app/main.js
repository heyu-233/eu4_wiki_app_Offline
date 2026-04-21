const { app, BrowserWindow, ipcMain, dialog, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { startWikiServer } = require("./lib/server");
const { checkContentStatus, importContentPack, getCompatibilityManifest } = require("./lib/content-manager");
const { search } = require("./lib/search-manager");
const { getStore, addHistory, toggleFavorite } = require("./lib/store");
const { APP_NAME, DEFAULT_ENTRY_PAGE } = require("./config/defaults");

let mainWindow = null;
let wikiServer = null;
let interceptInstalled = false;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      webviewTag: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

async function ensureServer() {
  if (wikiServer) {
    return wikiServer;
  }
  const status = checkContentStatus();
  if (!status.ok && status.reason !== "version-mismatch") {
    return null;
  }
  wikiServer = await startWikiServer();
  installUrlInterceptors();
  return wikiServer;
}

function installUrlInterceptors() {
  if (interceptInstalled || !wikiServer) {
    return;
  }

  const filter = {
    urls: [
      "https://www.eu4cn.com/*",
      "http://www.eu4cn.com/*",
      "https://eu4cn.com/*",
      "http://eu4cn.com/*"
    ]
  };

  const redirectHandler = (details, callback) => {
    try {
      const parsed = new URL(details.url);
      callback({ redirectURL: `${wikiServer.baseUrl}${parsed.pathname}${parsed.search}` });
    } catch {
      callback({});
    }
  };

  session.defaultSession.webRequest.onBeforeRequest(filter, redirectHandler);
  session.fromPartition("persist:eu4wiki").webRequest.onBeforeRequest(filter, redirectHandler);
  interceptInstalled = true;
}

function buildUrlForPath(targetPath) {
  if (!wikiServer) {
    return null;
  }
  const cleanPath = targetPath || DEFAULT_ENTRY_PAGE;
  return `${wikiServer.baseUrl}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (wikiServer?.server) {
    wikiServer.server.close();
  }
});

ipcMain.handle("content.checkStatus", async () => {
  const status = checkContentStatus();
  if (status.ok || status.reason === "version-mismatch") {
    await ensureServer();
  }
  return {
    ...status,
    currentUrl: wikiServer ? buildUrlForPath(status.entryPage || DEFAULT_ENTRY_PAGE) : null
  };
});

ipcMain.handle("content.importPack", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select EU4 Wiki content pack",
    filters: [{ name: "ZIP files", extensions: ["zip"] }],
    properties: ["openFile"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const status = importContentPack(result.filePaths[0]);
  if (wikiServer?.server) {
    wikiServer.server.close();
    wikiServer = null;
  }
  await ensureServer();
  return {
    canceled: false,
    ...status,
    currentUrl: wikiServer ? buildUrlForPath(status.entryPage || DEFAULT_ENTRY_PAGE) : null
  };
});

ipcMain.handle("search.query", async (_event, { q, filters }) => search(q, filters));

ipcMain.handle("reader.open", async (_event, payload) => {
  await ensureServer();
  return {
    url: buildUrlForPath(payload?.path || DEFAULT_ENTRY_PAGE)
  };
});

ipcMain.handle("reader.pageLoaded", async (_event, payload) => {
  addHistory(payload);
  return { ok: true };
});

ipcMain.handle("settings.getReleaseInfo", async () => {
  const releaseManifestPath = path.join(process.resourcesPath, "manifests", "release-manifest.json");
  const releaseInfo = fs.existsSync(releaseManifestPath)
    ? JSON.parse(fs.readFileSync(releaseManifestPath, "utf8"))
    : { notes: "Release manifest not bundled in dev mode." };
  return {
    compatibility: getCompatibilityManifest(),
    releaseInfo
  };
});

ipcMain.handle("settings.getState", async () => {
  const store = getStore();
  return {
    favorites: store.get("favorites", []),
    history: store.get("history", []),
    theme: store.get("theme", "system"),
    lastPath: store.get("lastPath", null)
  };
});

ipcMain.handle("settings.toggleFavorite", async (_event, entry) => ({
  favorite: toggleFavorite(entry)
}));

ipcMain.handle("settings.setTheme", async (_event, theme) => {
  getStore().set("theme", theme);
  return { ok: true };
});

ipcMain.handle("shell.openExternal", async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});
