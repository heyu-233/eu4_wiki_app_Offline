const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const outDir = path.join(root, "scripts", "generated");
const contentBuildSummary = JSON.parse(fs.readFileSync(path.join(outDir, "content-build-summary.json"), "utf8"));

fs.mkdirSync(outDir, { recursive: true });

const appManifest = {
  appVersion: packageJson.version,
  supportedContentVersions: [contentBuildSummary.contentVersion],
  minContentVersion: contentBuildSummary.contentVersion,
  buildDate: new Date().toISOString()
};

const releaseManifest = {
  summary: "Windows-first offline desktop reader for the EU4 Chinese wiki snapshot.",
  appVersion: packageJson.version,
  contentVersion: contentBuildSummary.contentVersion,
  pageCount: contentBuildSummary.pageCount,
  sourceSnapshotDate: contentBuildSummary.snapshotDate,
  releaseFiles: [
    `EU4 Wiki Offline-${packageJson.version}-Setup.exe`,
    `eu4wiki-content-${contentBuildSummary.contentVersion}.zip`
  ],
  notes: [
    "Publish the app installer and content pack together.",
    "Attach SHA256 checksums for every downloadable file.",
    "Describe this as an offline desktop reader, not an official mirror."
  ]
};

const releaseNotes = `# EU4 Wiki Offline ${packageJson.version}

## 下载内容

- 安装包: \`EU4 Wiki Offline-${packageJson.version}-Setup.exe\`
- 内容包: \`eu4wiki-content-${contentBuildSummary.contentVersion}.zip\`
- 内容来源快照日期: \`${contentBuildSummary.snapshotDate}\`

## 安装步骤

1. 安装桌面程序
2. 首次启动后导入内容包
3. 如果提示版本不兼容，请下载与当前 App 版本匹配的内容包

## 校验

- 在帖子、网盘或 GitHub Release 中附带 SHA256
- 同时附带 \`release-manifest.json\`

## 声明

- 本项目是离线桌面阅读整理版，不是官方镜像
- 请保留原站署名与来源说明
`;

fs.writeFileSync(path.join(outDir, "app-manifest.json"), JSON.stringify(appManifest, null, 2));
fs.writeFileSync(path.join(outDir, "release-manifest.json"), JSON.stringify(releaseManifest, null, 2));
fs.writeFileSync(path.join(outDir, "release-notes-template.md"), releaseNotes);
console.log("Generated app and release manifests.");
