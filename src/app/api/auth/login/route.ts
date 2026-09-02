import { NextResponse } from "next/server";
import { pinConfigured, pinsMatch, sessionCookie, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!pinConfigured()) {
    return NextResponse.json({ ok: true, required: false });
  }
  const body = (await request.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin || "");
  if (!pinsMatch(pin)) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookie(await signSession()));
  return res;
}
