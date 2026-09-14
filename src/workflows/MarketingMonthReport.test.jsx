// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketingMonthReport from "./MarketingMonthReport";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 14, 12));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("marketing month report", () => {
  it("shows monthly totals and lets the user open the previous month", async () => {
    const onMonthOffsetChange = vi.fn();
    await act(async () => root.render(<MarketingMonthReport
      jobs={[{ id: 1, status: "done", scheduled_date: "2026-09-02", source: "2ГИС", report_paid: 500000 }]}
      channels={[{ id: 1, name: "2ГИС", source_key: "2ГИС", monthly_plan: 100000 }]}
      topups={[{ id: 1, channel_id: 1, topup_date: "2026-09-01", amount: 30000 }]}
      settings={{ mkt_revenue_goal: 1000000, mkt_ad_percent: 10 }}
      monthOffset={0}
      onMonthOffsetChange={onMonthOffsetChange}
      onAddChannel={vi.fn()}
      onEditChannel={vi.fn()}
      onRemoveChannel={vi.fn()}
      onAddTopup={vi.fn()}
      onRemoveTopup={vi.fn()}
      accountName={() => "Kaspi Gold"}
    />));
    expect(container.textContent).toContain("сентябрь 2026 г.");
    expect(container.textContent).toContain("30 000 ₸");
    expect(container.textContent).toContain("500 000 ₸");
    expect(container.textContent).toContain("16.7×");
    await act(async () => container.querySelector('[aria-label="Предыдущий месяц"]').click());
    expect(onMonthOffsetChange).toHaveBeenCalledWith(-1);
    expect(container.querySelector('[aria-label="Следующий месяц"]').disabled).toBe(true);
  });
});
