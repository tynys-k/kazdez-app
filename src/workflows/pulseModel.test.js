import { describe, expect, it } from "vitest";
import { b2bFunnel, cashRunway, contractMonthlyValue, decisionQueue, historicalRates, monthProgress, planFact, plannedJobValue } from "./pulseModel";

const today = new Date(2026, 9, 10); // 10 октября, 31 день в месяце

describe("план/факт", () => {
  it("прогнозирует конец месяца по темпу и считает, сколько нужно в день", () => {
    expect(monthProgress(today)).toMatchObject({ days: 31, elapsed: 10, remaining: 21 });
    const rows = planFact({ target: { revenue: 3100000, jobs: null, mrr: 500000 }, fact: { revenue: 800000, jobs: 12, mrr: 520000 }, today });
    const revenue = rows.find((r) => r.key === "revenue");
    expect(revenue).toMatchObject({ forecast: 2480000, pct: 26, forecastPct: 80, status: "behind" });
    expect(revenue.perDayNeeded).toBe(Math.ceil(2300000 / 21));
    expect(rows.find((r) => r.key === "jobs")).toMatchObject({ status: "no_target", target: null, forecast: 37 });
    // MRR — остаток, его не экстраполируют: факт выше цели — цель выполнена.
    expect(rows.find((r) => r.key === "mrr")).toMatchObject({ forecast: 520000, status: "done" });
  });

  it("различает «в графике» и «под угрозой»", () => {
    const rows = planFact({ target: { revenue: 1000000, profit: 1000000 }, fact: { revenue: 330000, profit: 300000 }, today });
    expect(rows.find((r) => r.key === "revenue").status).toBe("on_track");
    expect(rows.find((r) => r.key === "profit").status).toBe("at_risk");
  });
});

describe("деньги на четыре недели", () => {
  it("раскладывает поступления и списания по неделям и находит кассовый разрыв", () => {
    const result = cashRunway({
      today, startBalance: 100000, receivables: 20000,
      debts: [{ amount: 30000, due_on: "2026-10-01" }, { amount: 40000, due_on: "2026-10-20" }, { amount: 5000 }, { amount: 9000, due_on: "2026-10-12", paid_on: "2026-10-05" }],
      plannedJobs: [{ scheduled_date: "2026-10-11", price_options: [{ amount: 10000 }, { amount: 20000 }] }, { scheduled_date: "2026-10-30", quoted_price: 50000 }],
      contracts: [{ id: "c1", price: 60000, interval_days: 14, next_service_date: "2026-10-01" }],
      completionRate: 0.5, directCostShare: 0.4, payrollOwed: 300000, monthlyOpex: 304000,
    });
    const [w1, w2, w3] = result.weeks;
    expect(w1).toMatchObject({ from: "2026-10-10", to: "2026-10-16" });
    expect(w1.inflow).toEqual({ receivables: 20000, debts: 30000, jobs: 10000, contracts: 30000 });
    expect(w2.inflow.debts).toBe(40000);
    expect(w3.inflow.contracts).toBe(30000); // 10 окт + 14 дней = 24 окт
    expect(w1.outflow).toMatchObject({ payroll: 300000, direct: 16000, opex: 70000 });
    expect(result.undatedDebts).toBe(5000);
    expect(result.firstGap).toBe(0);
    expect(result.minBalance).toBeLessThan(0);
  });

  it("не считает абонентский выезд, для которого уже есть заявка цикла", () => {
    const result = cashRunway({
      today, contracts: [{ id: "c1", price: 60000, interval_days: 60, next_service_date: "2026-10-12" }],
      plannedJobs: [{ scheduled_date: "2026-10-12", quoted_price: 60000, service_contract_id: "c1", contract_cycle_date: "2026-10-12" }],
    });
    expect(result.weeks[0].inflow).toMatchObject({ jobs: 60000, contracts: 0 });
  });

  it("берёт цену заявки и абонента в месяц и долю выполнения из истории", () => {
    expect(plannedJobValue({ price_options: [{ amount: 7000 }, { amount: 9000 }] })).toBe(9000);
    expect(contractMonthlyValue({ price: 30000, interval_days: 90 })).toBe(10000);
    const rates = historicalRates([
      { status: "done", scheduled_date: "2026-10-01", report_paid: 10000 },
      { status: "canceled", scheduled_date: "2026-10-02" },
      { status: "done", scheduled_date: "2025-01-01", report_paid: 99999 },
    ], { today, directProfitOf: () => 6000 });
    expect(rates).toMatchObject({ completionRate: 0.5, directCostShare: 0.4, sample: 2 });
  });
});

