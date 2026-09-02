const COOKIE = "inbox_session";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.APP_PIN ||
    process.env.WHATSAPP_APP_SECRET ||
    "deft-inbox-dev-secret"
  );
}

export function pinConfigured() {
  return Boolean(process.env.APP_PIN?.trim());
}

export function expectedPin() {
  return process.env.APP_PIN?.trim() || "";
}

export function pinsMatch(input: string) {
  const expected = expectedPin();
  if (!expected || input.length !== expected.length) return false;
  let out = 0;
  for (let i = 0; i < expected.length; i += 1) {
    out |= expected.charCodeAt(i) ^ input.charCodeAt(i);
  }
  return out === 0;
}

async function hmacHex(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signSession() {
  const payload = String(Date.now() + WEEK_MS);
  return `${payload}.${await hmacHex(payload)}`;
}

export async function verifySession(token?: string | null) {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(payload);
  if (expected.length !== sig.length) return false;
  let out = 0;
  for (let i = 0; i < expected.length; i += 1) {
    out |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return out === 0;
}

export function sessionCookie(value: string, maxAge = WEEK_MS / 1000) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const SESSION_COOKIE = COOKIE;
