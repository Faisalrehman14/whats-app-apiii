"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRemaining, windowOpen, windowRemaining } from "@/lib/safety";

type Conversation = {
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

type Message = {
  id: string;
  wamid: string | null;
  direction: string;
  type: string;
  body: string | null;
  templateName: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

type Contact = Conversation & { messages: Message[] };

type SettingsPayload = {
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
  } | null;
  templates: { name: string; status: string; category: string; language: string }[];
  apiError: string | null;
  recentEvents: { id: string; kind: string; detail: string; createdAt: string }[];
};

function qualityColor(rating?: string) {
  if (rating === "GREEN") return "bg-emerald-500";
  if (rating === "YELLOW") return "bg-amber-400";
  if (rating === "RED") return "bg-rose-500";
  return "bg-slate-500";
}

function timeLabel(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function InboxApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [composer, setComposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [tick, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" });
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const data = (await res.json()) as SettingsPayload;
    setSettings(data);
    if (!data.configured) setShowSettings(true);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
    const data = await res.json();
    setContact(data.contact);
  }, []);

  useEffect(() => {
    loadConversations();
    loadSettings();
    const poll = setInterval(() => {
      loadConversations();
      if (activeId) loadThread(activeId);
    }, 4000);
    const clock = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [activeId, loadConversations, loadSettings, loadThread]);

  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [contact?.messages.length]);

  const remaining = useMemo(
    () => windowRemaining(contact?.lastInboundAt),
    // tick forces a recompute of remaining time
    [contact?.lastInboundAt, tick],
  );
  const canFreeText = windowOpen(contact?.lastInboundAt);

  async function send(type: "text" | "template", extra?: { to?: string; templateName?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: extra?.to || contact?.waId,
          type,
          text: composer,
          templateName: extra?.templateName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setComposer("");
      await loadConversations();
      if (activeId) await loadThread(activeId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleOptIn() {
    if (!contact) return;
    await fetch(`/api/conversations/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optedIn: !contact.optedIn }),
    });
    await loadThread(contact.id);
    await loadConversations();
  }

  return (
    <div className="h-screen overflow-hidden bg-[#0b141a] text-[#e9edef]">
      <div className="flex h-full">
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-[#2a3942] bg-[#111b21]">
          <header className="flex items-center justify-between border-b border-[#2a3942] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Deft Inbox</p>
              <p className="text-xs text-[#8696a0]">Official Cloud API · number-safe</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNew(true)}
                className="rounded-full bg-[#00a884] px-3 py-1.5 text-xs font-semibold text-[#111b21]"
              >
                New
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-full bg-[#202c33] px-3 py-1.5 text-xs"
              >
                Settings
              </button>
            </div>
          </header>

          <QualityBar settings={settings} />

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="px-4 py-8 text-sm text-[#8696a0]">
                No chats yet. Incoming WhatsApp messages appear here after the webhook is connected.
              </p>
            ) : (
              conversations.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  className={`flex w-full items-start gap-3 border-b border-[#2a3942] px-4 py-3 text-left ${
                    activeId === item.id ? "bg-[#2a3942]" : "hover:bg-[#202c33]"
                  }`}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[#00a884]/20 text-sm font-semibold text-[#00a884]">
                    {(item.name || item.waId).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium">{item.name || item.waId}</p>
                      <span className="text-[11px] text-[#8696a0]">
                        {timeLabel(item.lastMessage?.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[#8696a0]">
                      {item.lastMessage?.body || "No messages"}
                    </p>
                  </div>
                  {item.unreadCount > 0 && (
                    <span className="mt-1 rounded-full bg-[#00a884] px-2 py-0.5 text-[11px] font-semibold text-[#111b21]">
                      {item.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {contact ? (
            <>
              <header className="flex items-center justify-between border-b border-[#2a3942] bg-[#202c33] px-5 py-3">
                <div>
                  <p className="font-medium">{contact.name || contact.waId}</p>
                  <p className="text-xs text-[#8696a0]">+{contact.waId}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      canFreeText ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400/15 text-amber-200"
                    }`}
                  >
                    {canFreeText ? `Service window · ${formatRemaining(remaining)}` : "Window closed · template only"}
                  </span>
                  <button
                    onClick={toggleOptIn}
                    className={`rounded-full px-2.5 py-1 ${
                      contact.optedIn ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {contact.optedIn ? "Opted in" : "No opt-in"}
                  </button>
                </div>
              </header>

              <div className="chat-canvas flex-1 overflow-y-auto px-6 py-5">
                {contact.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`mb-2 flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow ${
                        message.direction === "outbound"
                          ? "bg-[#005c4b]"
                          : "bg-[#202c33]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p className="mt-1 text-right text-[10px] text-white/50">
                        {timeLabel(message.createdAt)} · {message.status}
                        {message.errorMessage ? ` · ${message.errorMessage}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <footer className="border-t border-[#2a3942] bg-[#202c33] p-3">
                {!canFreeText && (
                  <p className="mb-2 text-xs text-amber-200">
                    Free chat is locked until this customer messages you. Use an approved template, or wait for their reply.
                  </p>
                )}
                {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (canFreeText) send("text");
                  }}
                >
                  <input
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder={canFreeText ? "Type a message" : "Window closed — send a template instead"}
                    disabled={!canFreeText}
                    className="flex-1 rounded-lg bg-[#2a3942] px-4 py-3 text-sm outline-none placeholder:text-[#8696a0] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={busy || !canFreeText}
                    className="rounded-lg bg-[#00a884] px-5 py-3 text-sm font-semibold text-[#111b21] disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
                {settings?.templates?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {settings.templates
                      .filter((t) => t.status === "APPROVED")
                      .slice(0, 6)
                      .map((template) => (
                        <button
                          key={`${template.name}-${template.language}`}
                          disabled={busy || !contact.optedIn}
                          onClick={() => send("template", { templateName: template.name })}
                          className="rounded-full border border-[#3b4a54] px-3 py-1 text-[11px] text-[#8696a0] hover:text-white disabled:opacity-40"
                        >
                          Template: {template.name}
                        </button>
                      ))}
                  </div>
                ) : null}
              </footer>
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#222e35] text-center">
              <div>
                <p className="text-2xl font-light">Deft WhatsApp Inbox</p>
                <p className="mt-2 max-w-md text-sm text-[#8696a0]">
                  Official Meta Cloud API only. No WhatsApp Web scraping, no unofficial bots — that is what gets numbers banned.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={async () => {
            await loadSettings();
            setShowSettings(false);
          }}
        />
      )}
      {showNew && (
        <NewChatModal
          templates={settings?.templates ?? []}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await loadConversations();
            setActiveId(id);
          }}
        />
      )}
    </div>
  );
}

function QualityBar({ settings }: { settings: SettingsPayload | null }) {
  const rating = settings?.health?.quality_rating;
  return (
    <div className="border-b border-[#2a3942] px-4 py-3 text-xs text-[#8696a0]">
      <div className="flex items-center justify-between">
        <span>{settings?.health?.verified_name || "Cloud API not connected"}</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${qualityColor(rating)}`} />
          {rating || "NO RATING"}
        </span>
      </div>
      <p className="mt-1">
        {settings?.health?.display_phone_number || "Add credentials in Settings"}
        {settings?.health?.whatsapp_business_manager_messaging_limit
          ? ` · ${settings.health.whatsapp_business_manager_messaging_limit}`
          : ""}
      </p>
      {settings?.apiError && <p className="mt-1 text-rose-300">{settings.apiError}</p>}
    </div>
  );
}

function SettingsModal({
  settings,
  onClose,
  onSaved,
}: {
  settings: SettingsPayload | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    accessToken: "",
    phoneNumberId: settings?.config.phoneNumberId ?? "",
    wabaId: settings?.config.wabaId ?? "",
    appSecret: "",
    verifyToken: settings?.config.verifyToken ?? "deft-decor-webhook",
    dailyNewRecipientCap: settings?.config.dailyNewRecipientCap ?? 40,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Could not save settings");
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Connect WhatsApp Cloud API" onClose={onClose}>
      <p className="mb-4 text-sm text-[#8696a0]">
        Get these from Meta Developer Console → your app → WhatsApp → API Setup. This inbox talks only to
        graph.facebook.com. Unofficial WhatsApp libraries are not used.
      </p>
      <form className="grid gap-3" onSubmit={save}>
        <Field
          label="Permanent access token"
          value={form.accessToken}
          placeholder={settings?.config.hasAccessToken ? "Token saved — paste to replace" : "EAA..."}
          onChange={(value) => setForm({ ...form, accessToken: value })}
        />
        <Field
          label="Phone number ID"
          value={form.phoneNumberId}
          onChange={(value) => setForm({ ...form, phoneNumberId: value })}
        />
        <Field
          label="WhatsApp Business Account ID"
          value={form.wabaId}
          onChange={(value) => setForm({ ...form, wabaId: value })}
        />
        <Field
          label="App secret (webhook signature)"
          value={form.appSecret}
          placeholder={settings?.config.hasAppSecret ? "Secret saved — paste to replace" : ""}
          onChange={(value) => setForm({ ...form, appSecret: value })}
        />
        <Field
          label="Webhook verify token"
          value={form.verifyToken}
          onChange={(value) => setForm({ ...form, verifyToken: value })}
        />
        <Field
          label="Daily new-template recipient cap"
          value={String(form.dailyNewRecipientCap)}
          onChange={(value) =>
            setForm({ ...form, dailyNewRecipientCap: Number(value) || 40 })
          }
        />
        <p className="rounded-lg bg-[#0b141a] p-3 text-xs text-[#8696a0]">
          Webhook callback URL (must be HTTPS, e.g. via ngrok):
          <br />
          <code className="text-[#00a884]">https://YOUR-DOMAIN/api/webhooks/whatsapp</code>
          <br />
          Subscribe the <code>messages</code> field on <code>whatsapp_business_account</code>.
        </p>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Close
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-[#00a884] px-4 py-2 text-sm font-semibold text-[#111b21]"
          >
            Save & connect
          </button>
        </div>
      </form>
      {settings?.recentEvents?.length ? (
        <div className="mt-4 border-t border-[#2a3942] pt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-[#8696a0]">Safety log</p>
          {settings.recentEvents.map((event) => (
            <p key={event.id} className="mb-1 text-xs text-[#8696a0]">
              {event.kind}: {event.detail}
            </p>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

function NewChatModal({
  templates,
  onClose,
  onCreated,
}: {
  templates: { name: string; status: string; language: string }[];
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [waId, setWaId] = useState("");
  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState(templates[0]?.name || "hello_world");
  const [error, setError] = useState<string | null>(null);
  const approved = templates.filter((t) => t.status === "APPROVED");

  async function create() {
    setError(null);
    const contactRes = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waId, name }),
    });
    const contactData = await contactRes.json();
    if (!contactRes.ok) {
      setError(contactData.error);
      return;
    }
    const sendRes = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: waId, type: "template", templateName }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      setError(sendData.error);
      return;
    }
    await onCreated(contactData.contact.id);
  }

  return (
    <Modal title="Start with an approved template" onClose={onClose}>
      <p className="mb-4 text-sm text-[#8696a0]">
        You cannot cold-message with free text. First contact must be an approved template, and the person must have opted in.
      </p>
      <div className="grid gap-3">
        <Field label="Customer number with country code" value={waId} placeholder="923001234567" onChange={setWaId} />
        <Field label="Name" value={name} onChange={setName} />
        <label className="grid gap-1 text-xs text-[#8696a0]">
          Template
          <select
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="rounded-lg bg-[#2a3942] px-3 py-2 text-sm text-white outline-none"
          >
            {(approved.length ? approved : [{ name: "hello_world", language: "en_US" }]).map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Cancel
          </button>
          <button onClick={create} className="rounded-lg bg-[#00a884] px-4 py-2 text-sm font-semibold text-[#111b21]">
            Record opt-in & send
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#2a3942] bg-[#111b21] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-[#8696a0]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-[#8696a0]">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg bg-[#2a3942] px-3 py-2 text-sm text-white outline-none"
      />
    </label>
  );
}
