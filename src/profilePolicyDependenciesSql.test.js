import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_profile_policy_direct_dependencies.sql"),
  "utf8",
);

describe("direct profile policy dependency migration", () => {
  it("moves legacy role checks behind a security-definer helper", () => {
    expect(sql).toMatch(/create or replace function public\.kd_has_role\(allowed_roles text\[\]\)/i);
    expect(sql).toMatch(/security definer\s+set search_path = pg_catalog, public/i);
    expect(sql.match(/alter policy /gi)).toHaveLength(17);
  });

  it("does not reproduce direct profile subqueries inside policies", () => {
    const policySection = sql.slice(sql.indexOf("alter policy"));
    expect(policySection).not.toMatch(/from\s+public?\.?profiles/i);
    expect(policySection).not.toMatch(/from\s+profiles/i);
  });

  it("revokes authorization internals only after replacing every known dependency", () => {
    const lastPolicy = sql.lastIndexOf("alter policy");
    const revoke = sql.indexOf("revoke select on table public.profiles");
    expect(revoke).toBeGreaterThan(lastPolicy);
    expect(sql).toContain("grant select (id) on table public.profiles to authenticated");
  });
});
