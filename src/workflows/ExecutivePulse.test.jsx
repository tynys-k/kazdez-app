// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExecutivePulse from "./ExecutivePulse";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const data = {
  dateLabel: "14 сентября 2026 г.", criticalCount: 1,
  month: { revenue: 1400000, profit: 310000, done: 42, revenueDelta: 12, profitDelta: -4, doneDelta: 7 },
  finance: { cash: 800000, accounts: 650000, inHands: 150000, receivables: 220000, overdueTransfers: 2, payrollOwed: 90000, payrollPeople: 1 },
  growth: { activeLeads: 18, lateLeads: 3, reactionHours: 2, marketingSpend: 120000 },
  today: { total: 8, done: 5, active: 3, inField: 2, overdue: 1, unassigned: 1, revenue: 210000, plan: 300000, jobs: [{ id: "j1", time: "14:00", title: "Дезинсекция", address: "Контрольный адрес 314" }] },
  people: { active: 12, docsExpired: 1, docsSoon: 2, trainingDue: 1 },
  system: { errors24h: 0, warnings: 0, offlineQueued: 0, online: true, freshness: "13:30" },
  trend: Array.from({ length: 6 }, (_, index) => ({ key: String(index), label: `м${index + 1}`, revenue: 100000 + index * 10000, profit: 20000 + index * 1000 })),
};

describe("executive company pulse", () => {
  it("shows a company-wide decision screen and switches management lenses", async () => {
    const onNavigate = vi.fn();
    await act(async () => root.render(<ExecutivePulse data={data} alerts={[{ id: "late", label: "Просроченные заявки", value: 1, tab: "jobs", tone: "danger" }]} channels={[]} onNavigate={onNavigate} onCopy={vi.fn()} />));
    expect(container.textContent).toContain("1 критических отклонений требуют решения");
    expect(container.textContent).toContain("Контрольный адрес 314");
    expect(container.textContent).toContain("без вручную придуманных целей");

    const cfo = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("CFO"));
    await act(async () => cfo.click());
    expect(container.textContent).toContain("Ждём оплату");
    expect(container.textContent).toContain("Долг по зарплате");
  });
});
