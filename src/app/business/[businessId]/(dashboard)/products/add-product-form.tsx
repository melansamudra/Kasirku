"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { AddProductState } from "./actions";

const initialState: AddProductState = { error: null };

export default function AddProductForm({
  action,
  categories,
  businessId,
}: {
  action: (state: AddProductState, formData: FormData) => Promise<AddProductState>;
  categories: string[];
  businessId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
      setImagePreview(null);
      setImageUrl("");
      setUploadError(null);
    }
  }, [pending, state.error]);

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
      setImagePreview(null);
      e.target.value = "";
      return;
    }
    setImageUrl(json.url);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="imageUrl" value={imageUrl} />

      {/* Image upload */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Foto Produk (opsional, maks 2 MB)
        </label>
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 flex items-center justify-center text-2xl">
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
              className="w-full text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-50"
            />
            {uploading && <p className="mt-1 text-[11px] text-zinc-400">Mengupload…</p>}
            {uploadError && <p className="mt-1 text-[11px] text-red-500">{uploadError}</p>}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Produk
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Es Kopi Susu"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="barcode" className="mb-1 block text-xs font-medium text-zinc-600">
            Barcode (opsional)
          </label>
          <input
            id="barcode"
            name="barcode"
            type="text"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="Scan atau ketik"
          />
        </div>
        <div>
          <label htmlFor="sku" className="mb-1 block text-xs font-medium text-zinc-600">
            SKU (opsional)
          </label>
          <input
            id="sku"
            name="sku"
            type="text"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. KJ-RED-S"
          />
        </div>
      </div>

      <div>
        <label htmlFor="variantLabel" className="mb-1 block text-xs font-medium text-zinc-600">
          Varian (opsional)
        </label>
        <input
          id="variantLabel"
          name="variantLabel"
          type="text"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Merah / S"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Isi ini kalau produk punya beberapa pilihan (ukuran/warna). Pakai Nama Produk yang
          sama untuk tiap variannya — nanti dikelompokkan otomatis.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
            Kategori
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue=""
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="" disabled>
              — Pilih Kategori —
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {categories.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-600">
              Belum ada kategori — tambahkan dulu di bagian Kategori di atas.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="emoji" className="mb-1 block text-xs font-medium text-zinc-600">
            Ikon (emoji)
          </label>
          <input
            id="emoji"
            name="emoji"
            type="text"
            maxLength={4}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-center text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="☕"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="price" className="mb-1 block text-xs font-medium text-zinc-600">
            Harga Jual
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="1"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="28000"
          />
        </div>
        <div>
          <label htmlFor="cost" className="mb-1 block text-xs font-medium text-zinc-600">
            Modal (HPP)
          </label>
          <input
            id="cost"
            name="cost"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="11000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="stock" className="mb-1 block text-xs font-medium text-zinc-600">
            Stok
          </label>
          <input
            id="stock"
            name="stock"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="50"
          />
        </div>
        <div>
          <label htmlFor="minStock" className="mb-1 block text-xs font-medium text-zinc-600">
            Stok Minimum
          </label>
          <input
            id="minStock"
            name="minStock"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="0 = tanpa notifikasi"
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || uploading}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tambah Produk"}
      </button>
    </form>
  );
}
