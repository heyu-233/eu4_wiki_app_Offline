const searchInput = document.getElementById("search-input");
const namespaceFilter = document.getElementById("namespace-filter");
const includeNoise = document.getElementById("include-noise");
const resultsEl = document.getElementById("search-results");
const historyEl = document.getElementById("history-list");
const favoritesEl = document.getElementById("favorites-list");
const releaseInfoEl = document.getElementById("release-info");
const setupPanel = document.getElementById("setup-panel");
const setupMessage = document.getElementById("setup-message");
const setupChecks = document.getElementById("setup-checks");
const importButton = document.getElementById("import-button");
const viewerPanel = document.getElementById("viewer-panel");
const webview = document.getElementById("wiki-view");
const addressBar = document.getElementById("address-bar");
const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");
const homeButton = document.getElementById("home-button");
const favoriteButton = document.getElementById("favorite-button");
const themeSelect = document.getElementById("theme-select");

let currentPage = null;
let currentStatus = null;
let currentState = { favorites: [], history: [], theme: "system" };

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "system" ? "" : theme;
  themeSelect.value = theme || "system";
}

function renderMetaList(status, release) {
  const compatibility = release.compatibility || {};
  const info = release.releaseInfo || {};
  releaseInfoEl.innerHTML = [
    `<div><strong>App 版本</strong><br>${escapeHtml(compatibility.appVersion || "dev")}</div>`,
    `<div><strong>支持内容包</strong><br>${escapeHtml((compatibility.supportedContentVersions || []).join(", ") || "n/a")}</div>`,
    `<div><strong>当前内容包</strong><br>${escapeHtml(status?.contentVersion || "未安装")}</div>`,
    `<div><strong>说明</strong><br>${escapeHtml(info.summary || "公开发布时请附带 release-manifest.json 与校验码。")}</div>`
  ].join("");
}

function renderLinkList(container, items, emptyText) {
  if (!items.length) {
    container.innerHTML = `<div class="link-item"><small>${escapeHtml(emptyText)}</small></div>`;
    return;
  }
  container.innerHTML = items.map((item) => `
    <div class="link-item">
      <button data-path="${escapeHtml(item.path)}" data-title="${escapeHtml(item.title || item.path)}">
        <strong>${escapeHtml(item.title || item.path)}</strong>
        <small>${escapeHtml(item.path)}</small>
      </button>
    </div>
  `).join("");
}

async function refreshState() {
  currentState = await window.eu4Api.settings.getState();
  renderLinkList(historyEl, currentState.history || [], "暂无浏览历史");
  renderLinkList(favoritesEl, currentState.favorites || [], "暂无收藏页面");
  applyTheme(currentState.theme || "system");
}

function showSetup(status) {
  currentStatus = status;
  setupPanel.classList.remove("hidden");
  viewerPanel.classList.add("hidden");
  setupMessage.textContent = status?.message || "未检测到可用内容包。";
  const checks = [];
  if (status?.compatibility) {
    checks.push(`当前 App 支持内容版本: ${(status.compatibility.supportedContentVersions || []).join(", ")}`);
  }
  if (status?.missingFiles?.length) {
    checks.push(`缺少文件: ${status.missingFiles.slice(0, 5).join(", ")}`);
  }
  if (status?.contentVersion) {
    checks.push(`检测到内容包版本: ${status.contentVersion}`);
  }
  if (status?.reason === "version-mismatch") {
    checks.push("当前内容包版本与应用不兼容，请导入匹配版本。");
  }
  setupChecks.innerHTML = checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function showViewer() {
  setupPanel.classList.add("hidden");
  viewerPanel.classList.remove("hidden");
}

async function openPath(targetPath) {
  const response = await window.eu4Api.reader.open({ path: targetPath });
  if (response?.url) {
    showViewer();
    webview.src = response.url;
    addressBar.textContent = response.url;
  }
}

function parseTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() || "");
  } catch {
    return url;
  }
}

async function boot() {
  const status = await window.eu4Api.content.checkStatus();
  await refreshState();
  const release = await window.eu4Api.settings.getReleaseInfo();

  renderMetaList(status, release);

  if (!status.ok) {
    showSetup(status);
    return;
  }

  currentStatus = status;
  await openPath(status.entryPage || "/首页.html");
}

searchInput.addEventListener("input", async () => {
  const q = searchInput.value.trim();
  if (!q) {
    resultsEl.innerHTML = "";
    return;
  }
  const results = await window.eu4Api.search.query(q, {
    namespace: namespaceFilter.value,
    includeNonArticle: includeNoise.checked
  });
  resultsEl.innerHTML = results.length
    ? results.map((item) => `
      <div class="result-item">
        <button data-path="${escapeHtml(item.path)}" data-title="${escapeHtml(item.title)}">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.summary || item.path)}</small>
        </button>
      </div>
    `).join("")
    : `<div class="result-item"><small>没有找到匹配结果。</small></div>`;
});

resultsEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-path]");
  if (!button) {
    return;
  }
  openPath(button.dataset.path);
});

historyEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-path]");
  if (button) {
    openPath(button.dataset.path);
  }
});

favoritesEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-path]");
  if (button) {
    openPath(button.dataset.path);
  }
});

importButton.addEventListener("click", async () => {
  const result = await window.eu4Api.content.importPack();
  if (result?.canceled) {
    return;
  }
  await refreshState();
  renderMetaList(result, await window.eu4Api.settings.getReleaseInfo());
  if (result.ok) {
    currentStatus = result;
    await openPath(result.entryPage || "/首页.html");
  } else {
    showSetup(result);
  }
});

backButton.addEventListener("click", () => {
  if (webview.canGoBack()) {
    webview.goBack();
  }
});

forwardButton.addEventListener("click", () => {
  if (webview.canGoForward()) {
    webview.goForward();
  }
});

homeButton.addEventListener("click", () => openPath((currentStatus && currentStatus.entryPage) || "/首页.html"));

favoriteButton.addEventListener("click", async () => {
  if (!currentPage) {
    return;
  }
  await window.eu4Api.settings.toggleFavorite(currentPage);
  await refreshState();
});

themeSelect.addEventListener("change", async () => {
  await window.eu4Api.settings.setTheme(themeSelect.value);
  applyTheme(themeSelect.value);
});

webview.addEventListener("did-navigate", async (event) => {
  addressBar.textContent = event.url;
  currentPage = {
    title: parseTitleFromUrl(event.url),
    path: decodeURIComponent(new URL(event.url).pathname)
  };
  await window.eu4Api.reader.pageLoaded(currentPage);
  await refreshState();
});

webview.addEventListener("dom-ready", () => {
  webview.insertCSS(`
    #ca-history,
    #ca-viewsource,
    #pt-login,
    #pt-createaccount,
    #t-info,
    #t-cargopagevalueslink {
      display: none !important;
    }
  `).catch(() => {});
});

webview.addEventListener("will-navigate", (event) => {
  if (!event.url.startsWith("http://127.0.0.1:")) {
    event.preventDefault();
    window.eu4Api.shell.openExternal(event.url);
  }
});

webview.addEventListener("new-window", (event) => {
  if (event.url) {
    window.eu4Api.shell.openExternal(event.url);
  }
});

boot().catch((error) => {
  showSetup({ message: error.message || "Failed to boot application." });
});
