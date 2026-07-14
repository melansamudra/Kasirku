const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getData: () => ipcRenderer.invoke("data:get"),
  setData: (data) => ipcRenderer.invoke("data:set", data),
  importExcel: () => ipcRenderer.invoke("dialog:importExcel"),
  exportMenuHpp: (rows) => ipcRenderer.invoke("dialog:exportMenuHpp", rows),
  backupData: () => ipcRenderer.invoke("dialog:backupData"),
  restoreData: () => ipcRenderer.invoke("dialog:restoreData"),
});
