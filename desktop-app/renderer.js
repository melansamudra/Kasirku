// Vanilla JS — sengaja tanpa framework, supaya app ini ringan & build-nya
// sederhana. Semua data lewat window.api (lihat preload.js), tidak ada
// fetch/network call sama sekali.

let state = { ingredients: [], menuItems: [], bundles: [] };

const expandedMenuIds = new Set();
const expandedBundleIds = new Set();
let activeCategory = null; // null = "Semua Menu"
let sidebarMessageTimer = null;

const SIDEBAR_DEFAULT_NOTE = "Data tersimpan lokal — tidak butuh internet.";
const NO_CATEGORY_LABEL = "Tanpa Kategori";

function uid() {
  return crypto.randomUUID();
}

function formatRupiah(value) {
  return `Rp${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function formatPercent(value) {
  return `${Math.round(value || 0)}%`;
}

function marginClass(marginPercent) {
  if (marginPercent >= 40) return "margin-good";
  if (marginPercent >= 20) return "margin-mid";
  return "margin-low";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function persist() {
  await window.api.setData(state);
  renderAll();
}

function showSidebarMessage(text, ms = 4000) {
  const target = document.getElementById("sidebar-message");
  target.textContent = text;
  clearTimeout(sidebarMessageTimer);
  sidebarMessageTimer = setTimeout(() => {
    target.textContent = SIDEBAR_DEFAULT_NOTE;
  }, ms);
}

// ---------- Perhitungan HPP ----------

function computeHpp(menuItem) {
  return menuItem.lines.reduce((sum, line) => {
    const ing = state.ingredients.find((i) => i.id === line.ingredientId);
    return sum + (ing ? line.qty * ing.unitCost : 0);
  }, 0);
}

function computeMenuMetrics(menuItem) {
  const hpp = computeHpp(menuItem);
  const sellingPrice = menuItem.sellingPrice || 0;
  const hppPercent = sellingPrice > 0 ? (hpp / sellingPrice) * 100 : 0;
  const marginPercent = sellingPrice > 0 ? ((sellingPrice - hpp) / sellingPrice) * 100 : 0;
  return { hpp, sellingPrice, hppPercent, marginPercent };
}

function computeBundleHpp(bundle) {
  return bundle.items.reduce((sum, item) => {
    const menuItem = state.menuItems.find((m) => m.id === item.menuItemId);
    return sum + (menuItem ? computeHpp(menuItem) * item.qty : 0);
  }, 0);
}

function computeBundleMetrics(bundle) {
  const hpp = computeBundleHpp(bundle);
  const sellingPrice = bundle.sellingPrice || 0;
  const hppPercent = sellingPrice > 0 ? (hpp / sellingPrice) * 100 : 0;
  const marginPercent = sellingPrice > 0 ? ((sellingPrice - hpp) / sellingPrice) * 100 : 0;
  return { hpp, sellingPrice, hppPercent, marginPercent };
}

// ---------- Render utama ----------

function renderAll() {
  renderIngredients();
  renderMenuItems();
  renderBundles();
  renderDashboard();
  renderCategoryNav();
}

// ---------- Bahan Baku ----------

function renderIngredients() {
  const tbody = document.getElementById("ingredient-list");
  tbody.innerHTML = "";

  if (state.ingredients.length === 0) {
    const row = el("tr");
    const cell = el("td", "empty", "Belum ada bahan baku.");
    cell.colSpan = 4;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const ing of state.ingredients) {
    const row = el("tr");
    row.appendChild(el("td", null, ing.name));
    row.appendChild(el("td", null, ing.unit));

    const priceCell = el("td", "inline-edit");
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.className = "price-input";
    priceInput.value = ing.unitCost;
    const saveBtn = el("button", "link", "Simpan");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", async () => {
      const value = Number(priceInput.value);
      if (Number.isNaN(value) || value < 0) return;
      ing.unitCost = value;
      await persist();
    });
    priceCell.append(priceInput, saveBtn);
    row.appendChild(priceCell);

    const actionCell = el("td");
    const deleteBtn = el("button", "danger", "Hapus");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Hapus bahan "${ing.name}"?`)) return;
      state.ingredients = state.ingredients.filter((i) => i.id !== ing.id);
      for (const menu of state.menuItems) {
        menu.lines = menu.lines.filter((l) => l.ingredientId !== ing.id);
      }
      await persist();
    });
    actionCell.appendChild(deleteBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  }
}

