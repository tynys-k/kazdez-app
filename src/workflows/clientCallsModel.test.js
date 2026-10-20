import { describe, expect, it } from "vitest";
import { buildCallJournal, buildCallQueue, callStageOf, callStateOf, callsForClient, outcomeLabel } from "./clientCallsModel";

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

describe("call retry order", () => {
  it("puts a client just dialled without answer after untouched ones", () => {
    const q = buildCallQueue([job(), job({ id: "j2", client_phone: "+77010000002", scheduled_date: "2026-10-08" })], { today, calls: [call({ created_at: "2026-10-17T09:00:00Z" })] });
    expect(q.after_primary.map((i) => i.job.id)).toEqual(["j2", "j1"]);
    expect(q.after_primary[1].retryOn).toBe("2026-10-18");
  });
});

describe("call journal", () => {
  const jobs = [job(), job({ id: "j2", type: "Вторичная", client_phone: "+77010000002" }), job({ id: "j3", client_phone: "+77010000003" })];
  const calls = [
    call({ id: "a", job_id: "j1", stage: "after_primary", outcome: "no_answer", created_at: "2026-10-12T10:00:00Z", created_by: "u1" }),
    call({ id: "b", job_id: "j1", stage: "after_primary", outcome: "agreed", rating: 5, note: "ждёт вторичную", created_at: "2026-10-13T10:00:00Z", created_by: "u2" }),
    call({ id: "c", job_id: "j1", stage: "after_primary", outcome: "note", note: "уточнил время", created_at: "2026-10-14T10:00:00Z", created_by: "u2" }),
    call({ id: "d", job_id: "j2", stage: "after_secondary", outcome: "complaint", note: "тараканы вернулись", created_at: "2026-10-15T10:00:00Z", created_by: "u1" }),
    call({ id: "e", job_id: "j3", stage: "after_primary", outcome: "no_answer", created_at: "2026-08-01T10:00:00Z", created_by: "u1" }),
    call({ id: "f", job_id: "j3", stage: "after_primary", outcome: "all_good", created_at: "2026-08-02T10:00:00Z", deleted_at: "2026-08-03T10:00:00Z" }),
  ];

  it("groups calls by job with the closing outcome as the result", () => {
    const { items } = buildCallJournal(jobs, calls);
    expect(items.map((e) => [e.jobId, e.result, e.calls.length])).toEqual([["j2", "complaint", 1], ["j1", "agreed", 3], ["j3", "pending", 1]]);
    expect(items[1].rating).toBe(5);
  });

  it("filters by stage, result, author and period with counts per chip", () => {
    expect(buildCallJournal(jobs, calls, { stage: "after_primary" }).items.map((e) => e.jobId)).toEqual(["j1", "j3"]);
    expect(buildCallJournal(jobs, calls, { result: "pending" }).items.map((e) => e.jobId)).toEqual(["j3"]);
    expect(buildCallJournal(jobs, calls, { authorId: "u2" }).items.map((e) => e.jobId)).toEqual(["j1"]);
    const recent = buildCallJournal(jobs, calls, { sinceIso: "2026-10-01", stage: "after_primary" });
    expect(recent.items.map((e) => e.jobId)).toEqual(["j1"]);
    expect(recent.counts.stage).toEqual({ all: 2, after_primary: 1, after_secondary: 1 });
    expect(recent.counts.result.agreed).toBe(1);
  });
});
