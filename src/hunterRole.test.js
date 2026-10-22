import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE_DEFINITIONS, effectivePermissions } from "./shared";
import { HUNTER_ROLE_MIGRATION } from "./workflows/hunterFunnelModel";

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("роль «Хантер»", () => {
  it("открывает только вкладку «Лиды»", () => {
    const permissions = effectivePermissions("hunter");
    expect([...permissions].sort()).toEqual(["action.leads_edit", "tab.leads"]);
    expect(permissions.has("tab.today")).toBe(false);
    expect(ROLE_DEFINITIONS.hunter.label).toBe("Хантер");
  });

  it("роли совпадают в интерфейсе, функции создания аккаунтов и базе", () => {
    const appRoles = Object.keys(ROLE_DEFINITIONS).filter((role) => role !== "admin").sort();
    const edge = read("supabase", "functions", "admin-users", "index.ts").match(/const roles = new Set\(\[([^\]]+)\]\)/)[1];
    expect(edge.match(/"(\w+)"/g).map((s) => s.slice(1, -1)).sort()).toEqual(appRoles);
    const check = read("supabase", HUNTER_ROLE_MIGRATION).match(/check \(role = any \(array\[([^\]]+)\]\)\)/)[1];
    expect(check.match(/'(\w+)'/g).map((s) => s.slice(1, -1)).filter((role) => role !== "admin").sort()).toEqual(appRoles);
  });
});
