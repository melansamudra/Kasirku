import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReservationForm from "./reservation-form";
import { submitReservation } from "./actions";

type StorefrontProduct = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  image_url: string | null;
};

type StorefrontInfo = {
  business: {
    name: string;
    address: string | null;
    phone: string | null;
    logo_url: string | null;
    tagline: string | null;
  };
  products: StorefrontProduct[];
};

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_storefront_info", { p_slug: slug });
  const info = data as unknown as StorefrontInfo | null;

  if (!info) {
    notFound();
  }

  const { business, products } = info;
  const categories = Array.from(
    new Set(products.map((p) => p.category ?? "Menu")),
  );

  const boundSubmit = submitReservation.bind(null, slug);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-zinc-900 px-4 py-14 text-center text-white">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logo_url}
            alt={business.name}
            className="mx-auto h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold">
            {business.name.charAt(0).toUpperCase()}
          </div>
        )}
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{business.name}</h1>
        {business.tagline && (
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-300">{business.tagline}</p>
        )}
        <p className="mt-3 text-xs text-zinc-400">
          {[business.address, business.phone].filter(Boolean).join(" · ")}
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {products.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-zinc-900">Menu</h2>
            <div className="mt-4 space-y-8">
              {categories.map((category) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {category}
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {products
                      .filter((p) => (p.category ?? "Menu") === category)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-white p-3"
                        >
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="h-14 w-14 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg">
                              🍽️
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                            <p className="text-sm font-semibold text-brand-700">
                              {formatRupiah(Number(p.price))}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <h2 className="text-lg font-bold text-zinc-900">Reservasi</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Isi form di bawah, tim kami akan menghubungi untuk konfirmasi.
          </p>
          <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
            <ReservationForm action={boundSubmit} />
          </div>
        </section>
      </main>
    </div>
  );
}
