"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  Self: "متقاضی",
  Manager: "مدیر مستقیم",
  Director: "دایرکتور محصول",
  CPO: "معاون محصول",
  Peer: "همکار",
  Report: "زیرمجموعه",
  Stakeholder: "ذی‌نفع",
};
const MANAGEMENT_ROLES = ["Manager", "Director", "CPO"];
const LEVELS = ["Junior", "Mid", "Senior", "Lead", "Director"];

type Rater = { id: string; name: string | null; role: string; inviteToken: string; status: string };
type Assessment = {
  id: string;
  subjectName: string;
  currentLevel: string | null;
  expectedLevel: string | null;
  questionScope: string | null;
  raters: Rater[];
};

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [editing, setEditing] = useState(false);
  const [addRole, setAddRole] = useState("Peer");
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/assessments/${id}`);
    if (res.status === 403 || res.status === 401) {
      router.replace("/");
      return;
    }
    const data = await res.json();
    if (res.ok) setAssessment(data.assessment);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddRater(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    const res = await fetch(`/api/assessments/${id}/raters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: addRole, name: addName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddError(data.error || "خطایی رخ داد.");
      return;
    }
    setAddName("");
    load();
  }

  async function handleRemoveRater(raterId: string) {
    if (!confirm("این ارزیاب حذف شود؟")) return;
    await fetch(`/api/assessments/${id}/raters/${raterId}`, { method: "DELETE" });
    load();
  }

  async function handleDelete() {
    if (!assessment) return;
    if (!confirm(`ارزیابی «${assessment.subjectName}» به همراه تمام ارزیابان و پاسخ‌های آن برای همیشه حذف شود؟`)) return;
    await fetch(`/api/assessments/${id}`, { method: "DELETE" });
    router.push("/");
  }

  function copyLink(token: string, raterId: string) {
    const url = `${window.location.origin}/respond/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(raterId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function isRoleLocked(role: string): boolean {
    if (!assessment || !MANAGEMENT_ROLES.includes(role)) return false;
    const selfRater = assessment.raters.find((r) => r.role === "Self");
    return !selfRater || selfRater.status !== "completed";
  }

  if (!assessment) {
    return <main className="max-w-3xl mx-auto px-6 py-12 text-center text-[var(--ink-faint)]">در حال بارگذاری...</main>;
  }

  const completedNonSelf = assessment.raters.filter((r) => r.status === "completed" && r.role !== "Self").length;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm text-[var(--accent)]">→ بازگشت به لیست</Link>

      <div className="flex flex-col gap-4 mt-4 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{assessment.subjectName}</h1>
            {(assessment.currentLevel || assessment.expectedLevel) && (
              <p className="text-sm text-[var(--ink-soft)] mt-1">
                {assessment.currentLevel ? `سطح فعلی: ${assessment.currentLevel}` : ""}
                {assessment.currentLevel && assessment.expectedLevel ? " · " : ""}
                {assessment.expectedLevel ? `سطح هدف: ${assessment.expectedLevel}` : ""}
              </p>
            )}
          </div>
          {completedNonSelf > 0 ? (
            <Link href={`/assessment/${id}/report`} className="btn-primary">مشاهده‌ی گزارش ←</Link>
          ) : (
            <span className="text-sm text-[var(--ink-faint)]">گزارش پس از ثبت نخستین پاسخ فعال می‌شود</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-secondary text-sm" onClick={() => setEditing((v) => !v)}>✎ ویرایش</button>
          <button className="btn-secondary text-sm" onClick={load}>↻ به‌روزرسانی</button>
          <button className="text-[var(--danger)] text-sm px-2 hover:opacity-75 transition-opacity" onClick={handleDelete}>حذف</button>
        </div>
      </div>

      {editing && (
        <EditForm
          assessment={assessment}
          hasResponses={assessment.raters.some((r) => r.status === "completed")}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      <div className="card p-5 mb-6">
        <h2 className="font-semibold mb-3">افزودن ارزیاب</h2>
        <form onSubmit={handleAddRater} className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs text-[var(--ink-faint)] mb-1">نقش</label>
            <select className="border border-[var(--line)] rounded-lg px-3 py-2 bg-white" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              {Object.entries(ROLE_LABELS)
                .filter(([role]) => role !== "Self" || !assessment.raters.some((r) => r.role === "Self"))
                .map(([role, label]) => (
                  <option key={role} value={role}>{label}</option>
                ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-[var(--ink-faint)] mb-1">نام (اختیاری)</label>
            <input className="w-full border border-[var(--line)] rounded-lg px-3 py-2" value={addName} onChange={(e) => setAddName(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary">+ افزودن</button>
        </form>
        {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
      </div>

      <div className="space-y-2">
        {assessment.raters.length === 0 ? (
          <div className="card p-6 text-center text-[var(--ink-soft)]">هنوز ارزیابی برای این پرونده تعریف نشده است.</div>
        ) : (
          assessment.raters.map((r) => {
            const locked = isRoleLocked(r.role) && r.status !== "completed";
            return (
              <div key={r.id} className={`card p-4 flex items-center justify-between ${locked ? "opacity-60" : ""}`}>
                <div>
                  <div className="font-medium">
                    {r.name || "(بدون نام)"} <span className="text-[var(--ink-faint)] text-sm">— {ROLE_LABELS[r.role]}</span>
                  </div>
                  <div className="mt-2">
                    {r.status === "completed" ? (
                      <span className="pill pill-success">✓ پاسخ داده شده</span>
                    ) : locked ? (
                      <span className="pill pill-neutral">🔒 در انتظار تکمیل پرسشنامه‌ی داوطلب</span>
                    ) : (
                      <span className="pill pill-warning">⏳ در انتظار پاسخ</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-sm" onClick={() => copyLink(r.inviteToken, r.id)}>
                    {copiedId === r.id ? "کپی شد ✓" : "کپی لینک"}
                  </button>
                  <button className="text-[var(--danger)] text-sm px-2 hover:opacity-75 transition-opacity" onClick={() => handleRemoveRater(r.id)}>حذف</button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {assessment.raters.some((r) => MANAGEMENT_ROLES.includes(r.role)) && isRoleLocked("Manager") && (
        <p className="text-xs text-[var(--ink-faint)] mt-2">
          لینک مدیر مستقیم، دایرکتور محصول و معاون محصول تا زمان تکمیل پرسشنامه توسط متقاضی فعال نمی‌شود.
        </p>
      )}
    </main>
  );
}

function EditForm({
  assessment,
  hasResponses,
  onSaved,
}: {
  assessment: Assessment;
  hasResponses: boolean;
  onSaved: () => void;
}) {
  const [subjectName, setSubjectName] = useState(assessment.subjectName);
  const [currentLevel, setCurrentLevel] = useState(assessment.currentLevel || "");
  const [expectedLevel, setExpectedLevel] = useState(assessment.expectedLevel || "");
  const [questionScope, setQuestionScope] = useState(assessment.questionScope || "defining");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/assessments/${assessment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectName,
        currentLevel: currentLevel || null,
        expectedLevel: expectedLevel || null,
        questionScope: expectedLevel ? questionScope : null,
      }),
    });
    onSaved();
  }

  return (
    <form onSubmit={handleSave} className="card p-5 mb-6 space-y-4">
      {hasResponses && (
        <p className="text-xs text-[var(--accent2)] bg-[var(--accent2-soft)] border border-[var(--accent2)]/30 rounded-lg p-3">
          توجه: برخی ارزیابان پیش‌تر پاسخ داده‌اند. تغییر «سطح مورد انتظار» ممکن است سبب شود پرسش‌های ارزیابان جدید با پرسش‌های پاسخ‌داده‌شده‌ی پیشین متفاوت باشد.
        </p>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">نام فرد</label>
        <input className="w-full border border-[var(--line)] rounded-lg px-3 py-2" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">سطح فعلی</label>
        <select className="w-full border border-[var(--line)] rounded-lg px-3 py-2 bg-white" value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)}>
          <option value="">— تعیین نشده —</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">سطح هدف (ارتقا)</label>
        <select className="w-full border border-[var(--line)] rounded-lg px-3 py-2 bg-white" value={expectedLevel} onChange={(e) => setExpectedLevel(e.target.value)}>
          <option value="">— حالت اکتشافی —</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {expectedLevel && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={questionScope === "defining"} onChange={() => setQuestionScope("defining")} />
            فقط تعریف‌کننده
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={questionScope === "defining_plus_devplan"} onChange={() => setQuestionScope("defining_plus_devplan")} />
            تعریف‌کننده + Development Plan
          </label>
        </div>
      )}
      <button type="submit" className="btn-primary">ذخیره‌ی تغییرات</button>
    </form>
  );
}
