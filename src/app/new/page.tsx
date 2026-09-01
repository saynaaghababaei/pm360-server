"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LEVELS = ["Junior", "Mid", "Senior", "Lead", "Director"];

export default function NewAssessmentPage() {
  const router = useRouter();
  const [role, setRole] = useState<"admin" | "viewer" | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [currentLevel, setCurrentLevel] = useState("");
  const [expectedLevel, setExpectedLevel] = useState("");
  const [questionScope, setQuestionScope] = useState("defining");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setRole(d.role || null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectName.trim()) {
      setError("نام فرد الزامی است");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectName: subjectName.trim(),
        currentLevel: currentLevel || null,
        expectedLevel: expectedLevel || null,
        questionScope: expectedLevel ? questionScope : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "خطایی رخ داد.");
      setLoading(false);
      return;
    }
    router.push(`/assessment/${data.assessment.id}`);
  }

  if (role === "viewer") {
    return (
      <main className="max-w-lg mx-auto px-6 py-14 text-center">
        <div className="card p-10 text-[var(--ink-soft)]">حساب شما اجازه‌ی ساخت ارزیابی جدید را ندارد.</div>
        <Link href="/" className="text-[var(--accent)] text-sm mt-4 inline-block">→ بازگشت</Link>
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-xl font-bold mb-6">ساخت ارزیابی جدید</h1>
      <form onSubmit={handleSubmit} className="card p-7 space-y-5">
        <div>
          <label className="field-label">نام فرد</label>
          <input
            className="input"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="مثلاً امیرمحمد"
            autoFocus
          />
        </div>

        <div>
          <label className="field-label">سطح فعلی (اختیاری)</label>
          <select
            className="input"
            value={currentLevel}
            onChange={(e) => setCurrentLevel(e.target.value)}
          >
            <option value="">— تعیین نشده —</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">در صورت تعیین، فاصله‌ی میان سطح فعلی و سطح محاسبه‌شده در گزارش نمایش داده می‌شود.</p>
        </div>

        <div>
          <label className="field-label">سطح هدف (ارتقا) — اختیاری</label>
          <select
            className="input"
            value={expectedLevel}
            onChange={(e) => setExpectedLevel(e.target.value)}
          >
            <option value="">— حالت اکتشافی (همه‌ی پرسش‌ها) —</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            در صورت تعیین، تنها پرسش‌های مربوط به همان سطح مطرح می‌شود. در صورت خالی گذاشتن، تمام پرسش‌ها مطرح شده و سطح بر اساس پاسخ‌ها محاسبه می‌شود.
          </p>
        </div>

        {expectedLevel && (
          <div>
            <label className="field-label">در صورت تعیین سطح هدف، کدام پرسش‌ها مطرح شود؟</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={questionScope === "defining"}
                  onChange={() => setQuestionScope("defining")}
                />
                فقط تعریف‌کننده (★) — کوتاه‌ترین حالت؛ مناسب تصمیم ارتقا
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={questionScope === "defining_plus_devplan"}
                  onChange={() => setQuestionScope("defining_plus_devplan")}
                />
                تعریف‌کننده + Development Plan — طولانی‌تر؛ خروجی آن می‌تواند مبنای برنامه‌ی توسعه‌ی فردی نیز قرار گیرد
              </label>
            </div>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "در حال ساخت..." : "ساخت ارزیابی"}
        </button>
      </form>
    </main>
  );
}
