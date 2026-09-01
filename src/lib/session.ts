// Server-side helper (Node runtime only — used from API routes) that reads
// the session cookie, verifies it, and looks up the CURRENT state of that
// user from the database. Always hitting the DB (rather than trusting only
// what's baked into the signed cookie) means role changes, reassignments,
// or account deletion by an admin take effect immediately — the affected
// person doesn't keep old access just because their browser still has a
// valid-looking cookie.
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-edge";
import { getUserById } from "@/lib/db";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const user = await getUserById(payload.userId);
  return user; // null if the account was deleted since the cookie was issued
}
