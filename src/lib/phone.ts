/** Canonical WhatsApp Cloud API user id: digits only, with country code, no plus. */
export function normalizeWaId(input: string): string {
  let n = String(input || "").replace(/[^\d]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length >= 10) {
    if (n.startsWith("03")) n = "92" + n.slice(1);
    else if (n.startsWith("07")) n = "44" + n.slice(1);
    else n = n.replace(/^0+/, "");
  }
  return n;
}

export function waIdAliases(input: string): string[] {
  const raw = String(input || "").replace(/[^\d]/g, "");
  const canonical = normalizeWaId(input);
  const aliases = new Set<string>([raw, canonical].filter(Boolean));
  if (canonical.startsWith("92") && canonical.length === 12) {
    aliases.add("0" + canonical.slice(2));
  }
  if (canonical.startsWith("44") && canonical.length >= 12) {
    aliases.add("0" + canonical.slice(2));
  }
  return [...aliases];
}

export function webhookPublicUrl() {
  if (process.env.WHATSAPP_WEBHOOK_URL) return process.env.WHATSAPP_WEBHOOK_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/webhooks/whatsapp`;
  }
  return "https://whats-app-apiii-production.up.railway.app/api/webhooks/whatsapp";
}
