"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoginScreen from "@/components/LoginScreen";
import { formatRemaining, windowOpen, windowRemaining } from "@/lib/safety";
import { dayLabel, formatClock, formatListTime, initials, sameDay } from "@/lib/time";
import type { Contact, Conversation, Message, SettingsPayload } from "@/types/inbox";

function qualityColor(rating?: string) {
  if (rating === "GREEN") return "bg-emerald-400";
  if (rating === "YELLOW") return "bg-amber-400";
  if (rating === "RED") return "bg-rose-500";
  return "bg-slate-500";
}

function Tick({ status }: { status: string }) {
  if (status === "failed") return <span className="text-rose-300">!</span>;
  if (status === "read") return <span className="text-sky-300">✓✓</span>;
  if (status === "delivered") return <span className="text-white/50">✓✓</span>;
  return <span className="text-white/40">✓</span>;
}

function MediaBody({ message }: { message: Message }) {
  const src =
    message.previewUrl ||
    (message.mediaId ? `/api/media/${encodeURIComponent(message.mediaId)}` : null);
  if ((message.type === "image" || message.type === "sticker") && src) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="mb-1 max-h-72 w-full rounded-md object-cover" />
        {message.body && !message.body.startsWith("📷") && !message.body.startsWith("Sticker") ? (
          <p className="whitespace-pre-wrap break-words leading-5">{message.body}</p>
        ) : null}
      </>
    );
  }
  if (message.type === "video" && src) {
    return <video src={src} controls playsInline className="mb-1 max-h-72 w-full rounded-md" />;
  }
  if ((message.type === "audio" || message.type === "voice") && src) {
    return <audio src={src} controls className="my-1 w-56 max-w-full" />;
  }
  if (message.type === "document" && src) {
    return (
      <a href={src} className="block py-1 underline" download={message.fileName || true}>
        📄 {message.fileName || message.body || "Document"}
      </a>
    );
  }
  return <p className="whitespace-pre-wrap break-words leading-5">{message.body}</p>;
}