document.getElementById("ingredient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const unit = form.unit.value.trim();
  const unitCost = Number(form.unitCost.value);
  const errorEl = document.getElementById("ingredient-error");
  errorEl.textContent = "";

  if (!name) {
    errorEl.textContent = "Nama bahan wajib diisi.";
    return;
  }
  if (!unit) {
    errorEl.textContent = "Satuan wajib diisi.";
    return;
  }
  if (Number.isNaN(unitCost) || unitCost < 0) {
    errorEl.textContent = "Harga per satuan harus angka dan tidak boleh negatif.";
    return;
  }

  state.ingredients.push({ id: uid(), name, unit, unitCost });
  await persist();
  form.reset();
});

document.getElementById("import-excel-btn").addEventListener("click", async () => {
  const errorEl = document.getElementById("ingredient-error");
  errorEl.textContent = "";
  const imported = await window.api.importExcel();
  if (!imported) return;
  if (imported.length === 0) {
    errorEl.textContent = "Tidak ada baris yang bisa dibaca — pastikan ada kolom Nama, Satuan, Harga.";
    return;
  }

  let addedCount = 0;
  let updatedCount = 0;
  for (const row of imported) {
    const existing = state.ingredients.find(
      (i) => i.name.toLowerCase() === row.name.toLowerCase()
    );
    if (existing) {
      existing.unitCost = row.unitCost;
      if (row.unit) existing.unit = row.unit;
      updatedCount += 1;
    } else {
      state.ingredients.push({ id: uid(), name: row.name, unit: row.unit || "-", unitCost: row.unitCost });
      addedCount += 1;
    }
  }
  await persist();
  showSidebarMessage(`Import selesai: ${addedCount} bahan baru, ${updatedCount} diperbarui.`);
});

// ---------- Menu Satuan ----------

function renderMenuItems() {
  const tbody = document.getElementById("menu-list");
  tbody.innerHTML = "";

  const filtered = activeCategory
    ? state.menuItems.filter((m) => (m.category.trim() || NO_CATEGORY_LABEL) === activeCategory)
    : state.menuItems;

  if (filtered.length === 0) {
    const row = el("tr");
    const cell = el("td", "empty", "Belum ada menu.");
    cell.colSpan = 7;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const menu of filtered) {
    tbody.appendChild(renderMenuRow(menu));
    if (expandedMenuIds.has(menu.id)) {
      tbody.appendChild(renderMenuDetailRow(menu));
    }
  }
}

