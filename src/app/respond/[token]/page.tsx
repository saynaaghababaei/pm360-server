"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";

type SubSkillLevel = { shortAnchor: string; behaviorDefinition?: string; realBehavior?: string; strongSignal?: string };
type SubSkill = {
  subSkill: string;
  subSkillDefinition: string;
  question?: string;
  levels: Record<string, SubSkillLevel>;
};
type PageSubskill = { id: number; sub: SubSkill };
type Page = { raviCategoryKey: string; label: string; type: string; subskills: PageSubskill[] };
type Answer = { selectedLevels: string[] | null; comment: string; answered: boolean };

const LEVEL_OPTIONS = ["Junior", "Mid", "Senior", "Lead"];
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RespondPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "invalid" }
    | { status: "locked"; subjectName: string }
    | { status: "no-questions" }
    | { status: "done" }
    | {
        status: "ready";
        assessment: { id: string; subjectName: string };
        rater: { id: string; role: string; name: string | null };
        pages: Page[];
        candidateExamples: Record<number, string>;
      }
  >({ status: "loading" });

  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [shuffles, setShuffles] = useState<Record<number, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/respond/${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setState({ status: "invalid" });
          return;
        }
        if (d.locked) {
          setState({ status: "locked", subjectName: d.subjectName });
          return;
        }
        if (d.noQuestions) {
          setState({ status: "no-questions" });
          return;
        }
        setState({
          status: "ready",
          assessment: d.assessment,
          rater: d.rater,
          pages: d.pages,
          candidateExamples: d.candidateExamples || {},
        });
        const initialAnswers: Record<number, Answer> = {};
        const initialShuffles: Record<number, string[]> = {};
        for (const page of d.pages as Page[]) {
          for (const { id } of page.subskills) {
            initialAnswers[id] = { selectedLevels: null, comment: "", answered: false };
            initialShuffles[id] = shuffle(LEVEL_OPTIONS);
          }
        }
        if (d.existingSubmission) {
          for (const r of d.existingSubmission.responses as Array<{ subSkillId: number; selectedLevels: string[] | null; comment: string }>) {
            if (initialAnswers[r.subSkillId]) {
              initialAnswers[r.subSkillId] = { selectedLevels: r.selectedLevels, comment: r.comment || "", answered: true };
            }
          }
        }
        setAnswers(initialAnswers);
        setShuffles(initialShuffles);
      });
  }, [token]);

  const isCandidate = state.status === "ready" && state.rater.role === "Self";
  const isManagementViewer = state.status === "ready" && MANAGEMENT_ROLES.includes(state.rater.role);
  const showDirectorOption = state.status === "ready" && ["Manager", "Director", "CPO", "Self"].includes(state.rater.role);

  const page = state.status === "ready" ? state.pages[pageIndex] : null;
  const totalQuestions = state.status === "ready" ? state.pages.reduce((s, p) => s + p.subskills.length, 0) : 0;
  const answeredCount = Object.values(answers).filter((a) => a.answered).length;
  const pageAnswered = page ? page.subskills.every(({ id }) => answers[id]?.answered) : false;

  function toggleLevel(id: number, level: string) {
    setAnswers((prev) => {
      const current = prev[id]?.selectedLevels || [];
      const next = current.includes(level) ? current.filter((l) => l !== level) : [...current, level];
      return { ...prev, [id]: { ...prev[id], selectedLevels: next, answered: next.length > 0 } };
    });
  }

  function selectDontKnow(id: number) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], selectedLevels: null, answered: true } }));
  }

  function updateComment(id: number, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], comment: value } }));
  }

  async function handleNext() {
    if (!page) return;
    if (!pageAnswered) return;
    const isLast = state.status === "ready" && pageIndex === state.pages.length - 1;
    if (!isLast) {
      setPageIndex((p) => p + 1);
      window.scrollTo(0, 0);
      return;
    }
    if (state.status !== "ready") return;
    setSubmitting(true);
    const responses = Object.entries(answers).map(([subSkillId, a]) => ({
      subSkillId: Number(subSkillId),
      selectedLevels: a.selectedLevels,
      comment: a.comment,
    }));
    const res = await fetch(`/api/respond/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses }),
    });
    if (res.ok) {
      setState({ status: "done" });
    }
    setSubmitting(false);
  }

  function handleBack() {
    setPageIndex((p) => Math.max(0, p - 1));
    window.scrollTo(0, 0);
  }

  if (state.status === "loading") {
    return <main className="max-w-lg mx-auto px-6 py-20 text-center text-gray-400">در حال بارگذاری...</main>;
  }
  if (state.status === "invalid") {
    return <main className="max-w-lg mx-auto px-6 py-20 text-center text-red-600">این لینک معتبر نیست.</main>;
  }
  if (state.status === "locked") {
    return (
      <main className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2">این پرسشنامه هنوز فعال نشده است</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          پیش از پاسخ‌دهی شما، متقاضی ({state.subjectName}) باید پرسشنامه‌ی خود را تکمیل کند. پس از تکمیل، این لینک فعال خواهد شد.
        </p>
        <button className="btn-secondary" onClick={() => window.location.reload()}>بررسی دوباره</button>
      </main>
    );
  }
  if (state.status === "no-questions") {
    return (
      <main className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="text-4xl mb-4">🙏</div>
        <h1 className="text-xl font-bold mb-2">در این ارزیابی پرسشی برای نقش شما تعریف نشده است</h1>
        <p className="text-gray-500 text-sm leading-relaxed">اقدام دیگری لازم نیست؛ می‌توانید این صفحه را ببندید.</p>
      </main>
    );
  }
  if (state.status === "done") {
    return (
      <main className="max-w-lg mx-auto px-6 py-24 text-center">
        <div className="text-4xl mb-4">✓</div>
        <h1 className="text-xl font-bold mb-2">پاسخ‌های شما ثبت شد</h1>
        <p className="text-gray-500">از زمانی که گذاشتید سپاسگزاریم. می‌توانید این صفحه را ببندید.</p>
      </main>
    );
  }

  if (!page) return null;

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          ارزیابی {state.assessment.subjectName} — شما به‌عنوان {ROLE_LABELS[state.rater.role]} پاسخ می‌دهید
        </p>
        <div className="flex items-center justify-between mt-3 mb-1">
          <span className="text-sm font-medium">صفحه {pageIndex + 1} از {state.pages.length} — {page.label}</span>
          <span className="text-xs text-gray-400">{answeredCount} از {totalQuestions} پرسش</span>
        </div>
        <div className="w-full h-1.5 bg-[#e4e0d8] rounded-full overflow-hidden">
          <div className="h-full bg-[#3f5d54] transition-all" style={{ width: `${(answeredCount / totalQuestions) * 100}%` }} />
        </div>
      </div>

      {pageIndex === 0 && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-700 font-medium mb-1">می‌توانید برای هر پرسش بیش از یک گزینه انتخاب کنید</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            اگر رفتارهای متفاوتی از این فرد در موقعیت‌های مختلف دیده‌اید، می‌توانید همه‌ی گزینه‌های مرتبط را تیک بزنید — لازم نیست فقط یکی را انتخاب کنید.
          </p>
        </div>
      )}
      {pageIndex === 0 && isCandidate && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-200">
          <p className="text-sm text-[#b8752f] font-medium mb-1">نوشتن نمونه برای هر پرسش اختیاری است، اما توصیه می‌شود</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            در صورت تمایل، پس از انتخاب گزینه، نمونه‌ای واقعی از تجربه‌ی خود بنویسید. رعایت قالب یا نگارش بند‌به‌بند الزامی نیست؛ فقط اطمینان حاصل کنید <b>موقعیت</b>، <b>اقدام</b>، و <b>نتیجه</b> در آن آمده باشد. در صورت ثبت، این نمونه مستقیماً به مدیر مستقیم، دایرکتور محصول و معاون محصول نمایش داده می‌شود.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {page.subskills.map(({ id, sub }) => {
          const order = shuffles[id] || LEVEL_OPTIONS;
          const answer = answers[id] || { selectedLevels: null, comment: "", answered: false };
          const selected = answer.selectedLevels || [];
          const dontKnowSelected = answer.answered && answer.selectedLevels === null;
          const example = isManagementViewer ? state.candidateExamples[id] : null;

          return (
            <div key={id} className="card p-5">
              <h3 className="font-semibold mb-1">{sub.subSkill}</h3>
              <p className="text-sm text-gray-600 mb-4">{sub.question || sub.subSkillDefinition}</p>
              <div className="space-y-2">
                {order.map((level) => {
                  const checked = selected.includes(level);
                  return (
                    <label
                      key={level}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked ? "border-[#3f5d54] bg-[#3f5d54]/5" : "border-[#e4e0d8] hover:bg-black/[0.02]"
                      }`}
                    >
                      <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleLevel(id, level)} />
                      <span className="text-sm leading-relaxed">{sub.levels[level]?.shortAnchor}</span>
                    </label>
                  );
                })}
                {showDirectorOption && sub.levels.Director && (
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.includes("Director") ? "border-[#b8752f] bg-[#b8752f]/5" : "border-dashed border-[#b8752f]/40 hover:bg-black/[0.02]"
                    }`}
                  >
                    <input type="checkbox" className="mt-1" checked={selected.includes("Director")} onChange={() => toggleLevel(id, "Director")} />
                    <span className="text-sm leading-relaxed">
                      <span className="text-[#b8752f] font-medium">فراتر از عالی: </span>
                      {sub.levels.Director.shortAnchor}
                    </span>
                  </label>
                )}
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    dontKnowSelected ? "border-gray-300 bg-black/[0.03]" : "border-[#e4e0d8] hover:bg-black/[0.02]"
                  }`}
                >
                  <input type="radio" name={`dontknow-${id}`} className="mt-0.5" checked={dontKnowSelected} onChange={() => selectDontKnow(id)} />
                  <span className="text-sm text-gray-400">اطلاعی ندارم / فرصت مشاهده نداشته‌ام</span>
                </label>
              </div>

              {isManagementViewer && (
                <div className="mt-3">
                  {example ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs font-semibold text-blue-700 mb-1">📋 مثالی که خودِ متقاضی برای این پرسش نوشته</div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{example}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">متقاضی برای این پرسش مثالی ننوشته.</p>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className="block text-xs text-gray-400 mb-1">
                  {isCandidate ? "نمونه‌ای از تجربه‌ی خودتان (موقعیت / اقدام / نتیجه) — اختیاری" : "نمونه‌ای از این رفتار که مشاهده کرده‌اید (اختیاری)"}
                </label>
                <textarea
                  className="w-full text-sm border border-[#e4e0d8] rounded-lg px-3 py-2"
                  rows={3}
                  value={answer.comment}
                  onChange={(e) => updateComment(id, e.target.value)}
                  placeholder={isCandidate ? "برای نمونه: در پروژه‌ی X هنگامی که Y پیش آمد، من Z را انجام دادم و نتیجه W حاصل شد..." : "..."}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#faf9f6]/95 backdrop-blur border-t border-[#e4e0d8] p-4">
        <div className="max-w-2xl mx-auto flex justify-between gap-3">
          <button className="btn-secondary" disabled={pageIndex === 0} onClick={handleBack}>→ بازگشت</button>
          <button className="btn-primary flex-1" disabled={!pageAnswered || submitting} onClick={handleNext}>
            {submitting ? "در حال ثبت..." : pageIndex === state.pages.length - 1 ? "ثبت نهایی پاسخ‌ها" : "بعدی ←"}
          </button>
        </div>
      </div>
    </main>
  );
}
