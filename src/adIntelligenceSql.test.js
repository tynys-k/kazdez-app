import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "2026-09-17_ad_intelligence.sql"), "utf8");

describe("advertising intelligence schema", () => {
  it("stores account, asset, daily/hourly fact and promotion separately", () => {
    for (const table of ["ad_accounts", "ad_assets", "ad_metrics", "ad_promotions"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("unique(asset_id,metric_date,hour_slot)");
    expect(sql).toContain("check (ended_on >= started_on)");
  });

  it("only finance editors can mutate advertising facts", () => {
    expect(sql.match(/create policy ad_[a-z_]+_write[\s\S]*?action\.finance_edit/g)).toHaveLength(4);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
