import { describe, expect, it, vi } from "vitest";
import { insertJobWithBranchFallback, isMissingJobsBranchColumn } from "./jobPersistence";

function clientWith(results) {
  const single = vi.fn();
  results.forEach((result) => single.mockResolvedValueOnce(result));
  const query = { insert: vi.fn(() => query), select: vi.fn(() => query), single };
  return { client: { from: vi.fn(() => query) }, query };
}

describe("jobs.branch_id schema compatibility", () => {
  it("recognizes the PostgREST schema-cache error", () => {
    expect(isMissingJobsBranchColumn({
      code: "PGRST204",
      message: "Could not find the 'branch_id' column of 'jobs' in the schema cache",
    })).toBe(true);
  });

  it("retries once without branch_id when an older schema rejects it", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'branch_id' column of 'jobs' in the schema cache" };
    const { client, query } = clientWith([{ data: null, error: missing }, { data: { id: "job-1" }, error: null }]);
    const result = await insertJobWithBranchFallback(client, { address: "A", branch_id: "branch-1" });

    expect(result).toMatchObject({ data: { id: "job-1" }, error: null, branchOmitted: true });
    expect(query.insert.mock.calls).toEqual([
      [{ address: "A", branch_id: "branch-1" }],
      [{ address: "A" }],
    ]);
  });

  it("does not retry an ambiguous network or permission failure", async () => {
    const error = { message: "Failed to fetch" };
    const { client, query } = clientWith([{ data: null, error }]);
    const result = await insertJobWithBranchFallback(client, { address: "A", branch_id: "branch-1" });

    expect(result).toMatchObject({ error, branchOmitted: false });
    expect(query.insert).toHaveBeenCalledTimes(1);
  });

  it("returns the original successful insert without a retry", async () => {
    const { client, query } = clientWith([{ data: { id: "job-1" }, error: null }]);
    const result = await insertJobWithBranchFallback(client, { address: "A", branch_id: "branch-1" });

    expect(result.branchOmitted).toBe(false);
    expect(query.insert).toHaveBeenCalledTimes(1);
  });
});
