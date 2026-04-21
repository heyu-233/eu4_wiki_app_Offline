const searchInput = document.getElementById("search-input");
const clearSearchButton = document.getElementById("clear-search-button");
const namespaceFilter = document.getElementById("namespace-filter");
const includeNoise = document.getElementById("include-noise");
const resultsEl = document.getElementById("search-results");
const searchSummaryEl = document.getElementById("search-summary");
const searchStatusEl = document.getElementById("search-status");
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
const overviewTitle = document.getElementById("overview-title");
const overviewCopy = document.getElementById("overview-copy");
const currentPackEl = document.getElementById("current-pack");
const supportedPackEl = document.getElementById("supported-pack");
const resultCountEl = document.getElementById("result-count");

let currentPage = null;
let currentStatus = null;
let currentState = { favorites: [], history: [], theme: "system" };
let latestQuery = "";
let searchTimer = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function namespaceLabel(namespace) {
  switch (namespace) {
    case "article": return "词条";
    case "special": return "特殊页";
    case "template": return "模板";
    case "project": return "项目页";
    case "talk": return "讨论页";
    case "user": return "用户页";
    default: return namespace || "页面";
  }
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "system" ? "" : theme;
  themeSelect.value = theme || "system";
}

function setOverview(status, extra = {}) {
  currentPackEl.textContent = status?.contentVersion || "未加载";
  supportedPackEl.textContent = (status?.compatibility?.supportedContentVersions || []).join(", ") || "--";
  if (extra.title) {
    overviewTitle.textContent = extra.title;
  } else if (status?.ok) {
    overviewTitle.textContent = "档案已接入，开始检索或继续阅读";
  } else {
    overviewTitle.textContent = "等待挂载内容包";
  }

  if (extra.copy) {
    overviewCopy.textContent = extra.copy;
  } else if (status?.ok) {
    overviewCopy.textContent = `当前内容版本 ${status.contentVersion || "未知"}，可以直接按国家、任务、机制或英文关键字检索。`;
  } else {
    overviewCopy.textContent = status?.message || "还没有可用内容，请先导入内容包。";
  }
}

function renderMetaList(status, release) {
  const compatibility = release.compatibility || {};
  const info = release.releaseInfo || {};
  releaseInfoEl.innerHTML = [
    `<div><strong>App 版本</strong><br>${escapeHtml(compatibility.appVersion || "dev")}</div>`,
    `<div><strong>支持内容版本</strong><br>${escapeHtml((compatibility.supportedContentVersions || []).join(", ") || "n/a")}</div>`,
    `<div><strong>当前内容包</strong><br>${escapeHtml(status?.contentVersion || "未安装")}</div>`,
    `<div><strong>发布说明</strong><br>${escapeHtml(info.summary || "公开发布时请附带 release-manifest.json 与校验值。")}</div>`
  ].join("");
}

function renderLinkList(container, items, emptyText) {
  if (!items.length) {
    container.innerHTML = `<div class="link-item"><button type="button" disabled><span class="link-title">${escapeHtml(emptyText)}</span></button></div>`;
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="link-item">
      <button data-path="${escapeHtml(item.path)}" data-title="${escapeHtml(item.title || item.path)}">
        <span class="link-title">${escapeHtml(item.title || item.path)}</span>
        <span class="link-meta">${escapeHtml(item.path)}</span>
      </button>
    </div>
  `).join("");
}

async function refreshState() {
  currentState = await window.eu4Api.settings.getState();
  renderLinkList(historyEl, currentState.history || [], "还没有浏览记录");
  renderLinkList(favoritesEl, currentState.favorites || [], "还没有收藏页面");
  applyTheme(currentState.theme || "system");
}

function showSetup(status) {
  currentStatus = status;
  setOverview(status);
  setupPanel.classList.remove("hidden");
  viewerPanel.classList.add("hidden");
  setupMessage.textContent = status?.message || "未检测到可用内容包。";
  const checks = [];
  if (status?.compatibility) {
    checks.push(`当前 App 支持内容版本：${(status.compatibility.supportedContentVersions || []).join(", ")}`);
  }
  if (status?.missingFiles?.length) {
    checks.push(`缺少文件：${status.missingFiles.slice(0, 5).join(", ")}`);
  }
  if (status?.contentVersion) {
    checks.push(`检测到内容包版本：${status.contentVersion}`);
  }
  if (status?.reason === "version-mismatch") {
    checks.push("当前内容包与应用不兼容，请导入与当前 App 匹配的版本。");
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

function renderResults(results, query) {
  resultCountEl.textContent = String(results.length);
  if (!query) {
    searchStatusEl.textContent = "待命";
    searchSummaryEl.textContent = "输入关键词后开始检索。";
    resultsEl.innerHTML = "";
    return;
  }

  searchStatusEl.textContent = results.length ? "已命中" : "无结果";
  searchSummaryEl.textContent = results.length
    ? `“${query}” 找到 ${results.length} 条结果，优先展示标题最接近的页面。`
    : `“${query}” 没有找到可用结果，试试中文、英文、简称或更短的词。`;

  resultsEl.innerHTML = results.length
    ? results.map((item) => `
      <div class="result-item">
        <button data-path="${escapeHtml(item.path)}" data-title="${escapeHtml(item.title)}">
          <div class="result-top">
            <span class="result-title">${escapeHtml(item.title)}</span>
            <span class="result-namespace">${escapeHtml(namespaceLabel(item.namespace))}</span>
          </div>
          <span class="result-meta">${escapeHtml(item.summary || item.path)}</span>
          <span class="result-meta">${escapeHtml(item.path)}</span>
        </button>
      </div>
    `).join("")
    : `<div class="result-item"><button type="button" disabled><span class="result-title">没有找到匹配结果</span><span class="result-meta">你可以尝试更短的关键词、英文名，或者切换到“全部页面”。</span></button></div>`;
}

async function runSearch(query) {
  latestQuery = query;
  const q = query.trim();
  if (!q) {
    renderResults([], "");
    return;
  }

  searchStatusEl.textContent = "检索中";
  const results = await window.eu4Api.search.query(q, {
    namespace: namespaceFilter.value,
    includeNonArticle: includeNoise.checked
  });

  if (latestQuery !== query) {
    return;
  }

  renderResults(results, q);
}

function queueSearch() {
  const query = searchInput.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(query), 120);
}

async function boot() {
  const status = await window.eu4Api.content.checkStatus();
  await refreshState();
  const release = await window.eu4Api.settings.getReleaseInfo();

  renderMetaList(status, release);
  setOverview(status);

  if (!status.ok) {
    showSetup(status);
    return;
  }

  currentStatus = status;
  await openPath(status.entryPage || "/首页.html");
}

searchInput.addEventListener("input", queueSearch);
namespaceFilter.addEventListener("change", queueSearch);
includeNoise.addEventListener("change", queueSearch);
clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.focus();
  renderResults([], "");
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
  setOverview(result);
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
  setOverview(currentStatus, {
    title: currentPage.title || "正在阅读",
    copy: `当前打开：${currentPage.path}`
  });
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
    body {
      scroll-behavior: smooth;
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
