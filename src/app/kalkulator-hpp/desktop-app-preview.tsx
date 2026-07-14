// Ilustrasi statis tampilan aplikasi desktop yang dijual — bukan screenshot
// asli (aplikasi Electron-nya jalan lokal di komputer pembeli, tidak ada
// cara mengambil screenshot otomatis dari sini), tapi mockup CSS yang
// merepresentasikan layout aslinya (sidebar + dashboard) supaya pengunjung
// halaman gratis ini tahu seperti apa produk yang mereka beli.
export function DesktopAppPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-red-300" />
        <span className="h-2 w-2 rounded-full bg-amber-300" />
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 text-[10px] font-medium text-zinc-400">Kalkulator HPP Desktop</span>
      </div>

      <div className="flex">
        <div className="w-14 shrink-0 space-y-1.5 border-r border-zinc-100 bg-white p-2">
          <div className="rounded-md bg-brand-600 px-1.5 py-1.5">
            <div className="h-1.5 w-full rounded-full bg-white/70" />
          </div>
          <div className="rounded-md px-1.5 py-1.5">
            <div className="h-1.5 w-full rounded-full bg-zinc-200" />
          </div>
          <div className="rounded-md px-1.5 py-1.5">
            <div className="h-1.5 w-full rounded-full bg-zinc-200" />
          </div>
        </div>

        <div className="flex-1 space-y-2 p-3">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-md border border-zinc-100 bg-zinc-50 p-1.5">
              <div className="h-1 w-6 rounded-full bg-zinc-300" />
              <div className="mt-1 h-2 w-8 rounded-full bg-zinc-700" />
            </div>
            <div className="rounded-md border border-brand-200 bg-brand-50 p-1.5">
              <div className="h-1 w-6 rounded-full bg-brand-300" />
              <div className="mt-1 h-2 w-8 rounded-full bg-brand-700" />
            </div>
          </div>

          <div className="flex h-12 items-end gap-1 rounded-md border border-zinc-100 bg-zinc-50 p-2">
            <div className="w-full rounded-t bg-brand-500" style={{ height: "60%" }} />
            <div className="w-full rounded-t bg-brand-500" style={{ height: "90%" }} />
            <div className="w-full rounded-t bg-brand-400" style={{ height: "40%" }} />
            <div className="w-full rounded-t bg-brand-300" style={{ height: "70%" }} />
            <div className="w-full rounded-t bg-brand-400" style={{ height: "50%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
