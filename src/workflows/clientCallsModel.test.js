import { describe, expect, it } from "vitest";
import { buildCallQueue, callStageOf, callStateOf, callsForClient, outcomeLabel } from "./clientCallsModel";

const today = "2026-10-17";
const job = (over = {}) => ({ id: over.id || "j1", status: "done", type: "Первичная", scheduled_date: "2026-10-05", client_phone: "+7 701 000 00 01", ...over });
const call = (over = {}) => ({ id: over.id || `c-${Math.random()}`, job_id: "j1", outcome: "no_answer", created_at: "2026-10-12T10:00:00Z", ...over });

describe("client call queue", () => {
  it("splits jobs into after-primary and after-secondary lists", () => {
    const q = buildCallQueue([job(), job({ id: "j2", type: "Вторичная", client_phone: "+77010000002" }), job({ id: "j3", type: "Плановая", client_phone: "+77010000003" })], { today });
    expect(q.after_primary.map((i) => i.job.id)).toEqual(["j1"]);
    expect(q.after_secondary.map((i) => i.job.id)).toEqual(["j2"]);
  });

  it("waits until the call is due", () => {
    const q = buildCallQueue([job({ scheduled_date: "2026-10-15" })], { today });
    expect(q.after_primary).toHaveLength(0);
    expect(q.upcoming).toBe(1);
  });

  it("keeps unanswered clients and counts attempts", () => {
    const q = buildCallQueue([job()], { today, calls: [call(), call({ created_at: "2026-10-13T10:00:00Z" })] });
    expect(q.after_primary[0].attempts).toBe(2);
  });

  it("removes clients once a closing outcome is logged", () => {
    expect(buildCallQueue([job()], { today, calls: [call({ outcome: "all_good" })] }).after_primary).toHaveLength(0);
    expect(buildCallQueue([job()], { today, calls: [call({ outcome: "agreed" })] }).after_primary).toHaveLength(0);
  });

  it("brings a client back when the closing call is deleted", () => {
    const q = buildCallQueue([job()], { today, calls: [call({ outcome: "all_good", deleted_at: "2026-10-13T00:00:00Z" })] });
    expect(q.after_primary).toHaveLength(1);
  });

  it("does not count a plain comment as an attempt or a result", () => {
    const q = buildCallQueue([job()], { today, calls: [call({ outcome: "note", note: "Просил звонить вечером" })] });
    expect(q.after_primary[0].attempts).toBe(0);
  });

  it("postpones callbacks until their date", () => {
    const q = buildCallQueue([job()], { today, calls: [call({ outcome: "callback", callback_on: "2026-10-20" })] });
    expect(q.after_primary).toHaveLength(0);
    expect(q.later[0].callbackOn).toBe("2026-10-20");
    const due = buildCallQueue([job()], { today: "2026-10-20", calls: [call({ outcome: "callback", callback_on: "2026-10-20" })] });
    expect(due.after_primary).toHaveLength(1);
  });

  it("skips clients already on repeat or booked for the next visit", () => {
    expect(buildCallQueue([job({ repeat_state: "on_repeat" })], { today }).after_primary).toHaveLength(0);
    const booked = [job(), job({ id: "j9", status: "new", scheduled_date: "2026-10-20" })];
    expect(buildCallQueue(booked, { today }).after_primary).toHaveLength(0);
  });

  it("treats legacy quality results as closed, but legacy no-answer as open", () => {
    expect(buildCallQueue([job()], { today, qualityChecks: [{ job_id: "j1", result: "positive" }] }).after_primary).toHaveLength(0);
    const open = buildCallQueue([job()], { today, qualityChecks: [{ job_id: "j1", result: "no_answer" }] });
    expect(open.after_primary[0].attempts).toBe(1);
  });

  it("limits the queue by visit age", () => {
    const old = job({ scheduled_date: "2026-06-01" });
    expect(buildCallQueue([old], { today, windowDays: 60 }).after_primary).toHaveLength(0);
    expect(buildCallQueue([old], { today, windowDays: 0 }).after_primary).toHaveLength(1);
  });
});

describe("client call helpers", () => {
  it("names the outcome by stage", () => {
    expect(callStageOf(job({ type: "Гарантийная" }))).toBe("after_secondary");
    expect(outcomeLabel("agreed", "after_primary")).toBe("Посадил на вторичную");
    expect(outcomeLabel("agreed", "after_secondary")).toMatch(/на повтор/);
  });

  it("collects a client's calls by client, phone or job", () => {
    const calls = [call({ id: "a", client_phone: "8 701 000 00 01" }), call({ id: "b", job_id: "x", client_phone: "+77019999999" }), call({ id: "c", job_id: "x", client_id: "cl1" })];
    expect(callsForClient(calls, { phone: "+77010000001" }).map((c) => c.id)).toEqual(["a"]);
    expect(callsForClient(calls, { clientId: "cl1" }).map((c) => c.id)).toEqual(["c"]);
  });

  it("explains why a job left the queue", () => {
    expect(callStateOf(job({ repeat_state: "finished" })).closedBy).toBe("repeat");
  });
});
