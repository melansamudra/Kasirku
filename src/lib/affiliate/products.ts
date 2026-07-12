// Placeholder — swap `affiliateUrl` for the real Tokopedia/Shopee Affiliate
// link once that account is approved. Until then these point to a plain
// marketplace search page (no commission yet, but a real working link so the
// page never looks broken to a visitor).
export type AffiliateProduct = {
  name: string;
  reason: string;
  affiliateUrl: string;
};

export type AffiliateCategory = {
  slug: string;
  icon: string;
  title: string;
  desc: string;
  products: AffiliateProduct[];
};

export const AFFILIATE_CATEGORIES: AffiliateCategory[] = [
  {
    slug: "printer-struk",
    icon: "🖨️",
    title: "Printer Struk Thermal",
    desc: "Cetak struk otomatis tiap transaksi — KasirKu sudah mendukung cetak ESC/POS langsung dari browser.",
    products: [
      {
        name: "Printer Thermal 58mm USB",
        reason: "Paling umum & terjangkau, cocok warung/kafe kecil",
        affiliateUrl: "https://www.tokopedia.com/search?st=product&q=printer+thermal+58mm",
      },
      {
        name: "Printer Thermal 80mm Bluetooth",
        reason: "Kertas lebih lebar untuk struk detail, nirkabel jadi meja lebih rapi",
        affiliateUrl: "https://www.tokopedia.com/search?st=product&q=printer+thermal+80mm+bluetooth",
      },
    ],
  },
  {
    slug: "laci-kas",
    icon: "🗄️",
    title: "Laci Kas (Cash Drawer)",
    desc: "Simpan uang tunai dengan aman — terhubung ke printer struk, terbuka otomatis tiap transaksi selesai.",
    products: [
      {
        name: "Cash Drawer RJ11",
        reason: "Standar industri, langsung terhubung ke printer struk kebanyakan merek",
        affiliateUrl: "https://www.tokopedia.com/search?st=product&q=cash+drawer+laci+kas+rj11",
      },
    ],
  },
  {
    slug: "barcode-scanner",
    icon: "🔍",
    title: "Barcode Scanner",
    desc: "Scan produk langsung di kasir — KasirKu sudah mendukung scan-to-add & barcode SKU produk.",
    products: [
      {
        name: "Barcode Scanner USB 1D/2D",
        reason: "Plug & play, terbaca sebagai keyboard tanpa driver tambahan",
        affiliateUrl: "https://www.tokopedia.com/search?st=product&q=barcode+scanner+usb",
      },
      {
        name: "Barcode Scanner Wireless",
        reason: "Fleksibel dibawa keliling toko atau gudang saat stock opname",
        affiliateUrl: "https://www.tokopedia.com/search?st=product&q=barcode+scanner+wireless",
      },
    ],
  },
  {
    slug: "tablet-stand",
    icon: "📱",
    title: "Tablet / POS Stand",
    desc: "Dudukan tablet atau HP supaya jadi layar kasir permanen yang stabil di meja.",
    products: [
      {
        name: "Tablet Stand Kasir Meja",
        reason: "Layar kasir tetap tegak, tidak perlu pegang HP terus saat sibuk",
        affiliateUrl: "https://www.tokopedia.com/search?st=product&q=tablet+stand+kasir",
      },
    ],
  },
];
