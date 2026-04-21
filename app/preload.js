const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eu4Api", {
  content: {
    checkStatus: () => ipcRenderer.invoke("content.checkStatus"),
    importPack: () => ipcRenderer.invoke("content.importPack")
  },
  search: {
    query: (q, filters) => ipcRenderer.invoke("search.query", { q, filters })
  },
  reader: {
    open: (payload) => ipcRenderer.invoke("reader.open", payload),
    pageLoaded: (payload) => ipcRenderer.invoke("reader.pageLoaded", payload)
  },
  settings: {
    getReleaseInfo: () => ipcRenderer.invoke("settings.getReleaseInfo"),
    getState: () => ipcRenderer.invoke("settings.getState"),
    toggleFavorite: (entry) => ipcRenderer.invoke("settings.toggleFavorite", entry),
    setTheme: (theme) => ipcRenderer.invoke("settings.setTheme", theme)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell.openExternal", url)
  }
});
