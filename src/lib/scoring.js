/* eslint-disable @typescript-eslint/no-explicit-any */
/* ============================================================
   PM 360 — pure scoring/business logic, ported from the original
   single-file HTML tool (app-core.js). No persistence, no framework
   dependency — every function here takes plain data in and returns plain
   data out, so it is trivially unit-testable and safe to call from any
   Next.js API route.
   ============================================================ */

import DATA from "@/data/competency-data.json";
const LEVELS_ORDER = DATA.levelsOrder; // ["Junior","Mid","Senior","Lead","Director"]
const LEVEL_VALUE = { Junior: 1, Mid: 2, Senior: 3, Lead: 4, Director: 5 };
const THRESHOLD = { "پایه": 1, "قابل قبول": 2, "قابل‌قبول": 2, "قوی": 3, "عالی": 4 };
const SCORE_LABEL = { 1: "پایه", 2: "قابل‌قبول", 3: "قوی", 4: "عالی", 5: "فراتر از عالی" };

// Floors a continuous weighted score (e.g. 2.75) down to the level it has
// FULLY and definitively reached, and returns its Persian label. This must
// stay consistent with the pass/fail threshold logic elsewhere (which checks
// `actual < threshold`, not a rounded value) — using round() here previously
// caused a contradiction: e.g. 2.75 would round-label as "قوی" while the
// status column simultaneously showed "not yet reached قوی (threshold 3)".
// Flooring guarantees the label never claims a level the score hasn't
// actually cleared. Clamped to the 1-5 range.
function scoreToLabel(score) {
  if (score === null || score === undefined) return "—";
  const floored = Math.max(1, Math.min(5, Math.floor(score)));
  return SCORE_LABEL[floored];
}

// Same floor logic as scoreToLabel, but returns the corresponding JOB LEVEL
// name (Junior/Mid/Senior/Lead/Director) instead of the abstract پایه/قابل‌قبول/
// قوی/عالی label — more intuitive for a reader scanning the growth-path table.
const JOB_LEVEL_LABEL_FROM_SCORE = { 1: "Junior", 2: "Mid", 3: "Senior", 4: "Lead", 5: "Director" };
function scoreToJobLevelLabel(score) {
  if (score === null || score === undefined) return "—";
  const floored = Math.max(1, Math.min(5, Math.floor(score)));
  return JOB_LEVEL_LABEL_FROM_SCORE[floored];
}
function thresholdToJobLevelLabel(expectedLevelLabel) {
  if (!expectedLevelLabel) return "—";
  const num = THRESHOLD[expectedLevelLabel];
  return num ? JOB_LEVEL_LABEL_FROM_SCORE[num] : "—";
}
const ROLE_LABELS = {
  Self: "متقاضی",
  Manager: "مدیر مستقیم",
  Director: "دایرکتور محصول",
  CPO: "معاون محصول",
  Peer: "همکار",
  Report: "زیرمجموعه",
  Stakeholder: "ذی‌نفع",
};
const DEFAULT_GROUP_WEIGHTS = {
  Manager: 0.25,
  Director: 0.15,
  CPO: 0.1,
  Peer: 0.25,
  Report: 0.15,
  Stakeholder: 0.1,
};

// Peer and Stakeholder only reach their FULL base weight once at least this
// many people in that group have answered a given question; below that, the
// group's weight is scaled down proportionally (count × per-person share) and
// the shortfall is redistributed to whichever groups DO have data — same
// redistribution mechanism as when a group is entirely missing. Manager and
// Report are not scaled this way (they're usually a single person by design).
const MIN_FULL_COUNT = { Peer: 3, Stakeholder: 3 };

// Returns the "allocated" (pre-normalization) weight for one rater group,
// given how many people in that group answered and the effective base
// weights in play (defaults or a custom override).
function allocatedGroupWeight(role, count, weights) {
  if (count <= 0) return 0;
  if (role === "Peer" || role === "Stakeholder") {
    const minFull = MIN_FULL_COUNT[role];
    const perPerson = weights[role] / minFull;
    return Math.min(count, minFull) * perPerson;
  }
  return weights[role]; // Manager / Report: full-or-zero
}
// Pure version: caller (an API route, which has already fetched
// GlobalSettings from the database) passes in the org-wide default weights.
// This keeps this whole module free of any persistence concerns.
function getEffectiveWeights(assessment, globalWeights) {
  if (assessment.customWeights) return assessment.customWeights;
  return globalWeights || DEFAULT_GROUP_WEIGHTS;
}

