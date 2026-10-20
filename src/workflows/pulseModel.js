// Вкладка «Пульс»: план/факт с прогнозом, деньги на четыре недели вперёд,
// B2B-воронка с абонентской выручкой (MRR) и решения по отклонениям.
// Здесь только расчёты — данные собирает App.jsx, рисует Pulse.jsx.
// Цели и решения хранятся в supabase/2026-10-20_company_pulse.sql.

import { DEAL_STAGES } from "./hunterFunnelModel";

export const COMPANY_PULSE_MIGRATION = "2026-10-20_company_pulse.sql";

const DAY_MS = 86400000;
const AVG_MONTH_DAYS = 30.4;

const num = (value) => Number(value) || 0;
const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDay = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export function monthStartIso(today = new Date()) {
  return isoDay(new Date(today.getFullYear(), today.getMonth(), 1));
}

// --- план/факт ----------------------------------------------------------

export const PLAN_METRICS = [
  { key: "revenue", label: "Выручка", format: "money", flow: true },
  { key: "profit", label: "Полная прибыль", format: "money", flow: true },
  { key: "jobs", label: "Выполненные заявки", format: "number", flow: true },
  { key: "new_subscribers", label: "Новые абоненты", format: "number", flow: true },
  // MRR — остаток на дату, а не накопление: прогноз по темпу к нему неприменим.
  { key: "mrr", label: "Абонентская выручка в месяц", format: "money", flow: false },
];

// Сколько месяца прошло. Сегодняшний день считаем прошедшим: выполненные
// сегодня заявки уже в факте.
export function monthProgress(today = new Date()) {
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const elapsed = today.getDate();
  return { days, elapsed, remaining: days - elapsed, share: elapsed / days };
}

// target — строка pulse_targets (или null), fact — { revenue, profit, jobs, new_subscribers, mrr }.
export function planFact({ target, fact, today = new Date() }) {
  const progress = monthProgress(today);
  return PLAN_METRICS.map((metric) => {
    const actual = num(fact?.[metric.key]);
    const goal = target?.[metric.key] == null || target[metric.key] === "" ? null : num(target[metric.key]);
    const forecast = metric.flow ? Math.round(actual / progress.share) : actual;
    if (goal == null || goal <= 0) {
      return { ...metric, fact: actual, target: null, forecast, pct: null, forecastPct: null, perDayNeeded: null, status: "no_target" };
    }
    const pct = Math.round(actual / goal * 100);
    const forecastPct = Math.round(forecast / goal * 100);
    const left = Math.max(0, goal - actual);
    const perDayNeeded = metric.flow && left > 0 ? Math.ceil(left / Math.max(1, progress.remaining)) : null;
    // Для накопительных показателей сравниваем прогноз с целью, для MRR — факт.
    const ratio = metric.flow ? forecastPct : pct;
    const status = actual >= goal ? "done" : ratio >= 100 ? "on_track" : ratio >= 90 ? "at_risk" : "behind";
    return { ...metric, fact: actual, target: goal, forecast, pct, forecastPct, perDayNeeded, status };
  });
}

// --- деньги на четыре недели --------------------------------------------

// Плановая цена заявки: то, о чём договорились, иначе наибольший вариант цены.
export function plannedJobValue(job) {
  if (num(job?.quoted_price) > 0) return num(job.quoted_price);
  return Math.max(0, ...(job?.price_options || []).map((option) => num(option?.amount)));
}

// Абонентский договор в пересчёте на месяц.
export function contractMonthlyValue(contract) {
  const interval = num(contract?.interval_days) || 30;
  return Math.round(num(contract?.price) * 30 / interval);
}

// Доля заявок, которые доходят до выполнения, и доля прямых расходов в выручке
// — по закрытым заявкам последних 90 дней. Без истории — честные 1 и 0.
export function historicalRates(jobs = [], { today = new Date(), directProfitOf = () => 0 } = {}) {
  const since = isoDay(addDays(today, -90));
  const recent = jobs.filter((job) => (job.scheduled_date || "") >= since && (job.status === "done" || job.status === "canceled"));
  const done = recent.filter((job) => job.status === "done");
  const revenue = done.reduce((sum, job) => sum + num(job.report_paid), 0);
  const directProfit = done.reduce((sum, job) => sum + num(directProfitOf(job)), 0);
  return {
    completionRate: recent.length ? done.length / recent.length : 1,
    directCostShare: revenue > 0 ? Math.min(1, Math.max(0, 1 - directProfit / revenue)) : 0,
    sample: recent.length,
  };
}

