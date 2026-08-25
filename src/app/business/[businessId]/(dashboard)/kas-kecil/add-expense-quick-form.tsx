"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addPettyCashExpense, addSupplierDebtNoteAdmin, addPettyCashKasbon } from "./actions";

const TUNAI_CATEGORIES = ["Bahan Baku", "Bukan Bahan Baku", "Lain-lain"];
const HUTANG_CATEGORIES = ["Bahan Baku", "Bukan Bahan Baku"] as const;

type Supplier = { id: string; name: string };
type Employee = { id: string; name: string };

export default function AddExpenseQuickForm({
  businessId,
  suppliers,
  employees,
  today,
}: {
  businessId: string;
  suppliers: Supplier[];
  employees: Employee[];
  today: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"tunai" | "hutang" | "kasbon">("tunai");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(TUNAI_CATEGORIES[0]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierManual, setSupplierManual] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [kasbonDate, setKasbonDate] = useState(today);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetFields() {
    setAmount("");
    setDescription("");
    setCategory(mode === "tunai" ? TUNAI_CATEGORIES[0] : HUTANG_CATEGORIES[0]);
    setSupplierId("");
    setSupplierManual("");
    setEmployeeId("");
    setKasbonDate(today);
    setReceiptFile(null);
    setReceiptPreview(null);
  }

  function handleModeChange(next: "tunai" | "hutang" | "kasbon") {
    setMode(next);
    setCategory(next === "tunai" ? TUNAI_CATEGORIES[0] : HUTANG_CATEGORIES[0]);
    setEmployeeId("");
    setError(null);
  }

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
    if (mode === "tunai" && !description.trim()) {
      setError("Keterangan wajib diisi.");
      return;
    }
    if (mode === "hutang" && !supplierId && !supplierManual.trim()) {
      setError("Pilih supplier atau ketik nama supplier.");
      return;
    }
    if (mode === "kasbon" && !employeeId) {
      setError("Pilih karyawan dulu.");
      return;
    }

    setPending(true);

    let receiptUrl: string | null = null;
    if (receiptFile && mode !== "kasbon") {
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

    const result =
      mode === "tunai"
        ? await addPettyCashExpense(businessId, amountNum, description.trim(), category, receiptUrl)
        : mode === "hutang"
          ? await addSupplierDebtNoteAdmin(
              businessId,
              supplierId || null,
              supplierId ? null : supplierManual.trim(),
              category as (typeof HUTANG_CATEGORIES)[number],
              amountNum,
              description.trim() || null,
              receiptUrl,
            )
          : await addPettyCashKasbon(businessId, employeeId, amountNum, description.trim(), kasbonDate);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    resetFields();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => handleModeChange("tunai")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            mode === "tunai" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          Nota Tunai
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("hutang")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            mode === "hutang" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          Nota Hutang
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("kasbon")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            mode === "kasbon" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          Kasbon
        </button>
      </div>
      <p className="text-[11px] text-zinc-400">
        {mode === "tunai"
          ? "Uang keluar tunai — mengurangi petty cash, menunggu admin pilih akun."
          : mode === "hutang"
            ? "Belum dibayar — tidak mengurangi petty cash, menunggu diverifikasi lalu dialihkan ke Pembelian & Hutang."
            : "Kasbon karyawan dari petty cash — beda dari nota tunai, dicatat sebagai Piutang Karyawan (bukan beban), otomatis kepotong dari gaji berikutnya."}
      </p>

      {mode === "kasbon" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Karyawan</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Pilih karyawan —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      {mode === "kasbon" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Tanggal Kasbon</label>
          <input
            type="date"
            value={kasbonDate}
            max={today}
            onChange={(e) => setKasbonDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Kosongkan default hari ini — ganti kalau kasbonnya baru dicatat telat dari kejadian
            aslinya.
          </p>
        </div>
      )}

      {mode === "hutang" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              if (e.target.value) setSupplierManual("");
            }}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Pilih supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {!supplierId && (
            <input
              type="text"
              value={supplierManual}
              onChange={(e) => setSupplierManual(e.target.value)}
              placeholder="Belum ada di daftar? Ketik nama supplier"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          )}
        </div>
      )}

      <div className={mode === "kasbon" ? "" : "grid grid-cols-2 gap-2.5"}>
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
        {mode !== "kasbon" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {(mode === "tunai" ? TUNAI_CATEGORIES : HUTANG_CATEGORIES).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Keterangan{mode === "tunai" ? "" : " (opsional)"}
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            mode === "tunai" ? "mis. Beli galon & kopi kantor" : mode === "hutang" ? "mis. Ayam potong 20kg" : "mis. Kebutuhan mendesak"
          }
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {mode !== "kasbon" && (
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
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending || uploading}
        className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading
          ? "Mengupload nota…"
          : pending
            ? "Menyimpan…"
            : mode === "tunai"
              ? "+ Catat Nota Tunai"
              : mode === "hutang"
                ? "+ Catat Nota Hutang"
                : "+ Catat Kasbon"}
      </button>
    </div>
  );
}
