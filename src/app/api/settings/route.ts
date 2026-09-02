import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig, isConfigured, saveConfig, type AppConfig } from "@/lib/config";
import { getPhoneHealth, listTemplates, WhatsAppApiError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getConfig();
  let health = null;
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let apiError: string | null = null;

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
  }

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
