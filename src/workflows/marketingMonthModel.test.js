import { describe, expect, it } from "vitest";
import { buildMarketingMonthHistory, buildMarketingMonthReport, marketingMonthRange } from "./marketingMonthModel";

const now = new Date(2026, 8, 14, 12);
const channels = [
  { id: 1, name: "2ГИС", source_key: "2ГИС", monthly_plan: 100000 },
  { id: 2, name: "Instagram", source_key: "Instagram", monthly_plan: 200000 },
];
const topups = [
  { id: 1, channel_id: 1, topup_date: "2026-09-01", amount: 30000 },
  { id: 2, channel_id: 1, topup_date: "2026-09-30", amount: 20000 },
  { id: 3, channel_id: 2, topup_date: "2026-08-31", amount: 70000 },
  { id: 4, channel_id: 2, topup_date: "2026-10-01", amount: 90000 },
];
const jobs = [
  { id: 1, status: "done", scheduled_date: "2026-09-02", source: "2ГИС", report_paid: 500000 },
  { id: 2, status: "done", scheduled_date: "2026-09-30", source: "Instagram", report_paid: 250000 },
  { id: 3, status: "done", scheduled_date: "2026-09-12", source: "Рекомендация", report_paid: 900000 },
  { id: 4, status: "done", scheduled_date: "2026-08-20", source: "Instagram", report_paid: 120000 },
  { id: 5, status: "canceled", scheduled_date: "2026-09-10", source: "2ГИС", report_paid: 100000 },
];

describe("marketing month report", () => {
  it("builds an inclusive calendar-month range", () => {
    expect(marketingMonthRange(0, now)).toMatchObject({ key: "2026-09", from: "2026-09-01", to: "2026-09-30" });
    expect(marketingMonthRange(-1, now)).toMatchObject({ key: "2026-08", from: "2026-08-01", to: "2026-08-31" });
  });

  it("does not mix adjacent months and excludes non-marketing revenue", () => {
    const report = buildMarketingMonthReport({ jobs, channels, topups, now });
    expect(report.totalSpent).toBe(50000);
    expect(report.totalRevenue).toBe(750000);
    expect(report.attributedJobs).toBe(2);
    expect(report.channels[0].topups).toHaveLength(2);
  });

  it("returns comparable history by month", () => {
    const history = buildMarketingMonthHistory({ jobs, channels, topups, months: 2, now });
    expect(history.map((month) => month.key)).toEqual(["2026-09", "2026-08"]);
    expect(history[1].totalSpent).toBe(70000);
    expect(history[1].totalRevenue).toBe(120000);
  });
});
