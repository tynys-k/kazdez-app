import { describe, expect, it } from "vitest";
import { taskCanComment, taskCanWork, taskOverdue, taskParticipant } from "./taskModel";
import { objectPayload, objectVolume } from "./objectModel";
import { clientStatuses } from "./clientStatusModel";
import { payrollCarryover } from "./payrollCarryoverModel";
import { warehouseBalance, warehouseRevisionDelta } from "./warehouseModel";
import { findContractClients } from "./ContractsRegister";

describe("task membership and deadlines", () => {
  const task = { created_by: "author", assignee_id: "worker", assignee_ids: ["helper"], observer_ids: ["observer"], commenter_ids: ["observer"] };
  it("observers see tasks but cannot perform them", () => { expect(taskParticipant(task, "observer")).toBe(true); expect(taskCanWork(task, "observer")).toBe(false); expect(taskCanWork(task, "helper")).toBe(true); });
  it("enforces comment policies without giving outsiders access", () => {
    expect(taskCanComment({ ...task, comment_policy: "author" }, "worker")).toBe(false);
    expect(taskCanComment({ ...task, comment_policy: "selected" }, "worker")).toBe(false);
    expect(taskCanComment({ ...task, comment_policy: "selected" }, "observer")).toBe(true);
    expect(taskCanComment({ ...task, comment_policy: "selected", commenter_ids: ["outsider"] }, "outsider")).toBe(false);
    expect(taskCanComment({ ...task, comment_policy: "author" }, "author")).toBe(true);
  });
  it("uses deadline time and does not flag done tasks", () => {
    const t = { due_date: "2026-09-14", due_time: "10:00", status: "new" };
    expect(taskOverdue(t, new Date("2026-09-14T09:59:00"))).toBe(false);
    expect(taskOverdue(t, new Date("2026-09-14T10:01:00"))).toBe(true);
    expect(taskOverdue({ ...t, status: "done" }, new Date("2026-09-15"))).toBe(false);
  });
});
describe("contract client search", () => {
  const clients = [
    { id: "1", name: "Виталий", phone: "+7 707 362 2255", bin_iin: "900101300111" },
    { id: "2", name: "Айжан", legal_name: "ТОО Каз Сервис", phone: "+7 701 555 1212", bin_iin: "120340009876" },
  ];
  it("finds by name, organization, phone digits and BIN/IIN", () => {
    expect(findContractClients(clients, "виталий").map((client) => client.id)).toEqual(["1"]);
    expect(findContractClients(clients, "каз сервис").map((client) => client.id)).toEqual(["2"]);
    expect(findContractClients(clients, "701555").map((client) => client.id)).toEqual(["2"]);
    expect(findContractClients(clients, "900101300111").map((client) => client.id)).toEqual(["1"]);
  });
  it("limits an empty result list so the modal never renders hundreds of clients", () => {
    expect(findContractClients(Array.from({ length: 50 }, (_, id) => ({ id })), "")).toHaveLength(20);
  });
});
describe("object measurements", () => {
  it("never converts land to apartment metres or keeps an apartment floor", () => {
    const p = objectPayload({ object_kind: "land", area: 45, floor: 5, object_details: { land_area: "2,5", land_unit: "ha" } });
    expect(p.area).toBeNull(); expect(p.floor).toBe(""); expect(p.object_details.land_area).toBe(2.5);
  });
  it("calculates cubic metres in all input modes", () => {
    expect(objectVolume({ volume_method: "dimensions", length_m: 5, width_m: 4, height_m: 3 })).toBe(60);
    expect(objectVolume({ floor_area_m2: 20, height_m: "2,5" })).toBe(50);
    expect(objectVolume({ volume_method: "manual", volume_m3: 25 })).toBe(25);
    expect(objectVolume({ height_m: 3 })).toBeNull();
  });
  it("clears dimensions no longer relevant and preserves mold separately", () => {
    const p = objectPayload({ object_kind: "apartment", area: 50, object_details: { measurement: "mold", mold_area_m2: 4, land_area: 10, entrance: "3", intercom: "25К" } });
    expect(p.area).toBe(50); expect(p.object_details.mold_area_m2).toBe(4); expect(p.object_details.land_area).toBeUndefined(); expect(p.object_details.intercom).toBe("25К");
  });
  it("rejects invalid measurements", () => { expect(() => objectPayload({ area: -1 })).toThrow(); expect(() => objectPayload({ object_kind: "house", object_details: { rooms: 1.5 } })).toThrow(); });
});
describe("automatic regular client", () => {
  const client = { id: "client", client_labels: ["vip"], blocked: true };
  const job = { client_id: "client", type: "Первичная", status: "done", visit_kind: "primary", visit_no: 1 };
  it("counts only completed primary visits and retains manual statuses", () => {
    const jobs = [job, { ...job, type: "Вторичная" }, { ...job, visit_kind: "guarantee" }, { ...job, visit_no: 2 }, { ...job, status: "new" }];
    expect(clientStatuses(client, jobs, 2)).toEqual({ primaryCount: 1, labels: ["blacklist", "vip"] });
    expect(clientStatuses(client, [...jobs, job], 2).labels).toContain("regular");
  });
});
describe("payroll carryover is not a cash payment", () => {
  const rows = [{ tech_id: "t", from_month: "2026-08", to_month: "2026-09", amount: 5000 }];
  it("clears the original overpayment and reduces the target payment once", () => {
    expect(payrollCarryover(rows, "t", "2026-08").net).toBe(5000);
    expect(payrollCarryover(rows, "t", "2026-09").net).toBe(-5000);
    expect(payrollCarryover(rows, "other", "2026-09").net).toBe(0);
    expect(payrollCarryover(rows, "t", null).net).toBe(0);
  });
});
describe("warehouse conservation", () => {
  const warehouses = [{ id: "u", unallocated: true }, { id: "b" }, { id: "m" }];
  const move = { item_kind: "chemical", item_id: "c", from_warehouse_id: "u", to_warehouse_id: "b", amount: 1000 };
  const balance = (id, moves, available = 5000) => warehouseBalance(warehouses.find((w) => w.id === id), "chemical", "c", moves, available, warehouses);
  it("allocates stock without changing total", () => { expect(balance("u", [move])).toBe(4000); expect(balance("b", [move])).toBe(1000); expect(balance("m", [move])).toBe(0); });
  it("warehouse-to-employee issue does not inflate unallocated balance", () => {
    const issue = { ...move, from_warehouse_id: "b", to_warehouse_id: "u", amount: 300 };
    expect(balance("u", [move, issue], 4700)).toBe(4000); expect(balance("b", [move, issue], 4700)).toBe(700);
  });
  it("records discrepancies separately from purchased quantity", () => {
    const revision = { ...move, from_warehouse_id: null, amount: -200, inventory_delta: -200 };
    expect(warehouseRevisionDelta([move, revision], "c")).toBe(-200);
    expect(balance("u", [move, revision], 4800)).toBe(4000); expect(balance("b", [move, revision], 4800)).toBe(800);
  });
});
