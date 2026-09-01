import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "احراز هویت لازم است." }, { status: 401 });
  return NextResponse.json({
    id: user.id,
    username: user.username,
    role: user.role,
    assignedAssessmentId: user.assignedAssessmentId,
  });
}
