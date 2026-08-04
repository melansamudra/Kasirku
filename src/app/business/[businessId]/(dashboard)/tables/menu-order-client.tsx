"use client";

import { useRef, useState, useTransition } from "react";
import { saveMenuOrder, toggleShowInSelfOrder } from "./actions";

type MenuItem = {
  id: string;
  name: string;
  category: string | null;
  emoji: string | null;
  image_url: string | null;
  show_in_self_order: boolean;
  sort_order: number;
  featured: boolean;
};

export default function MenuOrderClient({
  businessId,
  initialItems,
}: {
  businessId: string;
  initialItems: MenuItem[];
}) {
  const [items, setItems] = useState(
    [...initialItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const dragIndex = useRef<number | null>(null);
  const [, startTransition] = useTransition();

  // Kalau group by category, tampilkan dalam urutan kategori
  const displayItems = groupByCategory
    ? [...items].sort((a, b) => {
        const ca = a.category || "Lainnya";
        const cb = b.category || "Lainnya";
        if (ca !== cb) return ca.localeCompare(cb, "id");
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
    : items;

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, moved);
    dragIndex.current = index;
    setItems(next);
  }

  function handleDrop() {
    dragIndex.current = null;
    handleSaveOrder();
  }

  async function handleSaveOrder() {
    setSaving(true);
    setSaved(false);
    const payload = items.map((item, i) => ({ id: item.id, sort_order: i + 1 }));
    await saveMenuOrder(businessId, payload);
    setItems((prev) => prev.map((item, i) => ({ ...item, sort_order: i + 1 })));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleToggle(productId: string, show: boolean) {
    setItems((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, show_in_self_order: show } : item)),
    );
    startTransition(() => toggleShowInSelfOrder(businessId, productId, show));
  }

  // Untuk tampilan grup kategori — kumpulkan urutan kategori dari displayItems
  const categoryGroups: { cat: string; items: (MenuItem & { displayIndex: number })[] }[] = [];
  if (groupByCategory) {
    for (const item of displayItems) {
      const cat = item.category || "Lainnya";
      const group = categoryGroups.find((g) => g.cat === cat);
      const displayIndex = items.findIndex((i) => i.id === item.id);
      if (group) group.items.push({ ...item, displayIndex });
      else categoryGroups.push({ cat, items: [{ ...item, displayIndex }] });
    }
  }

  return (
    <div className="space-y-3">
      {/* Kontrol tampilan */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-400">
          {groupByCategory
            ? "Dikelompokkan per kategori. Seret ☰ untuk ubah urutan dalam grup."
            : "Urutan bebas. Seret ☰ untuk mengatur urutan tampil di menu pelanggan."}
        </p>
        <button
          onClick={() => setGroupByCategory((v) => !v)}
          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {groupByCategory ? "Urutan bebas" : "Kelompok kategori"}
        </button>
      </div>

      {saving && <p className="text-[11px] text-zinc-400">Menyimpan urutan…</p>}
      {saved && <p className="text-[11px] text-green-600">Urutan tersimpan.</p>}

      {groupByCategory ? (
        // Tampilan dikelompokkan per kategori
        <div className="space-y-4">
          {categoryGroups.map(({ cat, items: catItems }) => (
            <div key={cat}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {cat}
              </p>
              <div className="space-y-1.5">
                {catItems.map(({ displayIndex, ...item }) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={displayIndex}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Tampilan urutan bebas
        <div className="space-y-1.5">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onToggle,
}: {
  item: MenuItem;
  index: number;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: () => void;
  onToggle: (id: string, show: boolean) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 transition-colors select-none cursor-grab active:cursor-grabbing ${
        item.show_in_self_order ? "border-zinc-200" : "border-zinc-100 opacity-50"
      }`}
    >
      <span className="text-zinc-300 text-sm shrink-0">☰</span>
      <div className="h-8 w-8 shrink-0 rounded-lg bg-zinc-100 overflow-hidden flex items-center justify-center text-base">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          item.emoji || "📦"
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{item.name}</p>
        {item.featured && (
          <p className="text-[11px] text-amber-500">★ Unggulan</p>
        )}
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={item.show_in_self_order}
          onChange={(e) => onToggle(item.id, e.target.checked)}
        />
        <div className="h-5 w-9 rounded-full bg-zinc-200 peer-checked:bg-brand-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-4" />
      </label>
    </div>
  );
}
