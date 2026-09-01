import { NextRequest, NextResponse } from "next/server";
import { deleteUser, updateUserAssignment, getUserById } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "فقط ادمین می‌تواند این کار را انجام دهد." }, { status: 403 });
  }
  const body = await req.json();
  const target = await getUserById(id);
  if (!target) return NextResponse.json({ error: "کاربر پیدا نشد." }, { status: 404 });
  if (target.role !== "viewer") {
    return NextResponse.json({ error: "دسترسی فقط برای کاربران «مشاهده‌گر» قابل‌تغییر است." }, { status: 400 });
  }
  const assignedAssessmentId = typeof body?.assignedAssessmentId === "string" ? body.assignedAssessmentId : null;
  if (!assignedAssessmentId) {
    return NextResponse.json({ error: "انتخاب یک ارزیابی الزامی است." }, { status: 400 });
  }
  await updateUserAssignment(id, assignedAssessmentId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "فقط ادمین می‌تواند این کار را انجام دهد." }, { status: 403 });
  }
  if (user.id === id) {
    return NextResponse.json({ error: "نمی‌توانید حساب خودتان را حذف کنید." }, { status: 400 });
  }
  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
