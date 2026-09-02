import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { checkSend } from "@/lib/safety";
import { sendTemplate, sendText, WhatsAppApiError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function normalizePhone(input: string) {
  return input.replace(/[^\d+]/g, "");
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    to?: string;
    type?: "text" | "template";
    text?: string;
    templateName?: string;
    language?: string;
  };

  const to = normalizePhone(body.to || "");
  const type = body.type === "template" ? "template" : "text";
  if (!to) {
    return NextResponse.json({ error: "Recipient number is required" }, { status: 400 });
  }

  const config = await getConfig();
  if (!config.accessToken || !config.phoneNumberId) {
    return NextResponse.json(
      { error: "Connect your Cloud API credentials in Settings first." },
      { status: 400 },
    );
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const uniqueNewRecipientsToday = await prisma.contact.count({
    where: {
      lastOutboundAt: { gte: startOfDay },
      lastInboundAt: null,
    },
  });

  let contact = await prisma.contact.findUnique({ where: { waId: to.replace(/^\+/, "") } });
  if (!contact) {
    contact = await prisma.contact.findUnique({ where: { waId: to } });
  }

  const waId = contact?.waId || to.replace(/^\+/, "");
  const isNewTemplateRecipient = type === "template" && !contact?.lastOutboundAt;

  const decision = checkSend({
    type,
    body: body.text,
    optedIn: contact?.optedIn ?? false,
    blocked: contact?.blocked ?? false,
    lastInboundAt: contact?.lastInboundAt,
    lastOutboundAt: contact?.lastOutboundAt,
    uniqueNewRecipientsToday,
    dailyCap: config.dailyNewRecipientCap,
    isNewTemplateRecipient,
  });

  if (!decision.ok) {
    await prisma.auditEvent.create({
      data: {
        kind: "send_blocked",
        detail: `${decision.code}: ${to} — ${decision.message}`,
      },
    });
    return NextResponse.json(
      { error: decision.message, code: decision.code },
      { status: 422 },
    );
  }

  try {
    const result =
      type === "template"
        ? await sendTemplate(to, body.templateName || "hello_world", body.language || "en_US")
        : await sendText(to, body.text || "");

    const wamid = result.messages?.[0]?.id;
    const resolvedWaId = result.contacts?.[0]?.wa_id || waId;

    const savedContact = await prisma.contact.upsert({
      where: { waId: resolvedWaId },
      update: { lastOutboundAt: new Date() },
      create: {
        waId: resolvedWaId,
        name: resolvedWaId,
        lastOutboundAt: new Date(),
        optedIn: type === "template" ? Boolean(contact?.optedIn) : false,
      },
    });

    const message = await prisma.message.create({
      data: {
        wamid,
        contactId: savedContact.id,
        direction: "outbound",
        type,
        body: type === "template" ? `[template: ${body.templateName}]` : body.text,
        templateName: type === "template" ? body.templateName : null,
        status: "sent",
      },
    });

    return NextResponse.json({ ok: true, message, wamid });
  } catch (error) {
    const apiError = error as WhatsAppApiError;
    await prisma.auditEvent.create({
      data: {
        kind: "send_failed",
        detail: `${to}: ${apiError.message}`,
      },
    });
    return NextResponse.json(
      { error: apiError.message, payload: apiError.payload },
      { status: apiError.status || 500 },
    );
  }
}
