import { describe, it, expect } from "vitest";
import {
  jobChemCost, partnerShareAmt, executorShareAmt, jobEconomics,
  techCashOnHand, techCashCollected, techDepositedPending, techLedger, isClosedDate,
  clientStats, allocationPerJob, jobFullEconomics, jobDurations, durationStats, cashForecast, monthlyOpexAverage, salaryForMonth, absenceDaysInMonth, helpersTotal, helperEarnings, leadWaitingHours, leadSlaStats, dayLoad,
  priceFor,
  turnoverReport, chemPriceOn, chemForecast, supplierPrices,
  docStatus, docsNeedingAttention, guaranteeCostOf, guaranteeStats, dormantClients,
  periodTotals, comparePeriods, feedbackStats, happyClients,
  seasonality, subscriptionComparison,
  planProgress, parseTargets,
  trainingSummary, trainingDue,
  lastAcknowledgement, notAcknowledged, employeeHistory,
} from "./calc";

// Препарат: 10 000 ₸ за литр → 10 ₸ за мл.
const chemicals = [
  { id: "c1", name: "Блокада Ultra", price_per_liter: 10000, unit_kind: "liquid" },
  { id: "c2", name: "Пушка", price_per_liter: 5000, unit_kind: "liquid" },
];

const doneJob = (over = {}) => ({
  id: "j1", status: "done", assigned_to: "t1", scheduled_date: "2026-08-20",
  report_paid: 30000, report_cash: 30000, report_qr: 0, chemicals: [], ...over,
});

describe("jobChemCost", () => {
  it("считает по цене за литр, приведённой к миллилитрам", () => {
    const job = doneJob({ chemicals: [{ chemical_id: "c1", amount: 100 }] });
    expect(jobChemCost(job, chemicals)).toBe(1000); // 100 мл × 10 ₸
  });

  it("находит препарат по имени, когда в строке нет id (старые записи)", () => {
    const job = doneJob({ chemicals: [{ name: "пушка", amount: 50 }] });
    expect(jobChemCost(job, chemicals)).toBe(250); // 50 мл × 5 ₸
  });

  it("не падает на неизвестном препарате — считает его бесплатным, а не NaN", () => {
    const job = doneJob({ chemicals: [{ name: "Неведомое", amount: 100 }] });
    expect(jobChemCost(job, chemicals)).toBe(0);
  });
});

describe("partnerShareAmt", () => {
  it("обычная заявка: процент от суммы", () => {
    const job = doneJob({ partner_id: "p1", partner_share: 50 });
    expect(partnerShareAmt(job, chemicals)).toBe(15000);
  });

  it("не начисляет долю по невыполненной заявке", () => {
    const job = doneJob({ status: "new", partner_id: "p1", partner_share: 50 });
    expect(partnerShareAmt(job, chemicals)).toBe(0);
  });

  it("совместная работа: процент от прибыли, минус доля партнёра в наших препаратах", () => {
    const job = doneJob({
      partner_id: "p1", partner_share: 50, joint_work: true,
      joint_supplier: "us", joint_cost_share: 50,
      chemicals: [{ chemical_id: "c1", amount: 100 }], // 1000 ₸
    });
    // прибыль (30000−1000)×50% = 14500, минус его половина препаратов 500 → 14000
    expect(partnerShareAmt(job, chemicals)).toBe(14000);
  });

  it("совместная работа на препаратах партнёра: компенсация не удерживается", () => {
    const job = doneJob({
      partner_id: "p1", partner_share: 50, joint_work: true,
      joint_supplier: "partner", joint_cost_share: 50,
      chemicals: [{ chemical_id: "c1", amount: 100 }],
    });
    expect(partnerShareAmt(job, chemicals)).toBe(14500);
  });
});

describe("executorShareAmt", () => {
  it("удерживает долю, только когда вся сумма пришла нам", () => {
    const base = { executor_partner_id: "p2", executor_share_pct: 40, report_paid: 20000 };
    expect(executorShareAmt({ ...base, executor_settlement: "qr_full" })).toBe(8000);
    expect(executorShareAmt({ ...base, executor_settlement: "net" })).toBe(0);
  });
});

describe("jobEconomics", () => {
  it("вычитает препараты, комиссию QR и доли партнёров", () => {
    const job = doneJob({
      report_qr: 30000, report_cash: 0,
      chemicals: [{ chemical_id: "c1", amount: 100 }],
      tech_bonus: 2000, tech_travel: 500,
    });
    const e = jobEconomics(job, { chemicals, qrFeeRate: 0.0095 });
    expect(e.chemicals).toBe(1000);
    expect(e.qrFee).toBe(285);
    expect(e.techExtras).toBe(2500);
    expect(e.profit).toBe(30000 - 1000 - 285 - 2500);
    expect(e.margin).toBe(Math.round(e.profit / 30000 * 100));
  });

  it("не делит на ноль при нулевой выручке", () => {
    expect(jobEconomics(doneJob({ report_paid: 0 }), { chemicals }).margin).toBe(0);
  });
});

describe("techCashOnHand", () => {
  const profile = { cash_opening_balance: 5000, cash_opening_date: "2026-08-01" };
  const jobs = [
    doneJob({ id: "a", scheduled_date: "2026-08-10", report_cash: 20000 }),
    doneJob({ id: "b", scheduled_date: "2026-07-15", report_cash: 99999 }), // до начала учёта
  ];

  it("без ревизии считает от начального остатка и игнорирует всё до его даты", () => {
    expect(techCashCollected("t1", { jobs, profile })).toBe(20000);
    expect(techCashOnHand("t1", { jobs, deposits: [], cashAdjustments: [], profile })).toBe(25000);
  });

  it("вычитает и подтверждённые внесения, и ожидающие — денег на руках уже нет", () => {
    const deposits = [
      { tech_id: "t1", status: "confirmed", amount: 10000, requested_at: "2026-08-12T10:00:00Z" },
      { tech_id: "t1", status: "pending", amount: 5000, requested_at: "2026-08-13T10:00:00Z" },
    ];
    expect(techDepositedPending("t1", { deposits, profile })).toBe(5000);
    expect(techCashOnHand("t1", { jobs, deposits, cashAdjustments: [], profile })).toBe(10000);
  });

  it("ревизия становится новой точкой отсчёта — история до неё не влияет", () => {
    const cashAdjustments = [{
      tech_id: "t1", kind: "revision", event_date: "2026-08-15",
      balance_after: 1000, created_at: "2026-08-15T12:00:00Z",
    }];
    // заявка от 10.08 раньше ревизии → не считается; на руках ровно факт ревизии
    expect(techCashOnHand("t1", { jobs, deposits: [], cashAdjustments, profile })).toBe(1000);
  });

  it("после ревизии добавляет только новые сборы и корректировки", () => {
    const cashAdjustments = [
      { tech_id: "t1", kind: "revision", event_date: "2026-08-05", balance_after: 1000, created_at: "2026-08-05T12:00:00Z" },
      { tech_id: "t1", kind: "office_take", amount_delta: -500, created_at: "2026-08-16T12:00:00Z" },
    ];
    // 1000 + заявка 20000 от 10.08 − забрали в офис 500
    expect(techCashOnHand("t1", { jobs, deposits: [], cashAdjustments, profile })).toBe(20500);
  });

  it("берёт САМУЮ СВЕЖУЮ ревизию, а не первую попавшуюся", () => {
    const cashAdjustments = [
      { tech_id: "t1", kind: "revision", event_date: "2026-08-05", balance_after: 777, created_at: "2026-08-05T12:00:00Z" },
      { tech_id: "t1", kind: "revision", event_date: "2026-08-25", balance_after: 300, created_at: "2026-08-25T12:00:00Z" },
    ];
    expect(techCashOnHand("t1", { jobs, deposits: [], cashAdjustments, profile })).toBe(300);
  });

  it("не смешивает сотрудников", () => {
    const cashAdjustments = [{ tech_id: "t2", kind: "revision", event_date: "2026-08-15", balance_after: 999, created_at: "2026-08-15T12:00:00Z" }];
    expect(techCashOnHand("t1", { jobs, deposits: [], cashAdjustments, profile })).toBe(25000);
  });
});