function getCategoryDisplayName(raviCategory) {
  return raviCategory.split("\n")[0].replace(/\(.*?\)/g, "").trim();
}

const ALL_SUBSKILLS = DATA.glossarySubskills; // index in this array = stable subSkillId
const CATEGORIES = DATA.assessmentModel.filter((c) => c.raviCategoryKey !== "gate");
const GATE_CATEGORY = DATA.assessmentModel.find((c) => c.raviCategoryKey === "gate");

function getSubSkillsForCategory(key) {
  return ALL_SUBSKILLS.map((sub, id) => ({ id, sub })).filter((x) => x.sub.raviCategoryKey === key);
}

// Gate (Domain Knowledge) is intentionally excluded from every survey mode.
// The default assumption is that the manager already confirmed domain
// knowledge is sufficient BEFORE starting a 360 process (e.g. before kicking
// off a promotion evaluation) — it's a pre-check, not something re-litigated
// by every rater. See the guide (renderGuide) for the full explanation.
const SURVEY_PAGES = DATA.assessmentModel
  .filter((c) => c.raviCategoryKey !== "gate")
  .map((c) => ({
    raviCategoryKey: c.raviCategoryKey,
    label: getCategoryDisplayName(c.raviCategory),
    type: c.type, // "Hard Skills" | "Soft Skills" | "Domain Expert"
    subskills: getSubSkillsForCategory(c.raviCategoryKey),
  }));

// Which category types each rater role is realistically able to judge.
// Stakeholders are typically outside the team and can observe interpersonal/
// influence behavior (Soft Skills), but can't reliably judge internal
// execution mechanics (Hard Skills) or specialist domain depth (Gate).
// All other roles (Self, Manager, Peer, Report) see everything.
const ROLE_VISIBLE_TYPES = {
  Stakeholder: ["Soft Skills"],
};

function filterPagesByRole(pages, role) {
  const allowedTypes = ROLE_VISIBLE_TYPES[role];
  if (!allowedTypes) return pages; // no restriction for this role
  return pages.filter((p) => allowedTypes.includes(p.type));
}

// When an expected (target) level is set, ask about categories that have an
// expectation at that level. scope='defining' → only ★ defining categories
// (the ones whose weakness would fail the promotion, shortest form).
// scope='defining_plus_devplan' → defining + Development Plan categories too
// (so gaps in non-defining areas can also be captured for a growth plan).
// When no target level, ask everything (exploratory mode) regardless of scope.
// `role`, if given, additionally restricts to categories that role can judge.
function getSurveyPagesForLevel(expectedLevel, scope, role) {
  let pages;
  if (!expectedLevel) {
    pages = SURVEY_PAGES;
  } else {
    const effectiveScope = scope || "defining";
    const catByKey = {};
    for (const c of DATA.assessmentModel) catByKey[c.raviCategoryKey] = c;
    pages = SURVEY_PAGES.filter((page) => {
      const cat = catByKey[page.raviCategoryKey];
      if (!cat) return false;
      const lvl = cat.levels[expectedLevel];
      if (!lvl) return false;
      if (effectiveScope === "defining_plus_devplan") return lvl.expectedLevel !== null;
      return lvl.defining === true;
    });
  }
  return role ? filterPagesByRole(pages, role) : pages;
}

// Manager, Director, and CPO are the "management chain" roles: they're
// locked behind the candidate's own submission (see isRoleLocked), shown by
// name (not anonymized) in the rater breakdown, and see the "beyond
// excellent" bonus option. They are otherwise scored completely
// independently of one another — no shared/collapsed value between them.
const MANAGEMENT_ROLES = ["Manager", "Director", "CPO"];

function isRoleLocked(assessment, role) {
  if (!MANAGEMENT_ROLES.includes(role)) return false;
  const selfRater = assessment.raters.find((r) => r.role === "Self");
  return !selfRater || selfRater.status !== "completed";
}

