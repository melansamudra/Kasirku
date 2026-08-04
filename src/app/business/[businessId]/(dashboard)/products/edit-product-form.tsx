"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditProductState } from "./actions";

export default function EditProductForm({
  name,
  category,
  price,
  cost,
  minStock,
  emoji,
  barcode,
  sku,
  variantLabel,
  imageUrl: initialImageUrl,
  categories,
  businessId,
  action,
}: {
  name: string;
  category: string | null;
  price: number;
  cost: number;
  minStock: number;
  emoji: string | null;
  barcode: string | null;
  sku: string | null;
  variantLabel: string | null;
  imageUrl: string | null;
  categories: string[];
  businessId: string;
  action: (state: EditProductState, formData: FormData) => Promise<EditProductState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    name,
    category: category ?? "",
    price: String(price),
    cost: String(cost),
    minStock: String(minStock),
    emoji: emoji ?? "",
    barcode: barcode ?? "",
    sku: sku ?? "",
    variantLabel: variantLabel ?? "",
  });
  const [imageUrl, setImageUrl] = useState(initialImageUrl ?? "");
  const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Edit
      </button>
    );
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Ukuran foto maksimal 2 MB.");
      e.target.value = "";
      return;
    }

    setUploadError(null);
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("businessId", businessId);

    const res = await fetch("/api/upload-product-image", { method: "POST", body: fd });
    const json = await res.json();
    setUploading(false);

    if (!res.ok) {
      setUploadError(json.error ?? "Gagal upload foto.");
      setImagePreview(initialImageUrl ?? null);
      e.target.value = "";
      return;
    }
    setImageUrl(json.url);
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("category", values.category);
    formData.set("price", values.price);
    formData.set("cost", values.cost);
    formData.set("minStock", values.minStock);
    formData.set("emoji", values.emoji);
    formData.set("barcode", values.barcode);
    formData.set("sku", values.sku);
    formData.set("variantLabel", values.variantLabel);
    formData.set("imageUrl", imageUrl);
    const result = await action({ error: null }, formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      {/* Image upload */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Foto Produk (maks 2 MB)
        </label>
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 flex items-center justify-center text-xl">
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
            ) : (
              "📷"
            )}
          </div>
          <div className="flex-1">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              disabled={uploading}
              className="w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-50"
            />
            {uploading && <p className="mt-0.5 text-[11px] text-zinc-400">Mengupload…</p>}
            {uploadError && <p className="mt-0.5 text-[11px] text-red-500">{uploadError}</p>}
            {imageUrl && !uploading && (
              <button
                type="button"
                onClick={() => { setImageUrl(""); setImagePreview(null); }}
                className="mt-0.5 text-[11px] text-red-400 hover:text-red-600"
              >
                Hapus foto
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Produk</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Barcode</label>
          <input
            type="text"
            value={values.barcode}
            onChange={(e) => setValues((v) => ({ ...v, barcode: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">SKU</label>
          <input
            type="text"
            value={values.sku}
            onChange={(e) => setValues((v) => ({ ...v, sku: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Varian (mis. Merah / S)
        </label>
        <input
          type="text"
          value={values.variantLabel}
          onChange={(e) => setValues((v) => ({ ...v, variantLabel: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Kategori</label>
          <select
            required
            value={values.category}
            onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="" disabled>
              — Pilih Kategori —
            </option>
            {values.category && !categories.includes(values.category) && (
              <option value={values.category}>{values.category} (tidak terdaftar)</option>
            )}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Ikon (emoji)</label>
          <input
            type="text"
            maxLength={4}
            value={values.emoji}
            onChange={(e) => setValues((v) => ({ ...v, emoji: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-center text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Harga Jual</label>
          <input
            type="number"
            min="0"
            step="1"
            value={values.price}
            onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Modal (HPP)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={values.cost}
            onChange={(e) => setValues((v) => ({ ...v, cost: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Stok Minimum (0 = tanpa notifikasi)
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={values.minStock}
          onChange={(e) => setValues((v) => ({ ...v, minStock: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending || uploading}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