describe("techLedger", () => {
  const handouts = [{ tech_id: "t1", chemical_id: "c1", kind: "issue", amount: 1000, created_at: "2026-08-01T10:00:00Z" }];
  const jobs = [doneJob({ scheduled_date: "2026-08-10", chemicals: [{ chemical_id: "c1", amount: 200 }] })];

  it("без ревизии: выдано минус израсходовано", () => {
    const [row] = techLedger("t1", { handouts, jobs, inventoryAdjustments: [], chemicals });
    expect(row.balance).toBe(800);
  });

  it("ревизия по препарату — новая точка отсчёта", () => {
    const inventoryAdjustments = [{
      tech_id: "t1", chemical_id: "c1", kind: "revision",
      event_date: "2026-08-15", balance_after: 500, amount_delta: -300,
      created_at: "2026-08-15T12:00:00Z",
    }];
    const [row] = techLedger("t1", { handouts, jobs, inventoryAdjustments, chemicals });
    // расход от 10.08 раньше ревизии → не вычитается повторно
    expect(row.balance).toBe(500);
  });

  it("пропускает препараты, которых больше нет в справочнике", () => {
    const rows = techLedger("t1", {
      handouts: [{ tech_id: "t1", chemical_id: "удалённый", kind: "issue", amount: 100 }],
      jobs: [], inventoryAdjustments: [], chemicals,
    });
    expect(rows).toHaveLength(0);
  });
});

describe("isClosedDate", () => {
  it("граница включительно: сам день закрытия уже закрыт", () => {
    expect(isClosedDate("2026-08-31", "2026-08-31")).toBe(true);
    expect(isClosedDate("2026-09-01", "2026-08-31")).toBe(false);
    expect(isClosedDate("2026-08-30", "2026-08-31")).toBe(true);
  });

  it("без даты закрытия ничего не блокируется", () => {
    expect(isClosedDate("2020-01-01", "")).toBe(false);
    expect(isClosedDate("2020-01-01", null)).toBe(false);
  });

  it("операция без даты не блокируется — иначе нельзя было бы завести новое", () => {
    expect(isClosedDate(null, "2026-08-31")).toBe(false);
    expect(isClosedDate("", "2026-08-31")).toBe(false);
  });

  it("отметка времени сравнивается по дню, а не по часам", () => {
    expect(isClosedDate("2026-08-31T23:59:00Z", "2026-08-31")).toBe(true);
  });
});

describe("allocationPerJob", () => {
  const profiles = [
    { id: "t1", salary_monthly: 300000 },
    { id: "t2", salary_monthly: 0 },
  ];
  const jobs = [
    { id: "a", status: "done", assigned_to: "t1", scheduled_date: "2026-08-05" },
    { id: "b", status: "done", assigned_to: "t1", scheduled_date: "2026-08-20" },
    { id: "c", status: "done", assigned_to: "t2", scheduled_date: "2026-08-21" },
    { id: "d", status: "done", assigned_to: "t1", scheduled_date: "2026-09-01" },
    { id: "e", status: "new",  assigned_to: "t1", scheduled_date: "2026-08-25" },
  ];
  const opex = [{ spent_date: "2026-08-10", amount: 90000 }];

  it("оклад делится на заявки ЭТОГО дезинфектора за ЭТОТ месяц", () => {
    const at = allocationPerJob(jobs, { profiles, opex });
    // t1 сделал в августе 2 заявки → 300 000 / 2
    expect(at(jobs[0]).labor).toBe(150000);
    // в сентябре одну → весь оклад на неё
    expect(at(jobs[3]).labor).toBe(300000);
  });

  it("невыполненные заявки не уменьшают стоимость труда", () => {
    const at = allocationPerJob(jobs, { profiles, opex });
    expect(at(jobs[0]).labor).toBe(150000); // заявка "e" в статусе new не считается
  });

  it("постоянные расходы делятся поровну на все выполненные заявки месяца", () => {
    const at = allocationPerJob(jobs, { profiles, opex });
    // в августе 3 выполненных → 90 000 / 3
    expect(at(jobs[0]).overhead).toBe(30000);
    expect(at(jobs[2]).overhead).toBe(30000);
    // в сентябре расходов не было
    expect(at(jobs[3]).overhead).toBe(0);
  });

  it("без оклада труд не начисляется", () => {
    const at = allocationPerJob(jobs, { profiles, opex });
    expect(at(jobs[2]).labor).toBe(0);
  });

  it("заявка без даты или невыполненная ничего не получает", () => {
    const at = allocationPerJob(jobs, { profiles, opex });
    expect(at(jobs[4])).toEqual({ labor: 0, overhead: 0 });
    expect(at({ status: "done", assigned_to: "t1" })).toEqual({ labor: 0, overhead: 0 });
  });
});

describe("jobFullEconomics", () => {
  it("вычитает труд и постоянные из прямой прибыли", () => {
    const job = { status: "done", report_paid: 30000, report_qr: 0, chemicals: [] };
    const e = jobFullEconomics(job, { labor: 12000, overhead: 5000 });
    expect(e.profit).toBe(30000);       // прямая прибыль не меняется
    expect(e.fullProfit).toBe(13000);
    expect(e.fullMargin).toBe(43);
  });

  it("показывает убыток там, где прямая прибыль выглядела плюсом", () => {
    const job = { status: "done", report_paid: 10000, report_qr: 0, chemicals: [] };
    const e = jobFullEconomics(job, { labor: 9000, overhead: 4000 });
    expect(e.profit).toBeGreaterThan(0);
    expect(e.fullProfit).toBeLessThan(0); // ради этого всё и считается
  });
});

describe("clientStats", () => {
  const pk = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
  const job = (over) => ({ status: "done", report_paid: 10000, ...over });

  it("склеивает один номер в разных формах в ОДНОГО клиента", () => {
    const s = clientStats([
      job({ client_phone: "+7 701 382 1617", scheduled_date: "2026-08-01" }),
      job({ client_phone: "8701 382 16 17", scheduled_date: "2026-08-20" }),
    ], { phoneKeyOf: pk });
    // до починки это были два клиента и 0% возвратов
    expect(s.clients).toBe(1);
    expect(s.returned).toBe(1);
    expect(s.returnRate).toBe(100);
    expect(s.ltv).toBe(20000);
  });

  it("клиент попадает в когорту по ПЕРВОЙ заявке, а возврат считается позже", () => {
    const s = clientStats([
      job({ client_phone: "7011111111", scheduled_date: "2026-08-10" }),
      job({ client_phone: "7011111111", scheduled_date: "2026-09-15" }),
    ], { from: "2026-08-01", to: "2026-08-31", phoneKeyOf: pk });
    expect(s.clients).toBe(1);
    expect(s.returnRate).toBe(100); // вернулся в сентябре — но он клиент августа
  });

  it("клиент, пришедший позже, в когорту не попадает", () => {
    const s = clientStats([
      job({ client_phone: "7011111111", scheduled_date: "2026-09-10" }),
    ], { from: "2026-08-01", to: "2026-08-31", phoneKeyOf: pk });
    expect(s.clients).toBe(0);
  });

  it("отменённые не создают клиента", () => {
    const s = clientStats([
      job({ client_phone: "7011111111", scheduled_date: "2026-08-10", status: "canceled" }),
    ], { phoneKeyOf: pk });
    expect(s.clients).toBe(0);
  });

  it("заявки без телефона не сливаются в одного «клиента»", () => {
    const s = clientStats([
      job({ client_phone: "", scheduled_date: "2026-08-10" }),
      job({ client_phone: null, scheduled_date: "2026-08-11" }),
    ], { phoneKeyOf: pk });
    expect(s.clients).toBe(0);
  });

  it("ценность считается по платившим — бесплатные осмотры не занижают её", () => {
    const s = clientStats([
      job({ client_phone: "7011111111", scheduled_date: "2026-08-01", report_paid: 30000 }),
      job({ client_phone: "7022222222", scheduled_date: "2026-08-02", report_paid: 0 }),
    ], { phoneKeyOf: pk });
    expect(s.clients).toBe(2);
    expect(s.ltv).toBe(30000);
  });

  it("источник берётся из первой заявки клиента", () => {
    const s = clientStats([
      job({ client_phone: "7011111111", scheduled_date: "2026-08-20", source: "Повтор" }),
      job({ client_phone: "7011111111", scheduled_date: "2026-08-01", source: "Instagram" }),
    ], { phoneKeyOf: pk });
    expect(s.sources[0].label).toBe("Instagram");
  });
});

