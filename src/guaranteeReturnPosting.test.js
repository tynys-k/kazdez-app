import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATOMIC_GUARANTEE_RETURNS_MIGRATION, createFinancialRequestId } from "./financialPosting";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "..", "supabase", ATOMIC_GUARANTEE_RETURNS_MIGRATION), "utf8");

describe("atomic tender guarantee returns", () => {
  it("creates stable-format request identifiers", () => {
    const first = createFinancialRequestId();
    const second = createFinancialRequestId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });

  it("stores an idempotency key with a unique index", () => {
    expect(sql).toMatch(/add column if not exists request_id uuid/i);
    expect(sql).toMatch(/create unique index if not exists guarantee_returns_request_id_key/i);
    expect(sql).toMatch(/where request_id is not null/i);
  });

  it("locks the guarantee and calculates the remaining amount on the server", () => {
    expect(sql).toMatch(/from public\.tender_guarantees[\s\S]*for update/i);
    expect(sql).toMatch(/select coalesce\(sum\(r\.amount\), 0\)/i);
    expect(sql).toMatch(/p_amount > v_guarantee\.amount - v_returned/i);
  });

  it("creates the return and account movement in one transaction", () => {
    expect(sql).toMatch(/insert into public\.guarantee_returns/i);
    expect(sql).toMatch(/insert into public\.money_moves/i);
    expect(sql).toMatch(/'income', p_amount, p_returned_on/i);
    expect(sql).toMatch(/'tender_return', v_return_id/i);
  });

  it("checks access and exposes only the atomic API", () => {
    expect(sql).toMatch(/kd_has_permission\('action\.tenders_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.post_tender_guarantee_return_atomic[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.post_tender_guarantee_return_atomic[\s\S]*to authenticated, service_role/i);
  });

  it("protects retries and duplicate derived movements", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('guarantee_return:'/i);
    expect(sql).toMatch(/NEW\.source in \('paperwork', 'tender_pledge', 'tender_return'\)/i);
    expect(sql).toMatch(/where request_id = p_request_id[\s\S]*for update/i);
  });
});
