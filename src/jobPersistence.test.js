import { describe, expect, it, vi } from "vitest";
import { insertCompatibleJob, missingJobsColumn } from "./jobPersistence";

const missing = (column, table = "jobs") => ({
  code: "PGRST204",
  message: `Could not find the '${column}' column of '${table}' in the schema cache`,
});

function clientWith(results) {
  const single = vi.fn();
  results.forEach((result) => single.mockResolvedValueOnce(result));
  const query = { insert: vi.fn(() => query), select: vi.fn(() => query), single };
  return { client: { from: vi.fn(() => query) }, query };
}

describe("jobs schema compatibility", () => {
  it("extracts only a jobs column from a PostgREST schema-cache error", () => {
    expect(missingJobsColumn(missing("order_id"))).toBe("order_id");
    expect(missingJobsColumn(missing("order_id", "orders"))).toBeNull();
    expect(missingJobsColumn({ message: "Failed to fetch" })).toBeNull();
  });

  it("removes consecutive unsupported columns until an older schema accepts the job", async () => {
    const { client, query } = clientWith([
      { data: null, error: missing("branch_id") },
      { data: null, error: missing("order_id") },
      { data: { id: "job-1" }, error: null },
    ]);
    const result = await insertCompatibleJob(client, { address: "A", branch_id: "branch-1", order_id: "order-1" });

    expect(result).toMatchObject({ data: { id: "job-1" }, error: null, omittedColumns: ["branch_id", "order_id"] });
    expect(query.insert.mock.calls).toEqual([
      [{ address: "A", branch_id: "branch-1", order_id: "order-1" }],
      [{ address: "A", order_id: "order-1" }],
      [{ address: "A" }],
    ]);
  });

  it("does not retry an ambiguous network or permission failure", async () => {
    const error = { message: "Failed to fetch" };
    const { client, query } = clientWith([{ data: null, error }]);
    const result = await insertCompatibleJob(client, { address: "A", order_id: "order-1" });

    expect(result).toMatchObject({ error, omittedColumns: [] });
    expect(query.insert).toHaveBeenCalledTimes(1);
  });

  it("does not retry a missing column that was not sent", async () => {
    const error = missing("unexpected_column");
    const { client, query } = clientWith([{ data: null, error }]);
    const result = await insertCompatibleJob(client, { address: "A" });

    expect(result).toMatchObject({ error, omittedColumns: [] });
    expect(query.insert).toHaveBeenCalledTimes(1);
  });

  it("returns the original successful insert without a retry", async () => {
    const { client, query } = clientWith([{ data: { id: "job-1" }, error: null }]);
    const result = await insertCompatibleJob(client, { address: "A", order_id: "order-1" });

    expect(result.omittedColumns).toEqual([]);
    expect(query.insert).toHaveBeenCalledTimes(1);
  });
});
