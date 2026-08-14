"use client";

import { useState, useTransition } from "react";
import type { ReceiptSettings } from "@/lib/escpos";
import { saveReceiptSettings } from "./actions";

const DEFAULTS: Required<ReceiptSettings> = {
  show_logo: false,
  logo_url: "",
  show_address: false,
  show_phone: false,
  show_invoice: true,
  show_datetime: true,
  show_cashier: true,
  show_item_note: true,
  show_unit_price: true,
  show_item_disc: true,
  show_service: true,
  show_tax: true,
  show_payment_detail: true,
  show_order_label: true,
  show_customer_name: true,
  show_receipt_code: false,
  footer_text: "Terima kasih!",
  font_large: false,
};

const TOGGLES: {
  key: Exclude<keyof Required<ReceiptSettings>, "footer_text" | "logo_url">;
  label: string;
  desc?: string;
}[] = [
  { key: "show_logo", label: "Logo toko", desc: "Tampilkan logo di bagian atas struk" },
  { key: "show_address", label: "Alamat toko" },
  { key: "show_phone", label: "Nomor telepon toko" },
  { key: "show_invoice", label: "Nomor invoice" },
  {
    key: "show_receipt_code",
    label: "Kode struk (acak)",
    desc: "Kode unik acak per transaksi, aman ditampilkan ke akun mirror karena tidak berurutan seperti nomor invoice",
  },
  { key: "show_datetime", label: "Tanggal & jam" },
  { key: "show_cashier", label: "Nama kasir" },
  { key: "show_order_label", label: "Meja / Order" },
  { key: "show_customer_name", label: "Nama pelanggan" },
  {
    key: "show_item_note",
    label: "Catatan per item",
    desc: "Catatan khusus yang diinput kasir untuk item tertentu",
  },
  {
    key: "show_unit_price",
    label: "Harga satuan",
    desc: "Qty × harga di bawah nama produk",
  },
  { key: "show_item_disc", label: "Diskon item" },
  { key: "show_service", label: "Biaya layanan (service)" },
  { key: "show_tax", label: "Pajak (PPN)" },
  {
    key: "show_payment_detail",
    label: "Detail pembayaran",
    desc: "Metode, uang diterima, kembalian",
  },
  {
    key: "font_large",
    label: "Huruf lebih besar (2×)",
    desc: "Cocok untuk printer 80mm agar tulisan lebih mudah dibaca",
  },
];