describe("jobDurations и durationStats", () => {
  const j = (over) => ({ status: "done", pest: "Тараканы", ...over });

  it("считает путь, работу на объекте и полный цикл", () => {
    const d = jobDurations(j({
      en_route_at: "2026-08-20T09:00:00Z",
      arrived_at:  "2026-08-20T09:30:00Z",
      reported_at: "2026-08-20T10:45:00Z",
    }));
    expect(d.travel).toBe(30);
    expect(d.onSite).toBe(75);
    expect(d.total).toBe(105);
  });

  it("отбрасывает выброс: забыли нажать «В путь» и отметились вечером", () => {
    const d = jobDurations(j({
      en_route_at: "2026-08-20T09:00:00Z",
      arrived_at:  "2026-08-20T23:30:00Z", // 14.5 часа — не бывает
      reported_at: "2026-08-20T23:59:00Z",
    }));
    expect(d.travel).toBeNull();
    expect(d.onSite).not.toBeNull(); // 29 минут — правдоподобно
  });

  it("нажатие в обратном порядке не даёт отрицательного времени", () => {
    const d = jobDurations(j({ en_route_at: "2026-08-20T10:00:00Z", arrived_at: "2026-08-20T09:00:00Z" }));
    expect(d.travel).toBeNull();
  });

  it("без отметок ничего не выдумывает", () => {
    expect(jobDurations(j({}))).toEqual({ travel: null, onSite: null, total: null });
  });

  it("средние считаются только по заявкам с отметками", () => {
    const s = durationStats([
      j({ en_route_at: "2026-08-20T09:00:00Z", arrived_at: "2026-08-20T09:20:00Z", reported_at: "2026-08-20T10:20:00Z" }),
      j({ en_route_at: "2026-08-21T09:00:00Z", arrived_at: "2026-08-21T09:40:00Z", reported_at: "2026-08-21T11:40:00Z" }),
      j({}), // без отметок — не должна занижать среднее
    ]);
    expect(s.doneJobs).toBe(3);
    expect(s.measured).toBe(2);
    expect(s.avgTravel).toBe(30);   // (20+40)/2
    expect(s.avgOnSite).toBe(90);   // (60+120)/2
  });

  it("разбивка по видам вредителей: от вида зависит длительность", () => {
    const s = durationStats([
      j({ pest: "Клопы", en_route_at: "2026-08-20T09:00:00Z", arrived_at: "2026-08-20T09:10:00Z", reported_at: "2026-08-20T11:10:00Z" }),
      j({ pest: "Тараканы", en_route_at: "2026-08-20T09:00:00Z", arrived_at: "2026-08-20T09:10:00Z", reported_at: "2026-08-20T10:10:00Z" }),
    ]);
    const klopy = s.byPest.find((p) => p.pest === "Клопы");
    expect(klopy.avgOnSite).toBe(120);
    expect(s.byPest.find((p) => p.pest === "Тараканы").avgOnSite).toBe(60);
  });

  it("невыполненные заявки в статистику не идут", () => {
    const s = durationStats([
      { status: "new", pest: "Клопы", en_route_at: "2026-08-20T09:00:00Z", arrived_at: "2026-08-20T09:10:00Z", reported_at: "2026-08-20T10:10:00Z" },
    ]);
    expect(s.measured).toBe(0);
  });
});

describe("cashForecast и monthlyOpexAverage", () => {
  it("средние расходы считаются по полным прошедшим месяцам", () => {
    const opex = [
      { spent_date: "2026-08-10", amount: 90000 },
      { spent_date: "2026-07-10", amount: 60000 },
      { spent_date: "2026-06-10", amount: 30000 },
      { spent_date: "2026-09-01", amount: 999999 }, // текущий месяц не в счёт
    ];
    expect(monthlyOpexAverage(opex, { today: new Date("2026-09-15"), months: 3 })).toBe(60000);
  });

  it("без истории расходов норма не выдумывается", () => {
    expect(monthlyOpexAverage([], { today: new Date("2026-09-15") })).toBeNull();
    expect(monthlyOpexAverage([{ spent_date: "2026-09-01", amount: 5000 }], { today: new Date("2026-09-15") })).toBeNull();
  });

  it("ожидаемые поступления не смешиваются с фактическими деньгами", () => {
    const f = cashForecast({ onAccounts: 200000, inHands: 50000, expected: 300000, payrollOwed: 400000 });
    expect(f.available).toBe(250000);
    expect(f.afterPayroll).toBe(-150000);          // фактически не хватает
    expect(f.covered).toBe(false);
    expect(f.afterPayrollWithExpected).toBe(150000); // хватит, только если заплатят
  });

  it("зарплата покрыта, когда денег хватает без ожидаемых поступлений", () => {
    const f = cashForecast({ onAccounts: 500000, inHands: 0, expected: 0, payrollOwed: 400000 });
    expect(f.covered).toBe(true);
    expect(f.afterPayroll).toBe(100000);
  });

  it("запас в месяцах считается только при известной норме расходов", () => {
    expect(cashForecast({ onAccounts: 600000, payrollOwed: 0, monthlyOpex: 200000 }).monthsOfRunway).toBe(3);
    expect(cashForecast({ onAccounts: 600000, payrollOwed: 0, monthlyOpex: null }).monthsOfRunway).toBeNull();
    expect(cashForecast({ onAccounts: 600000, payrollOwed: 0, monthlyOpex: 0 }).monthsOfRunway).toBeNull();
  });
});

describe("оклад с учётом отсутствий", () => {
  it("случай владельца: 150 000, график 6/1, отсутствовал 8 дней вместо 4", () => {
    const r = salaryForMonth({ salary: 150000, schedule: "6/1", absenceDays: 8 });
    expect(r.norm).toEqual({ workDays: 26, offDays: 4 });
    expect(r.excessDays).toBe(4);
    expect(r.deduction).toBe(23077);
    expect(r.payable).toBe(126923);
  });

  it("отсутствовал по норме — оклад не режется", () => {
    expect(salaryForMonth({ salary: 150000, schedule: "6/1", absenceDays: 4 }).payable).toBe(150000);
    expect(salaryForMonth({ salary: 150000, schedule: "6/1", absenceDays: 0 }).payable).toBe(150000);
  });

  it("график 5/2 даёт другую норму и другую ставку дня", () => {
    const r = salaryForMonth({ salary: 220000, schedule: "5/2", absenceDays: 12 });
    expect(r.norm).toEqual({ workDays: 22, offDays: 9 });
    expect(r.excessDays).toBe(3);
    expect(r.payable).toBe(220000 - Math.round(3 * 220000 / 22));
  });

  it("без графика вычитать не из чего — оклад остаётся целым", () => {
    const r = salaryForMonth({ salary: 150000, schedule: null, absenceDays: 20 });
    expect(r.deduction).toBe(0);
    expect(r.payable).toBe(150000);
  });

  it("вычет не уходит в минус, даже если отсутствовал весь месяц", () => {
    const r = salaryForMonth({ salary: 150000, schedule: "6/1", absenceDays: 31 });
    expect(r.payable).toBe(0);
    expect(r.deduction).toBe(150000);
  });

  it("день, отмеченный дважды, считается одним", () => {
    const daysOff = [
      { tech_id: "t1", off_date: "2026-08-05" },
      { tech_id: "t1", off_date: "2026-08-05" },
      { tech_id: "t1", off_date: "2026-08-06" },
      { tech_id: "t2", off_date: "2026-08-07" },
      { tech_id: "t1", off_date: "2026-09-01" },
    ];
    expect(absenceDaysInMonth("t1", daysOff, "2026-08")).toBe(2);
  });
});

