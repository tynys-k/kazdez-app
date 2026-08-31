import { describe, it, expect } from "vitest";
import {
  jobChemCost, partnerShareAmt, executorShareAmt, jobEconomics,
  techCashOnHand, techCashCollected, techDepositedPending, techLedger, isClosedDate,
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
