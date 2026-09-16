import { describe, expect, it } from "vitest";
import { allocateBudget, buildAssetPerformance, buildHourlyPerformance, buildPromotionLift, parseMetricsCsv, recommendationFor } from "./adsIntelligenceModel";

const accounts = [{ id: "a", name: "KazDez", platform: "olx" }];
const assets = [
  { id: "winner", account_id: "a", name: "Тараканы", margin_pct: 60, is_active: true },
  { id: "loser", account_id: "a", name: "Клопы", margin_pct: 60, is_active: true },
];

describe("advertising intelligence", () => {
  it("measures profit after promotion spend and does not confuse revenue with profit", () => {
    const metrics = Array.from({ length: 14 }, (_, index) => ({
      asset_id: "winner", metric_date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      phone_views: 2, orders: index < 4 ? 1 : 0, revenue: index < 4 ? 50000 : 0,
    }));
    const [row] = buildAssetPerformance({ accounts, assets: [assets[0]], metrics, promotions: [{ asset_id: "winner", started_on: "2026-09-01", cost: 20000 }] });
    expect(row.spend).toBe(20000);
    expect(row.metrics.revenue).toBe(200000);
    expect(row.grossProfit).toBe(120000);
    expect(row.profitAfterAds).toBe(100000);
    expect(row.profitReturn).toBe(6);
    expect(recommendationFor(row).action).toBe("scale");
  });

  it("holds back budget from listings with enough spend but no sales", () => {
    const metrics = Array.from({ length: 14 }, (_, index) => ({
      asset_id: index < 7 ? "winner" : "loser", metric_date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      phone_views: 4, orders: index < 3 ? 1 : 0, revenue: index < 3 ? 50000 : 0, spend: 3000,
    }));
    const rows = buildAssetPerformance({ accounts, assets, metrics });
    const plan = allocateBudget(rows, 100000);
    expect(plan.find((row) => row.id === "loser").recommendation.action).toBe("pause");
    expect(plan.find((row) => row.id === "loser").recommendedBudget).toBe(0);
    expect(plan.reduce((sum, row) => sum + row.recommendedBudget, 0)).toBe(100000);
  });

  it("finds the best measured hour", () => {
    const hours = buildHourlyPerformance([
      { hour_slot: 10, phone_views: 3, orders: 1, spend: 1000 },
      { hour_slot: 18, phone_views: 7, orders: 2, spend: 1000 },
    ]);
    expect(hours[0].hour).toBe(18);
  });

  it("compares a promotion with an equal window before it", () => {
    const lift = buildPromotionLift(
      [{ id: "p", asset_id: "winner", promotion_type: "top_3", started_on: "2026-09-04", ended_on: "2026-09-06", cost: 9000 }],
      [
        { asset_id: "winner", metric_date: "2026-09-01", phone_views: 2 },
        { asset_id: "winner", metric_date: "2026-09-02", phone_views: 2 },
        { asset_id: "winner", metric_date: "2026-09-03", phone_views: 2 },
        { asset_id: "winner", metric_date: "2026-09-04", phone_views: 5 },
        { asset_id: "winner", metric_date: "2026-09-05", phone_views: 5 },
        { asset_id: "winner", metric_date: "2026-09-06", phone_views: 5 },
      ],
    )[0];
    expect(lift.beforeContacts).toBe(6);
    expect(lift.duringContacts).toBe(15);
    expect(lift.contactLift).toBe(1.5);
    expect(lift.incrementalContactCost).toBe(1000);
  });

  it("imports normalized Russian CSV exports", () => {
    const rows = parseMetricsCsv("объявление;дата;час;просмотры;избранное;просмотры телефона;заказы;выручка\nOLX-42;2026-09-16;18;120;8;11;2;90000");
    expect(rows).toEqual([expect.objectContaining({ asset: "OLX-42", metric_date: "2026-09-16", hour_slot: 18, views: 120, phone_views: 11, orders: 2, revenue: 90000 })]);
  });
});
