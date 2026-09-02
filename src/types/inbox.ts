export type Conversation = {
  id: string;
  waId: string;
  name: string | null;
  optedIn: boolean;
  blocked: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  unreadCount: number;
  lastMessage: {
    body: string | null;
    direction: string;
    status: string;
    createdAt: string;
  } | null;
};

export type Message = {
  id: string;
  wamid: string | null;
  direction: string;
  type: string;
  body: string | null;
  templateName: string | null;
  mediaId?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  previewUrl?: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export type Contact = Conversation & { messages: Message[] };

export type SettingsPayload = {
  configured: boolean;
  config: {
    phoneNumberId: string;
    wabaId: string;
    graphVersion: string;
    verifyToken: string;
    dailyNewRecipientCap: number;
    hasAccessToken: boolean;
    hasAppSecret: boolean;
  };
  health: {
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
    throughput?: { level?: string };
    status?: string;
    name_status?: string;
    account_mode?: string;
    can_send_message?: string;
    health_error?: string;
    code_verification_status?: string;
    platform_type?: string;
  } | null;
  webhook?: {
    url: string;
    subscribed: boolean;
    messagesField?: boolean;
    overrideUrl?: string;
    phoneOverrideUrl?: string;
    error?: string;
  } | null;
  lastWebhookAt?: string | null;
  lastWebhookRejectAt?: string | null;
  templates: { name: string; status: string; category: string; language: string }[];
  apiError: string | null;
  recentEvents: { id: string; kind: string; detail: string; createdAt: string }[];
};
