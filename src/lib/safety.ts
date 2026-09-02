const WINDOW_MS = 24 * 60 * 60 * 1000;
const PAIR_GAP_MS = 6_000;

export type SafetyDecision = {
  ok: boolean;
  code?:
    | "WINDOW_CLOSED"
    | "OPT_IN_REQUIRED"
    | "PAIR_RATE"
    | "DAILY_CAP"
    | "BLOCKED"
    | "EMPTY";
  message: string;
};

export function windowOpen(lastInboundAt?: Date | string | null) {
  if (!lastInboundAt) return false;
  const ts =
    typeof lastInboundAt === "string"
      ? new Date(lastInboundAt).getTime()
      : lastInboundAt.getTime();
  return Date.now() - ts < WINDOW_MS;
}

export function windowRemaining(lastInboundAt?: Date | string | null) {
  if (!lastInboundAt) return 0;
  const ts =
    typeof lastInboundAt === "string"
      ? new Date(lastInboundAt).getTime()
      : lastInboundAt.getTime();
  return Math.max(0, WINDOW_MS - (Date.now() - ts));
}

export function formatRemaining(ms: number) {
  if (ms <= 0) return "Closed";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}

export function checkPairRate(lastOutboundAt?: Date | string | null): SafetyDecision {
  if (!lastOutboundAt) return { ok: true, message: "ok" };
  const ts =
    typeof lastOutboundAt === "string"
      ? new Date(lastOutboundAt).getTime()
      : lastOutboundAt.getTime();
  const wait = PAIR_GAP_MS - (Date.now() - ts);
  if (wait > 0) {
    return {
      ok: false,
      code: "PAIR_RATE",
      message: `Meta pair limit: wait ${Math.ceil(wait / 1000)}s before messaging this person again (1 message / 6 seconds).`,
    };
  }
  return { ok: true, message: "ok" };
}

export function checkSend(input: {
  type: "text" | "template" | "image" | "video" | "audio" | "document";
  body?: string;
  optedIn: boolean;
  blocked: boolean;
  lastInboundAt?: Date | string | null;
  lastOutboundAt?: Date | string | null;
  uniqueNewRecipientsToday: number;
  dailyCap: number;
  isNewTemplateRecipient: boolean;
}): SafetyDecision {
  if (input.blocked) {
    return {
      ok: false,
      code: "BLOCKED",
      message: "This contact is blocked locally. Unblock before sending.",
    };
  }

  const pair = checkPairRate(input.lastOutboundAt);
  if (!pair.ok) return pair;

  if (input.type === "template") {
    if (!input.optedIn) {
      return {
        ok: false,
        code: "OPT_IN_REQUIRED",
        message:
          "WhatsApp policy: the customer must opt in before you send a template. Mark opt-in only if they agreed (form, checkout, or explicit WhatsApp yes).",
      };
    }
    if (input.isNewTemplateRecipient && input.uniqueNewRecipientsToday >= input.dailyCap) {
      return {
        ok: false,
        code: "DAILY_CAP",
        message: `Local safety cap reached (${input.dailyCap} new template recipients today). Raising volume too fast drops quality rating and can restrict the number.`,
      };
    }
    return { ok: true, message: "ok" };
  }

  if (input.type === "text" && !input.body?.trim()) {
    return { ok: false, code: "EMPTY", message: "Message is empty." };
  }
  if (!windowOpen(input.lastInboundAt)) {
    return {
      ok: false,
      code: "WINDOW_CLOSED",
      message:
        "24-hour customer service window is closed. Only an approved template can be sent until the customer messages you again.",
    };
  }
  return { ok: true, message: "ok" };
}
