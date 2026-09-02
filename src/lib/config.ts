import { prisma } from "@/lib/db";

export type AppConfig = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
  dailyNewRecipientCap: number;
};

const KEYS = [
  "accessToken",
  "phoneNumberId",
  "wabaId",
  "appSecret",
  "verifyToken",
  "graphVersion",
  "dailyNewRecipientCap",
] as const;

export async function getConfig(): Promise<AppConfig> {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    accessToken: map.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId:
      map.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    wabaId: map.wabaId || process.env.WHATSAPP_WABA_ID || "",
    appSecret: map.appSecret || process.env.WHATSAPP_APP_SECRET || "",
    verifyToken:
      map.verifyToken ||
      process.env.WHATSAPP_VERIFY_TOKEN ||
      "deft-decor-webhook",
    graphVersion:
      map.graphVersion || process.env.WHATSAPP_GRAPH_VERSION || "v23.0",
    dailyNewRecipientCap: Number(
      map.dailyNewRecipientCap || process.env.DAILY_NEW_RECIPIENT_CAP || 40,
    ),
  };
}

export async function saveConfig(partial: Partial<AppConfig>) {
  const entries = Object.entries(partial).filter(
    ([key, value]) =>
      KEYS.includes(key as (typeof KEYS)[number]) && value !== undefined,
  );

  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
}

export function isConfigured(config: AppConfig) {
  return Boolean(config.accessToken && config.phoneNumberId);
}