describe("B2B-воронка", () => {
  const stages = ["new", "lpr_found", "kp_sent", "negotiation", "contract", "first_service", "subscriber", "lost", "snoozed"].map((code) => ({ id: `s-${code}`, code }));
  const lead = (name, code, extra = {}) => ({ id: name, name, client_type: "company", stage_id: `s-${code}`, stage_changed_at: "2026-10-08", ...extra });

  it("считает стадии, конверсию, застрявшие сделки и MRR", () => {
    const funnel = b2bFunnel({
      today, stages,
      leads: [
        lead("Кафе", "kp_sent", { expected_mrr: 40000, stage_changed_at: "2026-09-01" }),
        lead("Склад", "negotiation", { quoted_price: 25000 }),
        lead("Садик", "subscriber", { contract_signed_at: "2026-10-03" }),
        lead("Офис", "lost", { stage_changed_at: "2026-10-05" }),
        { ...lead("Частник", "kp_sent"), client_type: "person" },
      ],
      contracts: [
        { price: 30000, interval_days: 30, created_at: "2026-10-04T10:00:00Z" },
        { price: 60000, interval_days: 60, created_at: "2026-05-01" },
        { price: 10000, interval_days: 30, active: false },
      ],
    });
    const kp = funnel.stages.find((s) => s.code === "kp_sent");
    expect(kp).toMatchObject({ count: 1, value: 40000, reached: 3, conversion: 67, stuck: 1 });
    expect(funnel.pipeline).toEqual({ count: 2, value: 65000 });
    expect(funnel.stuckDeals.map((d) => d.name)).toEqual(["Кафе"]);
    expect(funnel).toMatchObject({ signedThisMonth: 1, lostThisMonth: 1 });
    expect(funnel.mrr).toEqual({ current: 60000, subscribers: 2, paused: 1, newThisMonth: 1, newMrr: 30000 });
  });
});

describe("центр решений", () => {
  it("показывает ответственного, просрочку и прячет отложенное", () => {
    const alerts = [
      { id: "a", label: "Без решения", tone: "warning" },
      { id: "b", label: "Назначено", tone: "danger" },
      { id: "c", label: "Просрочено", tone: "danger" },
      { id: "d", label: "Отложено", tone: "danger" },
      { id: "e", label: "Задача закрыта", tone: "warning" },
      { id: "f", label: "Перенос истёк", tone: "warning" },
    ];
    const decisions = [
      { alert_key: "b", status: "open", owner_id: "p1", due_on: "2026-10-12", task_id: "t1" },
      { alert_key: "c", status: "open", owner_id: "p1", due_on: "2026-10-09", task_id: "t2" },
      { alert_key: "d", status: "open", snoozed_until: "2026-10-15" },
      { alert_key: "e", status: "open", owner_id: "p1", due_on: "2026-10-20", task_id: "t3" },
      { alert_key: "f", status: "open", snoozed_until: "2026-10-10" },
      { alert_key: "a", status: "closed", owner_id: "p1" },
    ];
    const queue = decisionQueue({ alerts, decisions, tasks: [{ id: "t1", status: "new" }, { id: "t2", status: "in_progress" }, { id: "t3", status: "done" }], profiles: [{ id: "p1", full_name: "Айгерим" }], today });
    expect(queue.rows.map((r) => [r.alert.id, r.state])).toEqual([["a", "none"], ["f", "none"], ["e", "task_done"], ["c", "overdue"], ["b", "assigned"]]);
    expect(queue.rows.find((r) => r.alert.id === "b").owner).toBe("Айгерим");
    expect(queue.snoozed.map((r) => r.alert.id)).toEqual(["d"]);
    expect(queue.totals).toEqual({ unowned: 3, overdue: 1, assigned: 1, snoozed: 1 });
  });
});
