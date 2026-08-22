"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addPettyCashExpense } from "./actions";

const CATEGORIES = ["Bahan Baku", "Bukan Bahan Baku", "Lain-lain"];

export default function AddExpenseQuickForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("Ukuran foto maksimal 2 MB.");
      e.target.value = "";
      return;
    }

    setError(null);
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    setError(null);

    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Jumlah harus angka lebih dari 0.");
      return;
    }
    if (!description.trim()) {
      setError("Keterangan wajib diisi.");
      return;
    }

    setPending(true);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", receiptFile);
      fd.append("businessId", businessId);
      const res = await fetch("/api/upload-cash-receipt", { method: "POST", body: fd });
      const json = await res.json();
      setUploading(false);
      if (!res.ok) {
        setPending(false);
        setError(json.error ?? "Gagal upload foto nota.");
        return;
      }
      receiptUrl = json.url;
    }

    const result = await addPettyCashExpense(businessId, amountNum, description.trim(), category, receiptUrl);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setAmount("");
    setDescription("");
    setCategory(CATEGORIES[0]);
    setReceiptFile(null);
    setReceiptPreview(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Jumlah (Rp)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="mis. 150000"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Keterangan</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="mis. Nota supplier ayam — CV Sumber Rejeki"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Foto Nota (opsional, maks 2 MB)</label>
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 flex items-center justify-center text-2xl">
            {receiptPreview ? (
              <img src={receiptPreview} alt="preview nota" className="h-full w-full object-cover" />
            ) : (
              "🧾"
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleReceiptChange}
            disabled={uploading}
            className="flex-1 text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-50"
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending || uploading}
        className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? "Mengupload nota…" : pending ? "Menyimpan…" : "+ Catat Pengeluaran"}
      </button>
    </div>
  );
}
