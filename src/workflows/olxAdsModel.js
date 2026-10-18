// Аналитика OLX по объявлениям.
//
// OLX отдаёт по объявлению только накопительные счётчики: просмотры,
// избранное, показ телефона «всего». Раз в неделю и в конце месяца их
// переписывают снимком (ad_snapshots), а прирост за период — разница
// двух снимков. Вложения — покупки продвижения (ad_promotions) с датой
// старта внутри периода. Касса тут не участвует: это внутренняя оценка,
// какое объявление окупает продвижение.
import { allocateCapped } from "./adsIntelligenceModel";

export const PROMOTION_DAYS = {
  lift_once: 1, lift_7: 7, top_3: 3, top_7: 7, top_30: 30, vip_7: 7, fast: 7, turbo: 30, other: 1,
};

// Снимок старше начала периода годится как точка отсчёта, только если он
// свежий: иначе в «прирост за месяц» попадёт рост прошлых месяцев.
const BASELINE_MAX_DAYS = 10;
const COUNTERS = ["views", "favorites", "phone_views"];

const day = (value) => String(value || "").slice(0, 10);
const n = (value) => Math.max(0, Number(value) || 0);
const daysBetween = (a, b) => Math.round((Date.parse(`${day(b)}T00:00:00Z`) - Date.parse(`${day(a)}T00:00:00Z`)) / 86400000);

