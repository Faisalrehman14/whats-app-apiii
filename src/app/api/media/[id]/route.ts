import { NextRequest, NextResponse } from "next/server";
import { downloadMedia, WhatsAppApiError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const media = await downloadMedia(id);
    const headers = new Headers();
    headers.set("Content-Type", media.mimeType);
    headers.set("Cache-Control", "private, max-age=3600");
    if (media.contentLength) headers.set("Content-Length", media.contentLength);
    return new NextResponse(media.body, { headers });
  } catch (error) {
    const apiError = error as WhatsAppApiError;
    return NextResponse.json({ error: apiError.message }, { status: apiError.status || 500 });
  }
}
