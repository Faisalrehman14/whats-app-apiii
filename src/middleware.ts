import { NextRequest, NextResponse } from "next/server";
import { pinConfigured, SESSION_COOKIE, verifySession } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/webhooks") || path.startsWith("/api/auth")) {
    return NextResponse.next();
  }
  if (!path.startsWith("/api/")) return NextResponse.next();
  if (!pinConfigured()) return NextResponse.next();
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