function renderMenuRow(menu) {
  const { hpp, sellingPrice, hppPercent, marginPercent } = computeMenuMetrics(menu);
  const row = el("tr", "menu-row" + (expandedMenuIds.has(menu.id) ? " expanded" : ""));

  const nameCell = el("td", "name-cell");
  nameCell.append(menu.name + " ", el("span", "expand-icon", "▾"));
  nameCell.addEventListener("click", () => {
    if (expandedMenuIds.has(menu.id)) expandedMenuIds.delete(menu.id);
    else expandedMenuIds.add(menu.id);
    renderMenuItems();
  });
  row.appendChild(nameCell);

  row.appendChild(el("td", null, menu.category.trim() || "-"));
  row.appendChild(el("td", null, formatRupiah(hpp)));
  row.appendChild(el("td", null, formatRupiah(sellingPrice)));
  row.appendChild(el("td", null, formatPercent(hppPercent)));
  row.appendChild(el("td", marginClass(marginPercent), formatPercent(marginPercent)));

  const actionCell = el("td");
  const deleteBtn = el("button", "danger", "Hapus");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Hapus menu "${menu.name}"?`)) return;
    state.menuItems = state.menuItems.filter((m) => m.id !== menu.id);
    state.bundles.forEach((b) => {
      b.items = b.items.filter((i) => i.menuItemId !== menu.id);
    });
    expandedMenuIds.delete(menu.id);
    await persist();
  });
  actionCell.appendChild(deleteBtn);
  row.appendChild(actionCell);

  return row;
}

function renderMenuDetailRow(menu) {
  const row = el("tr", "detail-row");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  const box = el("div", "detail-box");

  const fields = el("div", "detail-fields");
  const catLabel = el("label", null, "Kategori ");
  const catInput = document.createElement("input");
  catInput.type = "text";
  catInput.value = menu.category;
  catLabel.appendChild(catInput);

  const priceLabel = el("label", null, "Harga Jual ");
  const priceInput = document.createElement("input");
  priceInput.type = "number";
  priceInput.min = "0";
  priceInput.className = "price-input";
  priceInput.value = menu.sellingPrice;
  priceLabel.appendChild(priceInput);

  const saveFieldsBtn = el("button", "btn secondary", "Simpan");
  saveFieldsBtn.type = "button";
  saveFieldsBtn.addEventListener("click", async () => {
    const price = Number(priceInput.value);
    if (Number.isNaN(price) || price < 0) return;
    menu.category = catInput.value.trim();
    menu.sellingPrice = price;
    await persist();
  });
  fields.append(catLabel, priceLabel, saveFieldsBtn);
  box.appendChild(fields);

  box.appendChild(el("div", "detail-title", "Rincian Resep"));

  for (const line of menu.lines) {
    const ing = state.ingredients.find((i) => i.id === line.ingredientId);
    const lineEl = el("div", "recipe-line");
    const labelText = ing
      ? `${line.qty} ${ing.unit} ${ing.name}`
      : `${line.qty} (bahan terhapus)`;
    lineEl.appendChild(el("span", null, labelText));

    const right = el("span");
    right.textContent = ing ? formatRupiah(line.qty * ing.unitCost) + " " : "";
    const removeBtn = document.createElement("button");
    removeBtn.className = "danger";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async () => {
      menu.lines = menu.lines.filter((l) => l.id !== line.id);
      await persist();
    });
    right.appendChild(removeBtn);
    lineEl.appendChild(right);
    box.appendChild(lineEl);
  }

  const addRow = el("div", "recipe-add");
  const select = document.createElement("select");
  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = "Pilih bahan…";
  select.appendChild(placeholderOpt);
  for (const ing of state.ingredients) {
    const opt = document.createElement("option");
    opt.value = ing.id;
    opt.textContent = ing.name;
    select.appendChild(opt);
  }

  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.min = "0";
  qtyInput.placeholder = "Jumlah";

  const addBtn = el("button", "btn secondary", "+ Tambah");
  addBtn.type = "button";
  addBtn.addEventListener("click", async () => {
    const qty = Number(qtyInput.value);
    if (!select.value || Number.isNaN(qty) || qty <= 0) return;
    menu.lines.push({ id: uid(), ingredientId: select.value, qty });
    await persist();
  });

  addRow.append(select, qtyInput, addBtn);
  box.appendChild(addRow);

  cell.appendChild(box);
  row.appendChild(cell);
  return row;
}

document.getElementById("menu-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const category = form.category.value.trim();
  const sellingPrice = Number(form.sellingPrice.value);
  const errorEl = document.getElementById("menu-error");
  errorEl.textContent = "";

  if (!name) {
    errorEl.textContent = "Nama menu wajib diisi.";
    return;
  }
  if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
    errorEl.textContent = "Harga jual harus angka dan tidak boleh negatif.";
    return;
  }

  state.menuItems.push({ id: uid(), name, category, sellingPrice, lines: [] });
  await persist();
  form.reset();
});

document.getElementById("export-menu-btn").addEventListener("click", async () => {
  if (state.menuItems.length === 0) {
    alert("Belum ada menu untuk didownload.");
    return;
  }
  const rows = state.menuItems.map((menu) => {
    const { hpp, sellingPrice, hppPercent, marginPercent } = computeMenuMetrics(menu);
    return {
      name: menu.name,
      category: menu.category.trim() || "-",
      hpp: Math.round(hpp),
      sellingPrice,
      hppPercent: Math.round(hppPercent),
      marginPercent: Math.round(marginPercent),
    };
  });
  const result = await window.api.exportMenuHpp(rows);
  if (result.ok) showSidebarMessage(`HPP menu tersimpan di ${result.filePath}`);
});

// ---------- Menu Bundling ----------

function renderBundles() {
  const tbody = document.getElementById("bundle-list");
  tbody.innerHTML = "";

  if (state.bundles.length === 0) {
    const row = el("tr");
    const cell = el("td", "empty", "Belum ada paket bundling.");
    cell.colSpan = 6;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const bundle of state.bundles) {
    tbody.appendChild(renderBundleRow(bundle));
    if (expandedBundleIds.has(bundle.id)) {
      tbody.appendChild(renderBundleDetailRow(bundle));
    }
  }
}

function renderBundleRow(bundle) {
  const { hpp, sellingPrice, hppPercent, marginPercent } = computeBundleMetrics(bundle);
  const row = el("tr", "menu-row" + (expandedBundleIds.has(bundle.id) ? " expanded" : ""));

  const nameCell = el("td", "name-cell");
  nameCell.append(bundle.name + " ", el("span", "expand-icon", "▾"));
  nameCell.addEventListener("click", () => {
    if (expandedBundleIds.has(bundle.id)) expandedBundleIds.delete(bundle.id);
    else expandedBundleIds.add(bundle.id);
    renderBundles();
  });
  row.appendChild(nameCell);

  const contents = bundle.items
    .map((item) => {
      const menuItem = state.menuItems.find((m) => m.id === item.menuItemId);
      return menuItem ? `${menuItem.name} x${item.qty}` : null;
    })
    .filter(Boolean)
    .join(", ");
  row.appendChild(el("td", null, contents || "-"));

  row.appendChild(el("td", null, formatRupiah(hpp)));
  row.appendChild(el("td", null, formatRupiah(sellingPrice)));
  row.appendChild(el("td", null, formatPercent(hppPercent)));
  row.appendChild(el("td", marginClass(marginPercent), formatPercent(marginPercent)));

  const actionCell = el("td");
  const deleteBtn = el("button", "danger", "Hapus");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Hapus paket "${bundle.name}"?`)) return;
    state.bundles = state.bundles.filter((b) => b.id !== bundle.id);
    expandedBundleIds.delete(bundle.id);
    await persist();
  });
  actionCell.appendChild(deleteBtn);
  row.appendChild(actionCell);

  return row;
}

