import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ログインの確認（4章）とセッションの更新。権限の最終確認は各画面・各処理のサーバー側でも行う。

const MEMBER_PREFIXES = ["/events", "/orders", "/mypage"];

function isMemberPath(pathname: string) {
  return MEMBER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdminPath(pathname: string) {
  if (!(pathname === "/admin" || pathname.startsWith("/admin/"))) return false;
  return !(pathname === "/admin/login" || pathname.startsWith("/admin/login/"));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // JWT を確かめ、必要ならトークンを更新する
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname, search } = request.nextUrl;

  if (isMemberPath(pathname) && !claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (isAdminPath(pathname) && (!claims || claims.aal !== "aal2")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 静的ファイル・画像・Webhook・定期処理には通さない
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
