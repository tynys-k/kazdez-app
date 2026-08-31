import { describe, it, expect } from "vitest";
import {
  jobChemCost, partnerShareAmt, executorShareAmt, jobEconomics,
  techCashOnHand, techCashCollected, techDepositedPending, techLedger, isClosedDate,
  clientStats, allocationPerJob, jobFullEconomics, jobDurations, durationStats,
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