describe("помощники на заявке", () => {
  const jobs = [
    { id: "j1", status: "done", assigned_to: "t1", scheduled_date: "2026-08-10" },
    { id: "j2", status: "done", assigned_to: "t1", scheduled_date: "2026-09-05" },
    { id: "j3", status: "new",  assigned_to: "t1", scheduled_date: "2026-08-12" },
  ];
  const helpers = [
    { job_id: "j1", tech_id: "t2", amount: 15000 },
    { job_id: "j1", tech_id: "t3", amount: 5000 },
    { job_id: "j2", tech_id: "t2", amount: 7000 },
    { job_id: "j3", tech_id: "t2", amount: 9000 },
  ];
  const august = (d) => String(d || "").startsWith("2026-08");

  it("сумма доплат по заявке складывается со всех помощников", () => {
    expect(helpersTotal("j1", helpers)).toBe(20000);
    expect(helpersTotal("нет-такой", helpers)).toBe(0);
  });

  it("заработок помощника считается по месяцу ЗАЯВКИ", () => {
    expect(helperEarnings("t2", { jobs, jobHelpers: helpers, inPeriod: august })).toBe(15000);
    expect(helperEarnings("t2", { jobs, jobHelpers: helpers })).toBe(22000); // без периода: j1 + j2
  });

  it("невыполненная заявка бонус помощнику не приносит", () => {
    // j3 в статусе new — 9000 не считаются
    expect(helperEarnings("t2", { jobs, jobHelpers: helpers })).toBe(22000);
  });

  it("бонусы помощников уменьшают прибыль заявки", () => {
    const job = { status: "done", report_paid: 100000, report_qr: 0, chemicals: [], tech_bonus: 10000 };
    const без = jobEconomics(job, {});
    const с = jobEconomics(job, { helpers: 15000 });
    expect(без.profit - с.profit).toBe(15000);
    expect(с.techExtras).toBe(25000);
  });
});

describe("ожидание лида", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();
  const lead = (over) => ({ id: "l", stage_id: "s1", updated_at: hoursAgo(1), ...over });

  it("считает часы без движения", () => {
    expect(leadWaitingHours(lead({ updated_at: hoursAgo(5) }), now)).toBe(5);
    expect(leadWaitingHours({ created_at: hoursAgo(3) }, now)).toBe(3);
    expect(leadWaitingHours({}, now)).toBeNull();
  });

  it("новый лид дольше норматива считается непринятым", () => {
    const s = leadSlaStats([
      lead({ id: "a", updated_at: hoursAgo(3) }),   // ждёт 3 ч при нормативе 2
      lead({ id: "b", updated_at: hoursAgo(1) }),   // ещё в норме
    ], { firstStageId: "s1", reactionHours: 2, now });
    expect(s.lateReaction).toBe(1);
    expect(s.open).toBe(2);
  });

  it("сконвертированный лид больше не ждёт", () => {
    const s = leadSlaStats([
      lead({ updated_at: hoursAgo(99), converted_job_id: "j1" }),
    ], { firstStageId: "s1", now });
    expect(s.open).toBe(0);
    expect(s.lateReaction).toBe(0);
  });

  it("взятый в работу и забытый попадает в «зависшие», а не в «не отвечено»", () => {
    const s = leadSlaStats([
      lead({ stage_id: "s2", updated_at: hoursAgo(24 * 5) }),
    ], { firstStageId: "s1", staleDays: 3, now });
    expect(s.stale).toBe(1);
    expect(s.lateReaction).toBe(0);
  });

  it("без указания первой стадии не выдумывает просрочку по реакции", () => {
    const s = leadSlaStats([lead({ updated_at: hoursAgo(99) })], { firstStageId: null, now });
    expect(s.lateReaction).toBe(0);
  });
});

describe("загрузка бригады на день", () => {
  const durations = { avgTotal: 120, byPest: [{ pest: "Клопы", avgTotal: 180 }, { pest: "Муравьи", avgTotal: 60 }] };

  it("считает по виду вредителя, а не по средней «по больнице»", () => {
    const l = dayLoad([{ pest: "Клопы" }, { pest: "Муравьи" }], durations);
    expect(l.busyMin).toBe(240);          // 180 + 60, а не 120 + 120
    expect(l.freeMin).toBe(9 * 60 - 240);
    expect(l.known).toBe(true);
  });

  it("для незнакомого вида берёт общий средний и помечает оценку неточной", () => {
    const l = dayLoad([{ pest: "Мокрицы" }], durations);
    expect(l.busyMin).toBe(120);
    expect(l.known).toBe(true); // общий средний известен
  });

  it("без всякой статистики не выдумывает загрузку", () => {
    const l = dayLoad([{ pest: "Клопы" }], { avgTotal: null, byPest: [] });
    expect(l.busyMin).toBeNull();
    expect(l.known).toBe(false);
  });

  it("пустой день — весь день свободен", () => {
    const l = dayLoad([], durations);
    expect(l.busyMin).toBe(0);
    expect(l.freeMin).toBe(9 * 60);
  });

  it("переполненный день не уходит в минус", () => {
    const l = dayLoad(Array(6).fill({ pest: "Клопы" }), durations); // 18 часов работы
    expect(l.freeMin).toBe(0);
    expect(l.busyMin).toBe(1080);
  });
});

describe("прайс", () => {
  const list = [
    { pest: "Клопы", area_from: 0, area_to: 40, price: 25000 },
    { pest: "Клопы", area_from: 41, area_to: 80, price: 35000 },
    { pest: "Клопы", area_from: 81, area_to: null, price: 50000 },
    { pest: "Тараканы", area_from: 0, area_to: null, price: 20000 },
  ];

  it("подбирает ступень по площади", () => {
    expect(priceFor("Клопы", 30, list).price).toBe(25000);
    expect(priceFor("Клопы", 60, list).price).toBe(35000);
    expect(priceFor("Клопы", 300, list).price).toBe(50000); // верхняя ступень открыта
  });

  it("вид сравнивается без учёта регистра и пробелов", () => {
    expect(priceFor("  клопы ", 30, list).price).toBe(25000);
  });

  it("без площади берёт нижнюю ступень и помечает как неточную", () => {
    const r = priceFor("Клопы", null, list);
    expect(r.price).toBe(25000);
    expect(r.exact).toBe(false);
  });

  it("на границе диапазона попадает в нужную ступень", () => {
    expect(priceFor("Клопы", 40, list).price).toBe(25000);
    expect(priceFor("Клопы", 41, list).price).toBe(35000);
  });

  it("незнакомый вид цены не выдумывает", () => {
    expect(priceFor("Мокрицы", 30, list)).toBeNull();
    expect(priceFor("", 30, list)).toBeNull();
  });

  it("дыра в прайсе честно возвращает пусто, а не соседнюю цену", () => {
    const holed = [{ pest: "Клопы", area_from: 0, area_to: 40, price: 25000 }];
    expect(priceFor("Клопы", 100, holed)).toBeNull();
  });
});

