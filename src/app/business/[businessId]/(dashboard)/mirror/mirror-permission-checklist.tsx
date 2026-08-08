"use client";

const MIRROR_PERMISSIONS = [
  { key: "show_transactions", label: "Transaksi POS" },
  { key: "show_purchases", label: "Pembelian & Pengeluaran" },
  { key: "show_kas_harian", label: "Kas Harian" },
  { key: "show_amount", label: "Lihat Nominal Angka" },
  { key: "show_customer", label: "Lihat Nama Pelanggan" },
  { key: "show_cashier", label: "Lihat Nama Kasir" },
];

type Permissions = Record<string, boolean>;

export default function MirrorPermissionChecklist({
  defaultValues = {},
}: {
  defaultValues?: Permissions;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {MIRROR_PERMISSIONS.map((item) => (
        <label
          key={item.key}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
        >
          <input
            type="checkbox"
            name={item.key}
            defaultChecked={defaultValues[item.key] ?? false}
            className="accent-brand-600"
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}
