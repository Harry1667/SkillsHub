import { NextResponse, type NextRequest } from "next/server";

// 輕量 middleware：只檢查 cookie 是否存在。完整驗證留到 server component / API 裡。
// 目的：未登入時從任何頁面直接跳 /login。
const PROTECTED_PREFIXES = ["/dashboard", "/skills", "/settings", "/admin", "/discover"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const hasCookie = req.cookies.has("skillshub_session");
  if (hasCookie) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/skills/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/discover/:path*",
  ],
};
