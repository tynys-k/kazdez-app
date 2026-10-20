// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pulse from "./Pulse";
import { b2bFunnel, cashRunway, decisionQueue, planFact } from "./pulseModel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const today = new Date(2026, 9, 10);
const alerts = [{ id: "debts", label: "Просроченные долги клиентов", value: "120 000 ₸", tab: "opex", tone: "danger" }];
const props = (overrides = {}) => ({
  monthLabel: "октябрь 2026 г.", elapsedShare: 10 / 31,
  plan: planFact({ target: { revenue: 3100000 }, fact: { revenue: 800000, jobs: 12 }, today }),
  target: { revenue: 3100000 },
  runway: cashRunway({ today, startBalance: 100000, payrollOwed: 300000 }),
  assumptions: { completionRate: 0.9, directCostShare: 0.35, monthlyOpex: 0 },
  funnel: b2bFunnel({ today, leads: [], stages: [], contracts: [{ price: 30000, interval_days: 30 }] }),
  queue: decisionQueue({ alerts, today }),
  people: [{ id: "p1", full_name: "Айгерим" }],
  ready: true,
  onSaveTargets: vi.fn(async () => null), onDecide: vi.fn(async () => null),
  onNavigate: vi.fn(), onOpenLead: vi.fn(), onOpenAlert: vi.fn(),
  ...overrides,
});

describe("вкладка «Пульс»", () => {
  it("сводит план, кассовый разрыв, MRR и отклонения в заголовок и блоки", async () => {
    await act(async () => root.render(<Pulse {...props()} />));
    expect(container.textContent).toContain("Выручка: прогноз 80% плана · кассовый разрыв на 1-й неделе · 1 отклонение без ответственного");
    expect(container.textContent).toContain("Отстаём");
    expect(container.querySelector(".pl-mrr strong").textContent).toMatch(/^30\s000 ₸$/);
    expect(container.textContent).toContain("1 абонент");
    expect(container.textContent).toContain("Нет ответственного");
  });

  it("назначает ответственного со сроком из строки отклонения", async () => {
    const p = props();
    await act(async () => root.render(<Pulse {...p} />));
    const assign = [...container.querySelectorAll("button")].find((b) => b.textContent === "Назначить");
    await act(async () => assign.click());
    const select = container.querySelector(".pl-decision-form select");
    await act(async () => { select.value = "p1"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const submit = [...container.querySelectorAll("button")].find((b) => b.textContent === "Создать задачу");
    await act(async () => submit.click());
    expect(p.onDecide).toHaveBeenCalledWith(alerts[0], "assign", expect.objectContaining({ ownerId: "p1" }));
    expect(container.querySelector(".pl-decision-form")).toBeNull();
  });
});
