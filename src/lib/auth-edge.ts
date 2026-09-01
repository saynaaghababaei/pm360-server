// Edge-Runtime-safe half of the auth module — used from middleware.ts (which
// Next.js runs on the Edge Runtime, where Node's `crypto` module is not
// available). Uses only the Web Crypto API (globalThis.crypto.subtle), which
// works identically in both the Edge Runtime and Node.js.
//
// The session cookie now carries WHO is logged in (userId, role, username) —
// not just "authenticated" — because authorization decisions (admin sees
// everything, viewer sees only their one assigned assessment) depend on it.
export const SESSION_COOKIE_NAME = "pm360_session";

export type SessionPayload = {
  userId: string;
  username: string;
  role: "admin" | "viewer";
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to your environment variables (see DEPLOY.md).");
  }
  return secret;
}

function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  return decodeURIComponent(escape(atob(padded)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Returns the decoded, verified session payload, or null if the cookie is
// missing, malformed, or the signature doesn't match (tampered/forged).
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;
  const encodedPayload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  if (!encodedPayload || !sig) return null;

  const expected = await hmacHex(getSecret(), encodedPayload);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (
      typeof payload?.userId === "string" &&
      typeof payload?.username === "string" &&
      (payload?.role === "admin" || payload?.role === "viewer")
    ) {
      return payload as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export { base64UrlEncode, hmacHex };
