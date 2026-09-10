import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { todayWibDateString } from "@/lib/wib";
import { submitOpnameEntries } from "./actions";
import OpnameForm from "./opname-form";
import EntryActions from "./entry-actions";
import StockOpnameLinkBox from "./link-box";
import KartuStokList, { type KartuStokRow } from "../lokasi/[locationId]/kartu-stok/kartu-stok-list";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  addDaysStr,
  getPeriodRange,
  parsePeriod,
  wibStartOfDay,
} from "../reports/period";
import PeriodTabs from "../reports/period-tabs";

const DEPARTMENT_LABELS: Record<string, string> = { dapur: "Dapur", bar: "Bar", front: "Front" };

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function StockOpnamePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    divisi?: string;
    period?: string;
    from?: string;
    to?: string;
    tab?: string;
    date?: string;
  }>;
}) {
  const { businessId } = await params;
  const { divisi, period: periodParam, from, to, tab: tabParam, date: dateParam } = await searchParams;
  const activeTab: "opname" | "kartu-stok" | "rekonsil" =
    tabParam === "kartu-stok" ? "kartu-stok" : tabParam === "rekonsil" ? "rekonsil" : "opname";
  const base = `/business/${businessId}/stock-opname`;

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, stock_opname_slug")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const { data: allIngredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, stock, departments")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name");

  const departmentsInUse = Array.from(
    new Set((allIngredients ?? []).flatMap((i) => i.departments ?? [])),
  ).sort();

  const selectedDivisi = divisi && departmentsInUse.includes(divisi) ? divisi : null;
  const visibleIngredients = selectedDivisi
    ? (allIngredients ?? []).filter((i) => (i.departments ?? []).includes(selectedDivisi))
    : (allIngredients ?? []);

  const rekonsilDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? (dateParam as string) : todayWibDateString();

  // Query string dipakai berulang buat link tab/divisi/periode -- selalu bawa
  // parameter lain yang lagi aktif supaya pindah salah satu filter tidak
  // mereset filter yang lain.
  function qs(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string | undefined> = {
      tab: activeTab !== "opname" ? activeTab : undefined,
      divisi: selectedDivisi ?? undefined,
      period: activeTab === "kartu-stok" ? period : undefined,
      from: activeTab === "kartu-stok" ? from : undefined,
      to: activeTab === "kartu-stok" ? to : undefined,
      date: activeTab === "rekonsil" ? rekonsilDate : undefined,
      ...overrides,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  // Pending dipisah dari riwayat (bukan digabung 1 query ber-limit) supaya
  // entri yang masih perlu ditindak TIDAK BISA "kepotong" dari tampilan
  // walau riwayat terverifikasi/ditolak sudah menumpuk ratusan baris --
  // limit 50 cuma berlaku ke riwayat, bukan ke antrian pending.
  const [{ data: pendingEntriesRaw }, { data: historyEntriesRaw }] = await Promise.all([
    supabase
      .from("ingredient_opname_entries")
      .select("id, ingredient_id, entry_date, reported_stock, system_stock_at_report, status, submitted_by_name, ingredients(name, unit, departments)")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("ingredient_opname_entries")
      .select("id, ingredient_id, entry_date, reported_stock, system_stock_at_report, status, submitted_by_name, ingredients(name, unit, departments)")
      .eq("business_id", businessId)
      .neq("status", "pending")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  function filterByDivisi<T extends { ingredients: unknown }>(rows: T[] | null): T[] {
    if (!selectedDivisi) return rows ?? [];
    return (rows ?? []).filter((r) => {
      const ing = r.ingredients as unknown as { departments?: string[] } | null;
      return (ing?.departments ?? []).includes(selectedDivisi);
    });
  }

  const pendingEntries = filterByDivisi(pendingEntriesRaw);
  const historyEntries = filterByDivisi(historyEntriesRaw);

  // Stok Data di bawah tetap real-time (saldo & opname terakhir SAAT INI),
  // cuma Stock Masuk/Keluar yang difilter periode -- sama pola dengan Kartu
  // Stok per-lokasi (lokasi/[locationId]/kartu-stok/page.tsx).
  const adjustments = await fetchAllRows<{
    ingredient_id: string | null;
    item_name: string;
    unit: string | null;
    diff: number;
  }>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("stock_adjustments")
      .select("ingredient_id, item_name, unit, diff")
      .eq("business_id", businessId)
      .is("location_id", null)
      .not("ingredient_id", "is", null);
    if (fromIso) q = q.gte("entry_date", fromIso.slice(0, 10));
    if (toIsoExclusive) q = q.lt("entry_date", toIsoExclusive.slice(0, 10));
    return q.range(rangeFrom, rangeTo);
  });

  // checkout_transaction() memotong ingredients.stock LANGSUNG per resep
  // produk, tanpa pernah menulis baris ke stock_adjustments (cuma dicatat di
  // transaction_ingredient_consumption) -- jadi Stock Keluar akibat penjualan
  // harus dihitung terpisah dari sini, bukan dari query stock_adjustments di
  // atas. Transaksi voided dilewati karena stoknya sudah dikembalikan oleh
  // void_transaction() (lihat 20260908100000_transaction_mirroring.sql).
  const salesConsumption = await fetchAllRows<{ ingredient_id: string; qty: number }>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("transaction_ingredient_consumption")
      .select("ingredient_id, qty, transactions!inner(business_id, date, voided)")
      .eq("transactions.business_id", businessId)
      .eq("transactions.voided", false);
    if (fromIso) q = q.gte("transactions.date", fromIso);
    if (toIsoExclusive) q = q.lt("transactions.date", toIsoExclusive);
    return q.range(rangeFrom, rangeTo);
  });

  const { data: latestOpnamePerIngredient } = await supabase
    .from("ingredient_opname_entries")
    .select("ingredient_id, reported_stock, status, entry_date")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  // Rekonsil Stok Harian: BUKAN filter data yang ada, tapi hitung mundur dari
  // saldo LIVE sekarang -- saldo di akhir tanggal terpilih = saldo sekarang
  // dikurangi semua pergerakan yang terjadi SETELAH tanggal itu. Tidak ada
  // tabel snapshot harian, jadi ini dihitung on-the-fly dari log pergerakan
  // yang sudah ada (stock_adjustments + transaction_ingredient_consumption).
  let rekonsilRows: KartuStokRow[] = [];
  if (activeTab === "rekonsil") {
    const dayStartIso = wibStartOfDay(rekonsilDate);
    const nextDayStartIso = wibStartOfDay(addDaysStr(rekonsilDate, 1));

    const [adjFromDate, consOnDay, consAfterDay, opnameOnDate] = await Promise.all([
      fetchAllRows<{ ingredient_id: string | null; entry_date: string; diff: number }>((rf, rt) =>
        supabase
          .from("stock_adjustments")
          .select("ingredient_id, entry_date, diff")
          .eq("business_id", businessId)
          .is("location_id", null)
          .not("ingredient_id", "is", null)
          .gte("entry_date", rekonsilDate)
          .range(rf, rt),
      ),
      fetchAllRows<{ ingredient_id: string; qty: number }>((rf, rt) =>
        supabase
          .from("transaction_ingredient_consumption")
          .select("ingredient_id, qty, transactions!inner(business_id, date, voided)")
          .eq("transactions.business_id", businessId)
          .eq("transactions.voided", false)
          .gte("transactions.date", dayStartIso)
          .lt("transactions.date", nextDayStartIso)
          .range(rf, rt),
      ),
      fetchAllRows<{ ingredient_id: string; qty: number }>((rf, rt) =>
        supabase
          .from("transaction_ingredient_consumption")
          .select("ingredient_id, qty, transactions!inner(business_id, date, voided)")
          .eq("transactions.business_id", businessId)
          .eq("transactions.voided", false)
          .gte("transactions.date", nextDayStartIso)
          .range(rf, rt),
      ),
      // Hasil hitung fisik (opname) YANG DICATAT PERSIS di tanggal terpilih --
      // beda dari Kartu Stok tab yang selalu nampilin opname TERBARU (tanpa
      // peduli tanggal). Di sini justru itu yang mau dibandingkan: stok
      // sistem tanggal itu vs hasil hitung fisik tanggal itu.
      supabase
        .from("ingredient_opname_entries")
        .select("id, ingredient_id, reported_stock, status, entry_date")
        .eq("business_id", businessId)
        .eq("entry_date", rekonsilDate)
        .order("created_at", { ascending: false }),
    ]);

    const rekonsilMap = new Map<string, KartuStokRow & { afterDate: number }>();
    for (const ing of allIngredients ?? []) {
      rekonsilMap.set(ing.id, {
        key: `ing:${ing.id}`,
        id: ing.id,
        componentType: "ingredient",
        name: ing.name,
        unit: ing.unit,
        stokData: Number(ing.stock),
        stockMasuk: 0,
        stockKeluar: 0,
        lastOpname: null,
        afterDate: 0,
      });
    }
    for (const a of adjFromDate) {
      if (!a.ingredient_id) continue;
      const row = rekonsilMap.get(a.ingredient_id);
      if (!row) continue;
      const diff = Number(a.diff);
      if (a.entry_date === rekonsilDate) {
        if (diff > 0) row.stockMasuk += diff;
        else row.stockKeluar += Math.abs(diff);
      } else {
        // entry_date > rekonsilDate (query sudah difilter >= rekonsilDate) --
        // dijumlahkan dulu, nanti dikurangkan dari saldo sekarang di bawah.
        row.afterDate += diff;
      }
    }
    for (const c of consOnDay) {
      const row = rekonsilMap.get(c.ingredient_id);
      if (row) row.stockKeluar += Number(c.qty);
    }
    for (const c of consAfterDay) {
      const row = rekonsilMap.get(c.ingredient_id);
      // Konsumsi selalu mengurangi stok -- kontribusinya ke perubahan bersih
      // setelah tanggal ini negatif, makanya dikurangkan (bukan ditambahkan)
      // ke afterDate supaya "saldo sekarang - afterDate" balik jadi benar.
      if (row) row.afterDate -= Number(c.qty);
    }
    for (const o of opnameOnDate.data ?? []) {
      const row = rekonsilMap.get(o.ingredient_id);
      // Baris pertama per bahan = paling baru (sudah order by created_at
      // desc) -- kalau bahan itu diopname 2x di tanggal yang sama, yang
      // dipakai buat dibandingkan adalah submission terakhir.
      if (row && !row.lastOpname) {
        row.lastOpname = {
          reportedStock: Number(o.reported_stock),
          status: o.status as "pending" | "verified" | "rejected",
          entryDate: o.entry_date,
        };
        row.opnameEntryId = o.id;
      }
    }

    rekonsilRows = [...rekonsilMap.values()]
      .map((r) => ({ ...r, stokData: r.stokData - r.afterDate }))
      .filter((r) => !selectedDivisi || visibleIngredients.some((i) => i.id === r.id))
      .map(({ afterDate: _afterDate, ...rest }) => rest)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const rows = new Map<string, KartuStokRow>();
  for (const ing of allIngredients ?? []) {
    rows.set(`ing:${ing.id}`, {
      key: `ing:${ing.id}`,
      id: ing.id,
      componentType: "ingredient",
      name: ing.name,
      unit: ing.unit,
      stokData: Number(ing.stock),
      stockMasuk: 0,
      stockKeluar: 0,
      lastOpname: null,
    });
  }
  for (const a of adjustments) {
    if (!a.ingredient_id) continue;
    const row = rows.get(`ing:${a.ingredient_id}`);
    if (!row) continue;
    const diff = Number(a.diff);
    if (diff > 0) row.stockMasuk += diff;
    else row.stockKeluar += Math.abs(diff);
  }
  for (const c of salesConsumption) {
    const row = rows.get(`ing:${c.ingredient_id}`);
    if (row) row.stockKeluar += Number(c.qty);
  }
  for (const o of latestOpnamePerIngredient ?? []) {
    const row = rows.get(`ing:${o.ingredient_id}`);
    // Baris pertama yang ketemu per bahan = paling baru (sudah order by
    // created_at desc), sisanya (opname lama) dilewati.
    if (row && !row.lastOpname) {
      row.lastOpname = {
        reportedStock: Number(o.reported_stock),
        status: o.status as "pending" | "verified" | "rejected",
        entryDate: o.entry_date,
      };
    }
  }
  const kartuStokList = [...rows.values()]
    .filter((r) => !selectedDivisi || visibleIngredients.some((i) => i.id === r.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const boundSubmit = submitOpnameEntries.bind(null, businessId);
  const today = todayWibDateString();

  function renderOpnameRow(e: {
    id: string;
    entry_date: string;
    reported_stock: number;
    system_stock_at_report: number;
    status: string;
    ingredients: unknown;
  }) {
    const diff = Number(e.reported_stock) - Number(e.system_stock_at_report);
    const ing = e.ingredients as unknown as { name: string; unit: string } | null;
    return (
      <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
        <div className="min-w-0">
          <p className="font-medium text-zinc-700">
            {ing?.name ?? "Bahan terhapus"} · {formatDate(e.entry_date)}
          </p>
          <p className="text-[11px] text-zinc-400">
            Sistem {e.system_stock_at_report} {ing?.unit} vs Fisik {e.reported_stock} {ing?.unit} ·{" "}
            <span className={diff === 0 ? "text-zinc-400" : diff > 0 ? "text-brand-700" : "text-red-600"}>
              Selisih {diff > 0 ? "+" : ""}
              {diff}
            </span>
          </p>
        </div>
        {e.status === "pending" ? (
          <EntryActions businessId={businessId} entryId={e.id} />
        ) : (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              e.status === "verified" ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {e.status === "verified" ? "✓ Terverifikasi" : "Ditolak"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Stock Opname — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {activeTab === "opname" &&
              "Hitung fisik bahan baku, bandingkan dengan sistem, dan verifikasi selisihnya. Stok baru berubah setelah diverifikasi — bukan langsung saat dicatat."}
            {activeTab === "kartu-stok" && "Saldo & pergerakan stok bahan baku per periode."}
            {activeTab === "rekonsil" &&
              "Saldo bahan baku persis di akhir tanggal yang dipilih, dihitung mundur dari saldo sekarang."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 text-xs font-semibold">
          <a
            href={`${base}${qs({ tab: undefined, period: undefined, from: undefined, to: undefined, date: undefined })}`}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === "opname" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Catat Opname
          </a>
          <a
            href={`${base}${qs({ tab: "kartu-stok", date: undefined })}`}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === "kartu-stok" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Kartu Stok
          </a>
          <a
            href={`${base}${qs({ tab: "rekonsil", period: undefined, from: undefined, to: undefined })}`}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === "rekonsil" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Rekonsil Stok Harian
          </a>
        </div>
      </div>

      {departmentsInUse.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`${base}${qs({ divisi: undefined })}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              !selectedDivisi ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Semua Divisi
          </a>
          {departmentsInUse.map((d) => (
            <a
              key={d}
              href={`${base}${qs({ divisi: d })}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                selectedDivisi === d ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {DEPARTMENT_LABELS[d] ?? d}
            </a>
          ))}
        </div>
      )}

      {activeTab === "opname" && (
        <>
          <StockOpnameLinkBox businessId={businessId} initialSlug={business.stock_opname_slug ?? ""} />

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Catat Hasil Hitung Fisik</h2>
            <OpnameForm action={boundSubmit} ingredients={visibleIngredients ?? []} today={today} />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-bold text-zinc-900">Menunggu Verifikasi</h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Semua entri pending ditampilkan di sini, tidak ada batas jumlah -- tidak akan "kepotong" walau
                riwayat di bawah sudah menumpuk banyak.
              </p>
            </div>
            <div className="divide-y divide-zinc-50 px-4">
              {pendingEntries.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-300">Tidak ada entri menunggu verifikasi.</p>
              )}
              {pendingEntries.map((e) => renderOpnameRow(e))}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-bold text-zinc-900">Riwayat</h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">50 entri terverifikasi/ditolak terakhir.</p>
            </div>
            <div className="divide-y divide-zinc-50 px-4">
              {historyEntries.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-300">Belum ada riwayat.</p>
              )}
              {historyEntries.map((e) => renderOpnameRow(e))}
            </div>
          </div>
        </>
      )}

      {activeTab === "kartu-stok" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-400">
              Stok Data & Stok Riil selalu saldo terkini. Stock Masuk/Keluar: {PERIOD_DESCRIPTIONS[period]}.
            </p>
            <PeriodTabs
              basePath={base}
              period={period}
              extraQuery={`tab=kartu-stok${selectedDivisi ? `&divisi=${selectedDivisi}` : ""}`}
            />
          </div>

          {period === "custom" && (
            <form method="get" className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
              <input type="hidden" name="tab" value="kartu-stok" />
              <input type="hidden" name="period" value="custom" />
              {selectedDivisi && <input type="hidden" name="divisi" value={selectedDivisi} />}
              <label className="text-xs font-medium text-zinc-600">
                Dari
                <input
                  type="date"
                  name="from"
                  defaultValue={from}
                  className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                Sampai
                <input
                  type="date"
                  name="to"
                  defaultValue={to}
                  className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Terapkan
              </button>
            </form>
          )}

          <div className="mt-3">
            <KartuStokList items={kartuStokList} />
          </div>
        </div>
      )}

      {activeTab === "rekonsil" && (
        <div className="mt-4">
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
            <input type="hidden" name="tab" value="rekonsil" />
            {selectedDivisi && <input type="hidden" name="divisi" value={selectedDivisi} />}
            <label className="text-xs font-medium text-zinc-600">
              Tanggal
              <input
                type="date"
                name="date"
                defaultValue={rekonsilDate}
                max={todayWibDateString()}
                className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Tampilkan
            </button>
          </form>
          <p className="mt-2 text-[11px] text-zinc-400">
            Stok Data dihitung persis di akhir tanggal {formatDate(rekonsilDate)} (bukan saldo hari ini). Stok
            Riil & Selisih diambil dari hasil Catat Opname yang tercatat di tanggal itu juga — kalau tidak ada
            opname di tanggal ini, kolomnya kosong.
          </p>

          <div className="mt-3">
            <KartuStokList items={rekonsilRows} businessId={businessId} />
          </div>
        </div>
      )}
    </div>
  );
}
