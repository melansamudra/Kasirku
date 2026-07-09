const FEATURES = [
  { icon: "🧾", label: "Kasir & struk instan" },
  { icon: "📦", label: "Stok & resep otomatis" },
  { icon: "📊", label: "Laporan real-time" },
  { icon: "🪑", label: "Self-order via QR" },
];

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full flex-1 overflow-hidden bg-zinc-50">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-brand-200/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-300/30 blur-3xl lg:right-[45%]"
      />

      {/* Panel brand — desktop */}
      <div className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-600 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-2xl"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <span className="text-lg font-bold">K</span>
          </div>
          <span className="text-lg font-bold tracking-tight">KasirKu</span>
        </div>

        <div className="relative">
          <h2 className="max-w-sm text-3xl font-bold leading-tight">
            Satu aplikasi untuk seluruh operasional tokomu
          </h2>
          <p className="mt-3 max-w-sm text-sm text-brand-50/80">
            Dari kasir harian, stok bahan baku, sampai laporan laba rugi — semua rapi
            dalam satu tempat.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm"
              >
                <span className="text-base leading-none">{f.icon}</span>
                <span className="text-xs font-medium text-white/90">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-brand-50/60">
          Dipercaya pemilik F&amp;B, retail, dan tempat wisata.
        </p>
      </div>

      {/* Panel form */}
      <div className="relative flex w-full flex-1 items-center justify-center px-4 py-12 lg:px-12">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl border border-zinc-100 bg-white/95 p-8 shadow-xl shadow-zinc-300/20 backdrop-blur-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
