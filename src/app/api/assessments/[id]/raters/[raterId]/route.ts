import { NextRequest, NextResponse } from "next/server";
import { removeRater } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; raterId: string }> }
) {
  const { raterId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی حذف ارزیاب را ندارید." }, { status: 403 });
  }
  await removeRater(raterId);
  return NextResponse.json({ ok: true });
}
