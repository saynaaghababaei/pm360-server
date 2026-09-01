import { NextRequest, NextResponse } from "next/server";
import { getGlobalWeights, setGlobalWeights } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  const weights = await getGlobalWeights();
  return NextResponse.json({ weights });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی تغییر تنظیمات را ندارید." }, { status: 403 });
  }
  const body = await req.json();
  if (!body?.weights) return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  await setGlobalWeights(body.weights);
  return NextResponse.json({ ok: true });
}