export function addDays(date, days) {
  const value = new Date(`${day(date)}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function promotionEndDate(startedOn, type) {
  return addDays(startedOn, (PROMOTION_DAYS[type] || 1) - 1);
}

// Номер объявления из ссылки: https://www.olx.kz/d/obyavlenie/...-IDxxxxx.html
export function olxIdFromUrl(url) {
  const match = String(url || "").match(/-ID([A-Za-z0-9]+)\.html/);
  return match ? match[1] : "";
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function counterWindow(snapshots = [], from, to) {
  const list = [...snapshots].filter((row) => day(row.snapshot_date) && (!to || day(row.snapshot_date) <= to))
    .sort((a, b) => day(a.snapshot_date).localeCompare(day(b.snapshot_date)));
  const end = list[list.length - 1] || null;
  if (!end || (from && day(end.snapshot_date) < from)) return { start: null, end: null, deltas: null, dropped: false };
  const before = from ? list.filter((row) => day(row.snapshot_date) <= from) : [];
  const baseline = before[before.length - 1];
  const start = baseline && daysBetween(baseline.snapshot_date, from) <= BASELINE_MAX_DAYS
    ? baseline
    : list.find((row) => !from || day(row.snapshot_date) >= from) || null;
  if (!start || day(start.snapshot_date) === day(end.snapshot_date)) return { start, end, deltas: null, dropped: false };
  const deltas = Object.fromEntries(COUNTERS.map((key) => [key, Math.max(0, n(end[key]) - n(start[key]))]));
  // Счётчик уменьшился — объявление пересоздали или ошиблись при вводе.
  const dropped = COUNTERS.some((key) => n(end[key]) < n(start[key]));
  return { start, end, deltas, dropped };
}

function verdictFor(row, { costPerPhoneMedian, organicPhonesMedian }) {
  if (!row.deltas) return { key: "nodata", tone: "neutral", label: "Нет замеров", reason: "Нужно два снимка счётчиков в периоде." };
  const phones = row.deltas.phone_views;
  if (!row.spend) {
    if (phones > 0 && phones >= (organicPhonesMedian || 1)) {
      return { key: "candidate", tone: "warn", label: "Кандидат на рекламу", reason: `Без вложений +${phones} телефонов — проверьте небольшим продвижением.` };
    }
    return { key: "idle", tone: "neutral", label: "Без рекламы", reason: phones ? `Сам дал +${phones} телефонов.` : "Без вложений и без отклика." };
  }
  if (!phones) return { key: "weak", tone: "danger", label: "Не продлевать", reason: "Деньги вложены, а телефон не смотрели." };
  const cost = row.spend / phones;
  if (costPerPhoneMedian == null || cost <= costPerPhoneMedian) {
    return { key: "boost", tone: "good", label: "Бустить", reason: "Телефон обходится дешевле, чем у остальных." };
  }
  if (cost <= costPerPhoneMedian * 2) return { key: "hold", tone: "warn", label: "Держать", reason: "Средняя отдача: продлевать без увеличения." };
  return { key: "weak", tone: "danger", label: "Слабо", reason: "Телефон обходится вдвое дороже среднего." };
}

export function buildOlxReport({ accounts = [], assets = [], snapshots = [], promotions = [], from, to } = {}) {
  const accountById = new Map(accounts.map((account) => [String(account.id), account]));
  const snapshotsByAsset = new Map();
  for (const row of snapshots) {
    const key = String(row.asset_id);
    if (!snapshotsByAsset.has(key)) snapshotsByAsset.set(key, []);
    snapshotsByAsset.get(key).push(row);
  }
  const rows = assets.filter((asset) => asset.is_active !== false).map((asset) => {
    const own = promotions.filter((row) => String(row.asset_id) === String(asset.id))
      .sort((a, b) => day(a.started_on).localeCompare(day(b.started_on)) || (a.activated_hour ?? -1) - (b.activated_hour ?? -1));
    const periodPromotions = own.filter((row) => (!from || day(row.started_on) >= from) && (!to || day(row.started_on) <= to));
    const spend = periodPromotions.reduce((sum, row) => sum + n(row.cost), 0);
    const counters = counterWindow(snapshotsByAsset.get(String(asset.id)) || [], from, to);
    const activeOnEnd = own.some((row) => day(row.started_on) <= to && day(row.ended_on || row.started_on) >= to);
    const phones = counters.deltas?.phone_views ?? null;
    return {
      ...asset,
      account: accountById.get(String(asset.account_id)) || {},
      promotions: periodPromotions,
      spend,
      activeOnEnd,
      ...counters,
      costPerPhone: spend && phones ? spend / phones : null,
      costPerView: spend && counters.deltas?.views ? spend / counters.deltas.views : null,
    };
  });
  const costPerPhoneMedian = median(rows.map((row) => row.costPerPhone).filter((value) => value != null));
  const organicPhonesMedian = median(rows.filter((row) => !row.spend && row.deltas?.phone_views > 0).map((row) => row.deltas.phone_views));
  return rows.map((row) => ({ ...row, verdict: verdictFor(row, { costPerPhoneMedian, organicPhonesMedian }) }))
    .sort((a, b) => b.spend - a.spend || (b.deltas?.phone_views ?? -1) - (a.deltas?.phone_views ?? -1));
}

export function summarizeOlxReport(rows = []) {
  return rows.reduce((acc, row) => {
    acc.spend += row.spend;
    acc.purchases += row.promotions.length;
    if (row.deltas) {
      acc.views += row.deltas.views;
      acc.favorites += row.deltas.favorites;
      acc.phones += row.deltas.phone_views;
      if (row.spend) acc.paidPhones += row.deltas.phone_views;
    }
    if (!row.spend) acc.withoutAds += 1;
    if (!row.deltas) acc.withoutData += 1;
    return acc;
  }, { spend: 0, purchases: 0, views: 0, favorites: 0, phones: 0, paidPhones: 0, withoutAds: 0, withoutData: 0 });
}

// 80% бюджета — объявлениям, где телефон обходится дешевле («Бустить»,
// вдвое меньше — «Держать»), пропорционально телефонам на тенге. 20% — на
// пробу объявлениям, которые и без рекламы собирают телефоны. Ни одно
// объявление не получает больше 35%, чтобы не сложить всё в одну корзину.
export function planOlxBudget(rows = [], budget = 0) {
  const total = Math.max(0, Number(budget) || 0);
  const result = new Map();
  if (!total) return result;
  const proven = rows.filter((row) => ["boost", "hold"].includes(row.verdict.key))
    .map((row) => ({ id: row.id, weight: (row.deltas.phone_views / row.spend) * (row.verdict.key === "hold" ? 0.5 : 1) }));
  const tests = rows.filter((row) => row.verdict.key === "candidate")
    .sort((a, b) => b.deltas.phone_views - a.deltas.phone_views).slice(0, 5)
    .map((row) => ({ id: row.id, weight: 1 }));
  if (!proven.length && !tests.length) return result;
  const provenPool = !tests.length ? total : !proven.length ? 0 : total * 0.8;
  const add = (map) => { for (const [id, value] of map) result.set(id, (result.get(id) || 0) + value); };
  add(allocateCapped(proven, provenPool, proven.length > 2 ? 0.35 : 1));
  add(allocateCapped(tests, total - provenPool, 1));
  for (const [id, value] of result) result.set(id, Math.round(value / 100) * 100);
  return result;
}
