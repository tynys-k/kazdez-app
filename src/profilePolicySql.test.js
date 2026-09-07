import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_profile_policy_security_definer.sql"),
  "utf8",
);
const compatibilityRestore = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_profile_policy_compatibility_restore.sql"),
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

  it("keeps only the service columns required by legacy production policies", () => {
    expect(migration).toContain("revoke select on table public.profiles from anon, authenticated");
    expect(migration).toMatch(/grant select \(id, role, is_active, access_overrides, branch_id\)/i);
    expect(compatibilityRestore).toMatch(/grant select \(id, role, is_active, access_overrides, branch_id\)/i);
    expect(`${migration}\n${compatibilityRestore}`).not.toMatch(/grant select \([^)]*(salary|phone|cash_opening)/i);
  });
});
