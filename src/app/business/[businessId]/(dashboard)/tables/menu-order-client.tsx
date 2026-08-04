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
  const dragIndex = useRef<number | null>(null);
  const [, startTransition] = useTransition();

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
      prev.map((item) =>
        item.id === productId ? { ...item, show_in_self_order: show } : item,
      ),
    );
    startTransition(() => toggleShowInSelfOrder(businessId, productId, show));
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-400">
        Seret ☰ untuk mengubah urutan. Centang untuk tampilkan di menu pelanggan.
      </p>

      {saving && (
        <p className="text-[11px] text-zinc-400">Menyimpan urutan…</p>
      )}
      {saved && (
        <p className="text-[11px] text-green-600">Urutan tersimpan.</p>
      )}

      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 transition-colors select-none cursor-grab active:cursor-grabbing ${
              item.show_in_self_order ? "border-zinc-200" : "border-zinc-100 opacity-50"
            }`}
          >
            {/* Drag handle */}
            <span className="text-zinc-300 text-sm shrink-0">☰</span>

            {/* Foto / emoji */}
            <div className="h-8 w-8 shrink-0 rounded-lg bg-zinc-100 overflow-hidden flex items-center justify-center text-base">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                item.emoji || "📦"
              )}
            </div>

            {/* Nama */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">{item.name}</p>
              <p className="text-[11px] text-zinc-400">
                {item.category || "Tanpa kategori"}
                {item.featured && " · ★ Unggulan"}
              </p>
            </div>

            {/* Toggle tampil */}
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={item.show_in_self_order}
                onChange={(e) => handleToggle(item.id, e.target.checked)}
              />
              <div className="h-5 w-9 rounded-full bg-zinc-200 peer-checked:bg-brand-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-4" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
