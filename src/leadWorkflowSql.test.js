import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/2026-09-09_lead_work_queue.sql", import.meta.url), "utf8");

describe("lead work queue migration", () => {
  it("fails clearly when the shared access functions are missing", () => {
    expect(sql).toContain("to_regprocedure('public.kd_account_active()')");
    expect(sql).toContain("to_regprocedure('public.is_admin()')");
    expect(sql).toContain("to_regprocedure('public.kd_has_role(text[])')");
  });

  it("adds ownership, response evidence and a concrete next action", () => {
    for (const column of ["owner_id", "first_response_at", "next_action", "next_action_at", "lost_reason"]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}`));
    }
  });

  it("backfills old open leads into the urgent queue", () => {
    expect(sql).toContain("'Связаться с клиентом'");
    expect(sql).toMatch(/next_action_at = coalesce\(l\.next_action_at, l\.updated_at, l\.created_at, now\(\)\)/);
  });

  it("keeps old open tabs compatible through a server trigger", () => {
    expect(sql).toContain("create trigger kd_prepare_lead_workflow");
    expect(sql).toMatch(/NEW\.next_action := coalesce/);
    expect(sql).toMatch(/NEW\.next_action_at := coalesce/);
  });

  it("clears an obsolete loss reason when a lead is won or converted", () => {
    expect(sql).toMatch(/if NEW\.converted_job_id is not null then\s+NEW\.lost_reason := null;/);
    expect(sql).toMatch(/elsif v_is_final then\s+NEW\.lost_reason := null;/);
  });

  it("locks a lead while recording a touch and its next promise", () => {
    expect(sql).toContain("function public.touch_lead_atomic");
    expect(sql).toMatch(/where id = p_lead_id for update/i);
    expect(sql).toMatch(/first_response_at = coalesce\(first_response_at, now\(\)\)/);
  });

  it("rejects past promises and closed leads", () => {
    expect(sql).toMatch(/p_next_action_at <= now\(\)/);
    expect(sql).toContain("Закрытому лиду нельзя назначить следующее касание");
  });

  it("limits the RPC to active administrators and managers", () => {
    expect(sql).toContain("kd_account_active()");
    expect(sql).toContain("kd_has_role(array['admin', 'manager'])");
    expect(sql).toContain("revoke all on function public.touch_lead_atomic(uuid, text, timestamptz) from public, anon");
    expect(sql).toContain("set search_path = pg_catalog, public");
  });
});