// Четыре недели от сегодня. Поступления: ожидаемые переводы, долги клиентов
// по сроку, плановые заявки и абонентские выезды без заявки (с поправкой на
// долю выполняемых). Списания: долг по зарплате, прямые расходы по плановым
// заявкам, средние постоянные расходы, оклады и реклама.
export function cashRunway({
  today = new Date(), startBalance = 0,
  receivables = 0, debts = [], plannedJobs = [], contracts = [],
  completionRate = 1, directCostShare = 0,
  payrollOwed = 0, monthlyOpex = 0, monthlySalaries = 0, monthlyMarketing = 0,
}) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeks = Array.from({ length: 4 }, (_, index) => {
    const from = addDays(start, index * 7);
    const to = addDays(start, index * 7 + 6);
    return { index, from: isoDay(from), to: isoDay(to), inflow: { receivables: 0, debts: 0, jobs: 0, contracts: 0 }, outflow: { payroll: 0, direct: 0, opex: 0, salaries: 0, marketing: 0 } };
  });
  const horizon = weeks[3].to;
  const weekOf = (iso) => {
    if (!iso) return null;
    const day = String(iso).slice(0, 10);
    if (day < weeks[0].from) return weeks[0];          // просроченное ждём в первую неделю
    if (day > horizon) return null;
    return weeks[Math.floor((parseDay(day) - start) / DAY_MS / 7)];
  };

  weeks[0].inflow.receivables += num(receivables);
  let undatedDebts = 0;
  for (const debt of debts) {
    if (debt.paid_on) continue;
    if (!debt.due_on) { undatedDebts += num(debt.amount); continue; }
    const week = weekOf(debt.due_on);
    if (week) week.inflow.debts += num(debt.amount);
  }
  const covered = new Set();
  for (const job of plannedJobs) {
    if (job.service_contract_id && job.contract_cycle_date) covered.add(`${job.service_contract_id}|${job.contract_cycle_date}`);
    const week = job.scheduled_date && job.scheduled_date >= weeks[0].from ? weekOf(job.scheduled_date) : null;
    if (!week) continue;
    const value = plannedJobValue(job) * completionRate;
    week.inflow.jobs += value;
    week.outflow.direct += value * directCostShare;
  }
  for (const contract of contracts) {
    if (contract.active === false || !contract.next_service_date) continue;
    if (covered.has(`${contract.id}|${contract.next_service_date}`)) continue;
    // Цикл абонента до горизонта: может уложиться больше одного выезда.
    // Просроченный выезд ждём сегодня, а не каждый пропущенный цикл разом.
    const interval = num(contract.interval_days) || 30;
    const first = parseDay(contract.next_service_date);
    for (let day = first < start ? start : first; isoDay(day) <= horizon; day = addDays(day, interval)) {
      const week = weekOf(isoDay(day));
      if (!week) continue;
      const value = num(contract.price) * completionRate;
      week.inflow.contracts += value;
      week.outflow.direct += value * directCostShare;
    }
  }

  weeks[0].outflow.payroll += Math.max(0, num(payrollOwed));
  const weekly = (monthly) => num(monthly) * 7 / AVG_MONTH_DAYS;
  let balance = num(startBalance);
  let minBalance = balance;
  let firstGap = null;
  const rows = weeks.map((week) => {
    week.outflow.opex = weekly(monthlyOpex);
    week.outflow.salaries = weekly(monthlySalaries);
    week.outflow.marketing = weekly(monthlyMarketing);
    const round = (obj) => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, Math.round(value)]));
    const inflow = round(week.inflow);
    const outflow = round(week.outflow);
    const totalIn = Object.values(inflow).reduce((sum, value) => sum + value, 0);
    const totalOut = Object.values(outflow).reduce((sum, value) => sum + value, 0);
    const opening = balance;
    balance = opening + totalIn - totalOut;
    minBalance = Math.min(minBalance, balance);
    if (balance < 0 && firstGap == null) firstGap = week.index;
    return { ...week, inflow, outflow, totalIn, totalOut, opening, closing: balance };
  });
  return { weeks: rows, startBalance: num(startBalance), endBalance: balance, minBalance, firstGap, undatedDebts };
}

// --- B2B-воронка и MRR --------------------------------------------------

const STAGE_INDEX = new Map(DEAL_STAGES.map((stage, index) => [stage.code, index]));