export default function InboxApp() {
  const [auth, setAuth] = useState<"loading" | "login" | "ready">("loading");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [composer, setComposer] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [installHint, setInstallHint] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [tick, setTick] = useState(0);
  const seenUnread = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const videoCamRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" });
    if (res.status === 401) {
      setAuth("login");
      return;
    }
    const data = await res.json();
    const next = (data.conversations ?? []) as Conversation[];
    const unread = next.reduce((sum, item) => sum + item.unreadCount, 0);
    if (unread > seenUnread.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const newest = next.find((item) => item.unreadCount > 0);
      if (newest) {
        new Notification(newest.name || newest.waId, {
          body: newest.lastMessage?.body || "New WhatsApp message",
          icon: "/icon-192.png",
        });
      }
    }
    seenUnread.current = unread;
    setConversations(next);
    setLoadingList(false);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as SettingsPayload;
    setSettings(data);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.contact) setContact(data.contact);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setAuth(data.required && !data.authenticated ? "login" : "ready"))
      .catch(() => setAuth("ready"));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstallHint(!standalone);
  }, []);

  useEffect(() => {
    if (auth !== "ready") return;
    loadConversations();
    loadSettings();
    const poll = setInterval(() => {
      loadConversations();
      if (activeId) loadThread(activeId);
    }, 3500);
    const clock = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [auth, activeId, loadConversations, loadSettings, loadThread]);

  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [contact?.messages.length]);

  useEffect(() => {
    if (!recording) {
      setRecSeconds(0);
      return;
    }
    const clock = setInterval(() => setRecSeconds((n) => n + 1), 1000);
    return () => clearInterval(clock);
  }, [recording]);

  const remaining = useMemo(
    () => windowRemaining(contact?.lastInboundAt),
    [contact?.lastInboundAt, tick],
  );
  const canFreeText = windowOpen(contact?.lastInboundAt);
  const chatOpen = Boolean(activeId);
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
  const filtered = conversations.filter((item) => {
    const hay = `${item.name || ""} ${item.waId} ${item.lastMessage?.body || ""}`.toLowerCase();
    return hay.includes(query.toLowerCase().trim());
  });

  async function send(type: "text" | "template", extra?: { to?: string; templateName?: string }) {
    const text = composer.trim();
    if (type === "text" && !text) return;
    setBusy(true);
    setError(null);
    const optimistic: Message | null =
      type === "text" && contact
        ? {
            id: `local-${Date.now()}`,
            wamid: null,
            direction: "outbound",
            type: "text",
            body: text,
            templateName: null,
            status: "queued",
            errorMessage: null,
            createdAt: new Date().toISOString(),
          }
        : null;
    if (optimistic) {
      setContact({ ...contact!, messages: [...contact!.messages, optimistic] });
      setComposer("");
    }
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: extra?.to || contact?.waId,
          type,
          text,
          templateName: extra?.templateName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      if (type === "template") setComposer("");
      await loadConversations();
      if (activeId) await loadThread(activeId);
      inputRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendFile(file: File, kind?: string) {
    if (!contact) return;
    if (!canFreeText) {
      setError("24-hour window closed. Customer must message first, then you can send photos, video, and voice.");
      return;
    }
    const type = kind || (file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document");
    const label =
      type === "image" ? "📷 Photo" : type === "video" ? "🎬 Video" : type === "audio" ? "🎤 Voice" : `📄 ${file.name}`;
    const previewUrl = URL.createObjectURL(file);
    const caption = composer.trim();
    setContact({
      ...contact,
      messages: [
        ...contact.messages,
        {
          id: `local-${Date.now()}`,
          wamid: null,
          direction: "outbound",
          type,
          body: caption || label,
          templateName: null,
          mediaId: null,
          previewUrl,
          status: "queued",
          errorMessage: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setBusy(true);
    setError(null);
    setAttachOpen(false);
    setComposer("");
    const form = new FormData();
    form.append("to", contact.waId);
    form.append("file", file);
    form.append("kind", type);
    if (caption) form.append("caption", caption);
    try {
      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send media");
      URL.revokeObjectURL(previewUrl);
      await loadConversations();
      if (activeId) await loadThread(activeId);
    } catch (err) {
      setError((err as Error).message);
      setContact((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.previewUrl === previewUrl
                  ? { ...message, status: "failed", errorMessage: (err as Error).message }
                  : message,
              ),
            }
          : current,
      );
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!canFreeText) {
      setError("Window closed — wait for the customer to message before sending voice notes.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 800) {
          setError("Voice note too short — tap the mic, speak, then tap again to send.");
          return;
        }
        const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        await sendFile(new File([blob], `voice.${ext}`, { type: blob.type || "audio/webm" }), "audio");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setAttachOpen(false);
    } catch {
      setError("Microphone permission is required for voice notes. Allow mic in the browser, then tap 🎤 again.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth("login");
  }

  function requestNotifications() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  if (auth === "loading") {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#0b141a] text-[#8696a0]">Loading inbox…</div>;
  }
  if (auth === "login") {
    return <LoginScreen onUnlocked={() => setAuth("ready")} />;
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#0b141a] text-[#e9edef]">
      <div className="flex h-full">
        <aside
          className={`${chatOpen ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-[#2a3942] bg-[#111b21] md:w-[380px]`}
        >
          <header className="flex items-center justify-between px-4 pb-2 pt-4">
            <div>
              <p className="text-[17px] font-semibold">Deft Inbox</p>
              <p className="text-xs text-[#8696a0]">
                {settings?.health?.display_phone_number || "Cloud API"}
                {unreadTotal ? ` · ${unreadTotal} unread` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${qualityColor(settings?.health?.quality_rating)}`} />
              <button onClick={() => setShowNew(true)} className="rounded-full bg-[#00a884] px-3 py-1.5 text-xs font-semibold text-[#111b21]">
                New
              </button>
              <button onClick={() => setShowSettings(true)} className="rounded-full bg-[#202c33] px-3 py-1.5 text-xs">
                Settings
              </button>
            </div>
          </header>

          {installHint && (
            <button
              onClick={() => {
                requestNotifications();
                setInstallHint(false);
              }}
              className="mx-4 mb-2 rounded-xl bg-[#005c4b] px-3 py-2 text-left text-xs text-[#d1f4ea]"
            >
              Install on phone: Chrome ⋮ → Add to Home screen. Tap to hide.
            </button>
          )}
          {settings && !settings.lastWebhookAt && (
            <div className="mx-4 mb-2 rounded-xl bg-rose-500/15 px-3 py-2 text-left text-xs text-rose-200">
              WhatsApp 1 tick = message Deft Inbox tak nahi pohancha. Number sirf{" "}
              <b>+44 7882 771582</b> hai. Meta app Live honi chahiye, aapka WhatsApp Tester/Admin
              hona chahiye, UK SIM par WhatsApp app khuli nahi honi chahiye, aur Payment method
              add hona chahiye. Settings mein webhook status dekho.
            </div>
          )}

          <div className="px-4 pb-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or start a chat"
              className="w-full rounded-lg bg-[#202c33] px-3 py-2 text-sm outline-none placeholder:text-[#8696a0]"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <p className="px-4 py-8 text-sm text-[#8696a0]">Syncing conversations…</p>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-[#8696a0]">
                <p className="text-base text-[#e9edef]">No chats yet</p>
                <p className="mt-2">Ask a customer to message +44 7882 771582, or start with an approved template.</p>
              </div>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                    activeId === item.id ? "bg-[#2a3942]" : "hover:bg-[#202c33]"
                  }`}
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#00a884]/20 text-sm font-semibold text-[#00a884]">
                    {initials(item.name, item.waId)}
                  </div>
                  <div className="min-w-0 flex-1 border-b border-[#2a3942] pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[15px] font-medium">{item.name || `+${item.waId}`}</p>
                      <span className={`text-[11px] ${item.unreadCount ? "text-[#00a884]" : "text-[#8696a0]"}`}>
                        {formatListTime(item.lastMessage?.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] text-[#8696a0]">
                        {item.lastMessage?.direction === "outbound" ? "You: " : ""}
                        {item.lastMessage?.body || "Tap to open"}
                      </p>
                      {item.unreadCount > 0 && (
                        <span className="rounded-full bg-[#00a884] px-1.5 py-0.5 text-[11px] font-semibold text-[#111b21]">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={`${chatOpen ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#0b141a]`}>
          {contact ? (
            <>
              <header className="flex items-center justify-between bg-[#202c33] px-2 py-2.5 md:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    className="grid h-10 w-10 place-items-center text-2xl md:hidden"
                    onClick={() => {
                      setActiveId(null);
                      setContact(null);
                    }}
                  >
                    ‹
                  </button>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#00a884]/20 text-sm font-semibold text-[#00a884]">
                    {initials(contact.name, contact.waId)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{contact.name || `+${contact.waId}`}</p>
                    <p className="truncate text-xs text-[#8696a0]">
                      {canFreeText
                        ? `Can reply · ${formatRemaining(remaining)}`
                        : "Waiting for their WhatsApp message"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center rounded-full text-lg disabled:opacity-35"
                    title="Video"
                    disabled={!canFreeText || busy}
                    onClick={() => videoCamRef.current?.click()}
                  >
                    📹
                  </button>
                  <a
                    href={`tel:+${contact.waId}`}
                    className="grid h-10 w-10 place-items-center rounded-full text-lg"
                    title="Call this number"
                  >
                    📞
                  </a>
                  <button
                    onClick={toggleOptIn}
                    className={`mr-1 hidden rounded-full px-2.5 py-1 text-[11px] sm:inline ${
                      contact.optedIn ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {contact.optedIn ? "Opted in" : "No opt-in"}
                  </button>
                </div>
              </header>

              <div className="chat-canvas flex-1 overflow-y-auto px-3 py-4 md:px-8">
                {contact.messages.map((message, index) => {
                  const prev = contact.messages[index - 1];
                  const showDay = !prev || !sameDay(prev.createdAt, message.createdAt);
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <p className="mx-auto my-3 w-fit rounded-lg bg-[#182229] px-3 py-1 text-[11px] text-[#8696a0]">
                          {dayLabel(message.createdAt)}
                        </p>
                      )}
                      <div className={`mb-1 flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[84%] rounded-lg px-2.5 py-1.5 text-[14.5px] shadow md:max-w-[65%] ${
                            message.direction === "outbound" ? "rounded-tr-none bg-[#005c4b]" : "rounded-tl-none bg-[#202c33]"
                          }`}
                        >
                          <MediaBody message={message} />
                          <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/45">
                            {formatClock(message.createdAt)}
                            {message.direction === "outbound" && <Tick status={message.status} />}
                          </p>
                          {message.errorMessage && (
                            <p className="mt-1 text-[11px] text-rose-200">{message.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <footer className="bg-[#202c33] px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
                {!canFreeText && (
                  <p className="mb-2 text-xs text-amber-200">
                    24-hour window closed. Ask them to message +44 7882 771582, then this chat will open.
                  </p>
                )}
                {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}
                {recording && (
                  <p className="mb-2 flex items-center gap-2 text-sm text-rose-300">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
                    Recording voice {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")} · tap 🎤 to send
                  </p>
                )}
                {attachOpen && (
                  <div className="mb-2 grid grid-cols-3 gap-2 rounded-2xl bg-[#111b21] p-3 text-center text-[11px] text-[#e9edef] sm:grid-cols-6">
                    <button type="button" disabled={!canFreeText || busy} onClick={() => photoRef.current?.click()}>
                      🖼️<br />Gallery
                    </button>
                    <button type="button" disabled={!canFreeText || busy} onClick={() => cameraRef.current?.click()}>
                      📷<br />Camera
                    </button>
                    <button type="button" disabled={!canFreeText || busy} onClick={() => videoRef.current?.click()}>
                      🎬<br />Video
                    </button>
                    <button type="button" disabled={!canFreeText || busy} onClick={() => videoCamRef.current?.click()}>
                      📹<br />Record
                    </button>
                    <button type="button" disabled={!canFreeText || busy} onClick={() => docRef.current?.click()}>
                      📄<br />File
                    </button>
                    <a href={`tel:+${contact.waId}`} className="text-[#e9edef]">
                      📞<br />Call
                    </a>
                  </div>
                )}
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) sendFile(file, "image");
                  }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) sendFile(file, "image");
                  }}
                />
                <input
                  ref={videoRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) sendFile(file, "video");
                  }}
                />
                <input
                  ref={videoCamRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) sendFile(file, "video");
                  }}
                />
                <input
                  ref={docRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) sendFile(file, "document");
                  }}
                />
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (canFreeText) send("text");
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAttachOpen((open) => !open)}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#2a3942] text-xl"
                    title="Attach"
                  >
                    +
                  </button>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        if (canFreeText) send("text");
                      }
                    }}
                    placeholder={canFreeText ? "Type a message" : "Window closed — use a template"}
                    disabled={!canFreeText}
                    className="max-h-32 flex-1 resize-none rounded-xl bg-[#2a3942] px-4 py-3 text-base outline-none placeholder:text-[#8696a0] disabled:opacity-50 md:text-sm"
                  />
                  {composer.trim() ? (
                    <button
                      type="submit"
                      disabled={busy || !canFreeText}
                      className="grid h-12 w-12 place-items-center rounded-full bg-[#00a884] text-lg font-semibold text-[#111b21] disabled:opacity-35"
                    >
                      ➤
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !canFreeText}
                      onClick={toggleRecording}
                      className={`grid h-12 w-12 place-items-center rounded-full text-lg ${
                        recording ? "animate-pulse bg-rose-500" : "bg-[#00a884]"
                      } text-[#111b21] disabled:opacity-35`}
                      title="Tap to record voice, tap again to send"
                    >
                      🎤
                    </button>
                  )}
                </form>
                {settings?.templates?.some((item) => item.status === "APPROVED") && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {settings.templates
                      .filter((item) => item.status === "APPROVED")
                      .slice(0, 8)
                      .map((template) => (
                        <button
                          key={`${template.name}-${template.language}`}
                          disabled={busy || !contact.optedIn}
                          onClick={() => send("template", { templateName: template.name })}
                          className="shrink-0 rounded-full border border-[#3b4a54] px-3 py-1 text-[11px] text-[#8696a0] disabled:opacity-40"
                        >
                          {template.name}
                        </button>
                      ))}
                  </div>
                )}
              </footer>
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#222e35] px-6 text-center">
              <div>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[#00a884] text-2xl font-bold text-[#111b21]">
                  D
                </div>
                <p className="text-2xl font-light">Deft WhatsApp Inbox</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-[#8696a0]">
                  Official Cloud API for +44 7882 771582. Apne personal WhatsApp se isi UK number
                  par message bhejo. 2 ticks aayein tabhi inbox mein chat dikhegi. 1 tick matlab
                  Meta ne message business number tak deliver nahi kiya.
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
          onLogout={logout}
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

function SettingsModal({
  settings,
  onClose,
  onSaved,
  onLogout,
}: {
  settings: SettingsPayload | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onLogout: () => void;
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
    <Modal title="Inbox settings" onClose={onClose}>
      <div className="mb-4 rounded-xl bg-[#0b141a] p-3 text-xs text-[#8696a0]">
        <p>
          Quality: <b className="text-white">{settings?.health?.quality_rating || "n/a"}</b>
          {settings?.health?.verified_name ? ` · ${settings.health.verified_name}` : ""}
        </p>
        <p className="mt-1">{settings?.health?.display_phone_number || "Number not connected yet"}</p>
        <p className="mt-1">
          Account: {settings?.health?.account_mode || settings?.health?.status || "n/a"}
          {settings?.health?.can_send_message ? ` · send ${settings.health.can_send_message}` : ""}
        </p>
        {settings?.health?.health_error && (
          <p className="mt-1 text-rose-300">{settings.health.health_error}</p>
        )}
        <p className="mt-2">
          Inbound webhook:{" "}
          <b className={settings?.webhook?.subscribed ? "text-emerald-300" : "text-rose-300"}>
            {settings?.webhook?.subscribed ? "subscribed" : "not subscribed"}
          </b>
          {settings?.webhook?.messagesField === false
            ? " · messages field OFF"
            : settings?.webhook?.messagesField
              ? " · messages field ON"
              : ""}
        </p>
        <p className="mt-1">
          Last customer webhook:{" "}
          {settings?.lastWebhookAt
            ? new Date(settings.lastWebhookAt).toLocaleString()
            : "never — WhatsApp 1 tick means Meta did not deliver"}
        </p>
        {settings?.lastWebhookRejectAt && (
          <p className="mt-1 text-amber-200">
            Meta did POST, but App Secret did not match ({new Date(settings.lastWebhookRejectAt).toLocaleString()}).
            Railway WHATSAPP_APP_SECRET must be the App Secret from developers.facebook.com.
          </p>
        )}
        {settings?.webhook?.error && <p className="mt-1 text-rose-300">{settings.webhook.error}</p>}
        {settings?.apiError && <p className="mt-1 text-rose-300">{settings.apiError}</p>}
      </div>
      <form className="grid gap-3" onSubmit={save}>
        <Field
          label="Access token"
          value={form.accessToken}
          placeholder={settings?.config.hasAccessToken ? "Saved — paste to replace" : "EAA..."}
          onChange={(value) => setForm({ ...form, accessToken: value })}
        />
        <Field label="Phone number ID" value={form.phoneNumberId} onChange={(value) => setForm({ ...form, phoneNumberId: value })} />
        <Field label="WABA ID" value={form.wabaId} onChange={(value) => setForm({ ...form, wabaId: value })} />
        <Field
          label="App secret"
          value={form.appSecret}
          placeholder={settings?.config.hasAppSecret ? "Saved — paste to replace" : ""}
          onChange={(value) => setForm({ ...form, appSecret: value })}
        />
        <Field label="Webhook verify token" value={form.verifyToken} onChange={(value) => setForm({ ...form, verifyToken: value })} />
        <p className="rounded-lg bg-[#0b141a] p-3 text-xs text-[#8696a0]">
          Webhook callback
          <br />
          <code className="text-[#00a884]">https://whats-app-apiii-production.up.railway.app/api/webhooks/whatsapp</code>
        </p>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onLogout} className="rounded-lg px-4 py-2 text-sm text-rose-300">
            Log out
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Close
          </button>
          <button disabled={saving} className="rounded-lg bg-[#00a884] px-4 py-2 text-sm font-semibold text-[#111b21]">
            Save
          </button>
        </div>
      </form>
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
  const [busy, setBusy] = useState(false);
  const approved = templates.filter((item) => item.status === "APPROVED");

  async function create() {
    setBusy(true);
    setError(null);
    const contactRes = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waId, name }),
    });
    const contactData = await contactRes.json();
    if (!contactRes.ok) {
      setError(contactData.error);
      setBusy(false);
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
      setBusy(false);
      return;
    }
    await onCreated(contactData.contact.id);
    setBusy(false);
  }

  return (
    <Modal title="New conversation" onClose={onClose}>
      <p className="mb-4 text-sm text-[#8696a0]">
        First outbound message must be an approved template after the customer has opted in.
      </p>
      <div className="grid gap-3">
        <Field label="Customer number" value={waId} placeholder="447..." onChange={setWaId} />
        <Field label="Name" value={name} onChange={setName} />
        <label className="grid gap-1 text-xs text-[#8696a0]">
          Template
          <select
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="rounded-lg bg-[#2a3942] px-3 py-2 text-sm text-white outline-none"
          >
            {(approved.length ? approved : [{ name: "hello_world", language: "en_US" }]).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={create}
            className="rounded-lg bg-[#00a884] px-4 py-2 text-sm font-semibold text-[#111b21]"
          >
            Send template
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
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 md:place-items-center md:p-4">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#2a3942] bg-[#111b21] p-5 shadow-2xl md:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-sm text-[#8696a0]">
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
