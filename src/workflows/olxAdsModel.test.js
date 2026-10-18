import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOlxReport, counterWindow, olxIdFromUrl, planOlxBudget, promotionEndDate, summarizeOlxReport } from "./olxAdsModel";

const accounts = [{ id: "acc", platform: "olx", name: "Бренд KazDez" }];
const snap = (asset_id, snapshot_date, views, favorites, phone_views) => ({ id: `${asset_id}-${snapshot_date}`, asset_id, snapshot_date, views, favorites, phone_views });

describe("counterWindow", () => {
  it("считает прирост накопительного счётчика между снимками", () => {
    const result = counterWindow([snap("a", "2026-10-01", 100, 5, 7), snap("a", "2026-10-31", 160, 9, 15)], "2026-10-01", "2026-10-31");
    expect(result.deltas).toEqual({ views: 60, favorites: 4, phone_views: 8 });
    expect(result.dropped).toBe(false);
  });

  it("берёт свежий снимок перед началом периода как точку отсчёта", () => {
    const result = counterWindow([snap("a", "2026-09-28", 90, 4, 6), snap("a", "2026-10-15", 120, 5, 9)], "2026-10-01", "2026-10-31");
    expect(result.start.snapshot_date).toBe("2026-09-28");
    expect(result.deltas.phone_views).toBe(3);
  });

  it("не тянет рост прошлых месяцев из старого снимка", () => {
    const result = counterWindow([snap("a", "2026-07-01", 10, 0, 1), snap("a", "2026-10-05", 100, 5, 7), snap("a", "2026-10-20", 130, 6, 10)], "2026-10-01", "2026-10-31");
    expect(result.start.snapshot_date).toBe("2026-10-05");
    expect(result.deltas.views).toBe(30);
  });

  it("без второго снимка прироста нет, при падении счётчика — флаг", () => {
    expect(counterWindow([snap("a", "2026-10-05", 10, 1, 1)], "2026-10-01", "2026-10-31").deltas).toBeNull();
    const dropped = counterWindow([snap("a", "2026-10-01", 50, 3, 5), snap("a", "2026-10-20", 10, 1, 1)], "2026-10-01", "2026-10-31");
    expect(dropped.dropped).toBe(true);
    expect(dropped.deltas.views).toBe(0);
  });
});

describe("buildOlxReport", () => {
  const assets = [
    { id: "good", account_id: "acc", name: "Тараканы — фото 1" },
    { id: "weak", account_id: "acc", name: "Клопы — фото 2" },
    { id: "free", account_id: "acc", name: "Мыши — без рекламы" },
    { id: "empty", account_id: "acc", name: "Нет замеров" },
    { id: "hidden", account_id: "acc", name: "Снято", is_active: false },
  ];
  const snapshots = [
    snap("good", "2026-10-01", 100, 5, 7), snap("good", "2026-10-31", 300, 20, 27),
    snap("weak", "2026-10-01", 50, 1, 3), snap("weak", "2026-10-31", 54, 1, 3),
    snap("free", "2026-10-01", 30, 1, 1), snap("free", "2026-10-31", 60, 3, 6),
  ];
  const promotions = [
    { id: "p1", asset_id: "good", promotion_type: "top_30", started_on: "2026-10-01", ended_on: "2026-10-30", activated_hour: 8, cost: 5000 },
    { id: "p2", asset_id: "good", promotion_type: "lift_7", started_on: "2026-10-04", ended_on: "2026-10-10", activated_hour: 13, cost: 2750 },
    { id: "p3", asset_id: "weak", promotion_type: "top_7", started_on: "2026-10-02", ended_on: "2026-10-08", cost: 3000 },
    { id: "old", asset_id: "weak", promotion_type: "top_7", started_on: "2026-09-02", ended_on: "2026-09-08", cost: 9000 },
  ];
  const report = buildOlxReport({ accounts, assets, snapshots, promotions, from: "2026-10-01", to: "2026-10-31" });
  const byId = Object.fromEntries(report.map((row) => [row.id, row]));

  it("суммирует все покупки объявления за период и только за период", () => {
    expect(byId.good.spend).toBe(7750);
    expect(byId.good.promotions.map((row) => row.id)).toEqual(["p1", "p2"]);
    expect(byId.weak.spend).toBe(3000);
    expect(byId.hidden).toBeUndefined();
  });

  it("решение по объявлению: бустить, не продлевать, кандидат, нет замеров", () => {
    expect(byId.good.costPerPhone).toBe(387.5);
    expect(byId.good.verdict.key).toBe("boost");
    expect(byId.weak.verdict.key).toBe("weak");
    expect(byId.free.verdict.key).toBe("candidate");
    expect(byId.empty.verdict.key).toBe("nodata");
    expect(report[0].id).toBe("good");
  });

  it("сводка и план бюджета: 80% проверенным, 20% на пробу, никого в минус", () => {
    const totals = summarizeOlxReport(report);
    expect(totals).toMatchObject({ spend: 10750, purchases: 3, phones: 25, paidPhones: 20, withoutAds: 2, withoutData: 1 });
    const plan = planOlxBudget(report, 50000);
    expect(plan.get("good")).toBe(40000);
    expect(plan.get("free")).toBe(10000);
    expect(plan.get("weak")).toBeUndefined();
  });
});

describe("помощники", () => {
  it("срок продвижения и номер из ссылки OLX", () => {
    expect(promotionEndDate("2026-10-18", "top_30")).toBe("2026-11-16");
    expect(promotionEndDate("2026-10-18", "lift_once")).toBe("2026-10-18");
    expect(olxIdFromUrl("https://www.olx.kz/d/obyavlenie/dezinsektsiya-IDn5Kx7.html?reason=ip")).toBe("n5Kx7");
    expect(olxIdFromUrl("https://example.com")).toBe("");
  });
});

describe("схема ad_snapshots", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "2026-10-18_olx_ad_snapshots.sql"), "utf8");
  it("снимок один на объявление и дату, писать может только финансист", () => {
    expect(sql).toContain("unique(asset_id,snapshot_date)");
    expect(sql).toContain("alter table public.ad_snapshots enable row level security");
    expect(sql).toMatch(/ad_snapshots_write[\s\S]*?action\.finance_edit/);
    expect(sql).toMatch(/"ad-images upload"[\s\S]*?action\.finance_edit/);
    expect(sql).toContain("'ad-images', 'ad-images', false");
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
