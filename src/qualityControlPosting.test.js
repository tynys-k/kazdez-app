import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_QUALITY_CONTROL_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_QUALITY_CONTROL_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");

describe("atomic quality control", () => {
  it("keeps one quality result per job", () => {
    expect(sql).toMatch(/unique index if not exists quality_checks_job_id_key/i);
    expect(sql).toContain("Для одной заявки найдено несколько проверок качества");
  });

  it("locks the job before changing related records", () => {
    expect(sql).toMatch(/from public\.jobs[\s\S]*where id = p_job_id[\s\S]*for update/i);
  });

  it("upserts quality and starts a repeat in one function", () => {
    expect(sql).toMatch(/function public\.save_quality_check_atomic/i);
    expect(sql).toMatch(/update public\.quality_checks[\s\S]*insert into public\.quality_checks[\s\S]*update public\.jobs/i);
    expect(sql).toMatch(/repeat_state = 'on_repeat'[\s\S]*repeat_since = now\(\)/i);
  });

  it("validates result, rating and user role", () => {
    expect(sql).toContain("('positive', 'repeat', 'complaint', 'no_answer')");
    expect(sql).toMatch(/v_rating < 1 or v_rating > 5/i);
    expect(sql).toMatch(/kd_has_role\(array\['admin', 'manager'\]\)/i);
  });

  it("blocks the old split-write path", () => {
    expect(sql).toMatch(/revoke insert, update on table public\.quality_checks from authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.save_quality_check_atomic[\s\S]*from public, anon/i);
  });

  it("uses only the atomic RPC from the current client", () => {
    expect(app).toMatch(/async function saveQualityCheck[\s\S]{0,500}supabase\.rpc\(rpcName/i);
    expect(app).not.toMatch(/async function saveQualityCheck[\s\S]{0,1200}supabase\.from\("quality_checks"\)/i);
    expect(app).toContain("ATOMIC_QUALITY_CONTROL_MIGRATION");
  });
});
