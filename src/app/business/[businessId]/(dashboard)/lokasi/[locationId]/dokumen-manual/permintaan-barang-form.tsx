"use client";

import ManualDocForm, { type ManualDocOnSuccess } from "./manual-doc-form";
import { createManualPurchaseRequest, type ManualDocItemInput } from "./actions";

export default function PermintaanBarangManualForm({
  businessId,
  locationId,
  onSuccess,
}: {
  businessId: string;
  locationId: string | null;
  onSuccess?: ManualDocOnSuccess;
}) {
  function handleSubmit(_context: string, note: string, items: ManualDocItemInput[]) {
    return createManualPurchaseRequest(businessId, locationId, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      onSuccess={onSuccess}
      title="Buat Permintaan Barang Baru"
      helperText="Isi bebas — tidak terhubung ke alur digital Permintaan Barang (alokasi/budget/PO). Purchasing proses manual dari daftar ini."
      qtyColumnLabel="Qty"
      submitLabel="Simpan Permintaan"
      submitPendingLabel="Menyimpan…"
    />
  );
}
