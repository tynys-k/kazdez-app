import { describe, expect, it } from "vitest";
import { clientTypeLookup, contractDraftFromJob, contractHistorySummary, contractJobs, contractVisitState, looksLikeLegalName, subscriptionCandidates, subscriptionIntervalLabel, subscriptionLookup } from "./subscriptionHistory";

describe("subscription history", () => {
  it("names common periods in plain language", () => {
    expect(subscriptionIntervalLabel(7)).toBe("Еженедельно");
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

  it("attaches historical unlinked jobs by normalized client phone", () => {
    const contract = { id: "c1", phone: "+7 747 565 8082" };
    const rows = contractJobs(contract, [
      { id: "historical", client_phone: "8 (747) 565-80-82", status: "done", scheduled_date: "2026-08-01" },
      { id: "other-phone", client_phone: "+7 701 111 22 33", status: "done", scheduled_date: "2026-08-02" },
      { id: "other-contract", service_contract_id: "c2", client_phone: "+7 747 565 8082", status: "done", scheduled_date: "2026-08-03" },
    ]);
    expect(rows.map((job) => job.id)).toEqual(["historical"]);
  });

  it("includes old phone-matched visits in subscriber totals and revenue", () => {
    const contract = { id: "c1", phone: "+7 747 565 8082", active: true, next_service_date: "2026-10-01" };
    const summary = contractHistorySummary(contract, [
      { id: "old", client_phone: "87475658082", status: "done", scheduled_date: "2026-09-10", report_paid: 20000 },
    ], "2026-09-12");
    expect(summary).toMatchObject({ total: 1, done: 1, revenue: 20000 });
    expect(summary.lastDone.id).toBe("old");
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

describe("legal-entity subscription candidates", () => {
  const clients = [
    { id: "k1", phone: "+7 701 111 1111", phone_key: "7011111111", client_type: "company", legal_name: "ТОО Посиделки" },
    { id: "k2", phone: "+7 702 222 2222", phone_key: "7022222222", client_type: "person", name: "Айгуль" },
  ];

  it("recognises legal forms only as separate uppercase words", () => {
    expect(looksLikeLegalName("ТОО Red Dragon KZ")).toBe(true);
    expect(looksLikeLegalName('ИП "GO BAR"')).toBe(true);
    expect(looksLikeLegalName("Типография")).toBe(false);
    expect(looksLikeLegalName("Айгуль")).toBe(false);
  });

  it("groups done legal jobs by client and skips people, open jobs and existing subscribers", () => {
    const jobs = [
      { id: "a", client_id: "k1", client_phone: "87011111111", status: "done", scheduled_date: "2026-08-01", report_paid: 15000, address: "Старый адрес" },
      { id: "b", client_phone: "+77011111111", status: "done", scheduled_date: "2026-09-01", report_paid: 20000, address: "Макатаева 127", pest: "Тараканы" },
      { id: "c", client_id: "k2", client_phone: "87022222222", status: "done", scheduled_date: "2026-09-02" },
      { id: "d", client_phone: "87033333333", contact_name: "ИП Сушист", status: "new", scheduled_date: "2026-09-03" },
      { id: "e", client_phone: "87044444444", contact_name: "ТОО Глория", status: "done", scheduled_date: "2026-09-04" },
    ];
    const contracts = [{ id: "s1", phone: "+7 704 444 4444" }];
    const rows = subscriptionCandidates({ jobs, clients, contracts });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "c:k1", name: "ТОО Посиделки", done: 2, revenue: 35000, address: "Макатаева 127", lastDate: "2026-09-01" });
  });

  it("drafts a monthly contract from the last visit without a past date", () => {
    const job = { client_phone: "+77011111111", address: "Макатаева 127", pest: "Тараканы", report_paid: 20000, scheduled_date: "2026-08-01" };
    expect(contractDraftFromJob(job, clients[0], "2026-09-21")).toMatchObject({ client_id: "k1", client_name: "ТОО Посиделки", price: 20000, interval_days: 30, next_service_date: "2026-09-21" });
    expect(contractDraftFromJob({ ...job, scheduled_date: "2026-09-10" }, clients[0], "2026-09-21").next_service_date).toBe("2026-10-10");
  });

  it("tells which jobs already belong to a subscriber and which are legal", () => {
    const isSub = subscriptionLookup([{ id: "s1", client_id: "k1" }], clients);
    expect(isSub({ client_phone: "87011111111" })).toBe(true);
    expect(isSub({ client_phone: "87022222222" })).toBe(false);
    const typeOf = clientTypeLookup(clients);
    expect(typeOf({ client_id: "k1" })).toBe("company");
    expect(typeOf({ client_id: "k2" })).toBe("person");
    expect(typeOf({ contact_name: "ТОО Новый" })).toBe("company");
  });
});
