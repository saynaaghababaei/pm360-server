import { NextRequest, NextResponse } from "next/server";
import { findByInviteToken, saveSubmission } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { getSurveyPagesForLevel, isRoleLocked, MANAGEMENT_ROLES } from "@/lib/scoring";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByInviteToken(token);
  if (!found) return NextResponse.json({ error: "لینک نامعتبر است." }, { status: 404 });

  if (isRoleLocked(found.assessment, found.rater.role)) {
    return NextResponse.json({ locked: true, subjectName: found.assessment.subjectName, role: found.rater.role });
  }

  const pages = getSurveyPagesForLevel(found.assessment.expectedLevel, found.assessment.questionScope, found.rater.role);
  if (pages.length === 0) {
    return NextResponse.json({ locked: false, noQuestions: true, role: found.rater.role });
  }

  // For Manager/Director/CPO, fetch the candidate's (Self) written examples
  // in one query and build a { [subSkillId]: text } map for the client to
  // show inline under each question — instead of N separate lookups.
  let candidateExamples: Record<number, string> = {};
  if (MANAGEMENT_ROLES.includes(found.rater.role)) {
    const selfRater = await prisma.rater.findFirst({
      where: { assessmentId: found.assessment.id, role: "Self", status: "completed" },
      include: { submission: true },
    });
    if (selfRater?.submission) {
      const responses = selfRater.submission.responses as Array<{ subSkillId: number; comment?: string }>;
      candidateExamples = Object.fromEntries(
        responses.filter((r) => r.comment && r.comment.trim()).map((r) => [r.subSkillId, r.comment!.trim()])
      );
    }
  }

  return NextResponse.json({
    locked: false,
    noQuestions: false,
    assessment: { id: found.assessment.id, subjectName: found.assessment.subjectName },
    rater: found.rater,
    pages,
    existingSubmission: found.existingSubmission,
    candidateExamples,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findByInviteToken(token);
  if (!found) return NextResponse.json({ error: "لینک نامعتبر است." }, { status: 404 });

  if (isRoleLocked(found.assessment, found.rater.role)) {
    return NextResponse.json({ error: "این پرسشنامه هنوز فعال نشده است." }, { status: 403 });
  }

  const body = await req.json();
  if (!Array.isArray(body?.responses)) {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  await saveSubmission(found.assessment.id, found.rater.id, body.responses);
  return NextResponse.json({ ok: true });
}
