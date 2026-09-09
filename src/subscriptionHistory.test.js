import { describe, expect, it } from "vitest";
import { contractHistorySummary, contractJobs, contractVisitState, subscriptionIntervalLabel } from "./subscriptionHistory";

describe("subscription history", () => {
  it("names common periods in plain language", () => {
    expect(subscriptionIntervalLabel(30)).toBe("Ежемесячно");
    expect(subscriptionIntervalLabel(90)).toBe("Ежеквартально");
    expect(subscriptionIntervalLabel(45)).toBe("Каждые 45 дн.");
  });

  it("selects only jobs from this contract and shows newest first", () => {
    const rows = contractJobs("c1", [
      { id: "old", service_contract_id: "c1", scheduled_date: "2026-07-01" },
      { id: "other", service_contract_id: "c2", scheduled_date: "2026-09-01" },
      { id: "new", service_contract_id: "c1", scheduled_date: "2026-08-01" },
    ]);
    expect(rows.map((job) => job.id)).toEqual(["new", "old"]);
  });

  it("distinguishes completed, canceled, overdue and created visits", () => {
    expect(contractVisitState({ status: "done" }, "2026-09-09").kind).toBe("done");
    expect(contractVisitState({ status: "canceled" }, "2026-09-09").kind).toBe("canceled");
    expect(contractVisitState({ status: "new", scheduled_date: "2026-09-01" }, "2026-09-09").kind).toBe("overdue");
    expect(contractVisitState({ status: "new", scheduled_date: "2026-09-10" }, "2026-09-09").kind).toBe("planned");
  });

  it("shows when the current cycle is due but no request exists", () => {
    const contract = { id: "c1", active: true, next_service_date: "2026-09-05" };
    const summary = contractHistorySummary(contract, [{ id: "done", service_contract_id: "c1", status: "done", scheduled_date: "2026-08-05", report_paid: 20000 }], "2026-09-09");
    expect(summary).toMatchObject({ total: 1, done: 1, dueWithoutJob: true, dueDays: 4, revenue: 20000 });
    expect(summary.lastDone.id).toBe("done");
  });

  it("does not call a cycle missing when its request already exists", () => {
    const contract = { id: "c1", active: true, next_service_date: "2026-09-05" };
    const summary = contractHistorySummary(contract, [{ id: "planned", service_contract_id: "c1", contract_cycle_date: "2026-09-05", status: "new", scheduled_date: "2026-09-05" }], "2026-09-09");
    expect(summary.dueWithoutJob).toBe(false);
    expect(summary.overdue).toBe(1);
  });
});
