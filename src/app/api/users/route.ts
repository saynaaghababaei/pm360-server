import { NextRequest, NextResponse } from "next/server";
import { listUsers, createUser, getUserByUsername } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "فقط ادمین می‌تواند کاربران را ببیند." }, { status: 403 });
  }
  const users = await listUsers();
  // Never send passwordHash to the client, even to an admin.
  const safe = users.map((u: { id: string; username: string; role: string; assignedAssessmentId: string | null; assignedAssessment: unknown; createdAt: Date }) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    assignedAssessmentId: u.assignedAssessmentId,
    assignedAssessment: u.assignedAssessment,
    createdAt: u.createdAt,
  }));
  return NextResponse.json({ users: safe });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "فقط ادمین می‌تواند کاربر جدید بسازد." }, { status: 403 });
  }

  const body = await req.json();
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role === "admin" ? "admin" : "viewer";
  const assignedAssessmentId = typeof body?.assignedAssessmentId === "string" ? body.assignedAssessmentId : null;

  if (!username || !password) {
    return NextResponse.json({ error: "یوزرنیم و رمز عبور الزامی است." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "رمز عبور باید حداقل ۴ کاراکتر باشد." }, { status: 400 });
  }
  if (role === "viewer" && !assignedAssessmentId) {
    return NextResponse.json({ error: "برای نقش «مشاهده‌گر»، انتخاب یک ارزیابی الزامی است." }, { status: 400 });
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    return NextResponse.json({ error: "این یوزرنیم قبلاً استفاده شده است." }, { status: 400 });
  }

  const created = await createUser({
    username,
    passwordHash: hashPassword(password),
    role,
    assignedAssessmentId,
  });
  return NextResponse.json({ user: { id: created.id, username: created.username, role: created.role } });
}
