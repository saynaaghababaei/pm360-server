import { prisma } from "@/lib/prisma";
import { DEFAULT_GROUP_WEIGHTS } from "@/lib/scoring";

// ---------------- Global weight settings ----------------

export async function getGlobalWeights() {
  const row = await prisma.globalSettings.findUnique({ where: { id: 1 } });
  if (row) return row.weights as Record<string, number>;
  const created = await prisma.globalSettings.create({
    data: { id: 1, weights: DEFAULT_GROUP_WEIGHTS },
  });
  return created.weights as Record<string, number>;
}

export async function setGlobalWeights(weights: Record<string, number>) {
  await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: { weights },
    create: { id: 1, weights },
  });
}

// ---------------- Assessments ----------------

// `viewer` narrows results by role: admins see everything; viewers see only
// the single assessment they've been assigned to (or nothing, if none).
export async function listAssessments(viewer: { role: "admin" | "viewer"; assignedAssessmentId: string | null }) {
  if (viewer.role === "admin") {
    return prisma.assessment.findMany({
      include: { raters: true },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!viewer.assignedAssessmentId) return [];
  return prisma.assessment.findMany({
    where: { id: viewer.assignedAssessmentId },
    include: { raters: true },
  });
}

export async function createAssessment(data: {
  subjectName: string;
  currentLevel?: string | null;
  expectedLevel?: string | null;
  questionScope?: string | null;
}) {
  return prisma.assessment.create({
    data: {
      subjectName: data.subjectName,
      currentLevel: data.currentLevel || null,
      expectedLevel: data.expectedLevel || null,
      questionScope: data.expectedLevel ? data.questionScope || "defining" : null,
    },
  });
}

// Fetches an assessment plus a `submissionsByRaterId` map shaped exactly the
// way scoring.js expects (the same shape the old localStorage version used),
// so computeReport() and friends can be called unmodified.
export async function getAssessmentEntry(id: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: { raters: true, submissions: true },
  });
  if (!assessment) return null;

  const submissionsByRaterId: Record<string, { raterId: string; submittedAt: string; responses: unknown }> = {};
  for (const sub of assessment.submissions) {
    submissionsByRaterId[sub.raterId] = {
      raterId: sub.raterId,
      submittedAt: sub.submittedAt.toISOString(),
      responses: sub.responses,
    };
  }

  return {
    assessment: {
      id: assessment.id,
      subjectName: assessment.subjectName,
      currentLevel: assessment.currentLevel,
      expectedLevel: assessment.expectedLevel,
      questionScope: assessment.questionScope,
      customWeights: assessment.customWeights,
      raters: assessment.raters.map((r: { id: string; name: string | null; role: string; inviteToken: string; status: string }) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        inviteToken: r.inviteToken,
        status: r.status,
      })),
    },
    submissions: submissionsByRaterId,
  };
}

export async function updateAssessmentDetails(
  id: string,
  data: { subjectName: string; currentLevel?: string | null; expectedLevel?: string | null; questionScope?: string | null }
) {
  return prisma.assessment.update({
    where: { id },
    data: {
      subjectName: data.subjectName,
      currentLevel: data.currentLevel || null,
      expectedLevel: data.expectedLevel || null,
      questionScope: data.expectedLevel ? data.questionScope || "defining" : null,
    },
  });
}

export async function deleteAssessment(id: string) {
  // onDelete: Cascade in schema.prisma removes raters + submissions too.
  await prisma.assessment.delete({ where: { id } });
}

export async function setAssessmentCustomWeights(id: string, weights: Record<string, number> | null) {
  return prisma.assessment.update({ where: { id }, data: { customWeights: weights ?? undefined } });
}

// ---------------- Raters ----------------

export async function addRater(assessmentId: string, name: string, role: string) {
  return prisma.rater.create({ data: { assessmentId, name: name || null, role } });
}

export async function removeRater(raterId: string) {
  // onDelete: Cascade removes the linked Submission too, if any.
  await prisma.rater.delete({ where: { id: raterId } });
}

export async function findByInviteToken(token: string) {
  const rater = await prisma.rater.findUnique({
    where: { inviteToken: token },
    include: { assessment: { include: { raters: true } }, submission: true },
  });
  if (!rater) return null;
  return {
    rater: { id: rater.id, name: rater.name, role: rater.role, inviteToken: rater.inviteToken, status: rater.status },
    assessment: {
      id: rater.assessment.id,
      subjectName: rater.assessment.subjectName,
      currentLevel: rater.assessment.currentLevel,
      expectedLevel: rater.assessment.expectedLevel,
      questionScope: rater.assessment.questionScope,
      raters: rater.assessment.raters.map((r: { id: string; role: string; status: string }) => ({ id: r.id, role: r.role, status: r.status })),
    },
    existingSubmission: rater.submission
      ? { raterId: rater.submission.raterId, submittedAt: rater.submission.submittedAt.toISOString(), responses: rater.submission.responses }
      : null,
  };
}

export async function saveSubmission(
  assessmentId: string,
  raterId: string,
  responses: unknown
) {
  await prisma.$transaction([
    prisma.submission.upsert({
      where: { raterId },
      update: { responses: responses as object, submittedAt: new Date() },
      create: { assessmentId, raterId, responses: responses as object },
    }),
    prisma.rater.update({ where: { id: raterId }, data: { status: "completed" } }),
  ]);
}

// Finds the candidate's (Self) own written example for one subskill, for
// display to Manager/Director/CPO — mirrors getSelfExampleFor from the
// original tool.
export async function getSelfExampleFor(assessmentId: string, subSkillId: number): Promise<string | null> {
  const selfRater = await prisma.rater.findFirst({
    where: { assessmentId, role: "Self", status: "completed" },
    include: { submission: true },
  });
  if (!selfRater?.submission) return null;
  const responses = selfRater.submission.responses as Array<{ subSkillId: number; comment?: string }>;
  const resp = responses.find((r) => r.subSkillId === subSkillId);
  return resp?.comment?.trim() || null;
}

// ---------------- Users (login accounts — separate from Rater) ----------------

export async function getUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function listUsers() {
  return prisma.user.findMany({
    include: { assignedAssessment: { select: { id: true, subjectName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUser(data: {
  username: string;
  passwordHash: string;
  role: "admin" | "viewer";
  assignedAssessmentId?: string | null;
}) {
  return prisma.user.create({
    data: {
      username: data.username,
      passwordHash: data.passwordHash,
      role: data.role,
      assignedAssessmentId: data.role === "viewer" ? data.assignedAssessmentId || null : null,
    },
  });
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}

export async function updateUserAssignment(id: string, assignedAssessmentId: string | null) {
  return prisma.user.update({ where: { id }, data: { assignedAssessmentId } });
}

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}
