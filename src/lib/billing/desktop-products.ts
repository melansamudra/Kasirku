// Katalog produk jual-putus (bukan langganan bisnis) — sengaja terpisah dari
// PLANS di plans.ts, karena produk di sini tidak terikat business_id sama
// sekali (pembeli tanpa akun KasirKu).
export type DesktopProductCode = "kalkulator-hpp-desktop";

export type DesktopProduct = {
  code: DesktopProductCode;
  name: string;
  description: string;
  price: number;
};

export const DESKTOP_PRODUCTS: DesktopProduct[] = [
  {
    code: "kalkulator-hpp-desktop",
    name: "Kalkulator HPP Desktop",
    description:
      "Aplikasi desktop untuk Windows — kelola bahan baku, susun resep menu, dan hitung HPP & margin. Sekali beli, data tersimpan di komputer kamu sendiri, tidak butuh internet setelah install.",
    price: 69000,
  },
];

export function getDesktopProduct(code: string): DesktopProduct | undefined {
  return DESKTOP_PRODUCTS.find((p) => p.code === code);
}
