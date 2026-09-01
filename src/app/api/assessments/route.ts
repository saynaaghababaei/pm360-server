import { NextRequest, NextResponse } from "next/server";
import { listAssessments, createAssessment } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  const assessments = await listAssessments({
    role: user.role as "admin" | "viewer",
    assignedAssessmentId: user.assignedAssessmentId,
  });
  return NextResponse.json({ assessments });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  // Only admins create assessments — a viewer account exists purely to read
  // the one report they were granted access to.
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی ساخت ارزیابی جدید را ندارید." }, { status: 403 });
  }

  const body = await req.json();
  if (!body?.subjectName || typeof body.subjectName !== "string") {
    return NextResponse.json({ error: "نام فرد الزامی است." }, { status: 400 });
  }
  const assessment = await createAssessment({
    subjectName: body.subjectName,
    currentLevel: body.currentLevel || null,
    expectedLevel: body.expectedLevel || null,
    questionScope: body.questionScope || null,
  });
  return NextResponse.json({ assessment });
}
