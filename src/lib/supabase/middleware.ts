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
  // "/" adalah landing page publik untuk calon pengguna yang belum daftar.
  const isPublicPath =
    isAuthPage ||
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/order") ||
    request.nextUrl.pathname.startsWith("/auth/callback");

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
