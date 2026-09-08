import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_CHEMICAL_SALES_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_CHEMICAL_SALES_MIGRATION), "utf8");

describe("atomic chemical sales", () => {
  it("gives sales a unique retry key", () => {
    expect(sql).toMatch(/alter table public\.chemical_sales add column if not exists request_id uuid/i);
    expect(sql).toMatch(/unique index if not exists chemical_sales_request_id_key/i);
  });

  it("links each employee deduction to exactly one sale", () => {
    expect(sql).toMatch(/add column if not exists chemical_sale_id uuid references public\.chemical_sales\(id\)/i);
    expect(sql).toMatch(/unique index if not exists inventory_adjustments_chemical_sale_id_key/i);
  });

  it("creates the sale and employee deduction in one function", () => {
    expect(sql).toMatch(/function public\.save_chemical_sale_atomic/i);
    expect(sql).toMatch(/insert into public\.chemical_sales[\s\S]*insert into public\.inventory_adjustments/i);
  });

  it("updates or removes the linked deduction when the sale changes", () => {
    expect(sql).toMatch(/delete from public\.inventory_adjustments where id = v_adjustment\.id/i);
    expect(sql).toMatch(/update public\.inventory_adjustments set[\s\S]*amount_delta = -p_amount/i);
  });

  it("protects paid and unlinked historical sales", () => {
    expect(sql).toContain("Оплаченная продажа защищена от изменения");
    expect(sql).toContain("Старая продажа не связана со списанием сотрудника");
  });

  it("protects sale dates after an accounting period is closed", () => {
    expect(sql).toMatch(/create trigger kd_closed_period_chemical_sales[\s\S]*kd_enforce_open_period\('sold_on', 'created_at'\)/i);
  });

  it("reconciles exact retries and rejects conflicting reuse", () => {
    expect(sql).toMatch(/chemical_sale_request:/i);
    expect(sql).toMatch(/where request_id = p_request_id for update/i);
    expect(sql).toMatch(/errcode = '23505'/i);
  });

  it("requires an active authorized user and blocks direct legacy writes", () => {
    expect(sql).toMatch(/coalesce\(public\.kd_account_active\(\), false\)/i);
    expect(sql).toMatch(/revoke all on function public\.save_chemical_sale_atomic[\s\S]*from public, anon/i);
    expect(sql).toMatch(/revoke insert, update, delete on public\.chemical_sales from authenticated/i);
  });
});