function renderBundleDetailRow(bundle) {
  const row = el("tr", "detail-row");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  const box = el("div", "detail-box");

  const fields = el("div", "detail-fields");
  const priceLabel = el("label", null, "Harga Jual Paket ");
  const priceInput = document.createElement("input");
  priceInput.type = "number";
  priceInput.min = "0";
  priceInput.className = "price-input";
  priceInput.value = bundle.sellingPrice;
  priceLabel.appendChild(priceInput);

  const saveBtn = el("button", "btn secondary", "Simpan");
  saveBtn.type = "button";
  saveBtn.addEventListener("click", async () => {
    const price = Number(priceInput.value);
    if (Number.isNaN(price) || price < 0) return;
    bundle.sellingPrice = price;
    await persist();
  });
  fields.append(priceLabel, saveBtn);
  box.appendChild(fields);

  box.appendChild(el("div", "detail-title", "Isi Paket"));

  for (const item of bundle.items) {
    const menuItem = state.menuItems.find((m) => m.id === item.menuItemId);
    const lineEl = el("div", "recipe-line");
    const labelText = menuItem
      ? `${item.qty}x ${menuItem.name}`
      : `${item.qty}x (menu terhapus)`;
    lineEl.appendChild(el("span", null, labelText));

    const right = el("span");
    right.textContent = menuItem ? formatRupiah(computeHpp(menuItem) * item.qty) + " " : "";
    const removeBtn = document.createElement("button");
    removeBtn.className = "danger";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async () => {
      bundle.items = bundle.items.filter((i) => i.id !== item.id);
      await persist();
    });
    right.appendChild(removeBtn);
    lineEl.appendChild(right);
    box.appendChild(lineEl);
  }

  const addRow = el("div", "recipe-add");
  const select = document.createElement("select");
  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = "Pilih menu…";
  select.appendChild(placeholderOpt);
  for (const menuItem of state.menuItems) {
    const opt = document.createElement("option");
    opt.value = menuItem.id;
    opt.textContent = menuItem.name;
    select.appendChild(opt);
  }

  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.min = "1";
  qtyInput.placeholder = "Jumlah";

  const addBtn = el("button", "btn secondary", "+ Tambah");
  addBtn.type = "button";
  addBtn.addEventListener("click", async () => {
    const qty = Number(qtyInput.value);
    if (!select.value || Number.isNaN(qty) || qty <= 0) return;
    bundle.items.push({ id: uid(), menuItemId: select.value, qty });
    await persist();
  });

  addRow.append(select, qtyInput, addBtn);
  box.appendChild(addRow);

  cell.appendChild(box);
  row.appendChild(cell);
  return row;
}

