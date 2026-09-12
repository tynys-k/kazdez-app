// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockRegister from "./StockRegister";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const chem = {
  id: "chem-1", name: "Ксулат", unit_kind: "volume", purchased_ml: 10000,
  remaining: 6500, used: 3500, stockValue: 78000, price_per_liter: 12000,
  low: false, orderSoon: false, forecast: { perMonth: 1750, daysLeft: 111 }, suppliers: [],
  batches: [{ purchase: { id: "purchase-1" }, remaining: 6500 }],
};
const tech = { id: "tech-1", full_name: "Аян" };
const props = {
  inventory: [chem], techs: [tech],
  techLedger: () => [{ chem, received: 2500, consumed: 500, balance: 2000 }],
  purchases: [{ id: "purchase-1", chemical_id: "chem-1", purchase_date: "2026-09-01", amount: 10000, price_per_liter: 12000, supplier: "Поставщик", batch_no: "K-41", expires_on: "2027-09-01" }],
  handouts: [{ id: "handout-1", chemical_id: "chem-1", tech_id: "tech-1", amount: 2500, created_at: "2026-09-02T10:00:00Z" }],
  adjustments: [], jobs: [{ id: "job-1", assigned_to: "tech-1", scheduled_date: "2026-09-03", address: "Абая 10", chemicals: [{ chemical_id: "chem-1", amount: 500 }] }], sales: [],
  equipment: [], equipIssuedQty: () => 0, totalStockValue: 78000, totalEquipValue: 0,
  selectedId: "chem-1", onSelect: vi.fn(), canEditStock: true, canManageTeam: true,
  onStockIn: vi.fn(), onHandout: vi.fn(), onMovement: vi.fn(), onRemoveChem: vi.fn(),
  onAddEquipment: vi.fn(), onEditEquipment: vi.fn(), onRemoveEquipment: vi.fn(),
  techEquipment: () => [], onIssueEquipment: vi.fn(), onTransferEquipment: vi.fn(), onEquipStatus: vi.fn(),
};

describe("stock register", () => {
  it("shows compact balances split between the warehouse and employees", async () => {
    await act(async () => root.render(<StockRegister {...props} />));
    expect(container.textContent).toContain("Остатки препаратов");
    expect(container.textContent).toContain("4.5 л");
    expect(container.textContent).toContain("2 л");
    expect(container.textContent).toContain("Основной склад");
    expect(container.textContent).toContain("Аян");
  });

  it("opens the full movement path and purchase batch", async () => {
    await act(async () => root.render(<StockRegister {...props} />));
    const buttons = [...container.querySelectorAll("button")];
    await act(async () => buttons.find((button) => button.textContent.startsWith("Движение"))?.click());
    expect(container.textContent).toContain("Расход по заявке");
    expect(container.textContent).toContain("Абая 10");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent.startsWith("Закупки и партии"))?.click());
    expect(container.textContent).toContain("Поставщик");
    expect(container.textContent).toContain("K-41");
  });
});
