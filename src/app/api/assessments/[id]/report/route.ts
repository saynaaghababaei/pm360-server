import { NextRequest, NextResponse } from "next/server";
import { getAssessmentEntry, getGlobalWeights } from "@/lib/db";
import { computeReport } from "@/lib/scoring";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  if (user.role !== "admin" && user.assignedAssessmentId !== id) {
    return NextResponse.json({ error: "شما اجازه‌ی دسترسی به این گزارش را ندارید." }, { status: 403 });
  }

  const entry = await getAssessmentEntry(id);
  if (!entry) return NextResponse.json({ error: "ارزیابی پیدا نشد." }, { status: 404 });

  const globalWeights = await getGlobalWeights();
  const report = computeReport(entry.assessment, entry.submissions, null, globalWeights);
  return NextResponse.json({ report });
}