document.getElementById("bundle-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const sellingPrice = Number(form.sellingPrice.value);
  const errorEl = document.getElementById("bundle-error");
  errorEl.textContent = "";

  if (!name) {
    errorEl.textContent = "Nama paket wajib diisi.";
    return;
  }
  if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
    errorEl.textContent = "Harga jual harus angka dan tidak boleh negatif.";
    return;
  }
  if (state.menuItems.length === 0) {
    errorEl.textContent = "Buat menu satuan dulu sebelum membuat paket bundling.";
    return;
  }

  state.bundles.push({ id: uid(), name, sellingPrice, items: [] });
  await persist();
  form.reset();
});

// ---------- Dashboard ----------

function renderDashboard() {
  const metrics = state.menuItems.map((m) => computeMenuMetrics(m));

  document.getElementById("dash-total-menu").textContent = state.menuItems.length;
  document.getElementById("dash-total-bahan").textContent = state.ingredients.length;

  const avgMargin = metrics.length
    ? metrics.reduce((sum, m) => sum + m.marginPercent, 0) / metrics.length
    : 0;
  document.getElementById("dash-avg-margin").textContent = formatPercent(avgMargin);

  const avgHpp = metrics.length ? metrics.reduce((sum, m) => sum + m.hpp, 0) / metrics.length : 0;
  document.getElementById("dash-avg-hpp").textContent = formatRupiah(avgHpp);

  const avgHppPercent = metrics.length
    ? metrics.reduce((sum, m) => sum + m.hppPercent, 0) / metrics.length
    : 0;
  document.getElementById("dash-avg-hpp-percent").textContent = `≈ ${formatPercent(avgHppPercent)} dari harga jual`;

  renderCategoryChart();
  renderMarginChart();
}

