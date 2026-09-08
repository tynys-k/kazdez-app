import { describe, expect, it } from "vitest";
import { buildChannelPlan, buildExternalMonthPlan, buildInternalSeasonality, canonicalPestName, realDemandJobs } from "./analytics";

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

  it("merges spelling and case variants without double-counting mixed services", () => {
    expect(canonicalPestName("Клопы")).toBe("Постельные клопы");
    expect(canonicalPestName("постельные Клопы")).toBe("Постельные клопы");
    expect(canonicalPestName("Клопы и Тараканы")).toBe("Постельные клопы + Тараканы");
    const result = buildInternalSeasonality([
      { status: "done", scheduled_date: "2026-01-01", pest: "Клопы", report_paid: 10000 },
      { status: "done", scheduled_date: "2026-01-02", pest: "клопы", report_paid: 12000 },
      { status: "done", scheduled_date: "2026-01-03", pest: "Постельные Клопы", report_paid: 14000 },
      { status: "done", scheduled_date: "2026-01-04", pest: "Клопы и Тараканы", report_paid: 20000 },
    ], 2026);
    expect(result.pests).toHaveLength(2);
    expect(result.pests[0]).toMatchObject({ name: "Постельные клопы", jobs: 3, revenue: 36000 });
    expect(result.pests[0].variants).toEqual(["Клопы", "Постельные Клопы", "клопы"]);
    expect(result.pests[1]).toMatchObject({ name: "Постельные клопы + Тараканы", jobs: 1, revenue: 20000 });
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
