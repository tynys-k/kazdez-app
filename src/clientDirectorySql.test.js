import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/2026-09-12_client_directory.sql"), "utf8");

describe("client directory migration", () => {
  it("adds company identity fields to the canonical client", () => {
    expect(sql).toMatch(/clients add column if not exists client_type/i);
    expect(sql).toMatch(/clients add column if not exists legal_name/i);
    expect(sql).toMatch(/clients add column if not exists bin_iin/i);
  });

  it("stores contacts, addresses and attachments as linked records", () => {
    expect(sql).toMatch(/create table if not exists public\.client_contacts/i);
    expect(sql).toMatch(/create table if not exists public\.client_addresses/i);
    expect(sql).toMatch(/create table if not exists public\.client_attachments/i);
    expect(sql.match(/client_id uuid not null references public\.clients\(id\) on delete cascade/gi)).toHaveLength(3);
  });

  it("keeps client files private and bounded", () => {
    expect(sql).toMatch(/values \('client-files', 'client-files', false/i);
    expect(sql).toMatch(/26214400/);
    expect(sql).toMatch(/bucket_id = 'client-files'/i);
  });

  it("saves the profile and its child records atomically", () => {
    expect(sql).toMatch(/function public\.save_client_profile_atomic/i);
    expect(sql).toMatch(/delete from public\.client_contacts where client_id=v_id/i);
    expect(sql).toMatch(/delete from public\.client_addresses where client_id=v_id/i);
    expect(sql).toMatch(/grant execute on function public\.save_client_profile_atomic/i);
  });
});
