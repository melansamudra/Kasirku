"use client";

import ManualDocForm, { type ManualDocOnSuccess } from "./manual-doc-form";
import { createManualDeliveryNote, type ManualDocItemInput } from "./actions";

export default function SuratJalanManualForm({
  businessId,
  locationId,
  onSuccess,
}: {
  businessId: string;
  locationId: string | null;
  onSuccess?: ManualDocOnSuccess;
}) {
  function handleSubmit(destination: string, note: string, items: ManualDocItemInput[]) {
    return createManualDeliveryNote(businessId, locationId, destination, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      onSuccess={onSuccess}
      title="Buat Surat Jalan Baru"
      helperText="Isi bebas — tidak terhubung ke Permintaan Barang/PO manapun. Murni dokumen pengiriman."
      contextLabel="Tujuan Pengiriman"
      contextPlaceholder="mis. Kitchen Atas / Nama toko / Alamat"
      qtyColumnLabel="Qty"
      submitLabel="Simpan & Buat Surat Jalan"
      submitPendingLabel="Menyimpan…"
    />
  );
}
