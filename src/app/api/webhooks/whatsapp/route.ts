import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { verifySignature } from "@/lib/signature";
import { extractInboundText } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected =
    process.env.WHATSAPP_VERIFY_TOKEN || "deft-decor-webhook";

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

type WebhookPayload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: Record<string, unknown>[];
        statuses?: {
          id: string;
          status: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string; message?: string }[];
        }[];
      };
    }[];
  }[];
};

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const config = await getConfig();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(raw, signature, config.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object && payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  try {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const inbound of value.messages ?? []) {
        const waId = String(inbound.from ?? "");
        const wamid = String(inbound.id ?? "");
        if (!waId || !wamid) continue;

        const existing = await prisma.message.findUnique({ where: { wamid } });
        if (existing) continue;

        const profile = value.contacts?.find((c) => c.wa_id === waId);
        const parsed = extractInboundText(inbound);
        const ts = inbound.timestamp
          ? new Date(Number(inbound.timestamp) * 1000)
          : new Date();

        const contact = await prisma.contact.upsert({
          where: { waId },
          update: {
            name: profile?.profile?.name || undefined,
            lastInboundAt: ts,
            unreadCount: { increment: 1 },
          },
          create: {
            waId,
            name: profile?.profile?.name || waId,
            lastInboundAt: ts,
            unreadCount: 1,
            optedIn: true,
            optedInAt: ts,
          },
        });

        await prisma.message.create({
          data: {
            wamid,
            contactId: contact.id,
            direction: "inbound",
            type: parsed.type,
            body: parsed.body,
            mediaId: parsed.mediaId,
            mimeType: parsed.mimeType,
            fileName: parsed.fileName,
            status: "received",
            createdAt: ts,
          },
        });

        const lower = parsed.body.toLowerCase().trim();
        if (["stop", "unsubscribe", "opt out", "opt-out"].includes(lower)) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { optedIn: false, blocked: true },
          });
          await prisma.auditEvent.create({
            data: {
              kind: "opt_out",
              detail: `${waId} opted out with "${parsed.body}"`,
            },
          });
        }
      }

      for (const status of value.statuses ?? []) {
        if (!status.id) continue;
        await prisma.message.updateMany({
          where: { wamid: status.id },
          data: {
            status: status.status,
            errorCode: status.errors?.[0]?.code
              ? String(status.errors[0].code)
              : undefined,
            errorMessage:
              status.errors?.[0]?.message || status.errors?.[0]?.title,
          },
        });
      }
    }
  }
  } catch (error) {
    console.error("Webhook processing failed", error);
  }

  return NextResponse.json({ ok: true });
}
