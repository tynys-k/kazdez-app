import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/2026-09-14_employee_hr_fields.sql", import.meta.url), "utf8");

describe("employee HR migration", () => {
  it("adds position and hiring date to profiles", () => {
    expect(sql).toMatch(/add column if not exists job_title text/i);
    expect(sql).toMatch(/add column if not exists hired_on date/i);
  });

  it("saves HR details through an authorized server function", () => {
    expect(sql).toMatch(/create or replace function public\.save_employee_profile_details/i);
    expect(sql).toMatch(/is_admin\(\).*kd_has_permission\('action\.team_manage'\)/is);
    expect(sql).toMatch(/grant execute on function public\.save_employee_profile_details/i);
  });

  it("returns HR fields from the safe profile directory", () => {
    expect(sql).toMatch(/'job_title', p\.job_title, 'hired_on', p\.hired_on/i);
  });
});
