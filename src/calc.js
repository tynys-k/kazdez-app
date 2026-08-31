// Денежная математика KazDez.
//
// Вынесена из Dashboard отдельным модулем по одной причине: внутри компонента
// эти расчёты замкнуты на состояние и их нельзя проверить иначе как глазами.
// Именно так три поломки (ревизия кассы, ревизия склада, расход препаратов)
// прожили недели незамеченными. Здесь функции чистые: всё, что им нужно,
// передаётся аргументами — значит на них можно написать тесты.
//
// Поведение сохранено ОДИН В ОДИН. Это перенос, а не переделка: любое
// расхождение с прежними числами — ошибка, а не улучшение.

import { lineAmount, norm, pricePerBase } from "./shared";

// --- препараты по заявке -------------------------------------------------

// Строка расхода ссылается на препарат по id, а у старых записей — только по имени.
export function lineChem(line, chemicals = []) {
  if (!line) return undefined;
  if (line.chemical_id) return chemicals.find((c) => c.id === line.chemical_id);
  return chemicals.find((c) => norm(c.name) === norm(line.name));
}

// Себестоимость препаратов, потраченных на заявке.
export function jobChemCost(job, chemicals = []) {
  return (job?.chemicals || []).reduce(
    (sum, line) => sum + lineAmount(line) * pricePerBase(lineChem(line, chemicals)),
    0,
  );
}

// --- доли партнёров ------------------------------------------------------

// Обычная заявка: партнёру процент от суммы.
// Совместная работа: процент от прибыли, а если препараты наши — партнёр
// компенсирует свою долю их стоимости, поэтому она вычитается.
export function partnerShareAmt(job, chemicals = []) {
  if (!job?.partner_id || job.status !== "done") return 0;
  const paid = Number(job.report_paid) || 0;
  if (!job.joint_work) return Math.round(paid * (Number(job.partner_share) || 0) / 100);
  const cost = jobChemCost(job, chemicals);
  const profitShare = (paid - cost) * (Number(job.partner_share) || 0) / 100;
  const costOwed = job.joint_supplier === "us" ? cost * (Number(job.joint_cost_share) || 0) / 100 : 0;
  return Math.round(profitShare - costOwed);
}

// Доля партнёра-исполнителя удерживается только когда вся сумма пришла нам.
export function executorShareAmt(job) {
  if (!job?.executor_partner_id || job.executor_settlement !== "qr_full") return 0;
  return Math.round((Number(job.report_paid) || 0) * (Number(job.executor_share_pct) || 0) / 100);
}

// --- экономика заявки ----------------------------------------------------

export function jobEconomics(job, { chemicals = [], qrFeeRate = 0.0095 } = {}) {
  const revenue = Number(job?.report_paid) || 0;
  const chemicalsCost = Math.round(jobChemCost(job, chemicals));
  const qrFee = Math.round((Number(job?.report_qr) || 0) * qrFeeRate);
  const partnersCost = Math.max(0, partnerShareAmt(job, chemicals)) + executorShareAmt(job);
  const techExtras = (Number(job?.tech_bonus) || 0) + (Number(job?.tech_travel) || 0);
  const transport = Number(job?.transport_cost) || 0;
  const other = Number(job?.other_cost) || 0;
  const profit = Math.round(revenue - chemicalsCost - qrFee - partnersCost - techExtras - transport - other);
  return {
    revenue, chemicals: chemicalsCost, qrFee, partners: partnersCost,
    techExtras, transport, other, profit,
    margin: revenue > 0 ? Math.round(profit / revenue * 100) : 0,
  };
}

// --- наличные у дезинфектора --------------------------------------------

// Начальный остаток из карточки сотрудника. Заявки и внесения ДО его даты
// в расчёт не идут — иначе история задним числом ломала бы текущий остаток.
export function techOpening(profile) {
  return { bal: Number(profile?.cash_opening_balance) || 0, date: profile?.cash_opening_date || null };
}

export function techCashCollected(techId, { jobs = [], profile } = {}) {
  const op = techOpening(profile);
  return jobs
    .filter((j) => j.assigned_to === techId && j.status === "done"
      && (!op.date || (j.scheduled_date && j.scheduled_date >= op.date)))
    .reduce((sum, j) => sum + (Number(j.report_cash) || 0), 0);
}