describe("оборот для отчётности", () => {
  const j = (over) => ({ status: "done", scheduled_date: "2026-08-10", report_cash: 0, report_qr: 0, report_transfer: 0, brand: "KazDez", ...over });

  it("разделяет наличные и официальные поступления", () => {
    const r = turnoverReport([
      j({ report_cash: 30000 }),
      j({ report_qr: 20000 }),
    ]);
    expect(r.cash).toBe(30000);
    expect(r.official).toBe(20000);
    expect(r.total).toBe(50000);
    expect(r.officialShare).toBe(40);
  });

  it("неоплаченное перечисление в оборот не идёт — денег ещё нет", () => {
    const r = turnoverReport([
      j({ report_transfer: 100000, transfer_paid: false }),
      j({ report_transfer: 50000, transfer_paid: true }),
    ]);
    expect(r.transfer).toBe(50000);
    expect(r.transferPending).toBe(100000);
    expect(r.total).toBe(50000);
  });

  it("разбивка по юрлицу считает и заявки, и суммы", () => {
    const r = turnoverReport([
      j({ brand: "KazDez", report_cash: 10000 }),
      j({ brand: "Sanitex", report_qr: 40000 }),
      j({ brand: "Sanitex", report_cash: 5000 }),
    ]);
    const san = r.byBrand.find((b) => b.brand === "Sanitex");
    expect(san.jobs).toBe(2);
    expect(san.total).toBe(45000);
    expect(r.byBrand[0].brand).toBe("Sanitex"); // сортировка по обороту
  });

  it("невыполненные заявки и чужой период не считаются", () => {
    const r = turnoverReport([
      j({ status: "new", report_cash: 99999 }),
      j({ scheduled_date: "2026-07-01", report_cash: 88888 }),
      j({ report_cash: 1000 }),
    ], { inPeriod: (d) => String(d).startsWith("2026-08") });
    expect(r.total).toBe(1000);
    expect(r.jobs).toBe(1);
  });

  it("пустой период не делит на ноль", () => {
    expect(turnoverReport([]).officialShare).toBe(0);
  });
});

describe("цена препарата на дату", () => {
  const chem = { id: "c1", name: "Дельта", unit_kind: "volume", price_per_liter: 20000 };
  const purchases = [
    { id: "p1", chemical_id: "c1", purchase_date: "2026-06-01", price_per_liter: 10000 },
    { id: "p2", chemical_id: "c1", purchase_date: "2026-08-01", price_per_liter: 20000 },
  ];

  it("берёт цену последнего прихода на дату заявки, а не сегодняшнюю", () => {
    // июньская заявка не должна дорожать от августовского закупа
    expect(chemPriceOn(chem, "2026-06-15", purchases)).toBe(10);
    expect(chemPriceOn(chem, "2026-08-15", purchases)).toBe(20);
  });

  it("до первого прихода и без истории — текущая цена из карточки", () => {
    expect(chemPriceOn(chem, "2026-05-01", purchases)).toBe(20);
    expect(chemPriceOn(chem, "2026-06-15", [])).toBe(20);
    expect(chemPriceOn(chem, null, purchases)).toBe(20);
  });

  it("два прихода одним днём: считает по тому, что записан позже", () => {
    const sameDay = [
      { id: "a", chemical_id: "c1", purchase_date: "2026-07-01", price_per_liter: 11000, created_at: "2026-07-01T08:00:00Z" },
      { id: "b", chemical_id: "c1", purchase_date: "2026-07-01", price_per_liter: 13000, created_at: "2026-07-01T17:00:00Z" },
    ];
    expect(chemPriceOn(chem, "2026-07-10", sameDay)).toBe(13);
  });

  it("себестоимость заявки считается по цене её дня", () => {
    const job = { scheduled_date: "2026-06-15", chemicals: [{ chemical_id: "c1", amount: 100 }] };
    // 100 мл по 10 000 ₸/л = 1000 ₸, а не 2000 ₸ по нынешней цене
    expect(jobChemCost(job, [chem], purchases)).toBe(1000);
    // без истории поведение прежнее
    expect(jobChemCost(job, [chem])).toBe(2000);
  });

  it("прибыль июньской заявки не меняется от августовского подорожания", () => {
    const job = {
      scheduled_date: "2026-06-15", status: "done", report_paid: 30000,
      chemicals: [{ chemical_id: "c1", amount: 100 }],
    };
    const june = jobEconomics(job, { chemicals: [chem], purchases });
    expect(june.chemicals).toBe(1000);
    expect(june.profit).toBe(29000);
  });
});

describe("прогноз закупа", () => {
  const chem = { id: "c1", name: "Дельта", unit_kind: "volume" };
  // 90 дней ровно: 4 заявки по 1000 мл, расход виден с первого дня окна
  const jobs = [
    { status: "done", scheduled_date: "2026-06-05", chemicals: [{ chemical_id: "c1", amount: 1000 }] },
    { status: "done", scheduled_date: "2026-07-05", chemicals: [{ chemical_id: "c1", amount: 1000 }] },
    { status: "done", scheduled_date: "2026-08-05", chemicals: [{ chemical_id: "c1", amount: 1000 }] },
    { status: "done", scheduled_date: "2026-08-25", chemicals: [{ chemical_id: "c1", amount: 1000 }] },
  ];

  it("считает расход в месяц и на сколько хватит остатка", () => {
    const f = chemForecast(chem, { jobs, remaining: 4000, todayIso: "2026-09-01" });
    // 4000 мл за 89 дней с первой заявки → около 1348 мл в месяц
    expect(f.used).toBe(4000);
    expect(Math.round(f.perMonth)).toBe(1348);
    expect(f.daysLeft).toBe(89);
    expect(f.orderByIso).toBe("2026-11-22"); // за неделю до конца остатка
  });

  it("отменённые заявки и чужие препараты в расход не идут", () => {
    const noise = [
      ...jobs,
      { status: "canceled", scheduled_date: "2026-08-20", chemicals: [{ chemical_id: "c1", amount: 5000 }] },
      { status: "done", scheduled_date: "2026-08-20", chemicals: [{ chemical_id: "c2", amount: 5000 }] },
    ];
    expect(chemForecast(chem, { jobs: noise, remaining: 0, todayIso: "2026-09-01" }).used).toBe(4000);
  });

  it("старый расход за пределами окна не учитывается", () => {
    const old = [{ status: "done", scheduled_date: "2025-01-01", chemicals: [{ chemical_id: "c1", amount: 9000 }] }];
    const f = chemForecast(chem, { jobs: old, remaining: 1000, todayIso: "2026-09-01" });
    expect(f.used).toBe(0);
    expect(f.perMonth).toBe(0);
    // без расхода срок жизни остатка неизвестен — это честнее, чем «хватит навсегда»
    expect(f.daysLeft).toBeNull();
    expect(f.orderByIso).toBeNull();
  });

  it("новый препарат не выглядит экономным из-за короткой истории", () => {
    const fresh = [{ status: "done", scheduled_date: "2026-08-30", chemicals: [{ chemical_id: "c1", amount: 300 }] }];
    const f = chemForecast(chem, { jobs: fresh, remaining: 300, todayIso: "2026-09-01" });
    // 300 мл за 3 дня, а не за 90 — иначе прогноз занижен в тридцать раз
    expect(f.basedOnDays).toBe(3);
    expect(f.daysLeft).toBe(3);
  });
});

describe("цены поставщиков", () => {
  const purchases = [
    { chemical_id: "c1", supplier: "Химснаб", purchase_date: "2026-06-01", price_per_liter: 12000, amount: 5000 },
    { chemical_id: "c1", supplier: "Химснаб", purchase_date: "2026-08-01", price_per_liter: 14000, amount: 5000 },
    { chemical_id: "c1", supplier: "АгроЛига", purchase_date: "2026-07-15", price_per_liter: 11000, amount: 3000 },
    { chemical_id: "c2", supplier: "Химснаб", purchase_date: "2026-08-01", price_per_liter: 99000, amount: 1000 },
  ];

  it("сводит поставщиков по последней цене, дешёвый первым", () => {
    const rows = supplierPrices("c1", purchases);
    expect(rows.map((r) => r.supplier)).toEqual(["АгроЛига", "Химснаб"]);
    expect(rows[1].lastPrice).toBe(14000);
    expect(rows[1].minPrice).toBe(12000);
    expect(rows[1].count).toBe(2);
    expect(rows[1].amount).toBe(10000);
  });

  it("приходы без поставщика не теряются", () => {
    const rows = supplierPrices("c1", [{ chemical_id: "c1", purchase_date: "2026-06-01", price_per_liter: 10000 }]);
    expect(rows[0].supplier).toBe("поставщик не указан");
  });
});

