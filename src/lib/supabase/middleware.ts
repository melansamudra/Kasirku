import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Required: refreshes the auth token and keeps cookies in sync.
  // Do not add logic between createServerClient and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authPages = ["/login", "/signup", "/forgot-password"];
  const isAuthPage = authPages.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  // /order/* adalah halaman self-order pelanggan (scan QR) — tanpa login.
  // /auth/callback menukar kode dari link email jadi sesi, sebelum user ada.
  // /reset-password sama kasusnya: link reset dari email membawa token di URL
  // fragment (#access_token=...), yang cuma bisa dibaca & diproses oleh
  // supabase-js di browser — belum ada sesi/cookie sama sekali saat request
  // pertama ini sampai ke middleware, jadi tidak boleh di-redirect ke /login
  // sebelum halamannya sempat jalan.
  // "/" adalah landing page publik untuk calon pengguna yang belum daftar.
  // /terms dan /privacy juga harus bisa dibaca tanpa login.
  // /rekomendasi-alat adalah halaman afiliasi publik — harus bisa diakses
  // pengunjung mana pun tanpa daftar/login dulu, itu tujuannya.
  // /blog adalah artikel SEO publik, sama alasannya.
  // /kalkulator-hpp adalah tool gratis publik (lead magnet) — harus bisa
  // dipakai siapa pun tanpa daftar/login dulu.
  // /sitemap.xml dan /robots.txt dipanggil crawler mesin pencari tanpa sesi
  // browser sama sekali — harus tetap terbaca meski tidak ada user login.
  // /api/midtrans (webhook Midtrans) dan /api/cron (dipicu Vercel Cron) adalah
  // panggilan server-to-server tanpa sesi browser sama sekali — masing-masing
  // punya otentikasinya sendiri (verifikasi signature / CRON_SECRET), bukan
  // sesi login, jadi middleware tidak boleh me-redirect mereka ke /login.
  // /api/kalkulator-hpp-desktop/download dipanggil pembeli yang memang tidak
  // punya akun KasirKu sama sekali (guest checkout) — otentikasinya sendiri
  // lewat order_id+download_token di query string, bukan sesi login.
  const isPublicPath =
    isAuthPage ||
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/order") ||
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/terms") ||
    request.nextUrl.pathname.startsWith("/privacy") ||
    request.nextUrl.pathname.startsWith("/rekomendasi-alat") ||
    request.nextUrl.pathname.startsWith("/blog") ||
    request.nextUrl.pathname.startsWith("/kalkulator-hpp") ||
    request.nextUrl.pathname === "/sitemap.xml" ||
    request.nextUrl.pathname === "/robots.txt" ||
    request.nextUrl.pathname.startsWith("/api/midtrans") ||
    request.nextUrl.pathname.startsWith("/api/cron") ||
    request.nextUrl.pathname.startsWith("/api/kalkulator-hpp-desktop");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
