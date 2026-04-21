const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { getImportedContentRoot } = require("./content-manager");

const HOME_FILE = "\u9996\u9875.html";
const NO_ARTICLE_PAGE = path.join("wiki", "Special_\u641c\u7d22", "Noarticletext.html");

function createWikiServer() {
  const app = express();
  const contentRoot = getImportedContentRoot();

  if (!contentRoot || !fs.existsSync(contentRoot)) {
    throw new Error("Cannot start wiki server without a content root.");
  }

  app.use((req, _res, next) => {
    const decoded = decodeURIComponent(req.path || "/");
    if (decoded === "/") {
      req.url = `/${HOME_FILE}`;
      return next();
    }

    const localFromWiki = decoded.startsWith("/wiki/") ? decoded.slice(5) : decoded;
    const candidateHtml = path.join(contentRoot, localFromWiki);
    const candidateRaw = path.join(contentRoot, decoded.replace(/^\//, ""));

    if (decoded.startsWith("/wiki/") && fs.existsSync(candidateHtml)) {
      req.url = `/${localFromWiki}`;
      return next();
    }

    if (fs.existsSync(candidateRaw)) {
      return next();
    }

    if (decoded.startsWith("/") && !path.extname(decoded)) {
      const htmlTarget = `${decoded}.html`;
      const htmlPath = path.join(contentRoot, htmlTarget.replace(/^\//, ""));
      if (fs.existsSync(htmlPath)) {
        req.url = htmlTarget;
      }
    }

    next();
  });

  app.use(express.static(contentRoot, {
    extensions: ["html"],
    fallthrough: true,
    index: false
  }));

  app.use((req, res) => {
    res.status(404).sendFile(path.join(contentRoot, NO_ARTICLE_PAGE), (error) => {
      if (error) {
        res.status(404).send("Page not found in offline snapshot.");
      }
    });
  });

  return app;
}

function startWikiServer() {
  const app = createWikiServer();
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
    server.on("error", reject);
  });
}

module.exports = {
  startWikiServer
};
