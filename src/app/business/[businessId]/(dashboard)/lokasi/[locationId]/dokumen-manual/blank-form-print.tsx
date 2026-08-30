// Formulir KOSONG -- template murni buat dicetak & diisi tangan (dipakai
// pas alur digital lagi tidak bisa diandalkan, mis. tidak ada sinyal/HP
// bermasalah). Isinya diketik manual di kertas dulu, dipindah ke sistem
// belakangan begitu bisa. Satu komponen dipakai ke-3 jenis dokumen supaya
// tata letaknya konsisten -- yang beda cuma judul, field header, kolom qty,
// dan label tanda tangan.
export default function BlankFormPrint({
  businessName,
  locationName,
  title,
  fields,
  qtyColumnLabel = "Qty",
  rowCount = 15,
  signLabels,
}: {
  businessName: string;
  locationName: string;
  title: string;
  fields: string[];
  qtyColumnLabel?: string;
  rowCount?: number;
  signLabels: [string, string];
}) {
  const rows = Array.from({ length: rowCount }, (_, i) => i);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{businessName}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{title.toUpperCase()}</h1>
            <p className="text-xs text-zinc-400">{locationName}</p>
          </div>
          <p className="text-xs text-zinc-400">No: ________________</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {fields.map((f) => (
            <div key={f}>
              <p className="text-zinc-400">{f}</p>
              <p className="mt-3 border-b border-zinc-300 pb-1">&nbsp;</p>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="w-8 px-2 py-2 text-left font-medium">No</th>
                <th className="px-3 py-2 text-left font-medium">Barang</th>
                <th className="w-20 px-3 py-2 text-right font-medium">{qtyColumnLabel}</th>
                <th className="w-20 px-3 py-2 text-left font-medium">Satuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((i) => (
                <tr key={i}>
                  <td className="px-2 py-3 text-zinc-400">{i + 1}</td>
                  <td className="px-3 py-3">&nbsp;</td>
                  <td className="px-3 py-3">&nbsp;</td>
                  <td className="px-3 py-3">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs">
          <p className="text-zinc-400">Catatan</p>
          <p className="mt-4 border-b border-zinc-300 pb-1">&nbsp;</p>
          <p className="mt-4 border-b border-zinc-300 pb-1">&nbsp;</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">{signLabels[0]}</p>
            <p className="mt-10 border-t border-zinc-300 pt-1">________________</p>
          </div>
          <div>
            <p className="text-zinc-400">{signLabels[1]}</p>
            <p className="mt-10 border-t border-zinc-300 pt-1">________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}
