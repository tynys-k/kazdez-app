import { describe, expect, it } from "vitest";
import { groupLeadActivities, leadActivityKindLabel, leadActivityOutcomeLabel, leadActivitySummary } from "./leadActivities";

describe("lead activity presentation", () => {
  it("uses human labels for CRM events", () => {
    expect(leadActivityKindLabel("whatsapp")).toBe("WhatsApp");
    expect(leadActivityOutcomeLabel("proposal_sent")).toBe("Предложение отправлено");
  });

  it("groups each lead timeline newest first", () => {
    const grouped = groupLeadActivities([
      { id: "old", lead_id: "lead-1", occurred_at: "2026-09-08T08:00:00Z" },
      { id: "other", lead_id: "lead-2", occurred_at: "2026-09-09T10:00:00Z" },
      { id: "new", lead_id: "lead-1", occurred_at: "2026-09-09T08:00:00Z" },
    ]);
    expect(grouped.get("lead-1").map((row) => row.id)).toEqual(["new", "old"]);
    expect(grouped.get("lead-2").map((row) => row.id)).toEqual(["other"]);
  });

  it("builds a compact latest-contact summary", () => {
    expect(leadActivitySummary({ kind: "call", outcome: "connected", comment: "Ждёт расчёт", occurred_at: "2026-09-09T08:00:00Z" })).toEqual({
      title: "Звонок · Связались", comment: "Ждёт расчёт", at: "2026-09-09T08:00:00Z",
    });
  });
});
