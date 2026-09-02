import crypto from "node:crypto";

export function verifySignature(
  raw: string | Buffer,
  header: string | null,
  secrets: string | string[],
) {
  const keys = [...new Set((Array.isArray(secrets) ? secrets : [secrets]).filter(Boolean))];
  if (!keys.length) return true;
  if (!header?.startsWith("sha256=")) return false;
  const actual = header.slice("sha256=".length);
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  return keys.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    } catch {
      return false;
    }
  });
}
