"use client";

import { useActionState, useState } from "react";
import {
  addProductDiscountRule,
  addPromoDiscountRule,
  deleteDiscountRule,
  toggleDiscountRuleActive,
  type DiscountRuleState,
} from "./actions";

type Product = { id: string; name: string };

type DiscountRule = {
  id: string;
  type: "per_product" | "promo";
  product_id: string | null;
  name: string | null;
  value: number;
  value_type: "pct" | "amt";
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  products?: { name: string } | null;
};

function formatValue(value: number, valueType: "pct" | "amt") {
  return valueType === "pct" ? `${value}%` : `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateRange(from: string | null, until: string | null) {
  if (!from && !until) return "Berlaku selamanya";
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  if (from && until) return `${fmt(from)} – ${fmt(until)}`;
  if (from) return `Mulai ${fmt(from)}`;
  return `s/d ${fmt(until!)}`;
}

function AddProductDiscountForm({
  businessId,
  products,
}: {
  businessId: string;
  products: Product[];
}) {
  const action = addProductDiscountRule.bind(null, businessId);
  const [state, formAction, pending] = useActionState<DiscountRuleState, FormData>(action, {
    error: null,
  });
  const [valueType, setValueType] = useState<"pct" | "amt">("pct");

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-xl border border-dashed border-zinc-200 p-3">
      <p className="text-xs font-medium text-zinc-700">+ Tambah Diskon Menu</p>
      <select
        name="productId"
        required
        className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
      >
        <option value="">Pilih menu…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <div className="flex overflow-hidden rounded-lg border border-zinc-200">
          <button
            type="button"
            onClick={() => setValueType("pct")}
            className={`px-2.5 py-1.5 text-xs font-bold ${valueType === "pct" ? "bg-brand-600 text-white" : "text-zinc-500"}`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => setValueType("amt")}
            className={`px-2.5 py-1.5 text-xs font-bold ${valueType === "amt" ? "bg-brand-600 text-white" : "text-zinc-500"}`}
          >
            Rp
          </button>
        </div>
        <input type="hidden" name="valueType" value={valueType} />
        <input
          type="number"
          name="value"
          min="0"
          max={valueType === "pct" ? 100 : undefined}
          step="any"
          required
          placeholder={valueType === "pct" ? "mis. 10" : "mis. 5000"}
          className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Simpan
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function AddPromoForm({ businessId }: { businessId: string }) {
  const action = addPromoDiscountRule.bind(null, businessId);
  const [state, formAction, pending] = useActionState<DiscountRuleState, FormData>(action, {
    error: null,
  });
  const [valueType, setValueType] = useState<"pct" | "amt">("pct");

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-xl border border-dashed border-zinc-200 p-3">
      <p className="text-xs font-medium text-zinc-700">+ Tambah Promo</p>
      <input
        type="text"
        name="name"
        required
        placeholder="Nama promo, mis. Promo Lebaran"
        className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
      />
      <div className="flex gap-2">
        <div className="flex overflow-hidden rounded-lg border border-zinc-200">
          <button
            type="button"
            onClick={() => setValueType("pct")}
            className={`px-2.5 py-1.5 text-xs font-bold ${valueType === "pct" ? "bg-brand-600 text-white" : "text-zinc-500"}`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => setValueType("amt")}
            className={`px-2.5 py-1.5 text-xs font-bold ${valueType === "amt" ? "bg-brand-600 text-white" : "text-zinc-500"}`}
          >
            Rp
          </button>
        </div>
        <input type="hidden" name="valueType" value={valueType} />
        <input
          type="number"
          name="value"
          min="0"
          max={valueType === "pct" ? 100 : undefined}
          step="any"
          required
          placeholder={valueType === "pct" ? "mis. 15" : "mis. 10000"}
          className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-zinc-400 mb-0.5">Berlaku dari (opsional)</label>
          <input
            type="date"
            name="validFrom"
            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-zinc-400 mb-0.5">s/d (opsional)</label>
          <input
            type="date"
            name="validUntil"
            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Simpan Promo
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

export default function DiscountRulesSection({
  businessId,
  rules,
  products,
}: {
  businessId: string;
  rules: DiscountRule[];
  products: Product[];
}) {
  const productRules = rules.filter((r) => r.type === "per_product");
  const promoRules = rules.filter((r) => r.type === "promo");

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Diskon &amp; Promo</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Kasir tidak lagi bisa memasukkan diskon manual. Semua diskon diatur di sini dan
        diterapkan otomatis saat checkout.
      </p>

      {/* Diskon per menu */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold text-zinc-700">Diskon per Menu</h3>
        <p className="text-[11px] text-zinc-400">Otomatis berlaku saat menu tertentu masuk keranjang.</p>
        <div className="mt-2 space-y-2">
          {productRules.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-center text-xs text-zinc-400">
              Belum ada diskon per menu.
            </p>
          ) : (
            productRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-zinc-900">
                    {r.products?.name ?? "(produk dihapus)"}
                  </p>
                  <p className="text-[11px] text-brand-700 font-semibold">
                    Diskon {formatValue(r.value, r.value_type)}
                  </p>
                </div>
                <button
                  onClick={() => deleteDiscountRule(businessId, r.id)}
                  className="text-xs text-zinc-400 hover:text-red-500"
                >
                  Hapus
                </button>
              </div>
            ))
          )}
        </div>
        {products.length > 0 && (
          <AddProductDiscountForm businessId={businessId} products={products} />
        )}
      </div>

      {/* Promo global */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold text-zinc-700">Promo Global</h3>
        <p className="text-[11px] text-zinc-400">
          Diskon seluruh order. Hanya satu promo aktif yang berlaku di kasir.
        </p>
        <div className="mt-2 space-y-2">
          {promoRules.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-center text-xs text-zinc-400">
              Belum ada promo.
            </p>
          ) : (
            promoRules.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-zinc-900">{r.name}</p>
                  <p className="text-[11px] text-brand-700 font-semibold">
                    {formatValue(r.value, r.value_type)}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {formatDateRange(r.valid_from, r.valid_until)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleDiscountRuleActive(businessId, r.id, !r.active)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      r.active
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-zinc-200 text-zinc-400"
                    }`}
                  >
                    {r.active ? "Aktif" : "Nonaktif"}
                  </button>
                  <button
                    onClick={() => deleteDiscountRule(businessId, r.id)}
                    className="text-xs text-zinc-400 hover:text-red-500"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <AddPromoForm businessId={businessId} />
      </div>
    </div>
  );
}
