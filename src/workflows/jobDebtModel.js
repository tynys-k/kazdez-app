// Оплата в долг по заявке.
//
// Отметку ставит админ при оформлении: клиент заранее договорился заплатить
// позже или попросил отсрочку уже на месте. Сумма долга появляется в
// job_debts, когда дезинфектор сдаёт отчёт с недоплатой. Вкладка «Долги»
// показывает и ожидаемые долги (заявка ещё не выполнена), и открытые.

export const JOB_DEBT_MIGRATION = "2026-10-20_job_debt_terms.sql";

export const DEBT_MODES = {
  advance: { label: "Договорились заранее", short: "в долг · заранее" },
  on_site: { label: "Попросили на месте", short: "в долг · на месте" },
};

export function debtModeLabel(mode) {
  return DEBT_MODES[mode]?.short || "";
}

// Состояние долга заявки: open — есть непогашенный долг, expected — заявка
// с отметкой ещё не выполнена, paid — долг закрыт, null — долга нет.
export function jobDebtState(job, debts = []) {
  if (!job || job.status === "canceled") return null;
  const own = debts.filter((d) => String(d.job_id) === String(job.id));
  const open = own.filter((d) => !d.paid_on);
  if (open.length) {
    const dueOn = open.map((d) => d.due_on).filter(Boolean).sort()[0] || null;
    return { kind: "open", amount: open.reduce((s, d) => s + (Number(d.amount) || 0), 0), dueOn, rows: open };
  }
  if (job.debt_mode && job.status !== "done") return { kind: "expected", amount: null, dueOn: job.debt_due_on || null };
  if (own.length || job.debt_mode) return { kind: "paid", amount: own.reduce((s, d) => s + (Number(d.amount) || 0), 0), dueOn: null };
  return null;
}

// Список для вкладки «Долги»: сначала открытые с ближайшим сроком, потом
// ожидаемые. Погашенные — только по запросу.
export function debtJobs(jobs = [], debts = [], { includePaid = false } = {}) {
  const rank = { open: 0, expected: 1, paid: 2 };
  return jobs
    .map((job) => ({ job, debt: jobDebtState(job, debts) }))
    .filter((x) => x.debt && (includePaid || x.debt.kind !== "paid"))
    .sort((a, b) => rank[a.debt.kind] - rank[b.debt.kind]
      || String(a.debt.dueOn || "9999").localeCompare(String(b.debt.dueOn || "9999"))
      || String(a.job.scheduled_date || "").localeCompare(String(b.job.scheduled_date || "")));
}
