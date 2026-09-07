import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_job_proof_access_lockdown.sql"),
  "utf8",
);

describe("job proof access lockdown migration", () => {
  it("uses one protected server-side access decision", () => {
    expect(sql).toMatch(/function public\.kd_can_access_job_proof\(p_job_id text\)[\s\S]*security definer/i);
    expect(sql).toContain("coalesce(public.kd_account_active(), false)");
    expect(sql).toContain("j.assigned_to = auth.uid()");
    expect(sql).toContain("public.kd_has_permission('action.jobs_edit')");
    expect(sql).toContain("revoke all on function public.kd_can_access_job_proof(text) from public, anon");
  });

  it("removes open access from every job_proofs write and read policy", () => {
    expect(sql).not.toMatch(/job_proofs[\s\S]{0,180}(using|check)\s*\(true\)/i);
    expect(sql.match(/public\.kd_can_access_job_proof\(job_id::text\)/g)).toHaveLength(6);
    expect(sql).toMatch(/create policy "job_proofs access scope"[\s\S]*as restrictive for all/i);
  });

  it("keeps the bucket private and scopes signed reads and uploads by job folder", () => {
    expect(sql).toMatch(/insert into storage\.buckets[\s\S]*'job-proofs', 'job-proofs', false[\s\S]*do update set public = false/i);
    expect(sql.match(/public\.kd_can_access_job_proof\(\(storage\.foldername\(name\)\)\[1\]\)/g)).toHaveLength(4);
    expect(sql).toMatch(/create policy "job-proofs access scope"[\s\S]*as restrictive for all/i);
    expect(sql).toMatch(/create policy "job-proofs read"[\s\S]*bucket_id = 'job-proofs'/i);
    expect(sql).toMatch(/create policy "job-proofs upload"[\s\S]*bucket_id = 'job-proofs'/i);
  });
});
