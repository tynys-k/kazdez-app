import { describe, expect, it } from "vitest";
import { buildLaterJobIndex, callStateOf } from "./clientCallsModel";
import { buildRepeatTriage, repeatValueOf } from "./repeatTriageModel";

const today = "2026-10-20";
const job = (over = {}) => ({ id: over.id || "j1", status: "done", type: "Первичная", scheduled_date: "2026-10-10", client_phone: `+7701000000${over.id?.slice(-1) || 1}`, report_paid: 20000, ...over });
const call = (over = {}) => ({ id: `c-${Math.random()}`, job_id: "j1", outcome: "no_answer", created_at: "2026-10-16T10:00:00Z", ...over });

function triage(jobs, calls = [], opts = {}) {
  const laterIndex = buildLaterJobIndex(jobs);
  return buildRepeatTriage(jobs, { today, laterIndex, stateOf: (j) => callStateOf(j, { calls, laterIndex }), ...opts });
}

describe("repeat triage after primary", () => {
  it("highlights primaries 5+ days old without a decision", () => {
    const t = triage([job(), job({ id: "j2", scheduled_date: "2026-10-18" })]);
    expect(t.byJob.get("j1").bucket).toBe("pending");
    expect(t.byJob.get("j2").bucket).toBe("soon");
    expect(t.totals.pending).toEqual({ count: 1, value: 10000 });
  });

  it("keeps unanswered clients pending", () => {
    expect(triage([job()], [call()]).byJob.get("j1").bucket).toBe("pending");
  });

  it("counts on-repeat, agreed and sold jobs as repeat", () => {
    expect(triage([job({ repeat_state: "on_repeat" })]).byJob.get("j1").bucket).toBe("repeat");
    expect(triage([job()], [call({ outcome: "agreed" })]).byJob.get("j1").bucket).toBe("repeat");
    const sold = triage([job({ repeat_state: "finished" }), job({ id: "j2", status: "new", repeat_of: "j1", scheduled_date: "2026-10-25" })]);
    expect(sold.byJob.get("j1").bucket).toBe("repeat");
  });

  it("closes on refusal and all-good calls", () => {
    expect(triage([job({ repeat_state: "finished" })]).byJob.get("j1").bucket).toBe("closed");
    expect(triage([job()], [call({ outcome: "all_good" })]).byJob.get("j1").reason).toBe("всё хорошо");
  });

  it("ignores old, secondary and unfinished jobs", () => {
    const t = triage([job({ scheduled_date: "2026-07-01" }), job({ id: "j2", type: "Вторичная" }), job({ id: "j3", status: "assigned" })]);
    expect(t.byJob.size).toBe(0);
  });

  it("puts the longest-waiting client first and computes conversion", () => {
    const t = triage([job({ scheduled_date: "2026-10-14" }), job({ id: "j2", scheduled_date: "2026-10-01" }), job({ id: "j3", repeat_state: "on_repeat" }), job({ id: "j4", repeat_state: "finished" })]);
    expect(t.pending.map((e) => e.job.id)).toEqual(["j2", "j1"]);
    expect(t.conversion).toBe(50);
  });

  it("prices the repeat by partner policy", () => {
    expect(repeatValueOf({ report_paid: 30000 }, "half")).toBe(15000);
    expect(repeatValueOf({ report_paid: 30000 }, "free")).toBe(0);
    expect(repeatValueOf({ price_options: [{ amount: 10000 }] }, "disc20")).toBe(8000);
  });
});
