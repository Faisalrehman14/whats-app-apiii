import { NextRequest, NextResponse } from "next/server";
import { pinConfigured, SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const required = pinConfigured();
  const authenticated = required
    ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
    : true;
  return NextResponse.json({ required, authenticated });
}