function renderCategoryChart() {
  const container = document.getElementById("dash-category-chart");
  container.innerHTML = "";

  const groups = new Map();
  for (const menu of state.menuItems) {
    const key = menu.category.trim() || NO_CATEGORY_LABEL;
    const hpp = computeHpp(menu);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hpp);
  }

  if (groups.size === 0) {
    container.appendChild(el("div", "empty", "Belum ada data kategori menu."));
    return;
  }

  const averages = Array.from(groups.entries()).map(([name, values]) => ({
    name,
    avg: values.reduce((a, b) => a + b, 0) / values.length,
  }));
  const max = Math.max(...averages.map((a) => a.avg), 1);

  for (const { name, avg } of averages.sort((a, b) => b.avg - a.avg)) {
    const row = el("div", "hbar-row");
    row.appendChild(el("div", "hbar-name", name));
    const track = el("div", "hbar-track");
    const fill = el("div", "hbar-fill");
    fill.style.width = `${Math.max((avg / max) * 100, 4)}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("div", "hbar-val", formatRupiah(avg)));
    container.appendChild(row);
  }
}

function renderMarginChart() {
  const container = document.getElementById("dash-margin-chart");
  container.innerHTML = "";

  if (state.menuItems.length === 0) {
    container.appendChild(el("div", "empty", "Belum ada menu."));
    return;
  }

  const items = state.menuItems.slice(0, 8).map((menu) => ({
    name: menu.name,
    margin: computeMenuMetrics(menu).marginPercent,
  }));
  const max = Math.max(...items.map((i) => Math.abs(i.margin)), 1);

  for (const { name, margin } of items) {
    const group = el("div", "bar-group");
    const bar = el("div", "bar" + (margin < 20 ? " low" : ""));
    bar.style.height = `${Math.max((Math.abs(margin) / max) * 100, 6)}%`;
    bar.appendChild(el("span", "bar-val", formatPercent(margin)));
    group.appendChild(bar);
    group.appendChild(el("div", "bar-name", name));
    container.appendChild(group);
  }
}

// ---------- Sidebar: kategori & navigasi ----------

function renderCategoryNav() {
  const container = document.getElementById("nav-category-list");
  container.innerHTML = "";

  const categories = Array.from(
    new Set(state.menuItems.map((m) => m.category.trim() || NO_CATEGORY_LABEL))
  ).sort();

  const allBtn = el("button", "nav-sub-item" + (activeCategory === null ? " active" : ""), "Semua Menu");
  allBtn.type = "button";
  allBtn.addEventListener("click", () => selectCategory(null));
  container.appendChild(allBtn);

  for (const category of categories) {
    const btn = el("button", "nav-sub-item" + (activeCategory === category ? " active" : ""), category);
    btn.type = "button";
    btn.addEventListener("click", () => selectCategory(category));
    container.appendChild(btn);
  }
}

function selectCategory(category) {
  activeCategory = category;
  switchTab("menu");
  switchSubtab("satuan");
  const crumb = document.getElementById("menu-category-crumb");
  if (category) {
    crumb.textContent = `— ${category}`;
    crumb.classList.remove("hidden");
  } else {
    crumb.classList.add("hidden");
  }
  renderCategoryNav();
  renderMenuItems();
}

function switchTab(tab) {
  document.querySelectorAll(".nav-item[data-tab]").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add("active");
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`panel-${tab}`).classList.remove("hidden");

  const navMenuToggle = document.getElementById("nav-menu-toggle");
  const navCategoryList = document.getElementById("nav-category-list");
  if (tab === "menu") {
    navMenuToggle.classList.add("open");
    navCategoryList.classList.remove("hidden");
  } else {
    navMenuToggle.classList.remove("open");
    navCategoryList.classList.add("hidden");
  }
}

function switchSubtab(subtab) {
  document.querySelectorAll(".subtab-item").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.subtab-item[data-subtab="${subtab}"]`).classList.add("active");
  document.querySelectorAll(".subpanel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`subpanel-${subtab}`).classList.remove("hidden");
}

document.querySelectorAll(".nav-item[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll(".subtab-item").forEach((btn) => {
  btn.addEventListener("click", () => switchSubtab(btn.dataset.subtab));
});

// ---------- Backup & Restore ----------

document.getElementById("backup-btn").addEventListener("click", async () => {
  const result = await window.api.backupData();
  if (result.ok) showSidebarMessage(`Backup tersimpan di ${result.filePath}`);
});

document.getElementById("restore-btn").addEventListener("click", async () => {
  const result = await window.api.restoreData();
  if (!result.ok) {
    if (result.error) showSidebarMessage(result.error);
    return;
  }
  if (!confirm("Pulihkan data ini akan menimpa data yang ada sekarang. Lanjutkan?")) return;
  state = {
    ingredients: result.data.ingredients ?? [],
    menuItems: result.data.menuItems ?? [],
    bundles: result.data.bundles ?? [],
  };
  await persist();
  showSidebarMessage("Data berhasil dipulihkan.");
});

// ---------- Init ----------

async function init() {
  const data = await window.api.getData();
  state = {
    ingredients: data.ingredients ?? [],
    menuItems: (data.menuItems ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category ?? "",
      sellingPrice: m.sellingPrice ?? 0,
      lines: m.lines ?? [],
    })),
    bundles: data.bundles ?? [],
  };
  renderAll();
}

init();