function depositsSum(techId, deposits, profile, status) {
  const op = techOpening(profile);
  return deposits
    .filter((d) => d.tech_id === techId && d.status === status
      && (!op.date || (d.requested_at || "").slice(0, 10) >= op.date))
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

export const techDepositedConfirmed = (techId, { deposits = [], profile } = {}) =>
  depositsSum(techId, deposits, profile, "confirmed");

// Деньги «в пути»: заявлены сотрудником, но админ ещё не подтвердил.
// На руках их уже нет, поэтому из остатка вычитаются наравне с подтверждёнными.
export const techDepositedPending = (techId, { deposits = [], profile } = {}) =>
  depositsSum(techId, deposits, profile, "pending");

// Ревизии по сотруднику, свежая первой.
export function techCashRevisions(techId, cashAdjustments = []) {
  return cashAdjustments
    .filter((a) => String(a.tech_id) === String(techId) && a.kind === "revision")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// Если ревизия была — она и есть точка отсчёта: берём зафиксированный факт
// и добавляем только движение ПОСЛЕ неё. Без ревизии считаем от начального остатка.
export function techCashOnHand(techId, { jobs = [], deposits = [], cashAdjustments = [], profile } = {}) {
  const latest = techCashRevisions(techId, cashAdjustments)[0];
  if (!latest) {
    return techOpening(profile).bal
      + techCashCollected(techId, { jobs, profile })
      - techDepositedConfirmed(techId, { deposits, profile })
      - techDepositedPending(techId, { deposits, profile });
  }
  const collectedAfter = jobs
    .filter((j) => String(j.assigned_to) === String(techId) && j.status === "done" && j.scheduled_date > latest.event_date)
    .reduce((sum, j) => sum + (Number(j.report_cash) || 0), 0);
  const depositedAfter = deposits
    .filter((d) => String(d.tech_id) === String(techId) && ["confirmed", "pending"].includes(d.status)
      && (d.requested_at || "").slice(0, 10) > latest.event_date)
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const laterAdjustments = cashAdjustments
    .filter((a) => String(a.tech_id) === String(techId) && String(a.created_at) > String(latest.created_at))
    .reduce((sum, a) => sum + (Number(a.amount_delta) || 0), 0);
  return Number(latest.balance_after) + collectedAfter - depositedAfter + laterAdjustments;
}

// --- препараты у дезинфектора -------------------------------------------

// Тот же принцип, что и с кассой, но точка отсчёта своя на каждый препарат.
export function techLedger(techId, { handouts = [], jobs = [], inventoryAdjustments = [], chemicals = [] } = {}) {
  const acc = {};
  const get = (cid) => (acc[cid] = acc[cid] || { issued: 0, opening: 0, consumed: 0, adjusted: 0 });

  handouts.filter((h) => h.tech_id === techId).forEach((h) => {
    const row = get(h.chemical_id);
    if (h.kind === "opening") row.opening += Number(h.amount) || 0;
    else row.issued += Number(h.amount) || 0;
  });
  jobs.filter((j) => j.assigned_to === techId).forEach((j) => {
    (j.chemicals || []).forEach((l) => { if (l.chemical_id) get(l.chemical_id).consumed += lineAmount(l); });
  });
  inventoryAdjustments.filter((a) => String(a.tech_id) === String(techId)).forEach((a) => {
    get(a.chemical_id).adjusted += Number(a.amount_delta) || 0;
  });

  return Object.entries(acc).map(([cid, v]) => {
    const chem = chemicals.find((c) => c.id === cid);
    if (!chem) return null;
    const received = v.issued + v.opening;
    const revisions = inventoryAdjustments
      .filter((a) => String(a.tech_id) === String(techId) && String(a.chemical_id) === String(cid) && a.kind === "revision")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (!revisions.length) return { chem, ...v, received, balance: received - v.consumed + v.adjusted };

    const checkpoint = revisions[0];
    const issuedAfter = handouts
      .filter((h) => String(h.tech_id) === String(techId) && String(h.chemical_id) === String(cid)
        && (h.created_at || "").slice(0, 10) > checkpoint.event_date)
      .reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
    const consumedAfter = jobs
      .filter((j) => String(j.assigned_to) === String(techId) && j.scheduled_date > checkpoint.event_date)
      .reduce((sum, j) => sum + (j.chemicals || [])
        .filter((l) => String(l.chemical_id) === String(cid))
        .reduce((s, l) => s + lineAmount(l), 0), 0);
    const adjustedAfter = inventoryAdjustments
      .filter((a) => String(a.tech_id) === String(techId) && String(a.chemical_id) === String(cid)
        && String(a.created_at) > String(checkpoint.created_at))
      .reduce((sum, a) => sum + (Number(a.amount_delta) || 0), 0);
    return {
      chem, ...v, received,
      balance: Number(checkpoint.balance_after) + issuedAfter - consumedAfter + adjustedAfter,
      revision: checkpoint,
    };
  }).filter(Boolean);
}

// --- закрытие периода ----------------------------------------------------

// Дата попадает в закрытый период, если она не позже границы включительно.
// Сравниваем строками ISO: они сортируются как даты, и это избавляет от
// часовых поясов — «31.08» в Алматы и в UTC должно значить одно и то же.
export function isClosedDate(dateIso, closedUntil) {
  if (!closedUntil || !dateIso) return false;
  return String(dateIso).slice(0, 10) <= String(closedUntil).slice(0, 10);
}

// --- полная себестоимость заявки ----------------------------------------

const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : "");

// Оклады и постоянные расходы, разнесённые на одну заявку.
//
// Оклад делится на выполненные заявки ЭТОГО дезинфектора за месяц: оклад
// платится именно за эти выезды, и у того, кто сделал 10 заявок, каждая
// «дороже» по труду, чем у того, кто сделал 40.
//
// Операционные расходы (аренда, реклама, связь) делятся ПОРОВНУ на все
// выполненные заявки месяца, а не пропорционально выручке: аренда не растёт
// от того, что заявка дороже — она обслуживает сам факт выезда.
export function allocationPerJob(jobs = [], { profiles = [], opex = [] } = {}) {
  const doneByTechMonth = new Map();   // "techId|2026-08" -> сколько заявок
  const doneByMonth = new Map();       // "2026-08"        -> сколько заявок
  for (const j of jobs) {
    if (j.status !== "done" || !j.scheduled_date) continue;
    const m = monthOf(j.scheduled_date);
    doneByMonth.set(m, (doneByMonth.get(m) || 0) + 1);
    if (j.assigned_to) {
      const k = `${j.assigned_to}|${m}`;
      doneByTechMonth.set(k, (doneByTechMonth.get(k) || 0) + 1);
    }
  }

  const opexByMonth = new Map();
  for (const o of opex) {
    if (!o.spent_date) continue;
    const m = monthOf(o.spent_date);
    opexByMonth.set(m, (opexByMonth.get(m) || 0) + (Number(o.amount) || 0));
  }

  const salaryOf = (techId) => Number(profiles.find((p) => p.id === techId)?.salary_monthly) || 0;

  return function forJob(job) {
    if (!job || job.status !== "done" || !job.scheduled_date) return { labor: 0, overhead: 0 };
    const m = monthOf(job.scheduled_date);
    const techJobs = doneByTechMonth.get(`${job.assigned_to}|${m}`) || 0;
    const monthJobs = doneByMonth.get(m) || 0;
    return {
      labor: techJobs > 0 ? Math.round(salaryOf(job.assigned_to) / techJobs) : 0,
      overhead: monthJobs > 0 ? Math.round((opexByMonth.get(m) || 0) / monthJobs) : 0,
    };
  };
}

// Прибыль заявки с учётом труда и постоянных расходов.
// Прямая прибыль (jobEconomics) остаётся как была: по ней видно, окупает ли
// заявка сама себя, а полная показывает, зарабатывает ли на ней компания.
export function jobFullEconomics(job, { chemicals = [], qrFeeRate = 0.0095, labor = 0, overhead = 0 } = {}) {
  const base = jobEconomics(job, { chemicals, qrFeeRate });
  const fullProfit = Math.round(base.profit - labor - overhead);
  return {
    ...base, labor, overhead, fullProfit,
    fullMargin: base.revenue > 0 ? Math.round(fullProfit / base.revenue * 100) : 0,
  };
}

// --- клиенты: возвращаемость и ценность ---------------------------------

// Считаем по ключу телефона (последние 10 цифр), а не по строке номера:
// «+7 701 …» и «8 701 …» — один человек, и до этой правки он считался
// за двух, занижая долю повторных обращений.
//
// Клиент относится к периоду по ПЕРВОЙ своей заявке — это когорта
// «пришёл в августе». Возвраты при этом считаются по всей его истории,
// иначе клиент, вернувшийся в сентябре, никогда бы не попал в статистику.
export function clientStats(jobs = [], { from = null, to = null, phoneKeyOf } = {}) {
  const byClient = new Map();
  for (const job of jobs) {
    if (job.status === "canceled") continue;
    const key = phoneKeyOf(job.client_phone);
    if (!key) continue;
    const date = job.scheduled_date || null;
    let c = byClient.get(key);
    if (!c) { c = { key, first: date, jobs: 0, done: 0, revenue: 0, source: job.source || "" }; byClient.set(key, c); }
    if (date && (!c.first || date < c.first)) { c.first = date; c.source = job.source || c.source; }
    c.jobs += 1;
    if (job.status === "done") { c.done += 1; c.revenue += Number(job.report_paid) || 0; }
  }

  const inCohort = (c) => (!from || (c.first && c.first >= from)) && (!to || (c.first && c.first <= to));
  const cohort = [...byClient.values()].filter(inCohort);
  const returned = cohort.filter((c) => c.jobs > 1);
  const paying = cohort.filter((c) => c.revenue > 0);
  const revenue = cohort.reduce((s, c) => s + c.revenue, 0);

  const bySource = {};
  for (const c of cohort) {
    const label = (c.source || "Не указан").trim() || "Не указан";
    const row = (bySource[label] = bySource[label] || { label, clients: 0, returned: 0, revenue: 0 });
    row.clients += 1;
    if (c.jobs > 1) row.returned += 1;
    row.revenue += c.revenue;
  }

  return {
    clients: cohort.length,
    returned: returned.length,
    returnRate: cohort.length ? Math.round(returned.length / cohort.length * 100) : 0,
    revenue,
    ltv: paying.length ? Math.round(revenue / paying.length) : 0,
    sources: Object.values(bySource)
      .map((r) => ({ ...r, returnRate: r.clients ? Math.round(r.returned / r.clients * 100) : 0, ltv: r.clients ? Math.round(r.revenue / r.clients) : 0 }))
      .sort((a, b) => b.clients - a.clients),
  };
}