function mean(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Median of a list of numeric rater values. Used (instead of mean) when
// combining multiple raters WITHIN one group (Manager/Director/CPO/Peer/
// Report/Stakeholder), because a single extreme opinion in a small group
// (as few as 2-3 people) can otherwise pull a mean far from what most of
// the group actually said. For a group of exactly one person, median and
// mean are identical — so this is a strict improvement, never a change,
// for the always-singleton groups (Manager/Director/CPO).
function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(vals) {
  const present = vals.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

const VALUE_TO_LEVEL_NAME = { 1: "Junior", 2: "Mid", 3: "Senior", 4: "Lead", 5: "Director" };

// A rater may now tick multiple options for one question (they observed the
// behavior at different levels on different occasions) — we take the HIGHEST
// A rater may tick multiple options for one question (they observed the
// behavior at different levels on different occasions) — we take the
// AVERAGE of the selected levels as that rater's effective answer (e.g.
// پایه + قابل‌قبول + عالی = (1+2+4)/3 = 2.33). Supports both the new
// `selectedLevels` array format and the old singular `selectedLevel` (for
// assessments imported from an earlier version of this tool).
function responseValue(resp) {
  const levels = resp.selectedLevels || (resp.selectedLevel !== undefined && resp.selectedLevel !== null ? [resp.selectedLevel] : null);
  if (!levels || levels.length === 0) return null;
  const nums = levels.map((l) => LEVEL_VALUE[l]).filter((n) => n !== undefined);
  if (nums.length === 0) return null;
  return mean(nums);
}

function roleLabelForComment(role, name) {
  if (role === "Manager") return `مدیر مستقیم (${name || "بدون نام"})`;
  if (role === "Director") return `دایرکتور محصول (${name || "بدون نام"})`;
  if (role === "CPO") return `معاون محصول (${name || "بدون نام"})`;
  if (role === "Self") return "متقاضی";
  const map = { Peer: "یک همکار", Report: "یک عضو زیرمجموعه", Stakeholder: "یک ذی‌نفع" };
  return map[role] || role;
}

function computeSubSkillScores(assessment, submissions, weights) {
  const raterById = new Map(assessment.raters.map((r) => [r.id, r]));

  return ALL_SUBSKILLS.map((sub, id) => {
    const responsesForThis = [];
    for (const sub2 of Object.values(submissions)) {
      const rater = raterById.get(sub2.raterId);
      if (!rater) continue;
      const resp = sub2.responses.find((r) => r.subSkillId === id);
      if (resp) responsesForThis.push({ role: rater.role, name: rater.name, resp });
    }

    // Management-chain "plurality override": pool every raw ticked option
    // (not each rater's own averaged value) from whichever of Manager/
    // Director/CPO responded to this subskill. If one level was ticked
    // strictly more times than every other level in that pooled basket, it
    // overrides each of those roles' own value for this subskill. If there's
    // a tie for the top spot (or nobody agrees on anything), there's no
    // clear plurality — each of the three falls back to their own
    // independently-averaged answer, same as every other rater group.
    const managementTicks = [];
    let managementResponderCount = 0;
    for (const { role, resp } of responsesForThis) {
      if (!MANAGEMENT_ROLES.includes(role)) continue;
      const levels = resp.selectedLevels || (resp.selectedLevel !== undefined && resp.selectedLevel !== null ? [resp.selectedLevel] : null);
      if (levels && levels.length > 0) {
        managementTicks.push(...levels);
        managementResponderCount += 1;
      }
    }
    let managementOverrideValue = null;
    let managementOverrideInfo = null;
    if (managementResponderCount >= 2 && managementTicks.length > 0) {
      const counts = {};
      for (const lvl of managementTicks) counts[lvl] = (counts[lvl] || 0) + 1;
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topCount = entries[0][1];
      const tiedAtTop = entries.filter((e) => e[1] === topCount);
      if (tiedAtTop.length === 1 && topCount > 1) {
        managementOverrideValue = LEVEL_VALUE[tiedAtTop[0][0]];
        managementOverrideInfo = { winningLevel: tiedAtTop[0][0], votes: topCount, totalTicks: managementTicks.length };
      }
    }

    const groups = {};
    let selfScore = null;
    const distribution = {};
    const comments = [];

    for (const { role, name, resp } of responsesForThis) {
      if (resp.comment && resp.comment.trim()) {
        comments.push({ label: roleLabelForComment(role, name), text: resp.comment.trim() });
      }
      const ownValue = responseValue(resp);
      const value = managementOverrideValue !== null && MANAGEMENT_ROLES.includes(role) && ownValue !== null ? managementOverrideValue : ownValue;
      if (value === null) continue;

      if (role === "Self") {
        selfScore = value;
        continue;
      }
      const bucketLabel = VALUE_TO_LEVEL_NAME[Math.round(value)] || VALUE_TO_LEVEL_NAME[Math.max(1, Math.min(5, Math.round(value)))];
      distribution[bucketLabel] = (distribution[bucketLabel] || 0) + 1;

      if (!groups[role]) groups[role] = [];
      groups[role].push(value);
    }

    const availableGroups = Object.keys(weights).filter((g) => groups[g] && groups[g].length > 0);
    let weightedScore = null;
    if (availableGroups.length > 0) {
      const allocated = {};
      for (const g of availableGroups) allocated[g] = allocatedGroupWeight(g, groups[g].length, weights);
      const totalAllocated = availableGroups.reduce((sum, g) => sum + allocated[g], 0);
      weightedScore = availableGroups.reduce((sum, g) => {
        const groupAvg = median(groups[g]);
        return sum + groupAvg * (totalAllocated > 0 ? allocated[g] / totalAllocated : 0);
      }, 0);
    }

    return {
      subSkillId: id,
      subSkill: sub.subSkill,
      skill: sub.skill,
      managementOverride: managementOverrideInfo,
      weightedScore,
      selfScore,
      distribution,
      comments,
    };
  });
}

function rollUpCategory(subskillScores, raviCategoryKey, field) {
  const subsInCat = ALL_SUBSKILLS.map((s, id) => ({ s, id })).filter((x) => x.s.raviCategoryKey === raviCategoryKey);
  const bySkill = new Map();
  for (const { s, id } of subsInCat) {
    const score = subskillScores[id][field];
    if (score === null) continue;
    if (!bySkill.has(s.skill)) bySkill.set(s.skill, []);
    bySkill.get(s.skill).push(score);
  }
  const skillAverages = Array.from(bySkill.values()).map((arr) => average(arr));
  return average(skillAverages);
}

// Builds the full model matrix (every level × every category), independent
// of any single "target level" — this is the second, separate table showing
// how the candidate's scores compare to the WHOLE model, cell by cell.
//   - Categories not expected at that level → { status: "na" }
//   - Defining (★) categories → binary: "met" (score >= threshold) or "gap"
//     (score < threshold) or "no-data" — same numeric comparison used for
//     level determination elsewhere, so this stays consistent.
//   - Development Plan categories → three-way, using the floored label so
//     it reads as a bucket comparison rather than a strict numeric one:
//     "met" (same bucket as threshold), "growth" (below — a development
//     area), "strength" (above — exceeds what was expected), "no-data".
function buildFullModelMatrix(reportCategories) {
  const scoreByKey = {};
  for (const c of reportCategories) scoreByKey[c.raviCategoryKey] = c.weightedScore;

  return LEVELS_ORDER.map((level) => {
    const cells = CATEGORIES.map((cat) => {
      const levelInfo = cat.levels[level];
      const label = getCategoryDisplayName(cat.raviCategory);
      if (!levelInfo || levelInfo.expectedLevel === null) {
        return { raviCategoryKey: cat.raviCategoryKey, label, status: "na" };
      }
      const score = scoreByKey[cat.raviCategoryKey] ?? null;
      const thresholdNum = THRESHOLD[levelInfo.expectedLevel];
      const neededJobLevel = thresholdToJobLevelLabel(levelInfo.expectedLevel);
      const candidateJobLevel = scoreToJobLevelLabel(score);

      if (levelInfo.defining) {
        let status = "no-data";
        if (score !== null) status = score >= thresholdNum ? "met" : "gap";
        return { raviCategoryKey: cat.raviCategoryKey, label, status, defining: true, neededJobLevel, candidateJobLevel };
      }

      // Development Plan: bucket comparison (floored score) vs. threshold
      let status = "no-data";
      if (score !== null) {
        const scoreBucket = Math.max(1, Math.min(5, Math.floor(score)));
        if (scoreBucket === thresholdNum) status = "met";
        else if (scoreBucket < thresholdNum) status = "growth";
        else status = "strength";
      }
      return { raviCategoryKey: cat.raviCategoryKey, label, status, defining: false, neededJobLevel, candidateJobLevel };
    });
    return { level, cells };
  });
}

// Builds the "برنامه‌ریزی توسعه" data: growth areas within the current level
// (Development Plan categories that haven't been met yet) PLUS the defining
// categories of the NEXT level (the gate for promotion) — each broken down
// into Competency → Skill → SubSkill with full glossary definitions, so the
// person knows exactly what to work on, not just which category name.
function buildDevelopmentPlan(fullMatrix, level, isTargetMode) {
  function buildTree(raviCategoryKey, neededJobLevel) {
    const subs = ALL_SUBSKILLS.map((s, id) => ({ s, id })).filter((x) => x.s.raviCategoryKey === raviCategoryKey);
    const byCompetency = new Map();
    for (const { s, id } of subs) {
      const compLabel = s.raviCompetency.split("\n")[0].trim();
      if (!byCompetency.has(compLabel)) byCompetency.set(compLabel, new Map());
      const bySkill = byCompetency.get(compLabel);
      if (!bySkill.has(s.skill)) bySkill.set(s.skill, { skillDefinition: s.skillDefinition, subskills: [] });
      const levelContent = neededJobLevel && s.levels[neededJobLevel] ? s.levels[neededJobLevel] : null;
      bySkill.get(s.skill).subskills.push({
        id,
        subSkill: s.subSkill,
        subSkillDefinition: s.subSkillDefinition,
        neededJobLevel,
        behaviorDefinition: levelContent ? levelContent.behaviorDefinition : "",
        realBehavior: levelContent ? levelContent.realBehavior : "",
        strongSignal: levelContent ? levelContent.strongSignal : "",
      });
    }
    return Array.from(byCompetency.entries()).map(([competency, skillsMap]) => ({
      competency,
      skills: Array.from(skillsMap.entries()).map(([skill, data]) => ({
        skill,
        skillDefinition: data.skillDefinition,
        subskills: data.subskills,
      })),
    }));
  }

  // Target mode: this assessment only ever asked about ONE specific target
  // level (e.g. Senior) — categories belonging to the level AFTER that were
  // never asked at all, so it would be both premature and factually wrong
  // (no data) to show "what's needed for the next level" here. Instead we
  // show exactly what's blocking the target level itself: its unmet
  // defining (★) categories, plus any unmet Development Plan categories
  // at that same level.
  if (isTargetMode) {
    const levelRow = fullMatrix.find((r) => r.level === level);
    const definingGaps = levelRow ? levelRow.cells.filter((c) => c.defining && c.status === "gap") : [];
    const devplanGaps = levelRow ? levelRow.cells.filter((c) => !c.defining && c.status === "growth") : [];
    return {
      mode: "target",
      level,
      definingGaps: definingGaps.map((c) => ({ raviCategoryKey: c.raviCategoryKey, label: c.label, status: c.status, neededJobLevel: c.neededJobLevel, candidateJobLevel: c.candidateJobLevel, tree: buildTree(c.raviCategoryKey, c.neededJobLevel) })),
      devplanGaps: devplanGaps.map((c) => ({ raviCategoryKey: c.raviCategoryKey, label: c.label, status: c.status, neededJobLevel: c.neededJobLevel, candidateJobLevel: c.candidateJobLevel, tree: buildTree(c.raviCategoryKey, c.neededJobLevel) })),
    };
  }

  // Exploratory mode: full picture — gaps within the current (achieved)
  // level, plus the defining gate for the NEXT level up.
  const currentIdx = LEVELS_ORDER.indexOf(level);
  const nextLevel = currentIdx >= 0 && currentIdx < LEVELS_ORDER.length - 1 ? LEVELS_ORDER[currentIdx + 1] : null;

  const currentRow = fullMatrix.find((r) => r.level === level);
  const nextRow = nextLevel ? fullMatrix.find((r) => r.level === nextLevel) : null;

  const currentGaps = currentRow ? currentRow.cells.filter((c) => !c.defining && c.status === "growth") : [];
  const nextDefining = nextRow ? nextRow.cells.filter((c) => c.defining) : [];

  return {
    mode: "exploratory",
    currentLevel: level,
    nextLevel,
    currentLevelGrowth: currentGaps.map((c) => ({ raviCategoryKey: c.raviCategoryKey, label: c.label, status: c.status, neededJobLevel: c.neededJobLevel, candidateJobLevel: c.candidateJobLevel, tree: buildTree(c.raviCategoryKey, c.neededJobLevel) })),
    nextLevelDefining: nextDefining.map((c) => ({ raviCategoryKey: c.raviCategoryKey, label: c.label, status: c.status, neededJobLevel: c.neededJobLevel, candidateJobLevel: c.candidateJobLevel, tree: buildTree(c.raviCategoryKey, c.neededJobLevel) })),
  };
}

// Per-rater score breakdown (category-level average) for Manager/Director/CPO
// by name, plus an anonymized combined average for Peer/Report/Stakeholder —
// for the "نمرات به تفکیک" section of the report.
function buildRaterBreakdown(assessment, submissions) {
  const named = [];
  const anonymousByRole = { Peer: [], Report: [], Stakeholder: [] };
  const anonymousExamplesByRole = { Peer: [], Report: [], Stakeholder: [] };

  for (const rater of assessment.raters) {
    const sub = submissions[rater.id];
    if (!sub || rater.role === "Self") continue;

    // Build a subskillScores-shaped array (one entry per ALL_SUBSKILLS index,
    // holding just this one rater's own value) so we can reuse rollUpCategory
    // — the exact same Skill-then-Category nested average used for the
    // official score in the main table. This guarantees the two numbers can
    // never drift apart, since they now come from one shared function
    // instead of two separately-maintained formulas.
    const raterSubskillScores = ALL_SUBSKILLS.map((s, id) => {
      const resp = sub.responses.find((r) => r.subSkillId === id);
      return { raterValue: resp ? responseValue(resp) : null };
    });
    const byCategory = {};
    for (const cat of CATEGORIES) {
      byCategory[cat.raviCategoryKey] = rollUpCategory(raterSubskillScores, cat.raviCategoryKey, "raterValue");
    }

    // Collect this rater's written examples (subskill name + text), wherever
    // they actually wrote one — this is what was missing before: the
    // breakdown table showed only numbers, never the examples it was named after.
    const examples = sub.responses
      .filter((r) => r.comment && r.comment.trim())
      .map((r) => ({ subSkillId: r.subSkillId, subSkill: ALL_SUBSKILLS[r.subSkillId].subSkill, text: r.comment.trim() }));

    if (MANAGEMENT_ROLES.includes(rater.role)) {
      named.push({ raterId: rater.id, name: rater.name, role: rater.role, byCategory, examples });
    } else if (anonymousByRole[rater.role]) {
      anonymousByRole[rater.role].push(byCategory);
      anonymousExamplesByRole[rater.role].push(...examples);
    }
  }

  const anonymousSummary = Object.entries(anonymousByRole)
    .filter(([, list]) => list.length > 0)
    .map(([role, list]) => {
      const byCategory = {};
      for (const cat of CATEGORIES) {
        const values = list.map((bc) => bc[cat.raviCategoryKey]).filter((v) => v !== null);
        byCategory[cat.raviCategoryKey] = values.length ? median(values) : null;
      }
      return { role, count: list.length, byCategory, examples: anonymousExamplesByRole[role] };
    });

  return { named, anonymousSummary };
}

// For a category, computes each rater group's spread of opinion: for every
// individual rater who answered anything in this category, their own
// Skill-then-Category nested average is computed first (via rollUpCategory,
// the same formula as the official score — see buildRaterBreakdown above for
// why this consistency matters), then min/max/count is taken ACROSS those
// per-rater numbers within each role. This measures "how much did people
// in this group disagree with each other" — distinct from subskill-topic
// variation, and distinct from the final median-based score itself.
function computeCategoryRaterSpread(assessment, submissions, raviCategoryKey) {
  const raterById = new Map(assessment.raters.map((r) => [r.id, r]));
  const byRole = {};

  for (const sub of Object.values(submissions)) {
    const rater = raterById.get(sub.raterId);
    if (!rater || rater.role === "Self") continue;
    const raterSubskillScores = ALL_SUBSKILLS.map((s, id) => {
      const resp = sub.responses.find((r) => r.subSkillId === id);
      return { raterValue: resp ? responseValue(resp) : null };
    });
    const raterAvg = rollUpCategory(raterSubskillScores, raviCategoryKey, "raterValue");
    if (raterAvg === null) continue;
    if (!byRole[rater.role]) byRole[rater.role] = [];
    byRole[rater.role].push(raterAvg);
  }

  const spread = {};
  for (const [role, vals] of Object.entries(byRole)) {
    spread[role] = { min: Math.min(...vals), max: Math.max(...vals), count: vals.length };
  }
  return spread;
}

function computeReport(assessment, submissions, weightsOverride, globalWeights) {
  const weights = weightsOverride || getEffectiveWeights(assessment, globalWeights);
  const subskillScores = computeSubSkillScores(assessment, submissions, weights);

  const categories = CATEGORIES.map((cat) => ({
    raviCategoryKey: cat.raviCategoryKey,
    label: getCategoryDisplayName(cat.raviCategory),
    weightedScore: rollUpCategory(subskillScores, cat.raviCategoryKey, "weightedScore"),
    selfScore: rollUpCategory(subskillScores, cat.raviCategoryKey, "selfScore"),
    subSkills: subskillScores.filter((s) => ALL_SUBSKILLS[s.subSkillId].raviCategoryKey === cat.raviCategoryKey),
    raterSpread: computeCategoryRaterSpread(assessment, submissions, cat.raviCategoryKey),
  }));

  // Gate (Domain Knowledge) is never asked (see SURVEY_PAGES above), so it
  // can never have real response data. We deliberately do NOT attempt to
  // compute a score for it — always report it as "not applicable" rather
  // than accidentally reading stray/legacy data. The manager's prior
  // confirmation is the assumption baked into this tool; see the guide.
  const gate = { score: null, threshold: null, passed: null };
  const categoryScoreByKey = new Map();
  for (const c of categories) categoryScoreByKey.set(c.raviCategoryKey, c.weightedScore);

  const allCategoriesForCheck = CATEGORIES; // Gate intentionally excluded from level-check logic too

  const levelChecks = LEVELS_ORDER.map((level) => {
    const checks = allCategoriesForCheck.map((cat) => {
      const levelInfo = cat.levels[level];
      const expected = levelInfo.expectedLevel;
      const defining = levelInfo.defining;
      const actualRaw = categoryScoreByKey.get(cat.raviCategoryKey);
      const actual = actualRaw === undefined ? null : actualRaw;
      let status = "met";
      if (defining) {
        if (actual === null) status = "no-data";
        else if (expected && actual < (THRESHOLD[expected] || 99)) status = "gap";
      }
      return {
        raviCategoryKey: cat.raviCategoryKey,
        label: getCategoryDisplayName(cat.raviCategory),
        expectedLevel: expected,
        defining,
        actualScore: actual,
        status,
      };
    });
    const passed = checks.every((c) => !c.defining || c.status === "met");
    return { level, categories: checks, passed };
  });

  let computedLevel = null;
  let firstFailedLevel = null;
  for (const lc of levelChecks) {
    if (lc.passed) computedLevel = lc.level;
    else {
      firstFailedLevel = lc;
      break;
    }
  }
  if (computedLevel === null) computedLevel = "زیر Junior";

  const orderIndex = (lvl) => LEVELS_ORDER.indexOf(lvl);

  // --- Target mode: an expected (promotion) level was set ---
  let targetMode = null;
  if (assessment.expectedLevel) {
    const targetCheck = levelChecks.find((lc) => lc.level === assessment.expectedLevel);
    if (targetCheck) {
      const gaps = targetCheck.categories.filter((c) => c.defining && c.status !== "met");
      targetMode = {
        expectedLevel: assessment.expectedLevel,
        ready: gaps.length === 0,
        gaps: gaps.map((g) => g.label),
      };
    }
  }

  // --- Current-level gap: compare computed vs current, if current was provided.
  // Only meaningful in exploratory mode — in target mode, computedLevel walks
  // through categories that were mostly never asked (only the target level's
  // categories were), so it isn't reliable, and targetMode.ready already
  // communicates readiness far more clearly than a second "gap" figure would.
  let currentGap = null;
  if (!targetMode && assessment.currentLevel && computedLevel !== "زیر Junior") {
    const diff = orderIndex(computedLevel) - orderIndex(assessment.currentLevel);
    currentGap = {
      currentLevel: assessment.currentLevel,
      computedLevel,
      diff, // >0 بالاتر از سطح فعلی، 0 منطبق، <0 پایین‌تر
    };
  }

  let verdict;
  if (targetMode) {
    if (targetMode.ready) {
      verdict = `نسبت به سطح هدف ${targetMode.expectedLevel}: تمام دسته‌های تعریف‌کننده پوشش داده شده — برای ${targetMode.expectedLevel} آماده است.`;
    } else {
      verdict = `نسبت به سطح هدف ${targetMode.expectedLevel}: هنوز آماده نیست — گپ در ${targetMode.gaps.join("، ")}.`;
    }
  } else if (firstFailedLevel) {
    const gaps = firstFailedLevel.categories.filter((c) => c.defining && c.status !== "met");
    const gapNames = gaps.map((g) => g.label).join("، ");
    verdict = `سطح محاسبه‌شده: ${computedLevel}. برای رسیدن به ${firstFailedLevel.level} گپ در دسته‌(های) تعریف‌کننده: ${gapNames}.`;
  } else {
    verdict = `این فرد تمام دسته‌های تعریف‌کننده تا سطح ${computedLevel} را پوشش داده — بالاترین سطح مدل است.`;
  }

  const byRole = {
    Self: { invited: 0, completed: 0 },
    Manager: { invited: 0, completed: 0 },
    Director: { invited: 0, completed: 0 },
    CPO: { invited: 0, completed: 0 },
    Peer: { invited: 0, completed: 0 },
    Report: { invited: 0, completed: 0 },
    Stakeholder: { invited: 0, completed: 0 },
  };
  for (const r of assessment.raters) {
    byRole[r.role].invited += 1;
    if (r.status === "completed") byRole[r.role].completed += 1;
  }

  // Overall (assessment-wide) representative weight per role, based on total
  // completed headcount per group — for display in the participation section.
  // Note: the ACTUAL weight used per question can differ slightly if some
  // raters skipped that specific question ("نمی‌دونم"); this is the
  // headline/typical figure, not a per-question guarantee.
  const nonSelfRoles = ["Manager", "Director", "CPO", "Peer", "Report", "Stakeholder"];
  const rolesWithData = nonSelfRoles.filter((r) => byRole[r].completed > 0);
  const allocatedByRole = {};
  for (const r of rolesWithData) allocatedByRole[r] = allocatedGroupWeight(r, byRole[r].completed, weights);
  const totalAllocatedByRole = rolesWithData.reduce((sum, r) => sum + allocatedByRole[r], 0);
  const effectiveWeightPct = {};
  for (const r of nonSelfRoles) {
    effectiveWeightPct[r] =
      rolesWithData.includes(r) && totalAllocatedByRole > 0 ? (allocatedByRole[r] / totalAllocatedByRole) * 100 : null;
  }

  const fullMatrix = buildFullModelMatrix(categories);
  const relevantLevelForDevPlan = targetMode ? targetMode.expectedLevel : LEVELS_ORDER.includes(computedLevel) ? computedLevel : null;

  return {
    subjectName: assessment.subjectName,
    currentLevel: assessment.currentLevel,
    expectedLevel: assessment.expectedLevel,
    questionScope: assessment.questionScope,
    computedLevel,
    verdict,
    currentGap,
    targetMode,
    gate,
    weightsUsed: weights,
    participation: {
      totalInvited: assessment.raters.length,
      totalCompleted: assessment.raters.filter((r) => r.status === "completed").length,
      byRole,
      effectiveWeightPct,
    },
    categories,
    levelChecks,
    fullMatrix,
    developmentPlan: relevantLevelForDevPlan ? buildDevelopmentPlan(fullMatrix, relevantLevelForDevPlan, !!targetMode) : null,
    raterBreakdown: buildRaterBreakdown(assessment, submissions),
  };
}

export {
  LEVELS_ORDER,
  LEVEL_VALUE,
  THRESHOLD,
  SCORE_LABEL,
  scoreToLabel,
  JOB_LEVEL_LABEL_FROM_SCORE,
  scoreToJobLevelLabel,
  thresholdToJobLevelLabel,
  ROLE_LABELS,
  DEFAULT_GROUP_WEIGHTS,
  MIN_FULL_COUNT,
  allocatedGroupWeight,
  getEffectiveWeights,
  getCategoryDisplayName,
  ALL_SUBSKILLS,
  CATEGORIES,
  GATE_CATEGORY,
  getSubSkillsForCategory,
  SURVEY_PAGES,
  ROLE_VISIBLE_TYPES,
  filterPagesByRole,
  getSurveyPagesForLevel,
  MANAGEMENT_ROLES,
  isRoleLocked,
  mean,
  median,
  average,
  VALUE_TO_LEVEL_NAME,
  responseValue,
  roleLabelForComment,
  computeSubSkillScores,
  rollUpCategory,
  buildFullModelMatrix,
  buildDevelopmentPlan,
  buildRaterBreakdown,
  computeCategoryRaterSpread,
  computeReport,
};
