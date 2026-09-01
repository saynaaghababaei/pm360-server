// Node.js-only half of the auth module — used only from API routes (which
// run in the Node.js runtime, not Edge), so Node's `crypto` module is safe
// to use here. See auth-edge.ts for the Edge-Runtime-safe verification
// function used by middleware.ts, and for the SessionPayload shape.
import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "crypto";
import { SESSION_COOKIE_NAME, base64UrlEncode, hmacHex, type SessionPayload } from "@/lib/auth-edge";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to your environment variables (see DEPLOY.md).");
  }
  return secret;
}

// --- Session tokens (login-issued, one per real user account) ---

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacHex(getSecret(), encoded);
  return `${encoded}.${sig}`;
}

// --- Password hashing (scrypt — built into Node, no extra dependency) ---
// Stored format: "<saltHex>:<hashHex>" so verifyPassword doesn't need the
// salt passed separately.

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, 64);
  if (derived.length !== expected.length) return false;
  try {
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export { SESSION_COOKIE_NAME };
