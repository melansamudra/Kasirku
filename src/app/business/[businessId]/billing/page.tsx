import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionAccess } from "@/lib/billing/status";
import { PLANS, getPlan } from "@/lib/billing/plans";
import { BILLING_MANUAL_MODE, BILLING_CONTACT } from "@/lib/billing/config";
import PayButton from "./pay-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: "Belum Berlangganan",
  active: "Aktif",
  past_due: "Jatuh Tempo",
  expired: "Kedaluwarsa",
};

const STATUS_BADGE: Record<string, string> = {
  unpaid: "bg-zinc-100 text-zinc-600",
  active: "bg-brand-50 text-brand-700",
  past_due: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-600",
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { businessId } = await params;
  const { status: finishStatus } = await searchParams;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const access = await getSubscriptionAccess(supabase, businessId);
  const currentPlan = access.planCode ? getPlan(access.planCode) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-lg font-bold text-zinc-900">Langganan — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Pilih paket untuk mengaktifkan/memperpanjang akses dashboard &amp; kasir.
      </p>

      {finishStatus === "selesai" && (
        <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700">
          Terima kasih! Kalau pembayaran berhasil, status di bawah akan berubah otomatis dalam
          beberapa saat (menunggu konfirmasi dari payment gateway).
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">Status Saat Ini</p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[access.status]}`}>
            {STATUS_LABELS[access.status]}
          </span>
        </div>
        {currentPlan && (
          <p className="mt-1 text-sm font-semibold text-zinc-900">{currentPlan.name}</p>
        )}
        {access.periodEnd && (
          <p className="mt-0.5 text-xs text-zinc-400">
            {access.status === "past_due" ? "Jatuh tempo sejak" : "Berlaku sampai"}{" "}
            {new Date(access.periodEnd).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
        {access.status === "past_due" && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Segera perpanjang sebelum masa tenggang habis agar akses tidak terkunci.
          </p>
        )}
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Paket Lengkap — Kasir + Akuntansi
        </p>
        <PlanGrid plans={PLANS.filter((p) => p.family === "full")} businessId={businessId} business={business} />
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Finance Only — Sudah Punya Kasir Sendiri? Cukup Akuntansi &amp; SDM Saja
        </p>
        <PlanGrid
          plans={PLANS.filter((p) => p.family === "finance")}
          businessId={businessId}
          business={business}
        />
      </div>
    </div>
  );
}

function PlanGrid({
  plans,
  businessId,
  business,
}: {
  plans: typeof PLANS;
  businessId: string;
  business: { name: string };
}) {
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-3">
      {plans.map((plan) => {
        const message = encodeURIComponent(
          `Halo, saya mau aktivasi paket ${plan.name} untuk toko "${business.name}" di KasirKu.`,
        );
        return (
          <div key={plan.code} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-bold text-zinc-900">{plan.name}</p>
            <p className="mt-1 text-xl font-bold text-brand-700">{formatRupiah(plan.price)}</p>
            <p className="text-[11px] text-zinc-400">
              {plan.kind === "lifetime" ? "Sekali bayar, seterusnya" : `Setiap ${plan.periodDays} hari`}
            </p>
            <div className="mt-4">
              {BILLING_MANUAL_MODE ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500">
                    Pembayaran otomatis belum aktif — hubungi kami dulu untuk aktivasi.
                  </p>
                  <a
                    href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${message}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    💬 Chat WhatsApp
                  </a>
                  <a
                    href={`mailto:${BILLING_CONTACT.email}?subject=${encodeURIComponent(
                      `Aktivasi paket ${plan.name} — ${business.name}`,
                    )}&body=${message}`}
                    className="block w-full rounded-xl border border-zinc-200 py-2.5 text-center text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    ✉️ Email
                  </a>
                </div>
              ) : (
                <PayButton businessId={businessId} planCode={plan.code} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
