import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_profile_policy_security_definer.sql"),
  "utf8",
);

describe("profile policy security-definer migration", () => {
  it("preserves the production permission logic instead of redefining it", () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.(is_admin|kd_has_permission)/i);
    expect(migration).toContain("alter function public.is_admin() security definer");
    expect(migration).toContain("alter function public.kd_has_permission(text) security definer");
  });

  it("pins a safe search path for both privileged functions", () => {
    expect(migration.match(/set search_path = public, pg_temp/g)).toHaveLength(2);
  });

  it("removes browser access to authorization internals", () => {
    expect(migration).toContain("revoke select on table public.profiles from anon, authenticated");
    expect(migration).toContain("grant select (id) on table public.profiles to authenticated");
    expect(migration).not.toMatch(/grant select \([^)]*(role|is_active|access_overrides|branch_id)/i);
  });
});
