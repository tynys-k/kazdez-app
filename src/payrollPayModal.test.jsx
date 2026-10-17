// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPayModal } from "./modals";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const people = [{ id: "p1", full_name: "Олжас" }, { id: "p2", full_name: "Айнур" }];
const accounts = [{ id: "kaspi-gold", name: "Kaspi Gold" }, { id: "kaspi-pay", name: "Kaspi Pay" }];
const owedFor = (techId, period) => (period === "2026-09" ? { p1: 526856, p2: 80000 }[techId] ?? null : null);
let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent === text);
const field = (label) => [...container.querySelectorAll(".kd-field")].find((el) => el.querySelector("span")?.textContent === label)?.querySelector("input,select,textarea");
async function change(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

describe("PayrollPayModal", () => {
  it("adds a payment for a chosen employee and period separate from the pay date", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    await act(async () => root.render(<PayrollPayModal people={people} owedFor={owedFor} defaultPeriod="2026-09" accounts={accounts} onClose={() => {}} onSave={onSave} />));
    expect(container.textContent).toContain("Добавить выплату");
    expect(button("Выплатить").disabled).toBe(true);
    await change(field("Сотрудник"), "p2");
    expect(field("Сумма (₸)").value).toBe("80000");
    expect(field("За какой период").value).toBe("2026-09");
    await change(field("Дата оплаты"), "2026-10-01");
    await change(field("Вид выплаты"), "tax");
    await change(field("Способ оплаты (счёт)"), "kaspi-pay");
    await change(field("Сумма (₸)"), "57375");
    await change(field("Комментарий"), "ИПН и ОПВ");
    await act(async () => button("Выплатить").click());
    expect(onSave).toHaveBeenCalledWith({ tech_id: "p2", type: "tax", amount: 57375, expense_date: "2026-10-01", period_month: "2026-09", account_id: "kaspi-pay", note: "ИПН и ОПВ" }, expect.any(String));
  });

  it("pre-fills the employee from the row button and offers all payment kinds", async () => {
    await act(async () => root.render(<PayrollPayModal tech={people[0]} people={people} owedFor={owedFor} defaultPeriod="2026-09" accounts={accounts} onClose={() => {}} onSave={vi.fn()} />));
    expect(container.textContent).toContain("Выплата — Олжас");
    expect(field("Сотрудник")).toBeUndefined();
    expect(field("Сумма (₸)").value).toBe("526856");
    expect([...field("Вид выплаты").options].map((o) => o.textContent)).toEqual(["Зарплата", "Аванс", "Премия", "Налоги", "Дорожные", "Другое"]);
    // Для месяца, который в разделе не пересчитан, сумму не угадываем.
    await change(field("За какой период"), "2026-08");
    expect(field("Сумма (₸)").value).toBe("");
  });
});
