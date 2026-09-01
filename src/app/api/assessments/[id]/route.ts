import { NextRequest, NextResponse } from "next/server";
import {
  getAssessmentEntry,
  updateAssessmentDetails,
  deleteAssessment,
  setAssessmentCustomWeights,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  // This is the management view (rater list + their invite links, editing,
  // etc.) — a viewer's access is limited to the read-only report, so they
  // never see raw assessment data or rater links even for their own
  // assigned assessment.
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی دسترسی به این صفحه را ندارید." }, { status: 403 });
  }

  const entry = await getAssessmentEntry(id);
  if (!entry) return NextResponse.json({ error: "ارزیابی پیدا نشد." }, { status: 404 });
  return NextResponse.json(entry);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  // Editing (including custom weights) is an admin-only action — a viewer's
  // access is strictly read-only.
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی ویرایش این ارزیابی را ندارید." }, { status: 403 });
  }

  const body = await req.json();

  if (body.customWeights !== undefined) {
    await setAssessmentCustomWeights(id, body.customWeights);
    return NextResponse.json({ ok: true });
  }

  if (!body.subjectName) {
    return NextResponse.json({ error: "نام فرد الزامی است." }, { status: 400 });
  }
  const assessment = await updateAssessmentDetails(id, {
    subjectName: body.subjectName,
    currentLevel: body.currentLevel || null,
    expectedLevel: body.expectedLevel || null,
    questionScope: body.questionScope || null,
  });
  return NextResponse.json({ assessment });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی حذف این ارزیابی را ندارید." }, { status: 403 });
  }
  await deleteAssessment(id);
  return NextResponse.json({ ok: true });
}
