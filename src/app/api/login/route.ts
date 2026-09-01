import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, signSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";

export async function POST(req: NextRequest) {
  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username.trim() : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "یوزرنیم و رمز عبور را وارد کنید." }, { status: 400 });
  }

  const user = await getUserByUsername(username);
  // Deliberately identical error for "no such user" and "wrong password" —
  // distinguishing them would let someone probe which usernames exist.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "یوزرنیم یا رمز عبور اشتباه است." }, { status: 401 });
  }

  const token = await signSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role as "admin" | "viewer",
  });

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
