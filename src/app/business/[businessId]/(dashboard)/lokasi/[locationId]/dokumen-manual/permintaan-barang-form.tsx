"use client";

import ManualDocForm from "./manual-doc-form";
import { createManualPurchaseRequest, type ManualDocItemInput } from "./actions";

export default function PermintaanBarangManualForm({
  businessId,
  locationId,
}: {
  businessId: string;
  locationId: string;
}) {
  function handleSubmit(_context: string, note: string, items: ManualDocItemInput[]) {
    return createManualPurchaseRequest(businessId, locationId, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      title="Buat Permintaan Barang Baru"
      helperText="Isi bebas — tidak terhubung ke alur digital Permintaan Barang (alokasi/budget/PO). Purchasing proses manual dari daftar ini."
      qtyColumnLabel="Qty"
      submitLabel="Simpan Permintaan"
      submitPendingLabel="Menyimpan…"
    />
  );
}
