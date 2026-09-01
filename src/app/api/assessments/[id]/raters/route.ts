import { NextRequest, NextResponse } from "next/server";
import { addRater, getAssessmentEntry } from "@/lib/db";
import { getSurveyPagesForLevel } from "@/lib/scoring";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "شما اجازه‌ی افزودن ارزیاب را ندارید." }, { status: 403 });
  }

  const body = await req.json();
  const role = body?.role;
  if (!role) return NextResponse.json({ error: "نقش الزامی است." }, { status: 400 });

  const entry = await getAssessmentEntry(id);
  if (!entry) return NextResponse.json({ error: "ارزیابی پیدا نشد." }, { status: 404 });

  // Server-side guard: only ONE "Self" (متقاضی) rater is allowed per
  // assessment — the whole locking model and the "completedNonSelf" report
  // gate assume this. The dashboard dropdown already hides "Self" once one
  // exists, but that's client-side only; without this check, a stale page
  // state (or a direct API call) could silently create a second Self rater,
  // which then made completedNonSelf stay at 0 forever because there was no
  // non-Self completed rater — exactly the bug that caused the report button
  // to stay disabled even after "raters" had answered.
  if (role === "Self" && entry.assessment.raters.some((r: { role: string }) => r.role === "Self")) {
    return NextResponse.json(
      { error: "این ارزیابی از قبل یک «متقاضی» دارد — فقط یک نفر می‌تواند نقش متقاضی داشته باشد." },
      { status: 400 }
    );
  }

  // Same guard the old client-side tool enforced: don't allow adding a rater
  // whose role would see zero questions given this assessment's current
  // target level / scope (e.g. a Stakeholder when only Hard Skills categories
  // are in scope).
  const pages = getSurveyPagesForLevel(entry.assessment.expectedLevel, entry.assessment.questionScope, role);
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "با تنظیمات فعلی این ارزیابی، این نقش هیچ پرسشی نمی‌بیند — نمی‌توان اضافه‌اش کرد." },
      { status: 400 }
    );
  }

  const rater = await addRater(id, body.name || "", role);
  return NextResponse.json({ rater });
}
