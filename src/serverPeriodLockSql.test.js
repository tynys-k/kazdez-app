import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_server_period_lock.sql"),
  "utf8",
);

describe("server period lock migration", () => {
  it("reads the close boundary on the server and cannot be invoked by API roles", () => {
    expect(sql).toMatch(/function public\.kd_books_closed_until\(\)[\s\S]*security definer/i);
    expect(sql).toContain("where s.key = 'books_closed_until'");
    expect(sql).toContain("revoke all on function public.kd_enforce_open_period() from public, anon, authenticated");
  });

  it("blocks both the original and replacement date of a closed operation", () => {
    expect(sql).toContain("v_old_date <= v_closed_until");
    expect(sql).toContain("v_new_date <= v_closed_until");
    expect(sql).toContain("errcode = '55000'");
  });

  it("installs the guard on every verified one-date operational ledger", () => {
    const tables = [
      "jobs", "opex", "money_moves", "tech_expenses", "cash_adjustments",
      "inventory_adjustments", "chemical_purchases", "mkt_topups",
    ];
    expect(sql.match(/create trigger kd_closed_period_/g)).toHaveLength(tables.length);
    tables.forEach((table) => expect(sql).toContain(`on public.${table}`));
  });
});
