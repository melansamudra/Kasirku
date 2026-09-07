"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UpdateSupplierState } from "./actions";
import type { AddSupplierState } from "../suppliers/actions";

const NEW_SUPPLIER = "__new__";

export default function EditSupplierButton({
  currentSupplierId,
  suppliers,
  updateSupplierAction,
  addSupplierAction,
}: {
  currentSupplierId: string | null;
  suppliers: { id: string; name: string }[];
  updateSupplierAction: (supplierId: string | null) => Promise<UpdateSupplierState>;
  addSupplierAction: (state: AddSupplierState, formData: FormData) => Promise<AddSupplierState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>(currentSupplierId ?? "");
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAddingNew = supplierId === NEW_SUPPLIER;
  const isUnchanged = !isAddingNew && (supplierId || null) === currentSupplierId;

  async function handleSubmit() {
    setError(null);

    let targetSupplierId: string | null = supplierId || null;

    if (isAddingNew) {
      const trimmedName = newName.trim();
      if (!trimmedName) {
        setError("Nama supplier baru wajib diisi.");
        return;
      }
      setPending(true);
      const formData = new FormData();
      formData.set("name", trimmedName);
      const addResult = await addSupplierAction({ error: null, supplierId: null }, formData);
      if (addResult.error || !addResult.supplierId) {
        setPending(false);
        setError(addResult.error ?? "Gagal menambah supplier baru.");
        return;
      }
      targetSupplierId = addResult.supplierId;
    } else {
      setPending(true);
    }

    const result = await updateSupplierAction(targetSupplierId);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setNewName("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] text-zinc-400 hover:text-brand-700">
        Ubah supplier
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-brand-200 bg-brand-50 p-2.5">
      <p className="text-[11px] font-medium text-brand-800">Ubah supplier pembelian ini</p>
      <select
        value={supplierId}
        onChange={(e) => {
          setError(null);
          setSupplierId(e.target.value);
        }}
        className="mt-2 w-full rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Tanpa Supplier</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW_SUPPLIER}>+ Tambah Supplier Baru…</option>
      </select>

      {isAddingNew && (
        <input
          type="text"
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nama supplier baru"
          className="mt-2 w-full rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      )}

      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending || isUnchanged || (isAddingNew && !newName.trim())}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : isAddingNew ? "Tambah & Pilih" : "Simpan"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
            setNewName("");
            setSupplierId(currentSupplierId ?? "");
          }}
          className="text-[11px] text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
