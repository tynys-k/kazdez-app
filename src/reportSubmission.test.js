import { describe, expect, it } from "vitest";
import { atomicReportRpcUnavailable, buildAtomicReportPayload, createReportRequestId } from "./reportSubmission";

describe("atomic report submission", () => {
  it("builds one normalized payload for every part of the report", () => {
    const payload = buildAtomicReportPayload(
      { id: "job-1", quoted_price: "15000" },
      {
        cash: "5000", qr: 4000, transfer: "1000", method: "Наличные + QR", note: "ok",
        followUp: { wanted: true, date: "2026-09-20", note: "контроль" },
        checks: [{ point_id: "point-1", result: "clean" }],
        chemDetails: [{ chemical_id: "chem-1", concentration: 2, method: "spray" }],
        equipment: ["sprayer"],
        debt: { amount: "5000", dueOn: "2026-09-30", note: "остаток" },
        discountReason: "debt",
      },
      [{ chemical_id: "chem-1", name: "Средство", amount: 50 }],
      { needed: true, avr: true, dogovor: false, note: "ТОО" },
    );

    expect(payload).toMatchObject({
      job_id: "job-1",
      payment: { cash: 5000, qr: 4000, transfer: 1000, method: "Наличные + QR" },
      debt: { amount: 5000, due_on: "2026-09-30" },
      discount: null,
      equipment: ["sprayer"],
    });
  });

  it("keeps a discount separate from a debt", () => {
    const payload = buildAtomicReportPayload(
      { id: "job-2", quoted_price: 10000, scheduled_date: "2026-09-01" },
      { cash: 7000, qr: 0, transfer: 0, followUp: {}, discountReason: "manager", discountNote: "согласовано" },
      [], {},
    );
    expect(payload.debt).toBeNull();
    expect(payload.discount).toEqual({ quoted: 10000, charged: 7000, reason: "manager", note: "согласовано" });
  });

  it("creates UUID-shaped idempotency keys and recognizes a missing migration", () => {
    expect(createReportRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(atomicReportRpcUnavailable({ code: "PGRST202", message: "not found" })).toBe(true);
    expect(atomicReportRpcUnavailable({ message: "Could not find submit_report_atomic in the schema cache" })).toBe(true);
    expect(atomicReportRpcUnavailable({ message: "network failed" })).toBe(false);
  });
});
