import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/2026-09-09_lead_activity_timeline.sql", import.meta.url), "utf8");

describe("lead activity timeline migration", () => {
  it("creates an indexed timeline attached to leads", () => {
    expect(sql).toContain("create table if not exists public.lead_activities");
    expect(sql).toContain("lead_id uuid not null references public.leads(id) on delete cascade");
    expect(sql).toContain("lead_activities_lead_timeline_idx");
  });

  it("separates contact kind, outcome, comment, author and time", () => {
    for (const column of ["kind text not null", "outcome text not null", "comment text", "occurred_at timestamptz", "created_by uuid"]) {
      expect(sql).toContain(column);
    }
  });

  it("protects direct writes and exposes only an atomic RPC", () => {
    expect(sql).toContain("alter table public.lead_activities enable row level security");
    expect(sql).toContain("revoke all on table public.lead_activities from public, anon, authenticated");
    expect(sql).toContain("function public.record_lead_activity_atomic");
    expect(sql).toMatch(/where id = p_lead_id for update/i);
  });

  it("requires a concrete next promise after a customer contact", () => {
    expect(sql).toContain("if v_kind <> 'note' then");
    expect(sql).toContain("Укажи следующий шаг и его срок");
    expect(sql).toContain("Следующий шаг должен быть назначен на будущее");
  });

  it("does not mistake a missed call for a first response", () => {
    expect(sql).toMatch(/v_outcome <> 'no_answer'.+coalesce\(first_response_at, v_occurred_at\)/s);
  });

  it("records stage changes regardless of which client writes them", () => {
    expect(sql).toContain("create trigger kd_log_lead_lifecycle");
    expect(sql).toContain("NEW.stage_id is distinct from OLD.stage_id");
    expect(sql).toContain("'stage_change', 'stage_changed'");
  });

  it("backfills only factual legacy events idempotently", () => {
    expect(sql).toContain("'lead-created:' || l.id::text");
    expect(sql).toContain("'lead-note:' || l.id::text");
    expect(sql).toContain("on conflict (legacy_key) do nothing");
  });
});
