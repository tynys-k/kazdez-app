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

import { chemUnit, lineAmount, norm, pricePerBase } from "./shared";

// --- препараты по заявке -------------------------------------------------

// Строка расхода ссылается на препарат по id, а у старых записей — только по имени.
export function lineChem(line, chemicals = []) {
  if (!line) return undefined;
  if (line.chemical_id) return chemicals.find((c) => c.id === line.chemical_id);
  return chemicals.find((c) => norm(c.name) === norm(line.name));
}

// Цена препарата на конкретную дату.
//
// price_per_liter в карточке препарата — это ТЕКУЩАЯ цена: каждый приход её
// перезаписывает. Считать по ней себестоимость старой заявки нельзя — прибыль
// закрытого месяца начинает меняться задним числом от того, что сегодня
// препарат привезли дороже. Поэтому берём цену из истории приходов: последний
// приход на дату заявки или раньше.
//
// Если истории нет (препарат заведён до появления таблицы приходов, или дата
// заявки не указана) — возвращаемся к текущей цене. Это прежнее поведение:
// хуже, чем история, но не хуже, чем было.
export function chemPriceOn(chem, dateIso, purchases = []) {
  if (!chem) return 0;
  if (dateIso) {
    let best = null;
    for (const p of purchases) {
      if (String(p.chemical_id) !== String(chem.id)) continue;
      if (!p.purchase_date || p.purchase_date > dateIso) continue;
      if (p.price_per_liter == null) continue;
      // Два прихода одним днём: берём тот, что записан позже.
      const newer = !best || p.purchase_date > best.purchase_date
        || (p.purchase_date === best.purchase_date && String(p.created_at || "") > String(best.created_at || ""));
      if (newer) best = p;
    }
    if (best) return Number(best.price_per_liter) / (chemUnit(chem.unit_kind).factor || 1000);
  }
  return pricePerBase(chem);
}

// Себестоимость препаратов, потраченных на заявке, — по ценам на дату заявки.
export function jobChemCost(job, chemicals = [], purchases = []) {
  const on = job?.scheduled_date || null;
  return (job?.chemicals || []).reduce(
    (sum, line) => sum + lineAmount(line) * chemPriceOn(lineChem(line, chemicals), on, purchases),
    0,
  );
}

// --- допуски сотрудников -------------------------------------------------

