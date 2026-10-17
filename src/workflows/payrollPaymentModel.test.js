import { describe, expect, it } from "vitest";
import { defaultPayrollPeriod, isPayrollMonth, paymentPeriod, payrollPaymentDeleteMessage, payrollPaymentsFor, payrollPeriodLabel } from "./payrollPaymentModel";

const tech = "t1";
const expenses = [
  // Зарплата за сентябрь, выданная 1 октября.
  { id: "a", tech_id: tech, status: "paid", amount: 150000, expense_date: "2026-10-01", period_month: "2026-09" },
  // Старая выплата без периода — относится к месяцу даты.
  { id: "b", tech_id: tech, status: "paid", amount: 50000, expense_date: "2026-09-22" },
  // Аванс за октябрь.
  { id: "c", tech_id: tech, status: "paid", amount: 20000, expense_date: "2026-10-15", period_month: "2026-10" },
  { id: "d", tech_id: tech, status: "unpaid", amount: 999, expense_date: "2026-09-10", period_month: "2026-09" },
  { id: "e", tech_id: "other", status: "paid", amount: 777, expense_date: "2026-09-10", period_month: "2026-09" },
];

describe("payroll payment period", () => {
  it("counts a payment made on 1 October for September in September", () => {
    const sep = payrollPaymentsFor(expenses, tech, { monthKey: "2026-09" }).map((e) => e.id);
    const oct = payrollPaymentsFor(expenses, tech, { monthKey: "2026-10" }).map((e) => e.id);
    expect(sep).toEqual(["a", "b"]);
    expect(oct).toEqual(["c"]);
  });

  it("falls back to the payment date month for rows without a period", () => {
    expect(paymentPeriod({ expense_date: "2026-08-31" })).toBe("2026-08");
    expect(paymentPeriod({ expense_date: "2026-10-01", period_month: "2026-09" })).toBe("2026-09");
    expect(paymentPeriod({ expense_date: "2026-10-01", period_month: "bad" })).toBe("2026-10");
    expect(paymentPeriod({})).toBe("");
  });

  it("keeps the payment date for week and all-time views", () => {
    const week = payrollPaymentsFor(expenses, tech, { inPeriod: (iso) => iso >= "2026-09-28" && iso < "2026-10-05" });
    expect(week.map((e) => e.id)).toEqual(["a"]);
    expect(payrollPaymentsFor(expenses, tech).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("labels and validates months", () => {
    expect(payrollPeriodLabel("2026-09")).toBe("Сентябрь 2026");
    expect(payrollPeriodLabel("2026-13")).toBe("");
    expect(isPayrollMonth("2026-01")).toBe(true);
    expect(isPayrollMonth("2026-1")).toBe(false);
  });

  it("explains what deleting a mistaken payment removes", () => {
    const text = payrollPaymentDeleteMessage({ ...expenses[0], account_id: "kaspi-gold" }, { person: "Олжас", typeLabel: "Зарплата", accountName: "Kaspi Gold", amountText: "15 000 ₸", dateText: "01.10.2026" });
    expect(text).toBe("Удалить выплату: Олжас · Зарплата за сентябрь 2026 · 15 000 ₸ · оплачено 01.10.2026? Расход по счёту «Kaspi Gold» тоже удалится, остаток счёта вернётся. Отменить удаление нельзя.");
    expect(payrollPaymentDeleteMessage({ expense_date: "2026-09-09" }, { typeLabel: "Дорожные" })).toContain("Расхода по счёту у неё нет.");
  });

  it("defaults the form to the month open in the section", () => {
    expect(defaultPayrollPeriod("2026-09", new Date(2026, 9, 17))).toBe("2026-09");
    expect(defaultPayrollPeriod("", new Date(2026, 9, 17))).toBe("2026-10");
  });
});
