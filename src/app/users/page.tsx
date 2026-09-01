"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Me = { id: string; username: string; role: "admin" | "viewer" };
type AssessmentOption = { id: string; subjectName: string };
type UserRow = {
  id: string;
  username: string;
  role: "admin" | "viewer";
  assignedAssessmentId: string | null;
  assignedAssessment: AssessmentOption | null;
  createdAt: string;
};

export default function UsersPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [assignedAssessmentId, setAssignedAssessmentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [meRes, usersRes, assessmentsRes] = await Promise.all([
      fetch("/api/me"),
      fetch("/api/users"),
      fetch("/api/assessments"),
    ]);
    const meData = await meRes.json();
    setMe(meData);
    if (usersRes.ok) setUsers((await usersRes.json()).users);
    if (assessmentsRes.ok) {
      const a = await assessmentsRes.json();
      setAssessments((a.assessments || []).map((x: { id: string; subjectName: string }) => ({ id: x.id, subjectName: x.subjectName })));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim(),
        password,
        role,
        assignedAssessmentId: role === "viewer" ? assignedAssessmentId : null,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "خطایی رخ داد.");
      return;
    }
    setUsername("");
    setPassword("");
    setRole("viewer");
    setAssignedAssessmentId("");
    load();
  }

  async function handleDelete(id: string, uname: string) {
    if (!confirm(`حساب «${uname}» حذف شود؟`)) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  async function handleReassign(id: string, newAssessmentId: string) {
    if (!newAssessmentId) return;
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedAssessmentId: newAssessmentId }),
    });
    load();
  }

  if (me && me.role !== "admin") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-14 text-center">
        <div className="card p-10 text-[var(--ink-soft)]">این صفحه فقط برای ادمین‌ها در دسترس است.</div>
        <Link href="/" className="text-[var(--accent)] text-sm mt-4 inline-block">→ بازگشت</Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm text-[var(--accent)] font-medium">→ بازگشت</Link>
      <h1 className="text-2xl font-bold tracking-tight mt-4 mb-1">مدیریت کاربران</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-8">
        نقش «ادمین» همه‌ی ارزیابی‌ها را می‌بیند و می‌سازد. نقش «مشاهده‌گر» فقط گزارشِ همان یک ارزیابی‌ای را که بهش اختصاص داده‌اید می‌بیند — بدون امکان ساخت ارزیابی یا مدیریت ارزیاب‌ها.
      </p>

      <form onSubmit={handleCreate} className="card p-6 mb-8 space-y-4">
        <h2 className="section-title mb-1">ساخت کاربر جدید</h2>
        <div>
          <label className="field-label">یوزرنیم</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="مثلاً ahmad" />
        </div>
        <div>
          <label className="field-label">رمز عبور</label>
          <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="حداقل ۴ کاراکتر" />
        </div>
        <div>
          <label className="field-label">نقش</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "viewer")}>
            <option value="viewer">مشاهده‌گر — فقط یک گزارش خاص</option>
            <option value="admin">ادمین — دسترسی کامل</option>
          </select>
        </div>
        {role === "viewer" && (
          <div>
            <label className="field-label">این کاربر فقط گزارش کدام ارزیابی را ببیند؟</label>
            <select className="input" value={assignedAssessmentId} onChange={(e) => setAssignedAssessmentId(e.target.value)}>
              <option value="">— انتخاب کنید —</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>{a.subjectName}</option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "در حال ساخت..." : "+ ساخت کاربر"}
        </button>
      </form>

      <h2 className="section-title mb-3">کاربران فعلی</h2>
      {users === null ? (
        <div className="card p-8 text-center text-[var(--ink-faint)]">در حال بارگذاری...</div>
      ) : users.length === 0 ? (
        <div className="card p-8 text-center text-[var(--ink-soft)]">هنوز کاربری ساخته نشده.</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-medium">
                  {u.username} <span className="pill pill-neutral">{u.role === "admin" ? "ادمین" : "مشاهده‌گر"}</span>
                </div>
                {u.role === "viewer" && (
                  <div className="text-xs text-[var(--ink-faint)] mt-1">
                    {u.assignedAssessment ? `دسترسی به: ${u.assignedAssessment.subjectName}` : "هنوز به هیچ ارزیابی‌ای دسترسی ندارد"}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {u.role === "viewer" && (
                  <select
                    className="border border-[var(--line)] rounded-lg px-2 py-1 text-xs bg-white"
                    value={u.assignedAssessmentId || ""}
                    onChange={(e) => handleReassign(u.id, e.target.value)}
                  >
                    <option value="">— تغییر دسترسی —</option>
                    {assessments.map((a) => (
                      <option key={a.id} value={a.id}>{a.subjectName}</option>
                    ))}
                  </select>
                )}
                {me && me.id !== u.id && (
                  <button className="btn-danger-ghost text-xs" onClick={() => handleDelete(u.id, u.username)}>حذف</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