function formatRp(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

function ReceiptPreview({
  s,
  businessName,
  address,
  phone,
}: {
  s: Required<ReceiptSettings>;
  businessName: string;
  address: string | null;
  phone: string | null;
}) {
  const items = [
    { name: "Kopi Susu", qty: 2, price: 15000, note: "Less sweet", disc: 0 },
    { name: "Croissant", qty: 1, price: 22000, note: null, disc: 2200 },
  ];
  const subtotal = items.reduce((acc, i) => acc + i.qty * i.price, 0);
  const itemDisc = items.reduce((acc, i) => acc + i.disc, 0);
  const afterDisc = subtotal - itemDisc;
  const service = Math.round(afterDisc * 0.1);
  const tax = Math.round(afterDisc * 0.11);
  const total =
    afterDisc +
    (s.show_service ? service : 0) +
    (s.show_tax ? tax : 0);

  return (
    <div className="mx-auto w-48 rounded bg-white border border-zinc-200 p-3 font-mono text-[11px] text-zinc-800 shadow-sm">
      <div className="text-center">
        {s.show_logo && s.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logo_url} alt="Logo" className="mx-auto mb-1 h-10 w-auto object-contain" />
        )}
        {s.show_logo && !s.logo_url && (
          <div className="mx-auto mb-1 flex h-10 w-24 items-center justify-center rounded border border-dashed border-zinc-300 text-[9px] text-zinc-400">
            Logo
          </div>
        )}
        <p className="text-[12px] font-bold uppercase leading-tight">{businessName}</p>
        {s.show_address && address && (
          <p className="text-[10px] text-zinc-500">{address}</p>
        )}
        {s.show_phone && phone && (
          <p className="text-[10px] text-zinc-500">Tel: {phone}</p>
        )}
      </div>

      <div className="mt-1 border-t border-dashed border-zinc-300 pt-1 space-y-0.5">
        {s.show_invoice && (
          <div className="flex justify-between gap-1">
            <span>No.</span>
            <span>#INV-001</span>
          </div>
        )}
        {s.show_receipt_code && (
          <div className="flex justify-between gap-1">
            <span>No. Struk</span>
            <span>6MT4QM</span>
          </div>
        )}
        {s.show_datetime && (
          <div className="flex justify-between gap-1">
            <span>Tgl</span>
            <span>02/08 12:00</span>
          </div>
        )}
        {s.show_cashier && (
          <div className="flex justify-between gap-1">
            <span>Kasir</span>
            <span>Andi</span>
          </div>
        )}
        {s.show_order_label && (
          <div className="flex justify-between gap-1">
            <span>Meja/Order</span>
            <span>Meja 5</span>
          </div>
        )}
        {s.show_customer_name && (
          <div className="flex justify-between gap-1">
            <span>Pelanggan</span>
            <span>Budi</span>
          </div>
        )}
      </div>

      <div className="mt-1 border-t border-dashed border-zinc-300 pt-1 space-y-0.5">
        {items.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between gap-1">
              <span className="flex-1 truncate">{item.name}</span>
              <span className="shrink-0">{formatRp(item.qty * item.price)}</span>
            </div>
            {s.show_unit_price && (
              <div className="text-[10px] text-zinc-400">
                {item.qty}×{formatRp(item.price)}
              </div>
            )}
            {s.show_item_note && item.note && (
              <div className="text-[10px] text-zinc-400 italic">* {item.note}</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-1 border-t border-dashed border-zinc-300 pt-1 space-y-0.5">
        <div className="flex justify-between gap-1">
          <span>Subtotal</span>
          <span>{formatRp(subtotal)}</span>
        </div>
        {s.show_item_disc && itemDisc > 0 && (
          <div className="flex justify-between gap-1 text-zinc-500">
            <span>Diskon item</span>
            <span>-{formatRp(itemDisc)}</span>
          </div>
        )}
        {s.show_service && (
          <div className="flex justify-between gap-1">
            <span>Layanan</span>
            <span>{formatRp(service)}</span>
          </div>
        )}
        {s.show_tax && (
          <div className="flex justify-between gap-1">
            <span>PPN</span>
            <span>{formatRp(tax)}</span>
          </div>
        )}
        <div className="flex justify-between gap-1 border-t border-dashed border-zinc-300 pt-0.5 font-bold">
          <span>TOTAL</span>
          <span>{formatRp(total)}</span>
        </div>
      </div>

      {s.show_payment_detail && (
        <div className="mt-1 border-t border-dashed border-zinc-300 pt-1 space-y-0.5">
          <div className="flex justify-between gap-1">
            <span>Tunai</span>
            <span>{formatRp(total + 5000)}</span>
          </div>
          <div className="flex justify-between gap-1">
            <span>Kembalian</span>
            <span>{formatRp(5000)}</span>
          </div>
        </div>
      )}

      <div className="mt-1 border-t border-dashed border-zinc-300 pt-1 text-center text-[10px]">
        {s.footer_text || "Terima kasih!"}
      </div>
    </div>
  );
}

export default function ReceiptSettingsSection({
  businessId,
  businessName,
  address,
  phone,
  initialSettings,
}: {
  businessId: string;
  businessName: string;
  address: string | null;
  phone: string | null;
  initialSettings: ReceiptSettings;
}) {
  const [s, setS] = useState<Required<ReceiptSettings>>({
    ...DEFAULTS,
    ...initialSettings,
  });
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (key: Exclude<keyof Required<ReceiptSettings>, "footer_text">) => {
    setS((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      await saveReceiptSettings(businessId, s as Record<string, unknown>);
      setSaved(true);
    });
  };

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Tampilan Struk</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Pilih informasi yang ditampilkan di struk pelanggan.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Checklist kiri */}
        <div className="space-y-3">
          {TOGGLES.map(({ key, label, desc }) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 group">
              <input
                type="checkbox"
                checked={s[key]}
                onChange={() => toggle(key)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600"
              />
              <div>
                <span className="text-sm text-zinc-800 group-hover:text-zinc-900">{label}</span>
                {desc && <p className="text-[11px] text-zinc-400">{desc}</p>}
              </div>
            </label>
          ))}

          {s.show_logo && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                URL logo toko
              </label>
              <input
                type="url"
                value={s.logo_url ?? ""}
                onChange={(e) => {
                  setS((prev) => ({ ...prev, logo_url: e.target.value }));
                  setSaved(false);
                }}
                placeholder="https://contoh.com/logo.png"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <p className="mt-1 text-[10px] text-zinc-400">
                Masukkan link gambar logo (JPG/PNG). Untuk logo terbaik gunakan gambar persegi atau horizontal.
              </p>
            </div>
          )}

          <div className="pt-2">
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Teks footer
            </label>
            <input
              type="text"
              value={s.footer_text}
              onChange={(e) => {
                setS((prev) => ({ ...prev, footer_text: e.target.value }));
                setSaved(false);
              }}
              placeholder="Terima kasih!"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>

          <div className="pt-1">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Menyimpan…" : saved ? "Tersimpan ✓" : "Simpan pengaturan"}
            </button>
          </div>
        </div>

        {/* Preview kanan */}
        <div>
          <p className="mb-3 text-xs font-medium text-zinc-500">Preview struk</p>
          <ReceiptPreview
            s={s}
            businessName={businessName}
            address={address}
            phone={phone}
          />
          <p className="mt-2 text-center text-[10px] text-zinc-400">
            Data contoh — struk nyata menyesuaikan transaksi
          </p>
        </div>
      </div>
    </div>
  );
}
