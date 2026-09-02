import { getConfig } from "@/lib/config";

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

async function graph<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<T> {
  const config = await getConfig();
  if (!config.accessToken) {
    throw new WhatsAppApiError("Missing WhatsApp access token", 400, null);
  }

  const url = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${path.replace(/^\//, "")}`,
  );
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }

  const { query: _query, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new WhatsAppApiError(err || `Graph API ${res.status}`, res.status, json);
  }
  return json as T;
}

export type SendTextResult = {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
};

export async function sendText(to: string, body: string) {
  const config = await getConfig();
  return graph<SendTextResult>(`${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
}

export async function sendTemplate(
  to: string,
  name: string,
  language = "en_US",
) {
  const config = await getConfig();
  return graph<SendTextResult>(`${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name,
        language: { code: language },
      },
    }),
  });
}

export async function markRead(messageId: string) {
  const config = await getConfig();
  return graph(`${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

export type PhoneHealth = {
  id: string;
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
  whatsapp_business_manager_messaging_limit?: string;
  throughput?: { level?: string };
};

export async function getPhoneHealth(): Promise<PhoneHealth | null> {
  const config = await getConfig();
  if (!config.phoneNumberId) return null;
  const health = await graph<PhoneHealth>(config.phoneNumberId, {
    query: {
      fields:
        "verified_name,display_phone_number,quality_rating,code_verification_status,platform_type,throughput",
    },
  });
  try {
    const limits = await graph<{ whatsapp_business_manager_messaging_limit?: string }>(
      config.phoneNumberId,
      { query: { fields: "whatsapp_business_manager_messaging_limit" } },
    );
    health.whatsapp_business_manager_messaging_limit =
      limits.whatsapp_business_manager_messaging_limit;
  } catch {
    // Field can live on the WABA; phone fetch still succeeds without it.
  }
  return health;
}

export type WabaTemplate = {
  name: string;
  status: string;
  category: string;
  language: string;
};

export async function listTemplates(): Promise<WabaTemplate[]> {
  const config = await getConfig();
  if (!config.wabaId) return [];
  const data = await graph<{ data?: WabaTemplate[] }>(
    `${config.wabaId}/message_templates`,
    { query: { fields: "name,status,category,language", limit: "50" } },
  );
  return data.data ?? [];
}

export async function sendMedia(
  to: string,
  kind: "image" | "video" | "audio" | "document",
  mediaId: string,
  extra?: { caption?: string; filename?: string },
) {
  const config = await getConfig();
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: kind,
    [kind]: {
      id: mediaId,
      ...(extra?.caption ? { caption: extra.caption } : {}),
      ...(kind === "document" && extra?.filename ? { filename: extra.filename } : {}),
    },
  };
  return graph<SendTextResult>(`${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadMedia(file: Blob, mime: string, filename: string) {
  const config = await getConfig();
  if (!config.accessToken || !config.phoneNumberId) {
    throw new WhatsAppApiError("Missing WhatsApp access token", 400, null);
  }
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", file, filename);
  form.append("type", mime);
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/media`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.id) {
    throw new WhatsAppApiError(json?.error?.message || `Media upload ${res.status}`, res.status, json);
  }
  return json.id;
}

export async function downloadMedia(mediaId: string) {
  const meta = await graph<{ url?: string; mime_type?: string; file_size?: number }>(mediaId);
  if (!meta.url) throw new WhatsAppApiError("Media URL missing", 404, meta);
  const config = await getConfig();
  const res = await fetch(meta.url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "User-Agent": "DeftInbox/1.0",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new WhatsAppApiError("Media download failed", res.status, null);
  const body = await res.arrayBuffer();
  return {
    body,
    mimeType: meta.mime_type || res.headers.get("content-type") || "application/octet-stream",
    contentLength: String(body.byteLength),
  };
}

export type ParsedInbound = {
  type: string;
  body: string;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
};

export function extractInboundText(message: Record<string, unknown>): ParsedInbound {
  const type = String(message.type ?? "unknown");
  if (type === "text") {
    const text = message.text as { body?: string } | undefined;
    return { type, body: text?.body ?? "" };
  }
  if (type === "button") {
    const button = message.button as { text?: string } | undefined;
    return { type, body: button?.text ?? "[button]" };
  }
  if (type === "interactive") {
    const interactive = message.interactive as {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    const title =
      interactive?.button_reply?.title || interactive?.list_reply?.title;
    return { type, body: title ?? "[interactive]" };
  }
  if (["image", "video", "audio", "document", "sticker", "voice"].includes(type)) {
    const media = (message[type] || message.audio) as
      | { id?: string; caption?: string; filename?: string; mime_type?: string }
      | undefined;
    const label =
      type === "image"
        ? "📷 Photo"
        : type === "video"
          ? "🎬 Video"
          : type === "audio" || type === "voice"
            ? "🎤 Voice"
            : type === "document"
              ? `📄 ${media?.filename || "Document"}`
              : "Sticker";
    return {
      type: type === "voice" ? "audio" : type,
      body: media?.caption || label,
      mediaId: media?.id,
      mimeType: media?.mime_type,
      fileName: media?.filename,
    };
  }
  if (type === "location") return { type, body: "📍 Location" };
  if (type === "reaction") {
    const reaction = message.reaction as { emoji?: string } | undefined;
    return { type, body: reaction?.emoji ?? "[reaction]" };
  }
  return { type, body: `[${type}]` };
}
