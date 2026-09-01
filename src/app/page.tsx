"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Rater = { id: string; role: string; status: string };
type Assessment = {
  id: string;
  subjectName: string;
  currentLevel: string | null;
  expectedLevel: string | null;
  raters: Rater[];
};
type Me = { id: string; username: string; role: "admin" | "viewer"; assignedAssessmentId: string | null };

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [list, setList] = useState<Assessment[] | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: Me) => {
        setMe(d);
        // A viewer has no dashboard/list — just their one report. Send them
        // straight there instead of showing an empty admin-style page.
        if (d.role === "viewer") {
          if (d.assignedAssessmentId) {
            router.replace(`/assessment/${d.assignedAssessmentId}/report`);
          }
          return;
        }
        fetch("/api/assessments")
          .then((r) => r.json())
          .then((d2) => setList(d2.assessments || []));
      });
  }, [router]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ارزیابی «${name}» به همراه تمام ارزیابان و پاسخ‌های آن برای همیشه حذف شود؟ این عمل قابل بازگشت نیست.`)) return;
    await fetch(`/api/assessments/${id}`, { method: "DELETE" });
    setList((prev) => prev?.filter((a) => a.id !== id) ?? null);
  }

  async function handleLogout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  if (!me) {
    return <main className="max-w-3xl mx-auto px-6 py-14 text-center text-[var(--ink-faint)]">در حال بارگذاری...</main>;
  }

  if (me.role === "viewer") {
    // Either already redirecting, or has no assignment yet.
    if (me.assignedAssessmentId) {
      return <main className="max-w-3xl mx-auto px-6 py-14 text-center text-[var(--ink-faint)]">در حال انتقال...</main>;
    }
    return (
      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-2xl font-bold tracking-tight">ارزیابی ۳۶۰ درجه PM</h1>
          <button onClick={handleLogout} className="btn-secondary text-sm">خروج</button>
        </div>
        <div className="card p-12 text-center text-[var(--ink-soft)]">
          هنوز هیچ ارزیابی‌ای به حساب شما اختصاص داده نشده است. با ادمین تیم صحبت کنید.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-14">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ارزیابی ۳۶۰ درجه PM</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1.5">
            بر اساس مدل ارزیابی داخلی (Ravi Mehta Framework) —{" "}
            <Link href="/guide" className="text-[var(--accent)] font-medium">راهنمای کامل مدل ←</Link>
            {" · "}
            <Link href="/users" className="text-[var(--accent)] font-medium">مدیریت کاربران ←</Link>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleLogout} className="btn-secondary text-sm">خروج</button>
          <Link href="/new" className="btn-primary">+ ارزیابی جدید</Link>
        </div>
      </div>

      {list === null ? (
        <div className="card p-10 text-center text-[var(--ink-faint)]">در حال بارگذاری...</div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[var(--ink-soft)] mb-4">هنوز ارزیابی‌ای ثبت نشده است.</p>
          <Link href="/new" className="btn-primary inline-block">+ ساخت اولین ارزیابی</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const completed = a.raters.filter((r) => r.status === "completed").length;
            return (
              <div key={a.id} className="card p-5 flex items-center justify-between">
                <Link href={`/assessment/${a.id}`} className="flex-1 group">
                  <div className="font-semibold group-hover:text-[var(--accent)] transition-colors">{a.subjectName}</div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="pill pill-neutral">{completed} از {a.raters.length} پاسخ‌داده</span>
                    {a.currentLevel && <span className="pill pill-neutral">فعلی: {a.currentLevel}</span>}
                    {a.expectedLevel && <span className="pill pill-accent">هدف: {a.expectedLevel}</span>}
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0 mr-2">
                  <Link href={`/assessment/${a.id}`} className="text-[var(--accent)] text-sm font-medium">مشاهده ←</Link>
                  <button className="btn-danger-ghost text-sm px-1" onClick={() => handleDelete(a.id, a.subjectName)}>حذف</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