export function b2bFunnel({ leads = [], stages = [], contracts = [], today = new Date(), stuckDays = 14 }) {
  const monthStart = monthStartIso(today);
  const codeById = new Map(stages.map((stage) => [String(stage.id), stage.code]));
  const deals = leads
    .filter((lead) => lead.client_type === "company")
    .map((lead) => ({ lead, code: codeById.get(String(lead.stage_id)) || null }));
  const dealValue = (lead) => num(lead.expected_mrr) || num(lead.quoted_price);
  const age = (lead) => Math.floor((parseDay(isoDay(today)) - parseDay(String(lead.stage_changed_at || lead.updated_at || lead.created_at || isoDay(today)).slice(0, 10))) / DAY_MS);

  const linear = deals.filter((deal) => STAGE_INDEX.has(deal.code));
  const rows = DEAL_STAGES.map((stage, index) => {
    const here = linear.filter((deal) => deal.code === stage.code);
    const reached = linear.filter((deal) => STAGE_INDEX.get(deal.code) >= index).length;
    const next = linear.filter((deal) => STAGE_INDEX.get(deal.code) >= index + 1).length;
    const stuck = stage.code === "subscriber" ? [] : here.filter((deal) => age(deal.lead) >= stuckDays);
    return {
      code: stage.code, label: stage.label, count: here.length, value: here.reduce((sum, deal) => sum + dealValue(deal.lead), 0),
      reached, conversion: index < DEAL_STAGES.length - 1 && reached ? Math.round(next / reached * 100) : null, stuck: stuck.length,
    };
  });
  const open = linear.filter((deal) => deal.code !== "subscriber");
  const stuckDeals = open
    .map((deal) => ({ id: deal.lead.id, name: deal.lead.name || deal.lead.phone || "Сделка", stage: DEAL_STAGES[STAGE_INDEX.get(deal.code)].label, days: age(deal.lead), value: dealValue(deal.lead), lead: deal.lead }))
    .filter((deal) => deal.days >= stuckDays)
    .sort((a, b) => b.value - a.value || b.days - a.days);
  const signedThisMonth = deals.filter((deal) => deal.code === "subscriber" && String(deal.lead.contract_signed_at || "") >= monthStart);
  const lostThisMonth = deals.filter((deal) => deal.code === "lost" && String(deal.lead.stage_changed_at || "").slice(0, 10) >= monthStart);

  const active = contracts.filter((contract) => contract.active !== false);
  const createdThisMonth = active.filter((contract) => String(contract.created_at || "").slice(0, 10) >= monthStart);
  return {
    stages: rows,
    pipeline: { count: open.length, value: open.reduce((sum, deal) => sum + dealValue(deal.lead), 0) },
    stuckDeals,
    signedThisMonth: signedThisMonth.length,
    lostThisMonth: lostThisMonth.length,
    snoozed: deals.filter((deal) => deal.code === "snoozed").length,
    mrr: {
      current: active.reduce((sum, contract) => sum + contractMonthlyValue(contract), 0),
      subscribers: active.length,
      paused: contracts.length - active.length,
      newThisMonth: createdThisMonth.length,
      newMrr: createdThisMonth.reduce((sum, contract) => sum + contractMonthlyValue(contract), 0),
    },
  };
}

// --- центр решений ------------------------------------------------------

// Совмещает рассчитанные отклонения с решениями руководителя. Отложенное до
// будущей даты уходит из очереди, закрытая задача при живом отклонении
// снова требует решения.
export function decisionQueue({ alerts = [], decisions = [], tasks = [], profiles = [], today = new Date() }) {
  const todayIso = isoDay(today);
  const openByKey = new Map(decisions.filter((d) => d.status === "open").map((d) => [d.alert_key, d]));
  const taskById = new Map(tasks.map((task) => [String(task.id), task]));
  const nameOf = (id) => profiles.find((profile) => String(profile.id) === String(id))?.full_name || "Сотрудник";
  const rows = alerts.map((alert) => {
    const decision = openByKey.get(alert.id) || null;
    if (!decision) return { alert, decision: null, state: "none" };
    if (decision.snoozed_until) {
      return decision.snoozed_until > todayIso
        ? { alert, decision, state: "snoozed", until: decision.snoozed_until }
        : { alert, decision, state: "none", wokeUp: true };
    }
    const task = decision.task_id ? taskById.get(String(decision.task_id)) : null;
    const base = { alert, decision, task, owner: nameOf(decision.owner_id), due: decision.due_on };
    if (task?.status === "done") return { ...base, state: "task_done" };
    if (decision.due_on && decision.due_on < todayIso) return { ...base, state: "overdue" };
    return { ...base, state: "assigned" };
  });
  const weight = { none: 0, task_done: 1, overdue: 2, assigned: 3, snoozed: 4 };
  rows.sort((a, b) => weight[a.state] - weight[b.state] || (a.alert.tone === "danger" ? -1 : 0) - (b.alert.tone === "danger" ? -1 : 0));
  const count = (state) => rows.filter((row) => row.state === state).length;
  return {
    rows: rows.filter((row) => row.state !== "snoozed"),
    snoozed: rows.filter((row) => row.state === "snoozed"),
    totals: { unowned: count("none") + count("task_done"), overdue: count("overdue"), assigned: count("assigned"), snoozed: count("snoozed") },
  };
}