describe("допуски сотрудников", () => {
  const today = "2026-09-01";

  it("различает действующий, истекающий и просроченный", () => {
    expect(docStatus({ expires_on: "2026-12-31" }, today).state).toBe("ok");
    expect(docStatus({ expires_on: "2026-09-20" }, today).state).toBe("soon");
    expect(docStatus({ expires_on: "2026-08-25" }, today).state).toBe("expired");
    expect(docStatus({ expires_on: "2026-08-25" }, today).daysLeft).toBe(-7);
  });

  it("документ без срока считается бессрочным, а не просроченным", () => {
    // иначе половина списка горит красным и на предупреждения перестают смотреть
    expect(docStatus({ expires_on: null }, today).state).toBe("nolimit");
  });

  it("последний день срока ещё действует", () => {
    expect(docStatus({ expires_on: today }, today).state).toBe("soon");
    expect(docStatus({ expires_on: today }, today).daysLeft).toBe(0);
  });

  it("в список внимания попадают просроченные и истекающие, горящие первыми", () => {
    const docs = [
      { id: "a", tech_id: "t1", expires_on: "2026-12-31" },
      { id: "b", tech_id: "t1", expires_on: "2026-09-20" },
      { id: "c", tech_id: "t1", expires_on: "2026-08-01" },
      { id: "d", tech_id: "t1", expires_on: null },
    ];
    const rows = docsNeedingAttention(docs, { todayIso: today });
    expect(rows.map((r) => r.doc.id)).toEqual(["c", "b"]);
  });

  it("документы отключённых сотрудников не висят в предупреждениях", () => {
    const docs = [
      { id: "a", tech_id: "t1", expires_on: "2026-08-01" },
      { id: "b", tech_id: "уволен", expires_on: "2026-08-01" },
    ];
    const rows = docsNeedingAttention(docs, { todayIso: today, activeTechIds: new Set(["t1"]) });
    expect(rows.map((r) => r.doc.id)).toEqual(["a"]);
  });
});

describe("гарантийные возвраты", () => {
  const chem = { id: "c1", name: "Дельта", unit_kind: "volume", price_per_liter: 10000 };
  const original = { id: "j1", status: "done", assigned_to: "t1", scheduled_date: "2026-08-05", report_paid: 30000, chemicals: [] };

  it("затраты бесплатного повтора ложатся на исходную заявку", () => {
    const repeat = {
      id: "j2", repeat_of: "j1", status: "done", assigned_to: "t1", scheduled_date: "2026-08-20",
      report_paid: 0, tech_travel: 2000, transport_cost: 1500,
      chemicals: [{ chemical_id: "c1", amount: 100 }],
    };
    // 100 мл по 10 ₸ = 1000, плюс дорожные 2000 и транспорт 1500
    expect(guaranteeCostOf("j1", { jobs: [original, repeat], chemicals: [chem] })).toBe(4500);
  });

  it("платный повтор стоит компании только разницу и не уходит в минус", () => {
    const paidBack = { id: "j3", repeat_of: "j1", status: "done", scheduled_date: "2026-08-20", report_paid: 3000, tech_travel: 2000, chemicals: [] };
    expect(guaranteeCostOf("j1", { jobs: [original, paidBack], chemicals: [chem] })).toBe(0);
  });

  it("невыполненный повтор ещё ничего не стоил", () => {
    const planned = { id: "j4", repeat_of: "j1", status: "new", tech_travel: 2000, chemicals: [] };
    expect(guaranteeCostOf("j1", { jobs: [original, planned], chemicals: [chem] })).toBe(0);
  });

  it("возврат приписывается тому, кто делал исходную заявку", () => {
    const jobs = [
      original,
      { id: "j5", status: "done", assigned_to: "t2", scheduled_date: "2026-08-06" },
      // переделывал другой человек — но виноват не он
      { id: "j6", repeat_of: "j1", status: "done", assigned_to: "t2", scheduled_date: "2026-08-20" },
    ];
    const rows = guaranteeStats(jobs);
    const t1 = rows.find((r) => r.techId === "t1");
    const t2 = rows.find((r) => r.techId === "t2");
    expect(t1).toMatchObject({ done: 1, returns: 1, rate: 100 });
    expect(t2).toMatchObject({ done: 1, returns: 0, rate: 0 });
  });

  it("период считается по дате исходной заявки", () => {
    const jobs = [
      { id: "j1", status: "done", assigned_to: "t1", scheduled_date: "2026-07-20" },
      { id: "j2", repeat_of: "j1", status: "done", assigned_to: "t1", scheduled_date: "2026-08-03" },
    ];
    // смотрим август: июльской заявки в нём нет, значит и возврата тоже
    const august = guaranteeStats(jobs, { inPeriod: (d) => String(d).slice(0, 7) === "2026-08" });
    expect(august).toEqual([]);
    const july = guaranteeStats(jobs, { inPeriod: (d) => String(d).slice(0, 7) === "2026-07" });
    expect(july[0]).toMatchObject({ done: 1, returns: 1 });
  });
});

describe("ушедшие клиенты", () => {
  const key = (p) => String(p || "").replace(/\D/g, "").slice(-10);
  const today = "2026-09-01";

  it("находит тех, кто обработался и не появлялся дольше срока", () => {
    const jobs = [
      { id: "1", client_phone: "+7 701 111 1111", client_name: "Айгуль", status: "done", scheduled_date: "2025-06-10", report_paid: 30000, pest: "Тараканы" },
      { id: "2", client_phone: "+7 702 222 2222", status: "done", scheduled_date: "2026-08-10", report_paid: 40000 },
    ];
    const rows = dormantClients(jobs, { months: 12, todayIso: today, phoneKeyOf: key });
    expect(rows.map((r) => r.name)).toEqual(["Айгуль"]);
    expect(rows[0].monthsSince).toBe(14);
  });

  it("клиент с незакрытой заявкой не ушёл — он в работе", () => {
    const jobs = [
      { client_phone: "7011111111", status: "done", scheduled_date: "2024-01-10", report_paid: 30000 },
      { client_phone: "7011111111", status: "new", scheduled_date: null },
    ];
    expect(dormantClients(jobs, { months: 12, todayIso: today, phoneKeyOf: key })).toEqual([]);
  });

  it("две формы одного номера — один клиент", () => {
    const jobs = [
      { client_phone: "+7 701 111 1111", status: "done", scheduled_date: "2024-01-10", report_paid: 30000 },
      { client_phone: "8 701 111 1111", status: "done", scheduled_date: "2024-05-10", report_paid: 20000 },
    ];
    const rows = dormantClients(jobs, { months: 12, todayIso: today, phoneKeyOf: key });
    expect(rows.length).toBe(1);
    expect(rows[0].revenue).toBe(50000);
    // срок считается от последней обработки, а не от первой
    expect(rows[0].lastDone).toBe("2024-05-10");
  });

  it("отменённые заявки не делают человека клиентом", () => {
    const jobs = [{ client_phone: "7011111111", status: "canceled", scheduled_date: "2024-01-10" }];
    expect(dormantClients(jobs, { months: 12, todayIso: today, phoneKeyOf: key })).toEqual([]);
  });

  it("сверху те, кого выгоднее вернуть", () => {
    const jobs = [
      { client_phone: "7011111111", status: "done", scheduled_date: "2024-01-10", report_paid: 10000 },
      { client_phone: "7022222222", status: "done", scheduled_date: "2024-02-10", report_paid: 90000 },
    ];
    const rows = dormantClients(jobs, { months: 12, todayIso: today, phoneKeyOf: key });
    expect(rows.map((r) => r.revenue)).toEqual([90000, 10000]);
  });
});

