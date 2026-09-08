import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_EQUIPMENT_TRANSFERS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_EQUIPMENT_TRANSFERS_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");

describe("atomic equipment transfers", () => {
  it("links exactly one successor to the source handout", () => {
    expect(sql).toMatch(/add column if not exists transfer_source_id uuid/i);
    expect(sql).toMatch(/unique index if not exists equipment_handouts_transfer_source_key/i);
  });

  it("locks the source and safely returns an exact retry", () => {
    expect(sql).toMatch(/from public\.equipment_handouts[\s\S]*where id = p_handout_id[\s\S]*for update/i);
    expect(sql).toMatch(/if v_existing\.tech_id = p_new_tech_id[\s\S]*return v_existing\.id/i);
  });

  it("creates the new handout and closes the old one in one function", () => {
    expect(sql).toMatch(/function public\.transfer_equipment_atomic/i);
    expect(sql).toMatch(/insert into public\.equipment_handouts[\s\S]*update public\.equipment_handouts[\s\S]*status = 'transferred'/i);
  });

  it("guards transfer integrity even for an old direct client", () => {
    expect(sql).toMatch(/create constraint trigger equipment_transfer_integrity/i);
    expect(sql).toContain("Передача оборудования должна одновременно создать выдачу новому сотруднику");
    expect(sql).toContain("Новая выдача не соответствует передаваемому оборудованию");
  });

  it("requires an active team manager and preserves history", () => {
    expect(sql).toMatch(/kd_account_active\(\)[\s\S]*action\.team_manage/i);
    expect(sql).toMatch(/revoke delete on table public\.equipment_handouts from authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.transfer_equipment_atomic[\s\S]*from public, anon/i);
  });

  it("uses only the atomic RPC from the current client", () => {
    expect(app).toMatch(/async function transferEquipment[\s\S]{0,500}supabase\.rpc\(rpcName/i);
    expect(app).not.toMatch(/async function transferEquipment[\s\S]{0,1200}supabase\.from\("equipment_handouts"\)/i);
    expect(app).toContain("ATOMIC_EQUIPMENT_TRANSFERS_MIGRATION");
  });
});