// Состояние документа на дату: действует, скоро истекает или просрочен.
//
// Документ без срока считаем бессрочным, а не просроченным: у части бумаг
// срока действительно нет, и подсвечивать их красным — значит приучить
// смотреть мимо предупреждений.
export function docStatus(doc, todayIso, soonDays = 30) {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  if (!doc?.expires_on) return { state: "nolimit", daysLeft: null };
  const daysLeft = Math.round((new Date(`${String(doc.expires_on).slice(0, 10)}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= soonDays) return { state: "soon", daysLeft };
  return { state: "ok", daysLeft };
}

// Документы, требующие внимания: просроченные и истекающие в ближайший месяц.
// Отсортированы по сроку — первым то, что горит сильнее.
export function docsNeedingAttention(docs = [], { todayIso, soonDays = 30, activeTechIds = null } = {}) {
  return docs
    .filter((d) => (activeTechIds ? activeTechIds.has(String(d.tech_id)) : true))
    .map((d) => ({ doc: d, ...docStatus(d, todayIso, soonDays) }))
    .filter((r) => r.state === "expired" || r.state === "soon")
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// --- закуп: поставщики и прогноз -----------------------------------------

const ISO_DAY = 86400000;
const isoShift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isoDiffDays = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / ISO_DAY);

// Сколько препарата ушло по заявкам за отрезок времени.
function chemUsedBetween(chem, jobs, fromIso, toIso) {
  let used = 0;
  let firstIso = null;
  for (const j of jobs) {
    if (j.status !== "done" || !j.scheduled_date) continue;
    const d = String(j.scheduled_date).slice(0, 10);
    if (d < fromIso || d > toIso) continue;
    const amount = (j.chemicals || [])
      .filter((x) => (x.chemical_id ? String(x.chemical_id) === String(chem.id) : norm(x.name) === norm(chem.name)))
      .reduce((a, x) => a + lineAmount(x), 0);
    if (amount > 0) {
      used += amount;
      if (!firstIso || d < firstIso) firstIso = d;
    }
  }
  return { used, firstIso };
}

// Прогноз по препарату: сколько уходит в месяц и на сколько хватит остатка.
//
// Считаем по фактическому расходу за последние windowDays дней, а не за всю
// историю: препарат мог полгода пролежать без дела, и среднее занизится ровно
// перед сезоном. Если препарат в ходу меньше окна, делим на реальный срок —
// иначе новинка выглядит так, будто почти не расходуется.
//
// leadDays — запас на доставку: дата «заказать до» отсчитывается назад от дня,
// когда остаток кончится.
export function chemForecast(chem, { jobs = [], remaining = 0, todayIso, windowDays = 90, leadDays = 7 } = {}) {
  if (!chem) return null;
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const { used, firstIso } = chemUsedBetween(chem, jobs, isoShift(today, -windowDays), today);
  const spanDays = firstIso ? Math.max(1, isoDiffDays(firstIso, today) + 1) : windowDays;
  const basedOnDays = Math.min(windowDays, spanDays);
  const perDay = used > 0 ? used / basedOnDays : 0;
  const left = Math.max(0, Number(remaining) || 0);
  const daysLeft = perDay > 0 ? Math.floor(left / perDay) : null;
  return {
    used, basedOnDays, perDay, perMonth: perDay * 30, daysLeft,
    orderByIso: daysLeft == null ? null : isoShift(today, Math.max(0, daysLeft - leadDays)),
  };
}

// Кто сколько просит за препарат. Первым идёт самый дешёвый по последней цене —
// именно этот порядок нужен, когда решаешь, у кого брать в следующий раз.
export function supplierPrices(chemId, purchases = []) {
  const by = new Map();
  for (const p of purchases) {
    if (String(p.chemical_id) !== String(chemId) || p.price_per_liter == null) continue;
    const key = (p.supplier || "").trim() || "поставщик не указан";
    const price = Number(p.price_per_liter);
    const date = String(p.purchase_date || "");
    const cur = by.get(key) || { supplier: key, count: 0, amount: 0, minPrice: price, maxPrice: price, lastPrice: null, lastDate: "" };
    cur.count += 1;
    cur.amount += Number(p.amount) || 0;
    cur.minPrice = Math.min(cur.minPrice, price);
    cur.maxPrice = Math.max(cur.maxPrice, price);
    if (date >= cur.lastDate) { cur.lastDate = date; cur.lastPrice = price; }
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => (a.lastPrice ?? Infinity) - (b.lastPrice ?? Infinity));
}

// --- доли партнёров ------------------------------------------------------

// Обычная заявка: партнёру процент от суммы.
// Совместная работа: процент от прибыли, а если препараты наши — партнёр
// компенсирует свою долю их стоимости, поэтому она вычитается.
export function partnerShareAmt(job, chemicals = [], purchases = []) {
  if (!job?.partner_id || job.status !== "done") return 0;
  const paid = Number(job.report_paid) || 0;
  if (!job.joint_work) return Math.round(paid * (Number(job.partner_share) || 0) / 100);
  const cost = jobChemCost(job, chemicals, purchases);
  const profitShare = (paid - cost) * (Number(job.partner_share) || 0) / 100;
  const costOwed = job.joint_supplier === "us" ? cost * (Number(job.joint_cost_share) || 0) / 100 : 0;
  return Math.round(profitShare - costOwed);
}

// Доля партнёра-исполнителя удерживается только когда вся сумма пришла нам.
export function executorShareAmt(job) {
  if (!job?.executor_partner_id || job.executor_settlement !== "qr_full") return 0;
  return Math.round((Number(job.report_paid) || 0) * (Number(job.executor_share_pct) || 0) / 100);
}

// --- сравнение периодов --------------------------------------------------

// Итоги периода: выручка, число выполненных заявок и средний чек.
//
// Считается по тем же правилам, что и основной свод: отменённые не в счёт,
// фильтр по бренду тот же, выручка — только по выполненным.
export function periodTotals(jobs = [], { inRange = () => true, brandFilter = "all" } = {}) {
  let revenue = 0, done = 0, total = 0;
  for (const j of jobs) {
    if (j.status === "canceled") continue;
    const isPartner = j.brand === "partner";
    if (brandFilter === "ours" && isPartner) continue;
    if (brandFilter === "partner" && !isPartner) continue;
    if (!inRange(j.scheduled_date)) continue;
    total += 1;
    if (j.status !== "done") continue;
    done += 1;
    revenue += Number(j.report_paid) || 0;
  }
  return { revenue, done, jobs: total, avg: done ? Math.round(revenue / done) : 0 };
}

// Насколько показатель изменился к прошлому периоду, в процентах.
//
// Если в прошлом периоде было ноль, возвращаем null: «рост на 100%» от нуля
// ничего не значит и только сбивает. Честнее сказать, что сравнивать не с чем.
export function comparePeriods(now, before) {
  const pct = (a, b) => (b > 0 ? Math.round((a - b) / b * 100) : null);
  return {
    revenue: pct(now?.revenue || 0, before?.revenue || 0),
    done: pct(now?.done || 0, before?.done || 0),
    avg: pct(now?.avg || 0, before?.avg || 0),
  };
}

// --- гарантийные возвраты ------------------------------------------------

// Чистая стоимость повторных выездов по заявке.
//
// Повторный выезд по гарантии — это бесплатная работа: препараты, бензин,
// день дезинфектора. В прибыли исходной заявки этих затрат не было, и заявка
// выглядела доходнее, чем на самом деле. Связь уже есть — jobs.repeat_of.
//
// Если повтор оказался платным, вычитаем полученное: заявка стоила компании
// только разницу. Ниже нуля не опускаемся — платный повтор не должен
// «улучшать» прибыль исходной заявки, это отдельная выручка.
export function guaranteeCostOf(jobId, { jobs = [], chemicals = [], purchases = [], jobHelpers = [] } = {}) {
  return jobs
    .filter((j) => j.repeat_of && String(j.repeat_of) === String(jobId) && j.status === "done")
    .reduce((sum, j) => {
      const cost = jobChemCost(j, chemicals, purchases)
        + (Number(j.tech_bonus) || 0) + (Number(j.tech_travel) || 0)
        + helpersTotal(j.id, jobHelpers)
        + (Number(j.transport_cost) || 0) + (Number(j.other_cost) || 0);
      return sum + Math.max(0, Math.round(cost - (Number(j.report_paid) || 0)));
    }, 0);
}

// Доля гарантийных возвратов по сотрудникам — самая честная оценка качества,
// какая возможна на этих данных.
//
// Возврат приписывается тому, кто делал ИСХОДНУЮ заявку, а не тому, кто поехал
// переделывать. И период берётся по дате исходной заявки: иначе работа июля,
// за которой вернулись в августе, попадёт в августовскую статистику чужого
// человека.
export function guaranteeStats(jobs = [], { inPeriod = () => true } = {}) {
  const byId = new Map(jobs.map((j) => [String(j.id), j]));
  const stats = new Map();
  const bump = (techId, field) => {
    const key = String(techId || "");
    const cur = stats.get(key) || { techId, done: 0, returns: 0 };
    cur[field] += 1;
    stats.set(key, cur);
  };
  for (const j of jobs) {
    if (j.status !== "done") continue;
    if (!j.repeat_of) {
      if (inPeriod(j.scheduled_date)) bump(j.assigned_to, "done");
      continue;
    }
    const origin = byId.get(String(j.repeat_of));
    if (origin && inPeriod(origin.scheduled_date)) bump(origin.assigned_to, "returns");
  }
  return [...stats.values()]
    .map((s) => ({ ...s, rate: s.done ? Math.round(s.returns / s.done * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate || b.returns - a.returns);
}

// --- экономика заявки ----------------------------------------------------

export function jobEconomics(job, { chemicals = [], purchases = [], qrFeeRate = 0.0095, helpers = 0, guaranteeCost = 0 } = {}) {
  const revenue = Number(job?.report_paid) || 0;
  const chemicalsCost = Math.round(jobChemCost(job, chemicals, purchases));
  const qrFee = Math.round((Number(job?.report_qr) || 0) * qrFeeRate);
  const partnersCost = Math.max(0, partnerShareAmt(job, chemicals, purchases)) + executorShareAmt(job);
  // Бонусы помощников — такие же прямые затраты, как бонус основного исполнителя.
  const techExtras = (Number(job?.tech_bonus) || 0) + (Number(job?.tech_travel) || 0) + (Number(helpers) || 0);
  const transport = Number(job?.transport_cost) || 0;
  const other = Number(job?.other_cost) || 0;
  // Гарантийные возвраты — такая же затрата исходной заявки, как препараты.
  const guarantee = Math.max(0, Math.round(Number(guaranteeCost) || 0));
  const profit = Math.round(revenue - chemicalsCost - qrFee - partnersCost - techExtras - transport - other - guarantee);
  return {
    revenue, chemicals: chemicalsCost, qrFee, partners: partnersCost,
    techExtras, transport, other, guarantee, profit,
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
export function jobFullEconomics(job, { chemicals = [], purchases = [], qrFeeRate = 0.0095, labor = 0, overhead = 0, helpers = 0, guaranteeCost = 0 } = {}) {
  const base = jobEconomics(job, { chemicals, purchases, qrFeeRate, helpers, guaranteeCost });
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

// --- сколько занимает работа ---------------------------------------------

// Приложение давно пишет отметки этапов, но никто на них не смотрел.
// en_route_at — вышел в путь, arrived_at — на объекте, reported_at — сдал отчёт.
//
// Отсекаем бессмысленные промежутки: дезинфектор мог забыть нажать «В путь»
// и отметиться только вечером, или нажать дважды. Такие выбросы сильнее
// портят среднее, чем помогает лишняя запись, поэтому в статистику не идут.
const MAX_SANE_MIN = 12 * 60;
function minutesBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const min = (new Date(toIso) - new Date(fromIso)) / 60000;
  if (!Number.isFinite(min) || min <= 0 || min > MAX_SANE_MIN) return null;
  return Math.round(min);
}

export function jobDurations(job) {
  return {
    travel: minutesBetween(job?.en_route_at, job?.arrived_at),
    onSite: minutesBetween(job?.arrived_at, job?.reported_at),
    total: minutesBetween(job?.en_route_at, job?.reported_at),
  };
}

const avg = (list) => (list.length ? Math.round(list.reduce((s, v) => s + v, 0) / list.length) : null);

// Средние по всем заявкам и в разрезе видов вредителей: от вида зависит,
// сколько реально занимает обработка, а значит и сколько заявок влезет в день.
export function durationStats(jobs = []) {
  const done = jobs.filter((j) => j.status === "done");
  const rows = done.map((j) => ({ job: j, d: jobDurations(j) }));
  const withOnSite = rows.filter((r) => r.d.onSite !== null);

  const byPest = {};
  for (const r of withOnSite) {
    const key = (r.job.pest || "—").trim() || "—";
    (byPest[key] = byPest[key] || { pest: key, onSite: [], total: [] }).onSite.push(r.d.onSite);
    if (r.d.total !== null) byPest[key].total.push(r.d.total);
  }

  return {
    doneJobs: done.length,
    measured: withOnSite.length,
    avgTravel: avg(rows.map((r) => r.d.travel).filter((v) => v !== null)),
    avgOnSite: avg(withOnSite.map((r) => r.d.onSite)),
    avgTotal: avg(rows.map((r) => r.d.total).filter((v) => v !== null)),
    byPest: Object.values(byPest)
      .map((p) => ({ pest: p.pest, jobs: p.onSite.length, avgOnSite: avg(p.onSite), avgTotal: avg(p.total) }))
      .sort((a, b) => b.jobs - a.jobs),
  };
}

// --- хватит ли денег ------------------------------------------------------

// Не предсказание, а сведение того, что уже известно: сколько есть на руках
// и на счетах, сколько должны получить и сколько должны отдать. Владельцу
// нужен ответ на «хватит ли на зарплату», а не кривая на графике.
//
// Средние расходы берём по ПОЛНЫМ прошедшим месяцам: текущий месяц ещё не
// кончился, и включать его — значит каждый раз занижать норму в начале месяца.
export function monthlyOpexAverage(opex = [], { today = new Date(), months = 3 } = {}) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const wanted = [];
  for (let i = 1; i <= months; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    wanted.push(key(d));
  }
  const sums = new Map(wanted.map((m) => [m, 0]));
  let seen = false;
  for (const o of opex) {
    if (!o.spent_date) continue;
    const m = String(o.spent_date).slice(0, 7);
    if (sums.has(m)) { sums.set(m, sums.get(m) + (Number(o.amount) || 0)); seen = true; }
  }
  if (!seen) return null;                       // нет истории — не выдумываем норму
  const total = [...sums.values()].reduce((s, v) => s + v, 0);
  return Math.round(total / wanted.length);
}

export function cashForecast({ onAccounts = 0, inHands = 0, expected = 0, payrollOwed = 0, monthlyOpex = null } = {}) {
  const available = onAccounts + inHands;
  const afterPayroll = available - payrollOwed;
  return {
    available, expected, payrollOwed, monthlyOpex,
    afterPayroll,
    // С учётом ожидаемых поступлений — но это деньги, которых ещё нет,
    // поэтому показываем отдельной строкой, а не смешиваем с фактом.
    afterPayrollWithExpected: afterPayroll + expected,
    // Хватает ли на зарплату прямо сейчас, не рассчитывая на приход.
    covered: payrollOwed <= available,
    // На сколько месяцев обычных расходов хватит остатка после зарплаты.
    monthsOfRunway: monthlyOpex && monthlyOpex > 0 ? Math.round(afterPayroll / monthlyOpex * 10) / 10 : null,
  };
}

// --- оклад с учётом отсутствий -------------------------------------------

// График вида «6/1» — шесть рабочих дней на один выходной.
export const WORK_SCHEDULES = { "6/1": [6, 1], "5/2": [5, 2], "7/0": [7, 0] };

// Месячная норма считается по средней длине месяца в неделях (52/12 ≈ 4,333),
// а не по календарю: так «26 рабочих дней при 6/1» одинаково и в феврале,
// и в августе, и сотрудник не получает разный оклад из-за длины месяца.
export function scheduleNorm(schedule) {
  const pair = WORK_SCHEDULES[schedule];
  if (!pair) return null;
  const [work, off] = pair;
  return { workDays: Math.round(work * 52 / 12), offDays: Math.round(off * 52 / 12) };
}

// Оклад за месяц с вычетом за пропуски СВЕРХ положенных выходных.
// Отгулы, больничные и отпуск лежат в одной таблице «Выходные» и считаются
// одинаково: приложение не знает, что из этого оплачивается, и не решает
// за владельца — просто показывает, сколько дней сверх нормы человек отсутствовал.
export function salaryForMonth({ salary = 0, schedule = null, absenceDays = 0 } = {}) {
  const base = Number(salary) || 0;
  const norm = scheduleNorm(schedule);
  // Без графика вычитать не из чего: норму рабочих дней взять неоткуда.
  if (!norm || base <= 0) {
    return { base, norm: null, absenceDays, excessDays: 0, dailyRate: 0, deduction: 0, payable: base };
  }
  const excessDays = Math.max(0, absenceDays - norm.offDays);
  const dailyRate = base / norm.workDays;
  // Вычет не может превысить сам оклад, даже если человек отсутствовал весь месяц.
  const deduction = Math.min(base, Math.round(excessDays * dailyRate));
  return { base, norm, absenceDays, excessDays, dailyRate: Math.round(dailyRate), deduction, payable: base - deduction };
}

// Сколько дней сотрудник отсутствовал в месяце. Один день считается один раз,
// даже если его отметили дважды.
export function absenceDaysInMonth(techId, daysOff = [], monthKey = "") {
  const set = new Set();
  for (const d of daysOff) {
    if (String(d.tech_id) !== String(techId)) continue;
    if (!d.off_date || !String(d.off_date).startsWith(monthKey)) continue;
    set.add(String(d.off_date).slice(0, 10));
  }
  return set.size;
}

// --- помощники на заявке --------------------------------------------------

// Сколько всего доплачено помощникам по заявке.
export function helpersTotal(jobId, jobHelpers = []) {
  return jobHelpers
    .filter((h) => String(h.job_id) === String(jobId))
    .reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
}

// Сколько сотрудник заработал помощью на чужих заявках за период.
// Дату берём у ЗАЯВКИ, а не у записи помощника: бонус относится к месяцу,
// когда работа была сделана, а не когда админ вспомнил его вписать.
export function helperEarnings(techId, { jobs = [], jobHelpers = [], inPeriod = () => true } = {}) {
  const jobById = new Map(jobs.map((j) => [String(j.id), j]));
  return jobHelpers
    .filter((h) => String(h.tech_id) === String(techId))
    .reduce((sum, h) => {
      const job = jobById.get(String(h.job_id));
      if (!job || job.status !== "done" || !inPeriod(job.scheduled_date)) return sum;
      return sum + (Number(h.amount) || 0);
    }, 0);
}

// --- сколько лид ждёт ответа ---------------------------------------------

// В дезинфекции побеждает тот, кто перезвонил первым. Приложение хранит лиды
// и стадии, но нигде не показывало, сколько человек уже ждёт.
//
// Считаем от updated_at: он меняется при переводе по стадиям, значит это
// «сколько лид лежит без движения». Для нового лида это совпадает с временем
// с момента появления — то есть с временем без ответа.
export function leadWaitingHours(lead, now = new Date()) {
  const since = lead?.updated_at || lead?.created_at;
  if (!since) return null;
  const hours = (now - new Date(since)) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? Math.floor(hours) : null;
}

// firstStageId — первая стадия воронки: лид в ней ещё никто не взял в работу.
export function leadSlaStats(leads = [], { firstStageId = null, reactionHours = 2, staleDays = 3, now = new Date() } = {}) {
  const open = leads.filter((l) => !l.converted_job_id);
  const rows = open.map((l) => ({ lead: l, hours: leadWaitingHours(l, now) }));
  const untouched = rows.filter((r) => r.hours !== null && firstStageId && String(r.lead.stage_id) === String(firstStageId));
  return {
    open: open.length,
    // Не отвечено дольше норматива — самое дорогое: клиент уходит к тем, кто взял трубку.
    lateReaction: untouched.filter((r) => r.hours >= reactionHours).length,
    // Взяли в работу и забыли.
    stale: rows.filter((r) => r.hours !== null && r.hours >= staleDays * 24
      && (!firstStageId || String(r.lead.stage_id) !== String(firstStageId))).length,
    longestHours: rows.reduce((m, r) => (r.hours !== null && r.hours > m ? r.hours : m), 0),
    reactionHours, staleDays,
  };
}

// --- загрузка бригады на день --------------------------------------------

// Рабочий день дезинфектора. Не настройка: величина нужна только как ориентир
// «сколько ещё влезет», и лишний переключатель тут дороже точности.
export const WORKDAY_MINUTES = 9 * 60;

// Сколько времени займут назначенные на день заявки и сколько дня останется.
//
// Длительность берём по виду вредителя из накопленной статистики: обработка
// от клопов и от муравьёв занимает разное время, и средняя «по больнице»
// ввела бы диспетчера в заблуждение. Если по виду замеров нет — общий средний,
// если и его нет — не гадаем и возвращаем null.
export function dayLoad(jobsOfDay = [], durations = null, { workdayMinutes = WORKDAY_MINUTES } = {}) {
  const perPest = new Map((durations?.byPest || []).map((p) => [p.pest, p.avgTotal]));
  const fallback = durations?.avgTotal ?? null;
  if (!jobsOfDay.length) return { jobs: 0, busyMin: 0, freeMin: workdayMinutes, known: true, workdayMinutes };

  let busy = 0, unknown = 0;
  for (const j of jobsOfDay) {
    const est = perPest.get((j.pest || "—").trim()) ?? fallback;
    if (est === null || est === undefined) unknown += 1; else busy += est;
  }
  // Пока статистики нет вообще, честнее не показывать загрузку, чем показать выдуманную.
  if (unknown === jobsOfDay.length) return { jobs: jobsOfDay.length, busyMin: null, freeMin: null, known: false, workdayMinutes };
  return {
    jobs: jobsOfDay.length,
    busyMin: Math.round(busy),
    freeMin: Math.max(0, workdayMinutes - Math.round(busy)),
    known: unknown === 0,
    workdayMinutes,
  };
}

// --- прайс ----------------------------------------------------------------

// Цена по виду вредителя и площади. Вид сравниваем без учёта регистра и
// пробелов: в заявках он вводится руками и «Клопы» встречается как «клопы».
//
// area_to = null означает «и больше»: верхняя ступень всегда открыта, иначе
// заявка на 300 м² не попала бы ни в одну строку прайса.
export function priceFor(pest, area, priceList = []) {
  const key = norm(pest);
  if (!key) return null;
  const rows = priceList.filter((r) => norm(r.pest) === key);
  if (!rows.length) return null;

  const a = Number(area);
  // Площадь не указали — берём самую нижнюю ступень как ориентир.
  if (!Number.isFinite(a) || a <= 0) {
    const lowest = [...rows].sort((x, y) => (Number(x.area_from) || 0) - (Number(y.area_from) || 0))[0];
    return lowest ? { price: Number(lowest.price) || 0, row: lowest, exact: false } : null;
  }
  const hit = rows.find((r) => {
    const from = Number(r.area_from) || 0;
    const to = r.area_to === null || r.area_to === undefined || r.area_to === "" ? Infinity : Number(r.area_to);
    return a >= from && a <= to;
  });
  return hit ? { price: Number(hit.price) || 0, row: hit, exact: true } : null;
}

// --- оборот для отчётности ------------------------------------------------

// Налоговую интересует не «выручка по заявкам», а деньги, которые фактически
// получены, и то, каким способом. Разделяем официальные поступления (QR и
// перечисление на счёт — их видно банку) и наличные.
//
// Перечисление считается только когда оно ОПЛАЧЕНО: до этого денег нет,
// а доход признаётся по факту получения.
export function turnoverReport(jobs = [], { inPeriod = () => true, brandOf = (j) => j.brand || "—" } = {}) {
  const rows = jobs.filter((j) => j.status === "done" && inPeriod(j.scheduled_date));
  const byBrand = new Map();
  let cash = 0, qr = 0, transfer = 0, transferPending = 0;

  for (const j of rows) {
    const c = Number(j.report_cash) || 0;
    const q = Number(j.report_qr) || 0;
    const t = Number(j.report_transfer) || 0;
    const paidTransfer = j.transfer_paid ? t : 0;
    cash += c; qr += q; transfer += paidTransfer; transferPending += t - paidTransfer;

    const key = brandOf(j);
    const b = byBrand.get(key) || { brand: key, jobs: 0, cash: 0, official: 0 };
    b.jobs += 1; b.cash += c; b.official += q + paidTransfer;
    byBrand.set(key, b);
  }

  const official = qr + transfer;
  return {
    jobs: rows.length,
    cash, qr, transfer, transferPending, official,
    total: cash + official,
    // Доля официальных поступлений — то, что видно по счетам.
    officialShare: cash + official > 0 ? Math.round(official / (cash + official) * 100) : 0,
    byBrand: [...byBrand.values()]
      .map((b) => ({ ...b, total: b.cash + b.official }))
      .sort((a, b) => b.total - a.total),
  };
}