describe("сравнение периодов", () => {
  const jobs = [
    { status: "done", scheduled_date: "2026-08-05", report_paid: 30000 },
    { status: "done", scheduled_date: "2026-08-15", report_paid: 50000 },
    { status: "new", scheduled_date: "2026-08-20" },
    { status: "canceled", scheduled_date: "2026-08-21", report_paid: 99000 },
    { status: "done", scheduled_date: "2026-07-10", report_paid: 40000 },
  ];
  const inMonth = (m) => (iso) => String(iso).slice(0, 7) === m;

  it("считает выручку, выполненные заявки и чек", () => {
    const t = periodTotals(jobs, { inRange: inMonth("2026-08") });
    expect(t).toMatchObject({ revenue: 80000, done: 2, jobs: 3, avg: 40000 });
  });

  it("отменённые не попадают ни в выручку, ни в счётчик", () => {
    expect(periodTotals(jobs, { inRange: inMonth("2026-08") }).jobs).toBe(3);
  });

  it("фильтр по бренду работает так же, как в своде", () => {
    const mixed = [
      { status: "done", scheduled_date: "2026-08-05", report_paid: 10000, brand: "partner" },
      { status: "done", scheduled_date: "2026-08-06", report_paid: 20000 },
    ];
    expect(periodTotals(mixed, { inRange: inMonth("2026-08"), brandFilter: "ours" }).revenue).toBe(20000);
    expect(periodTotals(mixed, { inRange: inMonth("2026-08"), brandFilter: "partner" }).revenue).toBe(10000);
  });

  it("даёт процент изменения к прошлому периоду", () => {
    const now = periodTotals(jobs, { inRange: inMonth("2026-08") });
    const before = periodTotals(jobs, { inRange: inMonth("2026-07") });
    const d = comparePeriods(now, before);
    expect(d.revenue).toBe(100); // 80 000 против 40 000
    expect(d.done).toBe(100);
    expect(d.avg).toBe(0); // чек тот же
  });

  it("с нулём в прошлом периоде сравнивать нечего — это null, а не рост на 100%", () => {
    const d = comparePeriods({ revenue: 50000, done: 1, avg: 50000 }, { revenue: 0, done: 0, avg: 0 });
    expect(d.revenue).toBeNull();
    expect(d.done).toBeNull();
    expect(d.avg).toBeNull();
  });

  it("падение показывается отрицательным числом", () => {
    expect(comparePeriods({ revenue: 30000 }, { revenue: 60000 }).revenue).toBe(-50);
  });
});

describe("оценки клиентов", () => {
  const jobs = [
    { id: "j1", assigned_to: "t1", pest: "Тараканы", scheduled_date: "2026-08-05" },
    { id: "j2", assigned_to: "t1", pest: "Клопы", scheduled_date: "2026-08-10" },
    { id: "j3", assigned_to: "t2", pest: "Тараканы", scheduled_date: "2026-08-12" },
    { id: "j4", assigned_to: "t2", pest: "Клопы", scheduled_date: "2026-07-01" },
  ];
  const feedback = [
    { id: "f1", job_id: "j1", rating: 5, created_at: "2026-08-06T10:00:00Z" },
    { id: "f2", job_id: "j2", rating: 2, created_at: "2026-08-11T10:00:00Z" },
    { id: "f3", job_id: "j3", rating: 5, created_at: "2026-08-13T10:00:00Z" },
    { id: "f4", job_id: "j4", rating: 1, created_at: "2026-07-02T10:00:00Z" },
  ];
  const august = (iso) => String(iso).slice(0, 7) === "2026-08";

  it("считает среднюю и число низких оценок за период", () => {
    const st = feedbackStats(feedback, jobs, { inPeriod: august });
    expect(st.total).toBe(3);
    expect(st.avg).toBe(4);
    expect(st.low).toBe(1);
  });

  it("худшие идут первыми — иначе список бесполезен", () => {
    const st = feedbackStats(feedback, jobs, { inPeriod: august });
    expect(st.byTech[0].techId).toBe("t1");
    expect(st.byTech[0].avg).toBe(3.5);
  });

  it("рядом со средней всегда есть количество оценок", () => {
    const st = feedbackStats(feedback, jobs, { inPeriod: august });
    // «5,0» по одному отзыву — не достижение, и это должно быть видно
    expect(st.byTech.find((r) => r.techId === "t2")).toMatchObject({ avg: 5, count: 1 });
  });

  it("оценка без заявки или без рейтинга не считается", () => {
    const noise = [...feedback, { id: "x", job_id: "нет", rating: 5 }, { id: "y", job_id: "j1", rating: 0 }];
    expect(feedbackStats(noise, jobs, { inPeriod: august }).total).toBe(3);
  });

  it("довольные за последние дни — для просьбы об отзыве, свежие первыми", () => {
    const rows = happyClients(feedback, jobs, { todayIso: "2026-08-14", days: 10 });
    expect(rows.map((r) => r.feedback.id)).toEqual(["f3", "f1"]);
  });

  it("за пределами окна просить отзыв уже поздно", () => {
    // f1 оставлен 6 августа — в семь дней от 14-го он не попадает
    const rows = happyClients(feedback, jobs, { todayIso: "2026-08-14", days: 7 });
    expect(rows.map((r) => r.feedback.id)).toEqual(["f3"]);
  });

  it("недовольных в этот список не зовут", () => {
    const rows = happyClients(feedback, jobs, { todayIso: "2026-08-14", days: 30 });
    expect(rows.every((r) => r.feedback.rating >= 4)).toBe(true);
  });
});

describe("план на месяц", () => {
  it("считает не только процент, но и темп на сегодня", () => {
    // 15 из 30 дней прошло: на сегодня должно быть половина плана
    const p = planProgress(3000000, 1200000, { monthKey: "2026-09", todayIso: "2026-09-15" });
    expect(p.daysInMonth).toBe(30);
    expect(p.daysPassed).toBe(15);
    expect(p.expected).toBe(1500000);
    expect(p.pct).toBe(40);
    expect(p.gap).toBe(-300000);
  });

  it("60% к 8 числу — опережение, а не провал", () => {
    const p = planProgress(1000000, 600000, { monthKey: "2026-09", todayIso: "2026-09-08" });
    expect(p.gap).toBeGreaterThan(0);
  });

  it("прошедший месяц считается целиком", () => {
    const p = planProgress(1000000, 900000, { monthKey: "2026-07", todayIso: "2026-09-15" });
    expect(p.daysPassed).toBe(31);
    expect(p.expected).toBe(1000000);
    expect(p.daysLeft).toBe(0);
  });

  it("будущий месяц ещё не начинался", () => {
    const p = planProgress(1000000, 0, { monthKey: "2026-12", todayIso: "2026-09-15" });
    expect(p.daysPassed).toBe(0);
    expect(p.expected).toBe(0);
  });

  it("без плана процент считать не от чего — это null, а не ноль", () => {
    expect(planProgress(0, 500000, { monthKey: "2026-09", todayIso: "2026-09-15" }).pct).toBeNull();
  });

  it("подсказывает, сколько нужно в день до конца месяца", () => {
    const p = planProgress(1000000, 400000, { monthKey: "2026-09", todayIso: "2026-09-20" });
    expect(p.daysLeft).toBe(10);
    expect(p.perDayNeeded).toBe(60000);
  });

  it("план перевыполнен — догонять уже нечего", () => {
    expect(planProgress(1000000, 1200000, { monthKey: "2026-09", todayIso: "2026-09-20" }).perDayNeeded).toBe(0);
  });
});

describe("хранение планов", () => {
  it("читает планы из настроек", () => {
    expect(parseTargets('{"2026-09":{"revenue":100}}')).toEqual({ "2026-09": { revenue: 100 } });
  });

  it("испорченная запись не роняет раздел денег", () => {
    expect(parseTargets("{это не json")).toEqual({});
    expect(parseTargets(null)).toEqual({});
  });
});

