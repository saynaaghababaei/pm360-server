"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
const STATUS_ICON: Record<string, string> = { met: "✅", gap: "⚠️", "no-data": "❔", growth: "🌱", strength: "💪" };
const SCORE_LABEL_FA: Record<number, string> = { 1: "پایه", 2: "قابل‌قبول", 3: "قوی", 4: "عالی", 5: "فراتر از عالی" };

function scoreToLabel(score: number | null): string {
  if (score === null || score === undefined) return "—";
  const floored = Math.max(1, Math.min(5, Math.floor(score)));
  return SCORE_LABEL_FA[floored];
}

function pillClassForStatus(status: string): string {
  if (status === "met" || status === "strength") return "pill-success";
  if (status === "gap") return "pill-danger";
  if (status === "growth") return "pill-warning";
  return "pill-neutral";
}

type Category = {
  raviCategoryKey: string;
  label: string;
  weightedScore: number | null;
  selfScore: number | null;
  raterSpread: Record<string, { min: number; max: number; count: number }>;
};
type LevelCheckCategory = { raviCategoryKey: string; expectedLevel: string | null; defining: boolean; actualScore: number | null; status: string };
type LevelCheck = { level: string; categories: LevelCheckCategory[]; passed: boolean };
type MatrixCell = {
  raviCategoryKey: string;
  label: string;
  status: string;
  defining?: boolean;
  neededJobLevel?: string;
  candidateJobLevel?: string;
};
type MatrixRow = { level: string; cells: MatrixCell[] };
type DevPlanCategory = { raviCategoryKey: string; label: string; status: string; neededJobLevel: string; candidateJobLevel: string; tree: unknown[] };
type DevPlan =
  | { mode: "target"; level: string; definingGaps: DevPlanCategory[]; devplanGaps: DevPlanCategory[] }
  | { mode: "exploratory"; currentLevel: string; nextLevel: string | null; currentLevelGrowth: DevPlanCategory[]; nextLevelDefining: DevPlanCategory[] };
type RaterNamed = { raterId: string; name: string | null; role: string; byCategory: Record<string, number | null>; examples: { subSkillId: number; subSkill: string; text: string }[] };
type RaterAnon = { role: string; count: number; byCategory: Record<string, number | null>; examples: { subSkillId: number; subSkill: string; text: string }[] };

