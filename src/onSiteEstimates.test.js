import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_JOB_CREATION_MIGRATION, ON_SITE_ESTIMATES_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ON_SITE_ESTIMATES_MIGRATION), "utf8");
const creationSql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_JOB_CREATION_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");
const modals = fs.readFileSync(path.join(process.cwd(), "src", "modals.jsx"), "utf8");

describe("оценка и продажа на месте", () => {
  it("хранит режим цены и фактический результат оценки отдельно", () => {
    expect(sql).toMatch(/add column if not exists pricing_mode text not null default 'quoted'/i);
    expect(sql).toMatch(/add column if not exists assessed_amount numeric/i);
    expect(sql).toMatch(/add column if not exists assessment_completed_at timestamptz/i);
  });

  it("убирает фиктивную исходную цену у оценки на месте", () => {
    expect(sql).toMatch(/new\.quoted_price := null/i);
    expect(sql).toMatch(/new\.price_options := '\[\]'::jsonb/i);
  });

  it("фиксирует сумму оценки при обычной сдаче отчёта", () => {
    expect(sql).toMatch(/new\.assessed_amount := coalesce\(new\.report_paid, 0\)/i);
    expect(sql).toMatch(/new\.assessment_completed_at := coalesce/i);
    expect(sql).toMatch(/update public\.orders[\s\S]*agreed_price = new\.assessed_amount/i);
  });

  it("позволяет создать заявку без цены только в явном режиме оценки", () => {
    expect(modals).toContain("Цена после оценки на месте");
    expect(modals).toContain('pricing_mode: f.pricing_mode || "quoted"');
    expect(modals).toMatch(/f\.type === "Осмотр" \|\| isOnSiteEstimate/);
  });

  it("не смешивает оценки с процентом поднятия", () => {
    expect(app).toMatch(/maxPriceOption = \(j\) => j\.pricing_mode === "on_site_estimate" \? 0/);
    expect(app).toContain("Заявки «оценка на месте» считаются отдельно");
    expect(app).toContain("assessmentSales");
  });

  it("проверяет режим оценки внутри атомарного создания", () => {
    expect(creationSql).toMatch(/coalesce\(v_input\.pricing_mode, 'quoted'\) not in \('quoted', 'on_site_estimate'\)/i);
    expect(creationSql).toMatch(/if v_input\.pricing_mode = 'on_site_estimate'[\s\S]*v_input\.quoted_price := null/i);
    expect(app).toMatch(/async function createJob[\s\S]{0,700}create_job_atomic/i);
    expect(app).toContain("ATOMIC_JOB_CREATION_MIGRATION");
  });
});
