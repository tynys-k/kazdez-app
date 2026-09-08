import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_STOCK_RECEIPTS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_STOCK_RECEIPTS_MIGRATION), "utf8");

describe("atomic stock receipts", () => {
  it("adds a unique retry key to purchase history", () => {
    expect(sql).toMatch(/add column if not exists request_id uuid/i);
    expect(sql).toMatch(/unique index if not exists chemical_purchases_request_id_key/i);
  });

  it("creates a new chemical and its initial purchase in one transaction", () => {
    expect(sql).toMatch(/function public\.create_chemical_with_stock_atomic/i);
    expect(sql).toMatch(/insert into public\.chemicals[\s\S]*insert into public\.chemical_purchases/i);
  });

  it("locks an existing chemical before incrementing its stock", () => {
    expect(sql).toMatch(/from public\.chemicals where id = p_chemical_id for update/i);
    expect(sql).toMatch(/purchased_ml = coalesce\(v_chemical\.purchased_ml, 0\) \+ p_amount/i);
  });

  it("stores supplier, batch and expiry with the purchase", () => {
    expect(sql).toMatch(/chemical_id, purchase_date, amount, price_per_liter, supplier,[\s\S]*batch_no, expires_on/i);
    expect(sql).toMatch(/p_expires_on < p_purchase_date/i);
  });

  it("reconciles exact retries and rejects conflicting reuse", () => {
    expect(sql.match(/where request_id = p_request_id for update/g)).toHaveLength(2);
    expect(sql.match(/errcode = '23505'/g)).toHaveLength(2);
  });

  it("requires an active stock user and blocks anonymous execution", () => {
    expect(sql.match(/coalesce\(public\.kd_account_active\(\), false\)/g)).toHaveLength(2);
    expect(sql.match(/kd_has_permission\('action\.stock_edit'\)/g)).toHaveLength(2);
    expect(sql).toMatch(/revoke all on function public\.post_chemical_purchase_atomic[\s\S]*from public, anon/i);
  });
});
