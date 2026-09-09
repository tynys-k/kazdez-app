import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/2026-09-09_fix_quality_check_job_id.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

describe("quality control legacy job id compatibility", () => {
  it("reads the real database type instead of assuming uuid", () => {
    expect(sql).toContain("a.atttypid::regtype");
    expect(sql).toContain("'public.quality_checks'::regclass");
  });

  it("keeps the indexed uuid path", () => {
    expect(sql).toContain("v_compare_expr := 'job_id = p_job_id'");
    expect(sql).toContain("v_insert_expr := 'p_job_id'");
  });

  it("casts both comparison and insert for a legacy text job_id", () => {
    expect(sql).toContain("v_compare_expr := 'job_id::text = p_job_id::text'");
    expect(sql).toContain("v_insert_expr := 'p_job_id::text'");
  });

  it("preserves validation, row locking and repeat creation", () => {
    expect(sql).toMatch(/from public\.jobs[\s\S]*where id = p_job_id[\s\S]*for update/i);
    expect(sql).toContain("('positive', 'repeat', 'complaint', 'no_answer')");
    expect(sql).toMatch(/repeat_state = 'on_repeat'[\s\S]*repeat_since = now\(\)/i);
  });

  it("shows a human instruction if an old server function is still installed", () => {
    expect(app).toContain("QUALITY_CONTROL_JOB_ID_FIX_MIGRATION");
    expect(app).toMatch(/operator does not exist:[^\n]*text[^\n]*uuid/i);
  });
});
