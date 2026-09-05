import { describe, expect, it, vi } from "vitest";
import { attachReportChemicals, createSourceLoader, fetchAllRows, mergeLoadWarnings } from "./dataLoading";

describe("loading under network failures", () => {
  it("keeps successful sources when another request throws or returns a database error", async () => {
    const load = createSourceLoader();
    const results = await load([
      { key: "jobs", run: () => ({ data: [{ id: "job" }] }) },
      { key: "cash", run: () => { throw new Error("offline"); } },
      { key: "stock", run: () => ({ data: [{ id: "partial" }], error: { message: "permission denied" } }) },
      { key: "missing", run: () => ({ data: null }) },
    ]);
    expect(results.jobs.data).toEqual([{ id: "job" }]);
    expect(results.cash.error.message).toBe("offline");
    expect(results.stock.data).toBeNull();
    expect(results.missing.error).toBeTruthy();
  });

  it("discards a stale response even if it finishes last", async () => {
    let finish;
    const load = createSourceLoader();
    const first = load([{ key: "jobs", run: () => new Promise((resolve) => { finish = resolve; }) }]);
    await Promise.resolve();
    const second = await load([{ key: "jobs", run: () => ({ data: [{ id: "new" }] }) }]);
    finish({ data: [{ id: "old" }] });
    expect(second.jobs.data[0].id).toBe("new");
    expect(await first).toEqual({});
  });

  it("a partial refresh clears only warnings it actually rechecked", () => {
    const warnings = mergeLoadWarnings(["Заявки: old", "Склад: old"], [
      { key: "jobs", label: "Заявки" }, { key: "stock", label: "Склад" },
    ], { jobs: { data: [], error: null } });
    expect(warnings).toEqual(["Склад: old"]);
  });

  it("joins report lines without losing empty jobs or numeric identifiers", () => {
    expect(attachReportChemicals([{ id: 1 }, { id: 2 }], [{ job_id: "1", amount: 10 }]))
      .toEqual([{ id: 1, chemicals: [{ job_id: "1", amount: 10 }] }, { id: 2, chemicals: [] }]);
  });
});

function fakeClient(pages) {
  const query = { select: vi.fn(() => query), order: vi.fn(() => query), range: vi.fn() };
  pages.forEach((page) => query.range.mockResolvedValueOnce(page));
  return { from: vi.fn(() => query), query };
}

describe("paginated history", () => {
  it("continues when the server returns less than the requested page size", async () => {
    const client = fakeClient([{ data: [{ id: 1 }] }, { data: [{ id: 2 }] }, { data: [] }]);
    expect(await fetchAllRows(client, "jobs")).toEqual({ data: [{ id: 1 }, { id: 2 }], error: null });
    expect(client.query.range.mock.calls).toEqual([[0, 999], [1, 1000], [2, 1001]]);
    expect(client.query.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("does not expose partial history as complete after a later page fails", async () => {
    const client = fakeClient([{ data: [{ id: 1 }] }, { error: { message: "network" } }]);
    expect(await fetchAllRows(client, "jobs")).toEqual({ data: null, error: { message: "network" } });
  });

  it("adds a unique tie-breaker to date ordering", async () => {
    const client = fakeClient([{ data: [] }]);
    await fetchAllRows(client, "money_moves", { column: "move_date", ascending: false });
    expect(client.query.order.mock.calls).toEqual([["move_date", { ascending: false }], ["id", { ascending: true }]]);
  });

  it("reports the safety cap instead of silently truncating", async () => {
    const client = fakeClient([{ data: [{ id: 1 }, { id: 2 }] }]);
    const result = await fetchAllRows(client, "jobs", null, 1000, 1);
    expect(result.data).toBeNull();
    expect(result.error.message).toContain("Слишком много");
  });
});
