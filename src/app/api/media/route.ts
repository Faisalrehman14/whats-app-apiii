import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { prepareWhatsAppMedia } from "@/lib/media-convert";
import { checkSend } from "@/lib/safety";
import { sendMedia, uploadMedia, WhatsAppApiError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS = ["image", "video", "audio", "document"] as const;
type Kind = (typeof KINDS)[number];

function kindFromMime(mime: string, hint?: string): Kind {
  if (hint && KINDS.includes(hint as Kind)) return hint as Kind;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const to = String(form.get("to") || "").replace(/[^\d+]/g, "");
  const caption = String(form.get("caption") || "");
  const hint = String(form.get("kind") || "");
  const file = form.get("file");
  if (!to || !(file instanceof File)) {
    return NextResponse.json({ error: "File and recipient are required" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const kind = kindFromMime(mime, hint);
  const config = await getConfig();
  if (!config.accessToken || !config.phoneNumberId) {
    return NextResponse.json({ error: "Connect Cloud API credentials first." }, { status: 400 });
  }

  const contact =
    (await prisma.contact.findUnique({ where: { waId: to.replace(/^\+/, "") } })) ||
    (await prisma.contact.findUnique({ where: { waId: to } }));

  const decision = checkSend({
    type: kind,
    body: caption,
    optedIn: contact?.optedIn ?? false,
    blocked: contact?.blocked ?? false,
    lastInboundAt: contact?.lastInboundAt,
    lastOutboundAt: contact?.lastOutboundAt,
    uniqueNewRecipientsToday: 0,
    dailyCap: config.dailyNewRecipientCap,
    isNewTemplateRecipient: false,
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.message, code: decision.code }, { status: 422 });
  }

  try {
    const prepared = await prepareWhatsAppMedia(file, kind);
    const mediaId = await uploadMedia(prepared.blob, prepared.mime, prepared.filename);
    const result = await sendMedia(to, kind, mediaId, {
      caption,
      filename: prepared.filename,
    });
    const wamid = result.messages?.[0]?.id;
    const waId = result.contacts?.[0]?.wa_id || to.replace(/^\+/, "");
    const saved = await prisma.contact.upsert({
      where: { waId },
      update: { lastOutboundAt: new Date() },
      create: { waId, name: waId, lastOutboundAt: new Date() },
    });
    const label =
      kind === "image" ? "📷 Photo" : kind === "video" ? "🎬 Video" : kind === "audio" ? "🎤 Voice" : `📄 ${file.name}`;
    const message = await prisma.message.create({
      data: {
        wamid,
        contactId: saved.id,
        direction: "outbound",
        type: kind,
        body: caption || label,
        mediaId,
        mimeType: prepared.mime,
        fileName: prepared.filename,
        status: "sent",
      },
    });
    return NextResponse.json({ ok: true, message, wamid, mediaId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send media";
    const status = error instanceof WhatsAppApiError ? error.status || 500 : 500;
    const payload = error instanceof WhatsAppApiError ? error.payload : undefined;
    return NextResponse.json({ error: message, payload }, { status });
  }
}
