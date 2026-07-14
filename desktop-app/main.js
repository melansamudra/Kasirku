const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store");
const XLSX = require("xlsx");

// Satu-satunya penyimpanan data — file JSON lokal di folder data user OS
// (mis. %APPDATA%/kalkulator-hpp-desktop di Windows). Tidak ada server, tidak
// ada internet yang dipanggil sama sekali dari sini.
const store = new Store({
  name: "kalkulator-hpp-data",
  defaults: { ingredients: [], menuItems: [], bundles: [] },
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("data:get", () => store.store);
ipcMain.handle("data:set", (_event, data) => {
  store.set(data);
  return true;
});

// Import bahan baku dari file Excel/CSV — dibaca & di-parse di main process
// (renderer tidak punya akses filesystem/require langsung karena
// nodeIntegration: false), lalu hasilnya dikirim balik sebagai array biasa.
ipcMain.handle("dialog:importExcel", async () => {
  const result = await dialog.showOpenDialog({
    title: "Import Bahan Baku dari Excel",
    filters: [{ name: "Excel/CSV", extensions: ["xlsx", "xls", "csv"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const workbook = XLSX.readFile(result.filePaths[0]);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const findKey = (rowKeys, patterns) =>
    rowKeys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));

  return rows
    .map((row) => {
      const keys = Object.keys(row);
      const nameKey = findKey(keys, ["nama", "name", "bahan"]);
      const unitKey = findKey(keys, ["satuan", "unit"]);
      const costKey = findKey(keys, ["harga", "cost", "price"]);
      return {
        name: nameKey ? String(row[nameKey]).trim() : "",
        unit: unitKey ? String(row[unitKey]).trim() : "",
        unitCost: costKey ? Number(row[costKey]) || 0 : 0,
      };
    })
    .filter((r) => r.name);
});

// Download HPP Menu — tabel menu (dengan HPP/harga jual/margin yang sudah
// dihitung di renderer) diekspor jadi satu file Excel.
ipcMain.handle("dialog:exportMenuHpp", async (_event, rows) => {
  const result = await dialog.showSaveDialog({
    title: "Download HPP Menu",
    defaultPath: "hpp-menu.xlsx",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };

  const sheetRows = rows.map((r) => ({
    Menu: r.name,
    Kategori: r.category || "-",
    "Total HPP": r.hpp,
    "Harga Jual": r.sellingPrice,
    "% HPP": r.hppPercent,
    Margin: r.marginPercent,
  }));
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "HPP Menu");
  XLSX.writeFile(workbook, result.filePath);
  return { ok: true, filePath: result.filePath };
});

// Backup — seluruh data (bahan baku, menu, paket) ditulis ke satu file JSON
// yang bisa dipulihkan kembali lewat "Pulihkan Data".
ipcMain.handle("dialog:backupData", async () => {
  const result = await dialog.showSaveDialog({
    title: "Backup Data",
    defaultPath: `kalkulator-hpp-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };

  fs.writeFileSync(result.filePath, JSON.stringify(store.store, null, 2), "utf-8");
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("dialog:restoreData", async () => {
  const result = await dialog.showOpenDialog({
    title: "Pulihkan Data dari Backup",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };

  try {
    const raw = fs.readFileSync(result.filePaths[0], "utf-8");
    const data = JSON.parse(raw);
    if (
      !Array.isArray(data.ingredients) ||
      !Array.isArray(data.menuItems) ||
      !Array.isArray(data.bundles)
    ) {
      return { ok: false, error: "Format file backup tidak dikenali." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "File tidak bisa dibaca — pastikan ini file backup JSON yang valid." };
  }
});
