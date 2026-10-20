// Разбор первичных на повтор.
//
// Через 5 дней после первичной по каждой заявке нужно решение: сажаем
// клиента на вторичную или закрываем. Пока решения нет, заявка «не
// разобрана» и подсвечивается во «Выполненных» — это недополученные деньги.
import { CALL_STAGES, addDaysIso, daysSinceIso } from "./clientCallsModel";

export const REPEAT_DUE_DAYS = CALL_STAGES.after_primary.afterDays;
// Заявки старше окна уже не подсвечиваем: клиент остыл, а длинный хвост
// прячет свежих, которым ещё можно продать вторичную.
export const REPEAT_WINDOW_DAYS = 60;

export const TRIAGE_BUCKETS = {
  pending: { label: "Не разобрано", hint: "5+ дней после первичной, решения по повтору нет" },
  repeat: { label: "На повтор", hint: "Посадили на вторичную или уже записали на выезд" },
  closed: { label: "Закрыто", hint: "Повтор не нужен, отказ, претензия или не выходит на связь" },
  soon: { label: "Скоро", hint: "Первичная была меньше 5 дней назад" },
};

// Сколько стоит вторичная по правилам: стандарт — 50% первичной, у
// партнёрских заявок — по договорённости с партнёром.
const POLICY_SHARE = { half: 0.5, free: 0, full: 1, disc15: 0.85, disc20: 0.8 };
export function repeatValueOf(job, policy) {
  const base = Number(job?.report_paid ?? job?.quoted_price ?? job?.price_options?.[0]?.amount) || 0;
  const share = POLICY_SHARE[policy] ?? POLICY_SHARE.half;
  return Math.round(base * share);
}

const REPEAT_CLOSE_LABELS = {
  all_good: "всё хорошо",
  declined: "отказ",
  complaint: "претензия",
  unreachable: "не выходит на связь",
};

// Куда относится первичная заявка. state — результат callStateOf.
export function repeatTriageOf(job, state, { today, laterIndex } = {}) {
  if (job?.status !== "done" || state?.stage !== "after_primary") return null;
  const days = daysSinceIso(state.doneDay, today ? new Date(`${String(today).slice(0, 10)}T12:00:00`) : new Date());
  const sold = laterIndex?.repeats?.has(String(job.id));
  if (job.repeat_state === "on_repeat") return { bucket: "repeat", days, reason: "в «Повторных выездах»" };
  if (sold) return { bucket: "repeat", days, reason: "повторная заявка создана" };
  // «Завершить повтор» без повторной заявки — клиент передумал после «да».
  if (job.repeat_state === "finished") return { bucket: "closed", days, reason: "отказ от повтора" };
  if (state.closingCall?.outcome === "agreed") return { bucket: "repeat", days, reason: "согласился на вторичную" };
  if (state.closedBy === "next_job") return { bucket: "repeat", days, reason: "уже записан на выезд" };
  if (state.closingCall) return { bucket: "closed", days, reason: REPEAT_CLOSE_LABELS[state.closingCall.outcome] || "закрыто" };
  if (state.closedBy === "quality") return { bucket: "closed", days, reason: "закрыто контролем качества" };
  if (days < REPEAT_DUE_DAYS) return { bucket: "soon", days, reason: `решение с ${addDaysIso(state.doneDay, REPEAT_DUE_DAYS)}` };
  return { bucket: "pending", days, reason: "" };
}

// Сводка по выполненным первичным за окно: счётчики, деньги, конверсия.
// stateOf и policyOf приходят снаружи, чтобы не пересчитывать обзвон.
export function buildRepeatTriage(jobs, { stateOf, policyOf = () => "half", laterIndex, today, windowDays = REPEAT_WINDOW_DAYS } = {}) {
  const todayIso = String(today || new Date().toISOString()).slice(0, 10);
  const oldest = windowDays ? addDaysIso(todayIso, -windowDays) : "";
  const byJob = new Map();
  const totals = Object.fromEntries(Object.keys(TRIAGE_BUCKETS).map((k) => [k, { count: 0, value: 0 }]));
  const pending = [];
  for (const job of jobs) {
    if (job.status !== "done" || job.type !== "Первичная") continue;
    const state = stateOf(job);
    if (!state.doneDay || (oldest && state.doneDay < oldest)) continue;
    const triage = repeatTriageOf(job, state, { today: todayIso, laterIndex });
    if (!triage) continue;
    const value = repeatValueOf(job, policyOf(job));
    const entry = { ...triage, value, state, job };
    byJob.set(String(job.id), entry);
    totals[triage.bucket].count += 1;
    totals[triage.bucket].value += value;
    if (triage.bucket === "pending") pending.push(entry);
  }
  // Дольше всех ждёт — первым: через 2 недели клиент уже не продаётся.
  pending.sort((a, b) => b.days - a.days || b.value - a.value);
  const decided = totals.repeat.count + totals.closed.count;
  const conversion = decided ? Math.round((totals.repeat.count / decided) * 100) : null;
  return { byJob, totals, pending, conversion, windowDays };
}