type Report = {
  subjectName: string;
  computedLevel: string;
  verdict: string;
  currentGap: { diff: number } | null;
  targetMode: { expectedLevel: string; ready: boolean; gaps: string[] } | null;
  participation: {
    totalInvited: number;
    totalCompleted: number;
    effectiveWeightPct: Record<string, number | null>;
  };
  categories: Category[];
  levelChecks: LevelCheck[];
  fullMatrix: MatrixRow[];
  developmentPlan: DevPlan | null;
  raterBreakdown: { named: RaterNamed[]; anonymousSummary: RaterAnon[] };
  questionScope: string | null;
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [role, setRole] = useState<"admin" | "viewer" | null>(null);
  const [openDevCats, setOpenDevCats] = useState<Set<string>>(new Set());
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [openExamples, setOpenExamples] = useState<Set<string>>(new Set());

  function load() {
    fetch(`/api/assessments/${id}/report`)
      .then((r) => r.json())
      .then((d) => setReport(d.report));
  }
  useEffect(() => {
    load();
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setRole(d.role || null));
  }, [id]);

  if (!report) {
    return <main className="max-w-3xl mx-auto px-6 py-20 text-center text-[var(--ink-faint)]">در حال بارگذاری گزارش...</main>;
  }

  const highlightLevel = report.targetMode ? report.targetMode.expectedLevel : report.computedLevel;
  const highlightLabel = report.targetMode ? "سطح هدف" : "سطح فعلی متقاضی";

  function toggleDevCat(key: string) {
    setOpenDevCats((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleExamples(key: string) {
    setOpenExamples((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleLogout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-8">
        {/* A viewer has no access to the management dashboard (/assessment/[id]) —
            send them to the home page instead, which is their own report anyway. */}
        <Link href={role === "viewer" ? "/" : `/assessment/${id}`} className="text-sm text-[var(--accent)] font-medium">
          → بازگشت{role === "admin" ? " به داشبورد" : ""}
        </Link>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-sm" onClick={load}>↻ به‌روزرسانی گزارش</button>
          {role === "viewer" && (
            <button className="btn-secondary text-sm" onClick={handleLogout}>خروج</button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="card p-7 mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-3">{report.subjectName}</h1>
        {report.targetMode ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--ink-soft)]">سطح هدف (ارتقا):</span>
            <span className="pill pill-warning font-semibold">{report.targetMode.expectedLevel}</span>
            {report.targetMode.ready ? (
              <span className="pill pill-success">✅ آماده</span>
            ) : (
              <span className="pill pill-danger">⚠️ هنوز گپ دارد</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--ink-soft)]">سطح محاسبه‌شده:</span>
            <span className="pill pill-accent font-semibold">{report.computedLevel}</span>
            {report.currentGap && (
              <span className={`pill ${report.currentGap.diff > 0 ? "pill-success" : report.currentGap.diff === 0 ? "pill-neutral" : "pill-warning"}`}>
                {report.currentGap.diff > 0
                  ? `${report.currentGap.diff} پله بالاتر از سطح فعلی`
                  : report.currentGap.diff === 0
                  ? "منطبق با سطح فعلی"
                  : `${Math.abs(report.currentGap.diff)} پله پایین‌تر از سطح فعلی`}
              </span>
            )}
          </div>
        )}
        {report.targetMode && !report.targetMode.ready && report.targetMode.gaps.length > 0 && (
          <p className="text-sm text-[var(--ink-soft)] mt-3">
            نسبت به سطح هدف {report.targetMode.expectedLevel}: هنوز آماده نیست — گپ در {report.targetMode.gaps.join("، ")}.
          </p>
        )}
        <p className="mt-4 text-sm leading-relaxed bg-[var(--paper)] border border-[var(--line)] rounded-xl p-4">{report.verdict}</p>
      </div>

      {/* Development Plan */}
      {report.developmentPlan && (
        <div className="card p-6 mb-6">
          <h2 className="section-title mb-4">🎯 برنامه‌ریزی توسعه</h2>
          {report.developmentPlan.mode === "target" ? (
            <>
              {report.developmentPlan.definingGaps.length === 0 && report.developmentPlan.devplanGaps.length === 0 ? (
                <p className="text-sm pill pill-success inline-flex">متقاضی همه‌ی دسته‌های لازم برای سطح هدف ({report.developmentPlan.level}) را پوشش داده است.</p>
              ) : (
                <>
                  {report.developmentPlan.definingGaps.length > 0 && (
                    <>
                      <h3 className="text-xs font-semibold text-[var(--danger)] mb-2 uppercase tracking-wide">دسته‌های تعریف‌کننده‌ای که هنوز نرسیده‌اند</h3>
                      {report.developmentPlan.definingGaps.map((c) => (
                        <DevCatBlock key={`def-${c.raviCategoryKey}`} cat={c} sectionKey="target-def" open={openDevCats} onToggle={toggleDevCat} kind="defining" />
                      ))}
                    </>
                  )}
                  {report.developmentPlan.devplanGaps.length > 0 && (
                    <>
                      <h3 className="text-xs font-semibold text-[var(--accent2)] mt-4 mb-2 uppercase tracking-wide">دسته‌های Development Plan ناتمام</h3>
                      {report.developmentPlan.devplanGaps.map((c) => (
                        <DevCatBlock key={`dev-${c.raviCategoryKey}`} cat={c} sectionKey="target-dev" open={openDevCats} onToggle={toggleDevCat} kind="devplan" />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {report.developmentPlan.currentLevelGrowth.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-[var(--accent2)] mb-2 uppercase tracking-wide">برای تکمیل سطح فعلی ({report.developmentPlan.currentLevel})</h3>
                  {report.developmentPlan.currentLevelGrowth.map((c) => (
                    <DevCatBlock key={`cur-${c.raviCategoryKey}`} cat={c} sectionKey="current" open={openDevCats} onToggle={toggleDevCat} kind="devplan" />
                  ))}
                </>
              )}
              {report.developmentPlan.nextLevelDefining.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-[var(--accent)] mt-4 mb-2 uppercase tracking-wide">برای رسیدن به سطح بعدی ({report.developmentPlan.nextLevel})</h3>
                  {report.developmentPlan.nextLevelDefining.map((c) => (
                    <DevCatBlock key={`next-${c.raviCategoryKey}`} cat={c} sectionKey="next" open={openDevCats} onToggle={toggleDevCat} kind="defining" />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Category table */}
      <div className="card p-6 mb-6 overflow-x-auto">
        <h2 className="section-title mb-4">نمره‌ی هر کتگوری</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>کتگوری</th>
              <th>نمره‌ی وزنی</th>
              <th>آستانه</th>
              <th>متقاضی</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {report.categories.map((cat) => {
              const check = report.levelChecks
                .find((lc) => lc.level === highlightLevel)
                ?.categories.find((c) => c.raviCategoryKey === cat.raviCategoryKey);
              const spreadEntries = Object.entries(cat.raterSpread).filter(([, s]) => s.count >= 2);
              const pct = cat.weightedScore !== null ? Math.min(100, (cat.weightedScore / 5) * 100) : 0;
              return (
                <tr key={cat.raviCategoryKey}>
                  <td className="font-medium">{cat.label}</td>
                  <td>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold tabular-nums">{cat.weightedScore !== null ? cat.weightedScore.toFixed(2) : "—"}</span>
                      <span className="text-xs text-[var(--ink-faint)]">{scoreToLabel(cat.weightedScore)}</span>
                    </div>
                    {cat.weightedScore !== null && (
                      <div className="progress-track w-24">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {spreadEntries.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {spreadEntries.map(([role, s]) => {
                          const wide = s.max - s.min >= 1.5;
                          return (
                            <div key={role} className={`text-xs ${wide ? "text-[var(--accent2)] font-medium" : "text-[var(--ink-faint)]"}`}>
                              {ROLE_LABELS[role]?.replace(" محصول", "")} ({s.count} نفر): {s.min.toFixed(1)}–{s.max.toFixed(1)}
                              {wide ? " · اختلاف‌نظر بالا" : ""}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="text-[var(--ink-soft)]">{check?.expectedLevel || "—"}</td>
                  <td>
                    <div className="font-medium tabular-nums">{cat.selfScore !== null ? cat.selfScore.toFixed(2) : "—"}</div>
                    <div className="text-xs text-[var(--ink-faint)]">{scoreToLabel(cat.selfScore)}</div>
                  </td>
                  <td>{check && <span className={`pill ${pillClassForStatus(check.status)}`}>{STATUS_ICON[check.status]}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rater breakdown */}
      {(report.raterBreakdown.named.length > 0 || report.raterBreakdown.anonymousSummary.length > 0) && (
        <div className="card p-6 mb-6 overflow-x-auto">
          <button className="w-full flex items-center justify-between" onClick={() => setBreakdownOpen((v) => !v)}>
            <span className="section-title">نمرات و مثال‌ها به تفکیک ارزیاب</span>
            <span className="text-sm text-[var(--ink-faint)]">{breakdownOpen ? "بستن ▴" : "نمایش ▾"}</span>
          </button>
          {breakdownOpen && (
            <table className="data-table mt-4">
              <thead>
                <tr>
                  <th>ارزیاب</th>
                  {report.categories.map((c) => <th key={c.raviCategoryKey}>{c.label}</th>)}
                  <th>مثال‌ها</th>
                </tr>
              </thead>
              <tbody>
                {report.raterBreakdown.named.map((n) => {
                  const key = `named:${n.raterId}`;
                  return (
                    <RaterRow
                      key={key}
                      rowKey={key}
                      label={<>{n.name || "(بدون نام)"} <span className="text-[var(--ink-faint)] text-xs">— {ROLE_LABELS[n.role]}</span></>}
                      byCategory={n.byCategory}
                      categories={report.categories}
                      examples={n.examples}
                      open={openExamples.has(key)}
                      onToggle={() => toggleExamples(key)}
                    />
                  );
                })}
                {report.raterBreakdown.anonymousSummary.map((a) => {
                  const key = `anon:${a.role}`;
                  return (
                    <RaterRow
                      key={key}
                      rowKey={key}
                      label={<>{ROLE_LABELS[a.role]} <span className="text-[var(--ink-faint)] text-xs">(میانه‌ی {a.count} نفر، ناشناس)</span></>}
                      byCategory={a.byCategory}
                      categories={report.categories}
                      examples={a.examples}
                      open={openExamples.has(key)}
                      onToggle={() => toggleExamples(key)}
                      dim
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Full matrix */}
      <div className="card p-6 mb-6 overflow-x-auto">
        <h2 className="section-title mb-1">ماتریس کامل مدل</h2>
        <p className="text-xs text-[var(--ink-faint)] mb-4 leading-relaxed">
          حاشیه‌ی توپر قرمز = تعریف‌کننده، نقطه‌چین آبی = Development Plan. ✅ تطابق · ⚠️ نرسیده · 🌱 زیر انتظار · 💪 فراتر از انتظار · ❔ بدون‌داده.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>سطح</th>
              {report.categories.map((c) => <th key={c.raviCategoryKey} className="px-1.5">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.fullMatrix.map((row) => {
              const isHighlight = row.level === highlightLevel;
              return (
                <tr key={row.level} className={isHighlight ? "bg-[var(--success-soft)]" : ""}>
                  <td className={`align-top ${isHighlight ? "font-bold text-[var(--success)] border-t-4 border-b-4 border-[var(--success)]" : "font-medium"}`}>
                    {row.level} {isHighlight && <span className="text-[10px] font-normal block">({highlightLabel})</span>}
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.raviCategoryKey} className={`px-1.5 ${isHighlight ? "border-t-4 border-b-4 border-[var(--success)]" : ""}`}>
                      {cell.status === "na" ? (
                        <span className="text-[var(--ink-faint)]">—</span>
                      ) : (
                        <div className={`rounded-lg px-2 py-1.5 text-center ${cell.defining ? "border-2 border-red-300" : "border border-dashed border-blue-300"}`}>
                          <div className="text-sm">{STATUS_ICON[cell.status]}</div>
                          {cell.status !== "no-data" && (
                            <div className="text-[10px] text-[var(--ink-faint)] mt-0.5">نیاز:{cell.neededJobLevel} متقاضی:{cell.candidateJobLevel}</div>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function RaterRow({
  label,
  byCategory,
  categories,
  examples,
  open,
  onToggle,
  dim,
}: {
  rowKey: string;
  label: React.ReactNode;
  byCategory: Record<string, number | null>;
  categories: Category[];
  examples: { subSkillId: number; subSkill: string; text: string }[];
  open: boolean;
  onToggle: () => void;
  dim?: boolean;
}) {
  return (
    <>
      <tr className={dim ? "bg-[var(--paper)]" : ""}>
        <td className={`font-medium ${dim ? "text-[var(--ink-soft)]" : ""}`}>{label}</td>
        {categories.map((c) => (
          <td key={c.raviCategoryKey} className="text-center tabular-nums">
            {byCategory[c.raviCategoryKey] !== null ? byCategory[c.raviCategoryKey]!.toFixed(2) : "—"}
          </td>
        ))}
        <td>
          <button className="text-xs text-[var(--accent)] font-medium whitespace-nowrap" onClick={onToggle}>
            {open ? "بستن ▴" : `مثال‌ها (${examples.length}) ▾`}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={categories.length + 2} className="bg-[var(--paper)] rounded-lg">
            {examples.length === 0 ? (
              <span className="text-xs text-[var(--ink-faint)]">مثالی ثبت نشده.</span>
            ) : (
              <div className="space-y-1.5 py-1">
                {examples.map((ex, i) => (
                  <div key={i} className="text-xs leading-relaxed">
                    <span className="font-medium text-[var(--ink-soft)]">{ex.subSkill}:</span> <span className="text-[var(--ink)]">{ex.text}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function DevCatBlock({
  cat,
  sectionKey,
  open,
  onToggle,
  kind,
}: {
  cat: DevPlanCategory;
  sectionKey: string;
  open: Set<string>;
  onToggle: (key: string) => void;
  kind: "defining" | "devplan";
}) {
  const key = `${sectionKey}:${cat.raviCategoryKey}`;
  const isOpen = open.has(key);
  const pillCls =
    cat.status === "no-data" ? "pill-neutral" : kind === "defining" ? (cat.status === "gap" ? "pill-danger" : "pill-success") : "pill-warning";
  const icon = cat.status === "no-data" ? "❔" : kind === "defining" ? (cat.status === "gap" ? "⚠️" : "✅") : "🌱";

  return (
    <div className="border border-[var(--line)] rounded-xl p-3.5 mb-2">
      <button className="w-full flex items-center justify-between text-right gap-3" onClick={() => onToggle(key)}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{cat.label}</span>
          <span className={`pill ${pillCls}`}>
            {icon} نیاز:{cat.neededJobLevel} متقاضی:{cat.candidateJobLevel}
            {cat.status === "no-data" ? " — بدون‌داده" : ""}
          </span>
        </div>
        <span className="text-xs text-[var(--ink-faint)] shrink-0">{isOpen ? "بستن ▴" : "جزئیات ▾"}</span>
      </button>
      {isOpen && (
        <p className="text-xs text-[var(--ink-faint)] mt-3 leading-relaxed">
          جزئیات ساب‌اسکیل تعریف رفتار/رفتار واقعی/Strong Signal — بخش «تودرتوی درخت کامل» هنوز به‌طور کامل پورت نشده (به نسخه‌ی HTML مراجعه کنید).
        </p>
      )}
    </div>
  );
}
