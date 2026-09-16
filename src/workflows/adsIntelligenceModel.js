const NUMBER_KEYS = [
  "impressions", "views", "clicks", "favorites", "phone_views", "messages",
  "leads", "qualified_leads", "orders", "revenue", "gross_profit", "spend",
];

const n = (value) => Math.max(0, Number(value) || 0);
const ratio = (top, bottom) => bottom > 0 ? top / bottom : null;
const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const PLATFORM_LABELS = {
  olx: "OLX",
  meta: "Instagram / Meta",
  google: "Google Ads",
  yandex: "Яндекс Директ",
};

export const PROMOTION_LABELS = {
  lift_once: "Поднятие разово",
  lift_7: "Поднятия 7 дней",
  top_3: "ТОП 3 дня",
  top_7: "ТОП 7 дней",
  top_30: "ТОП 30 дней",
  vip_7: "VIP 7 дней",
  fast: "Быстрая продажа",
  turbo: "Турбо продажа",
  other: "Другое продвижение",
};

function inPeriod(date, from, to) {
  const day = String(date || "").slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

function sumMetrics(rows) {
  const total = Object.fromEntries(NUMBER_KEYS.map((key) => [key, 0]));
  for (const row of rows) for (const key of NUMBER_KEYS) total[key] += n(row[key]);
  return total;
}

function daysCovered(rows) {
  return new Set(rows.map((row) => String(row.metric_date || "").slice(0, 10)).filter(Boolean)).size;
}

export function buildAssetPerformance({ accounts = [], assets = [], metrics = [], promotions = [], from, to } = {}) {
  const accountById = new Map(accounts.map((account) => [String(account.id), account]));
  const scopedMetrics = metrics.filter((row) => inPeriod(row.metric_date, from, to));
  const scopedPromotions = promotions.filter((row) => inPeriod(row.started_on, from, to));

  return assets.filter((asset) => asset.is_active !== false).map((asset) => {
    const rows = scopedMetrics.filter((row) => String(row.asset_id) === String(asset.id));
    const promoRows = scopedPromotions.filter((row) => String(row.asset_id) === String(asset.id));
    const totals = sumMetrics(rows);
    const promotionSpend = promoRows.reduce((sum, row) => sum + n(row.cost), 0);
    const spend = totals.spend + promotionSpend;
    const contacts = totals.leads || (totals.phone_views + totals.messages);
    const intentActions = contacts + totals.favorites;
    const days = daysCovered(rows);
    const confidence = Math.min(1, days / 14) * Math.min(1, Math.max(contacts, totals.clicks) / 20);
    const grossProfit = totals.gross_profit || totals.revenue * (n(asset.margin_pct) || 55) / 100;
    const profitAfterAds = grossProfit - spend;
    const account = accountById.get(String(asset.account_id)) || {};
    const roas = ratio(totals.revenue, spend);
    const profitReturn = ratio(grossProfit, spend);
    const romi = ratio(profitAfterAds, spend);
    const cpa = ratio(spend, totals.orders);
    const costPerContact = ratio(spend, contacts);
    const contactToOrder = ratio(totals.orders, contacts);
    const conservativeReturn = profitReturn == null ? 0 : Math.max(0, profitReturn * (0.35 + 0.65 * confidence));
    return {
      ...asset,
      account,
      platform: account.platform || asset.platform || "other",
      metrics: totals,
      promotions: promoRows,
      promotionSpend,
      spend,
      contacts,
      intentActions,
      days,
      confidence,
      grossProfit,
      profitAfterAds,
      roas,
      profitReturn,
      romi,
      cpa,
      costPerContact,
      contactToOrder,
      conservativeReturn,
    };
  }).sort((a, b) => b.profitAfterAds - a.profitAfterAds || b.contacts - a.contacts);
}

export function recommendationFor(row, { targetProfitReturn = 2, minEvidenceSpend = 10000 } = {}) {
  const target = Math.max(1, Number(targetProfitReturn) || 2);
  if (row.days < 3 || Math.max(row.contacts, row.metrics.clicks) < 5) {
    return { action: "test", tone: "neutral", label: "Собрать данные", reason: "Мало наблюдений: нужен тест без крупного бюджета." };
  }
  if (row.spend >= minEvidenceSpend && row.metrics.orders === 0 && row.contacts >= 10) {
    return { action: "pause", tone: "danger", label: "Не продлевать", reason: "Расход и контакты есть, оплаченных заказов нет." };
  }
  if (row.profitReturn != null && row.profitReturn >= target && row.confidence >= 0.45) {
    return { action: "scale", tone: "good", label: "Усилить", reason: `Валовая прибыль возвращает ${round(row.profitReturn, 1)}× рекламных затрат.` };
  }
  if (row.profitReturn != null && row.profitReturn < 1 && row.confidence >= 0.35) {
    return { action: "pause", tone: "danger", label: "Остановить", reason: "Валовая прибыль пока не покрывает рекламу." };
  }
  return { action: "hold", tone: "warn", label: "Оставить минимум", reason: "Результат пограничный: не масштабировать до следующего замера." };
}

function allocateCapped(items, amount, capShare = 0.35) {
  if (!items.length || amount <= 0) return new Map();
  const result = new Map(items.map((item) => [item.id, 0]));
  let remaining = amount;
  let eligible = [...items];
  const cap = amount * capShare;
  for (let pass = 0; pass < items.length + 2 && remaining > 0.5 && eligible.length; pass += 1) {
    const weightTotal = eligible.reduce((sum, item) => sum + Math.max(0.05, item.weight), 0);
    const next = [];
    for (const item of eligible) {
      const current = result.get(item.id) || 0;
      const addition = remaining * Math.max(0.05, item.weight) / weightTotal;
      const accepted = Math.min(addition, Math.max(0, cap - current));
      result.set(item.id, current + accepted);
      if (current + accepted < cap - 0.5) next.push(item);
    }
    const allocated = [...result.values()].reduce((sum, value) => sum + value, 0);
    const newRemaining = Math.max(0, amount - allocated);
    if (Math.abs(newRemaining - remaining) < 0.5) break;
    remaining = newRemaining;
    eligible = next;
  }
  if (remaining > 0.5) {
    const best = [...items].sort((a, b) => b.weight - a.weight)[0];
    result.set(best.id, (result.get(best.id) || 0) + remaining);
  }
  return result;
}

export function allocateBudget(rows, budget, options = {}) {
  const total = Math.max(0, Number(budget) || 0);
  if (!total || !rows.length) return [];
  const recommendations = rows.map((row) => ({ ...row, recommendation: recommendationFor(row, options) }));
  let proven = recommendations.filter((row) => row.recommendation.action === "scale");
  let experiments = recommendations.filter((row) => row.recommendation.action === "test" || row.recommendation.action === "hold");
  if (!proven.length) {
    proven = recommendations.filter((row) => row.recommendation.action !== "pause").slice(0, Math.min(3, rows.length));
    experiments = recommendations.filter((row) => !proven.some((item) => item.id === row.id) && row.recommendation.action !== "pause");
  }
  const provenPool = total * (experiments.length ? 0.8 : 1);
  const testPool = total - provenPool;
  const provenWeighted = proven.map((row) => ({ ...row, weight: Math.max(0.1, row.conservativeReturn) * Math.max(0.2, row.confidence) }));
  const testWeighted = experiments.map((row) => ({ ...row, weight: 1 / Math.max(1, row.spend || 1) }));
  const provenAlloc = allocateCapped(provenWeighted, provenPool, options.maxAssetShare || 0.35);
  const testAlloc = allocateCapped(testWeighted, testPool, options.maxAssetShare || 0.35);
  return recommendations.map((row) => ({
    ...row,
    recommendedBudget: Math.round((provenAlloc.get(row.id) || 0) + (testAlloc.get(row.id) || 0)),
  })).sort((a, b) => b.recommendedBudget - a.recommendedBudget || b.profitAfterAds - a.profitAfterAds);
}

export function buildHourlyPerformance(metrics = []) {
  return Array.from({ length: 24 }, (_, hour) => {
    const rows = metrics.filter((row) => Number(row.hour_slot) === hour);
    const totals = sumMetrics(rows);
    const contacts = totals.leads || (totals.phone_views + totals.messages);
    return { hour, label: `${String(hour).padStart(2, "0")}:00`, rows: rows.length, contacts, orders: totals.orders, revenue: totals.revenue, spend: totals.spend, costPerContact: ratio(totals.spend, contacts) };
  }).filter((row) => row.rows > 0).sort((a, b) => b.orders - a.orders || b.contacts - a.contacts || (a.costPerContact ?? Infinity) - (b.costPerContact ?? Infinity));
}

export function buildPromotionLift(promotions = [], metrics = []) {
  return promotions.map((promotion) => {
    const start = new Date(`${promotion.started_on}T00:00:00Z`);
    const end = new Date(`${promotion.ended_on || promotion.started_on}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const duration = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const beforeStart = new Date(start); beforeStart.setUTCDate(beforeStart.getUTCDate() - duration);
    const date = (value) => String(value || "").slice(0, 10);
    const iso = (value) => value.toISOString().slice(0, 10);
    const assetRows = metrics.filter((row) => String(row.asset_id) === String(promotion.asset_id));
    const during = sumMetrics(assetRows.filter((row) => date(row.metric_date) >= iso(start) && date(row.metric_date) <= iso(end)));
    const before = sumMetrics(assetRows.filter((row) => date(row.metric_date) >= iso(beforeStart) && date(row.metric_date) < iso(start)));
    const duringContacts = during.leads || (during.phone_views + during.messages);
    const beforeContacts = before.leads || (before.phone_views + before.messages);
    const contactLift = beforeContacts > 0 ? (duringContacts - beforeContacts) / beforeContacts : null;
    const incrementalContacts = Math.max(0, duringContacts - beforeContacts);
    return { ...promotion, duration, during, before, duringContacts, beforeContacts, contactLift, incrementalContacts, incrementalContactCost: ratio(n(promotion.cost), incrementalContacts) };
  }).filter(Boolean).sort((a, b) => String(b.started_on).localeCompare(String(a.started_on)));
}

const CSV_ALIASES = {
  asset: ["asset", "asset_id", "external_id", "объявление", "id объявления"],
  metric_date: ["date", "metric_date", "дата"],
  hour_slot: ["hour", "hour_slot", "час"],
  views: ["views", "просмотры"],
  impressions: ["impressions", "показы"],
  clicks: ["clicks", "клики"],
  favorites: ["favorites", "избранное"],
  phone_views: ["phone_views", "просмотры телефона", "телефон"],
  messages: ["messages", "сообщения"],
  leads: ["leads", "лиды"],
  qualified_leads: ["qualified_leads", "качественные лиды"],
  orders: ["orders", "заказы"],
  revenue: ["revenue", "выручка"],
  gross_profit: ["gross_profit", "валовая прибыль"],
  spend: ["spend", "расход"],
};

function csvCells(line, delimiter) {
  const cells = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

export function parseMetricsCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const headers = csvCells(lines[0], delimiter).map((header) => header.trim().toLocaleLowerCase("ru-RU"));
  const indexFor = (key) => headers.findIndex((header) => CSV_ALIASES[key].includes(header));
  const indexes = Object.fromEntries(Object.keys(CSV_ALIASES).map((key) => [key, indexFor(key)]));
  if (indexes.asset < 0 || indexes.metric_date < 0) throw new Error("В CSV нужны колонки asset и date (или «объявление» и «дата»). ");
  return lines.slice(1).map((line, lineIndex) => {
    const cells = csvCells(line, delimiter);
    const row = { asset: cells[indexes.asset]?.trim(), metric_date: cells[indexes.metric_date]?.trim() };
    if (!row.asset || !/^\d{4}-\d{2}-\d{2}$/.test(row.metric_date)) throw new Error(`Строка ${lineIndex + 2}: проверь объявление и дату YYYY-MM-DD.`);
    for (const key of ["hour_slot", ...NUMBER_KEYS]) if (indexes[key] >= 0) row[key] = n(String(cells[indexes[key]] || "0").replace(/\s/g, "").replace(",", "."));
    row.hour_slot = indexes.hour_slot >= 0 && cells[indexes.hour_slot] !== "" ? Math.min(23, Math.floor(row.hour_slot)) : null;
    return row;
  });
}
