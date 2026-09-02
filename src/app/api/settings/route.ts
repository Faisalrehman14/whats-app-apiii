import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig, isConfigured, saveConfig, type AppConfig } from "@/lib/config";
import { webhookPublicUrl } from "@/lib/phone";
import { ensureWebhookSubscription, getPhoneHealth, listTemplates, WhatsAppApiError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getConfig();
  let health = null;
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let apiError: string | null = null;
  let webhook = null;

  if (isConfigured(config)) {
    try {
      health = await getPhoneHealth();
    } catch (error) {
      apiError = (error as WhatsAppApiError).message;
    }
    try {
      templates = await listTemplates();
    } catch {
      templates = [];
    }
    try {
      webhook = await ensureWebhookSubscription();
    } catch (error) {
      webhook = {
        url: webhookPublicUrl(),
        subscribed: false,
        error: (error as Error).message,
      };
    }
  }

  const lastWebhook = await prisma.setting.findUnique({ where: { key: "lastWebhookAt" } });
  const recentEvents = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return NextResponse.json({
    configured: isConfigured(config),
    config: {
      phoneNumberId: config.phoneNumberId,
      wabaId: config.wabaId,
      graphVersion: config.graphVersion,
      verifyToken: config.verifyToken,
      dailyNewRecipientCap: config.dailyNewRecipientCap,
      hasAccessToken: Boolean(config.accessToken),
      hasAppSecret: Boolean(config.appSecret),
    },
    health,
    webhook,
    lastWebhookAt: lastWebhook?.value || null,
    templates,
    apiError,
    recentEvents,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<AppConfig>;
  const next: Partial<AppConfig> = {
    phoneNumberId: body.phoneNumberId,
    wabaId: body.wabaId,
    verifyToken: body.verifyToken,
    graphVersion: body.graphVersion,
    dailyNewRecipientCap: body.dailyNewRecipientCap,
  };
  if (body.accessToken?.trim()) next.accessToken = body.accessToken.trim();
  if (body.appSecret?.trim()) next.appSecret = body.appSecret.trim();
  await saveConfig(next);
  return NextResponse.json({ ok: true });
}
