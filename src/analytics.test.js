import { describe, expect, it } from "vitest";
import { buildChannelPlan, buildExternalMonthPlan, buildInternalSeasonality, realDemandJobs } from "./analytics";

describe("seasonality analytics", () => {
  const jobs = [
    { id: "1", status: "done", scheduled_date: "2026-09-01", pest: "Крысы", report_paid: 10000, source: "Google" },
    { id: "2", status: "done", scheduled_date: "2026-09-10", pest: "Крысы", report_paid: 0, source: "Google" },
    { id: "3", status: "done", scheduled_date: "2026-10-01", pest: "Тараканы", report_paid: 15000, source: "Instagram" },
    { id: "4", status: "done", scheduled_date: "2026-09-12", pest: "Крысы", report_paid: 0, visit_kind: "guarantee", source: "Google" },
    { id: "5", status: "canceled", scheduled_date: "2026-09-20", pest: "Крысы", report_paid: 50000, source: "Google" },
  ];

  it("counts completed demand but excludes guarantees and cancellations", () => {
    expect(realDemandJobs(jobs).map((job) => job.id)).toEqual(["1", "2", "3"]);
    const result = buildInternalSeasonality(jobs, 2026, "Крысы");
    expect(result.jobs).toBe(2);
    expect(result.revenue).toBe(10000);
    expect(result.months[8]).toMatchObject({ jobs: 2, revenue: 10000 });
  });

  it("keeps the external monthly budget fully allocated", () => {
    const rows = buildExternalMonthPlan(8, 1000000);
    expect(rows[0].name).toBe("Постельные клопы");
    expect(rows.find((row) => row.name === "Крысы").budgetShare).toBeGreaterThan(8);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBeGreaterThanOrEqual(999000);
  });

  it("uses existing channel plans as allocation weights", () => {
    const rows = buildChannelPlan([
      { id: "g", name: "Google", source_key: "Google", monthly_plan: 300000 },
      { id: "i", name: "Instagram", source_key: "Instagram", monthly_plan: 100000 },
    ], jobs, [{ channel_id: "g", amount: 1000 }], 800000);
    expect(rows[0]).toMatchObject({ id: "g", amount: 600000, jobs: 2, revenue: 10000 });
    expect(rows[1]).toMatchObject({ id: "i", amount: 200000, jobs: 1, revenue: 15000 });
  });
});