describe("сезонность", () => {
  const jobs = [
    { status: "done", scheduled_date: "2025-08-10", report_paid: 100000 },
    { status: "done", scheduled_date: "2026-08-10", report_paid: 150000 },
    { status: "done", scheduled_date: "2026-08-20", report_paid: 50000 },
    { status: "canceled", scheduled_date: "2026-08-21", report_paid: 999999 },
  ];

  it("сравнивает месяц с тем же месяцем год назад, а не с предыдущим", () => {
    const rows = seasonality(jobs, { monthsBack: 24, todayIso: "2026-08-15" });
    const aug26 = rows.find((r) => r.month === "2026-08");
    expect(aug26.revenue).toBe(200000);
    expect(aug26.done).toBe(2);
    expect(aug26.prevYear.month).toBe("2025-08");
    expect(aug26.yoy).toBe(100);
  });

  it("месяцы без заявок остаются в списке пустыми", () => {
    const rows = seasonality(jobs, { monthsBack: 24, todayIso: "2026-08-15" });
    expect(rows.length).toBe(24);
    // провал в середине графика — тоже факт, прятать его нельзя
    expect(rows.find((r) => r.month === "2026-03")).toMatchObject({ revenue: 0, done: 0 });
  });

  it("без данных за прошлый год сравнения нет — это null, а не ноль", () => {
    const rows = seasonality(jobs, { monthsBack: 24, todayIso: "2026-08-15" });
    expect(rows.find((r) => r.month === "2025-08").yoy).toBeNull();
  });

  it("отменённые в сезонность не попадают", () => {
    const rows = seasonality(jobs, { monthsBack: 24, todayIso: "2026-08-15" });
    expect(rows.find((r) => r.month === "2026-08").revenue).toBe(200000);
  });
});

describe("абоненты против разовых", () => {
  const key = (p) => String(p || "").replace(/\D/g, "").slice(-10);
  const jobs = [
    // абонент: два выезда, чек ниже
    { status: "done", scheduled_date: "2026-08-05", report_paid: 20000, service_contract_id: "c1", client_phone: "7011111111" },
    { status: "done", scheduled_date: "2026-08-20", report_paid: 20000, service_contract_id: "c1", client_phone: "7011111111" },
    // разовый: один выезд, чек выше
    { status: "done", scheduled_date: "2026-08-07", report_paid: 35000, client_phone: "7022222222" },
    { status: "new", scheduled_date: "2026-08-09", client_phone: "7033333333" },
  ];
  const august = (iso) => String(iso).slice(0, 7) === "2026-08";

  it("у абонента чек ниже, а выручка с клиента выше — ради этого всё и считается", () => {
    const { subscription, oneOff } = subscriptionComparison(jobs, { inPeriod: august, phoneKeyOf: key });
    expect(subscription.avg).toBe(20000);
    expect(oneOff.avg).toBe(35000);
    expect(subscription.perClient).toBe(40000);
    expect(oneOff.perClient).toBe(35000);
  });

  it("клиенты считаются по телефону, а не по числу заявок", () => {
    const { subscription } = subscriptionComparison(jobs, { inPeriod: august, phoneKeyOf: key });
    expect(subscription.clients).toBe(1);
    expect(subscription.done).toBe(2);
    expect(subscription.jobsPerClient).toBe(2);
  });

  it("невыполненные заявки не считаются ни там, ни там", () => {
    const { oneOff } = subscriptionComparison(jobs, { inPeriod: august, phoneKeyOf: key });
    expect(oneOff.done).toBe(1);
  });
});

describe("обучение менеджеров", () => {
  const today = "2026-09-01";
  const records = [
    { id: "a", person_id: "m1", topic: "Скрипт первого звонка", passed_on: "2026-03-01", score: 80, next_check_on: "2026-08-01" },
    { id: "b", person_id: "m1", topic: "Работа с возражениями", passed_on: "2026-06-01", score: null, next_check_on: "2026-12-01" },
    { id: "c", person_id: "m2", topic: "Скрипт первого звонка", passed_on: "2026-08-20", score: 60, next_check_on: null },
  ];

  it("сводит темы, последнюю дату и ближайшую перепроверку", () => {
    const s = trainingSummary(records, "m1", { todayIso: today });
    expect(s.topics).toBe(2);
    expect(s.lastPassed).toBe("2026-06-01");
    expect(s.nextCheck).toBe("2026-08-01");
    expect(s.state).toBe("expired");
  });

  it("средний балл считается только по темам с оценкой", () => {
    // вторая тема пройдена без оценки — это не ноль баллов
    expect(trainingSummary(records, "m1", { todayIso: today }).avgScore).toBe(80);
  });

  it("без записей возвращает пустую сводку, а не падает", () => {
    expect(trainingSummary(records, "нет", { todayIso: today })).toMatchObject({ topics: 0, state: "none", avgScore: null });
  });

  it("без даты перепроверки о теме не напоминают", () => {
    const s = trainingSummary(records, "m2", { todayIso: today });
    expect(s.nextCheck).toBeNull();
    expect(s.state).toBe("nolimit");
  });

  it("список на перепроверку — просроченные первыми", () => {
    const due = trainingDue(records, { todayIso: today });
    expect(due.map((d) => d.record.id)).toEqual(["a"]);
  });

  it("уволенных в списке нет", () => {
    expect(trainingDue(records, { todayIso: today, activeIds: new Set(["m2"]) })).toEqual([]);
  });
});

describe("отметки об инструктаже", () => {
  const acks = [
    { person_id: "p1", doc_key: "drive_safety", acknowledged_at: "2026-01-10T09:00:00Z" },
    { person_id: "p1", doc_key: "drive_safety", acknowledged_at: "2026-07-10T09:00:00Z" },
    { person_id: "p2", doc_key: "drive_training", acknowledged_at: "2026-05-01T09:00:00Z" },
  ];

  it("берёт свежую отметку, а не первую", () => {
    // инструктаж проходят повторно — важна последняя дата
    expect(lastAcknowledgement(acks, "p1", "drive_safety").acknowledged_at).toBe("2026-07-10T09:00:00Z");
  });

  it("отметка по другому материалу не считается", () => {
    expect(lastAcknowledgement(acks, "p2", "drive_safety")).toBeNull();
  });

  it("показывает, кто ещё не ознакомился", () => {
    const people = [{ id: "p1", full_name: "А" }, { id: "p2", full_name: "Б" }, { id: "p3", full_name: "В" }];
    expect(notAcknowledged(people, acks, "drive_safety").map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("отключённые сотрудники в списке не висят", () => {
    const people = [{ id: "p2" }, { id: "p3", is_active: false }];
    expect(notAcknowledged(people, acks, "drive_safety").map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("история сотрудника", () => {
  const events = [
    { id: "e1", person_id: "p1", kind: "hired", happened_on: "2024-03-01" },
    { id: "e2", person_id: "p1", kind: "salary", happened_on: "2025-01-01", amount: 120000 },
    { id: "e3", person_id: "p1", kind: "salary", happened_on: "2026-04-01", amount: 150000 },
    { id: "e4", person_id: "p2", kind: "hired", happened_on: "2026-01-01" },
  ];

  it("последнее событие сверху", () => {
    expect(employeeHistory(events, "p1").rows.map((e) => e.id)).toEqual(["e3", "e2", "e1"]);
  });

  it("дата приёма берётся из события, а не выдумывается", () => {
    expect(employeeHistory(events, "p1").hired).toBe("2024-03-01");
    // человека могли завести в системе через год после найма — без события даты нет
    expect(employeeHistory([{ id: "x", person_id: "p3", kind: "salary", happened_on: "2026-01-01", amount: 1 }], "p3").hired).toBeNull();
  });

  it("текущий оклад — из последнего изменения", () => {
    expect(employeeHistory(events, "p1").lastSalary).toMatchObject({ amount: 150000, happened_on: "2026-04-01" });
  });

  it("чужие события не попадают в историю", () => {
    expect(employeeHistory(events, "p2").rows.map((e) => e.id)).toEqual(["e4"]);
  });
});
