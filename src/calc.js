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
