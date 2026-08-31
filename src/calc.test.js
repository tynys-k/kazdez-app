import { describe, it, expect } from "vitest";
import {
  jobChemCost, partnerShareAmt, executorShareAmt, jobEconomics,
  techCashOnHand, techCashCollected, techDepositedPending, techLedger, isClosedDate,
  clientStats, allocationPerJob, jobFullEconomics, jobDurations, durationStats, cashForecast, monthlyOpexAverage, salaryForMonth, absenceDaysInMonth, helpersTotal, helperEarnings, leadWaitingHours, leadSlaStats, dayLoad,
  priceFor,
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
