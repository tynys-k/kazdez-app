import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const supabaseDir = path.join(process.cwd(), "supabase");
const migration = fs.readFileSync(
  path.join(supabaseDir, "2026-09-09_least_privilege.sql"),
  "utf8",
);

// Определения политик читаются из всех миграций в порядке дат: файлы названы
// датой, поэтому обычная сортировка по имени даёт хронологию. Побеждает
// последнее определение — именно оно и действует в базе.
function policyStatements(text) {
  return [...text.matchAll(/create policy\s+("[^"]+"|[a-z_]+)\s+on\s+public\.([a-z_]+)([\s\S]*?);/gi)]
    .map((m) => ({ name: m[1].replace(/"/g, ""), table: m[2], body: m[3] }));
}

function finalPolicies() {
  const files = fs.readdirSync(supabaseDir).filter((f) => f.endsWith(".sql")).sort();
  const byKey = new Map();
  for (const file of files) {
    const text = fs.readFileSync(path.join(supabaseDir, file), "utf8");
    for (const p of policyStatements(text)) {
      byKey.set(`${p.table}|${p.name}`, { ...p, file });
    }
  }
  return [...byKey.values()];
}

// Чтение открыто всем: политика разрешает select (или all) без условий.
function readsEverything(policy) {
  return /for\s+(select|all)\b/i.test(policy.body)
    && /using\s*\(\s*true\s*\)/i.test(policy.body)
    && !/as\s+restrictive/i.test(policy.body);
}

// Намеренные исключения. Каждое должно быть объяснимо одной фразой, иначе
// список превращается в способ обойти проверку.
const INTENTIONALLY_OPEN = new Set([
  // название филиала и реквизиты нашего же юрлица стоят в каждом акте
  "branches",
]);

describe("область видимости бизнес-таблиц", () => {
  it("ни одна таблица не отдаёт всё содержимое любому вошедшему", () => {
    // Это главная проверка файла. Она следит не за конкретной миграцией, а за
    // правилом: новая таблица с `select ... using (true)` уронит тест, и разговор
    // о том, кто должен её видеть, случится до боевого запуска, а не после утечки.
    const leaking = finalPolicies()
      .filter(readsEverything)
      .map((p) => p.table)
      .filter((t) => !INTENTIONALLY_OPEN.has(t));

    expect([...new Set(leaking)].sort()).toEqual([]);
  });

  it("решение о доступе принимает сервер, а не интерфейс", () => {
    expect(migration).toMatch(/function public\.kd_can_see_job\(p_job uuid\)[\s\S]*security definer/i);
    expect(migration).toMatch(/function public\.kd_can_see_object\(p_object uuid\)[\s\S]*security definer/i);
    expect(migration).toContain("revoke all on function public.kd_can_see_job(uuid) from public, anon");
    expect(migration).toContain("revoke all on function public.kd_can_see_object(uuid) from public, anon");
    // заблокированный аккаунт не видит ничего, даже со своей заявкой
    expect(migration.match(/coalesce\(public\.kd_account_active\(\), false\)/g).length).toBeGreaterThanOrEqual(2);
  });

  it("помощник на заявке приравнен к исполнителю", () => {
    // иначе половина бригады не увидит собственный выезд
    expect(migration).toMatch(/job_helpers h\s+where h\.job_id = p_job and h\.tech_id = auth\.uid\(\)/);
    expect(migration).toMatch(/"job_helpers select"[\s\S]*tech_id = auth\.uid\(\)/);
  });

  it("проверка прав на каждой строке обеспечена индексами", () => {
    // без них ограничение доступа превращается в тормоз на длинных списках
    for (const idx of [
      "jobs_assigned_idx",
      "jobs_object_assigned_idx",
      "jobs_order_assigned_idx",
      "job_helpers_tech_idx",
    ]) {
      expect(migration).toContain(idx);
    }
  });

  it("списки клиентов, объектов и заказов сверяются одним подзапросом", () => {
    // `in (подзапрос)` планировщик выполняет один раз; `exists` пересчитывался бы
    // для каждой строки списка
    expect(migration).toMatch(/clients\.phone_key in \(\s*select public\.kd_phone_key/);
    expect(migration).toMatch(/objects\.id in \(\s*select j\.object_id/);
    expect(migration).toMatch(/orders\.id in \(\s*select j\.order_id/);
  });

  it("клиент приложения не запрашивает таблицы, которых роли не отдадут", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
    const gated = ["price_list", "chemical_purchases", "chemical_sales", "paperwork",
      "paperwork_jobs", "job_discounts"];
    const missing = gated.filter((key) => !app.includes(`{ key: "${key}", when: () =>`));
    expect(missing).toEqual([]);
    // и сама загрузка обязана этот признак учитывать
    expect(app).toContain("SOURCES.filter((s) => !s.when || s.when())");
    // Клиентов гасить нельзя: база теперь отдаёт исполнителю его собственных,
    // и по ним на карточке заявки показывается метка чёрного списка.
    expect(app).toMatch(/\{ key: "clients", label:/);
  });
});
