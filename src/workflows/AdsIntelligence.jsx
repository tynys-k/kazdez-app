import React, { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Clock3, Database, FlaskConical, Plus, Sparkles, Target, Upload } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fmt } from "../shared";
import {
  PLATFORM_LABELS, PROMOTION_LABELS, allocateBudget, buildAssetPerformance,
  buildHourlyPerformance, buildPromotionLift, parseMetricsCsv,
} from "./adsIntelligenceModel";
import "./adsIntelligence.css";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const pct = (value) => value == null ? "—" : `${Math.round(value * 100)}%`;
const multiple = (value) => value == null ? "—" : `${value.toFixed(1)}×`;

function SavePanel({ title, icon: Icon, children, open = false }) {
  return <details className="kd-card kd-ads-entry" open={open}><summary><Icon size={16} />{title}</summary><div>{children}</div></details>;
}

export default function AdsIntelligence({ accounts = [], assets = [], metrics = [], promotions = [], settings = {}, canEdit = false, onReload }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [budget, setBudget] = useState(() => Math.round((Number(settings.mkt_revenue_goal) || 15000000) * (Number(settings.mkt_ad_percent) || 10) / 100));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountForm, setAccountForm] = useState({ platform: "olx", name: "" });
  const [assetForm, setAssetForm] = useState({ account_id: "", name: "", external_id: "", service: "", margin_pct: 55 });
  const [metricForm, setMetricForm] = useState({ asset_id: "", metric_date: today(), hour_slot: "", views: 0, favorites: 0, phone_views: 0, messages: 0, clicks: 0, leads: 0, orders: 0, revenue: 0, gross_profit: 0, spend: 0 });
  const [promoForm, setPromoForm] = useState({ asset_id: "", promotion_type: "lift_once", started_on: today(), ended_on: today(), activated_hour: "", cost: 0 });
  const [csv, setCsv] = useState("");

  const rows = useMemo(() => buildAssetPerformance({ accounts, assets, metrics, promotions, from, to }), [accounts, assets, metrics, promotions, from, to]);
  const plan = useMemo(() => allocateBudget(rows, budget, { targetProfitReturn: Number(settings.ads_target_profit_return) || 2 }), [rows, budget, settings.ads_target_profit_return]);
  const hours = useMemo(() => buildHourlyPerformance(metrics.filter((row) => row.metric_date >= from && row.metric_date <= to)), [metrics, from, to]);
  const lifts = useMemo(() => buildPromotionLift(promotions, metrics), [promotions, metrics]);
  const totals = rows.reduce((acc, row) => ({ spend: acc.spend + row.spend, revenue: acc.revenue + row.metrics.revenue, profit: acc.profit + row.profitAfterAds, orders: acc.orders + row.metrics.orders, contacts: acc.contacts + row.contacts }), { spend: 0, revenue: 0, profit: 0, orders: 0, contacts: 0 });

  async function mutate(action, reloadKeys = ["ad_accounts", "ad_assets", "ad_metrics", "ad_promotions"]) {
    setBusy(true); setNotice("");
    try {
      const result = await action();
      if (result?.error) throw result.error;
      await onReload?.(reloadKeys);
      setNotice("Сохранено. Рекомендации пересчитаны.");
    } catch (error) { setNotice(`Ошибка: ${error.message}`); }
    finally { setBusy(false); }
  }

  const addAccount = () => mutate(() => supabase.from("ad_accounts").insert({ ...accountForm, name: accountForm.name.trim() }));
  const seedOlx = () => mutate(() => supabase.from("ad_accounts").upsert([
    { platform: "olx", name: "Бренд KazDez" }, { platform: "olx", name: "Dezline" }, { platform: "olx", name: "Sanitex" },
  ], { onConflict: "platform,name", ignoreDuplicates: true }));
  const addAsset = () => mutate(() => supabase.from("ad_assets").insert({ ...assetForm, external_id: assetForm.external_id.trim() || null, service: assetForm.service.trim() || null, margin_pct: Number(assetForm.margin_pct) || 55 }));
  const addMetric = () => mutate(() => supabase.from("ad_metrics").upsert({
    ...metricForm, hour_slot: metricForm.hour_slot === "" ? -1 : Number(metricForm.hour_slot),
    ...Object.fromEntries(Object.entries(metricForm).filter(([key]) => !["asset_id", "metric_date", "hour_slot"].includes(key)).map(([key, value]) => [key, Number(value) || 0])),
  }, { onConflict: "asset_id,metric_date,hour_slot" }), ["ad_metrics"]);
  const addPromotion = () => mutate(() => supabase.from("ad_promotions").insert({ ...promoForm, activated_hour: promoForm.activated_hour === "" ? null : Number(promoForm.activated_hour), cost: Number(promoForm.cost) || 0 }), ["ad_promotions"]);
  const importCsv = async () => {
    let parsed;
    try { parsed = parseMetricsCsv(csv); } catch (error) { setNotice(error.message); return; }
    let payload;
    try {
      payload = parsed.map((row) => {
        const asset = assets.find((item) => [item.id, item.external_id, item.name].some((key) => String(key).toLocaleLowerCase("ru-RU") === row.asset.toLocaleLowerCase("ru-RU")));
        if (!asset) throw new Error(`Не найдено объявление/кампания «${row.asset}». Сначала добавьте его.`);
        const { asset: ignored, ...values } = row;
        void ignored;
        return { ...values, asset_id: asset.id, hour_slot: row.hour_slot == null ? -1 : row.hour_slot, source: "csv" };
      });
    } catch (error) { setNotice(error.message); return; }
    await mutate(() => supabase.from("ad_metrics").upsert(payload, { onConflict: "asset_id,metric_date,hour_slot" }), ["ad_metrics"]);
    setCsv("");
  };

  return <div className="kd-ads360">
    <div className="kd-ads-hero kd-card">
      <div><span>РЕКЛАМА 360</span><h2>Бюджет идёт туда, где остаётся прибыль</h2><p>Сравниваем OLX, Instagram, Google и Яндекс до оплаченного заказа. Просмотры — сигнал, но не цель.</p></div>
      <label>Бюджет на следующий период, ₸<input type="number" min="0" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} /></label>
    </div>

    <div className="kd-ads-toolbar kd-card">
      <label>С<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>По<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <div><small>Правило системы</small><strong>80% победителям · 20% тестам · 0% доказанным потерям</strong></div>
    </div>

    <div className="kd-ads-kpis">
      <div><span>Вложено</span><strong>{fmt(totals.spend)} ₸</strong><small>включая продвижения OLX</small></div>
      <div><span>Выручка</span><strong>{fmt(totals.revenue)} ₸</strong><small>ROAS {multiple(totals.spend ? totals.revenue / totals.spend : null)}</small></div>
      <div><span>Прибыль после рекламы</span><strong className={totals.profit < 0 ? "bad" : "good"}>{fmt(totals.profit)} ₸</strong><small>не валовая выручка</small></div>
      <div><span>Оплаченные заказы</span><strong>{totals.orders}</strong><small>{totals.contacts} контактов</small></div>
    </div>

    {!assets.length && <div className="kd-card kd-ads-empty"><Database size={28} /><div><strong>Начните со структуры рекламы</strong><span>Добавьте аккаунты, затем 33 объявления OLX и ежедневную статистику. После первых данных появятся решения по каждому объявлению.</span></div>{canEdit && <button className="kd-btn primary" onClick={seedOlx} disabled={busy}>Создать 3 аккаунта OLX</button>}</div>}

    {plan.length > 0 && <section className="kd-card">
      <div className="kd-stage2head"><div><div className="kd-title">План распределения {fmt(budget)} ₸</div><div className="kd-muted">80% усиливают доказанные связки, до 20% сохраняются для контролируемых тестов.</div></div><Target size={20} /></div>
      <div className="kd-ads-table"><div className="head"><span>Площадка / объявление</span><span>Факт</span><span>Экономика</span><span>Решение</span><span>Бюджет</span></div>{plan.map((row) => <div key={row.id}>
        <span><b>{row.name}</b><small>{PLATFORM_LABELS[row.platform] || row.platform} · {row.account.name || "без аккаунта"}</small></span>
        <span><b>{row.contacts} контактов · {row.metrics.orders} заказов</b><small>{row.metrics.views || row.metrics.impressions} просмотров/показов · {row.metrics.favorites} в избранном</small></span>
        <span><b>{multiple(row.profitReturn)} возврат прибыли</b><small>{row.cpa == null ? "CPA —" : `заказ ${fmt(row.cpa)} ₸`} · уверенность {pct(row.confidence)}</small></span>
        <span><em className={row.recommendation.tone}>{row.recommendation.label}</em><small>{row.recommendation.reason}</small></span>
        <strong>{fmt(row.recommendedBudget)} ₸</strong>
      </div>)}</div>
    </section>}

    <div className="kd-ads-grid">
      <section className="kd-card"><div className="kd-stage2head"><div><div className="kd-title">Когда включать продвижение</div><div className="kd-muted">Только часы, где уже есть почасовые замеры.</div></div><Clock3 size={19} /></div>
        {hours.length ? <div className="kd-ads-hours">{hours.slice(0, 6).map((row, index) => <div key={row.hour}><b>{index + 1}</b><strong>{row.label}</strong><span>{row.contacts} контактов · {row.orders} заказов</span></div>)}</div> : <div className="kd-empty">Внесите статистику с часом активации. Общий совет OLX 10:00–18:00 не заменяет ваши данные.</div>}
      </section>
      <section className="kd-card"><div className="kd-stage2head"><div><div className="kd-title">Эффект тарифов OLX</div><div className="kd-muted">Равные окна до и во время услуги.</div></div><FlaskConical size={19} /></div>
        {lifts.length ? <div className="kd-ads-lifts">{lifts.slice(0, 6).map((row) => <div key={row.id}><span><b>{PROMOTION_LABELS[row.promotion_type] || row.promotion_type}</b><small>{row.started_on} · {fmt(row.cost)} ₸</small></span><strong className={row.contactLift != null && row.contactLift > 0 ? "good" : "bad"}>{row.contactLift == null ? "нет базы" : `${row.contactLift > 0 ? "+" : ""}${pct(row.contactLift)}`}</strong><small>{row.incrementalContactCost == null ? "нет прироста" : `${fmt(row.incrementalContactCost)} ₸ / доп. контакт`}</small></div>)}</div> : <div className="kd-empty">Добавьте покупку ТОП, поднятия или VIP и ежедневные показатели до/после.</div>}
      </section>
    </div>

    <section className="kd-card">
      <div className="kd-stage2head"><div><div className="kd-title">Как система управляет каждой площадкой</div><div className="kd-muted">Один финансовый результат, но разные рычаги.</div></div><Sparkles size={19} /></div>
      <div className="kd-ads-playbook">
        <div><b>OLX</b><strong>Объявление × тариф × час</strong><span>ТОП держит позицию в отдельном блоке, поднятие обновляет место в обычной выдаче, VIP даёт главную. Покупаем повторно только при доказанном приросте контактов и заказов.</span></div>
        <div><b>Instagram / Meta</b><strong>Креатив × аудитория × оплаченный лид</strong><span>Передаём из CRM не только заявку, но квалификацию и оплату. Отключаем объявления с дешёвыми, но пустыми сообщениями.</span></div>
        <div><b>Google Ads</b><strong>Запрос × конверсия × ценность</strong><span>Звонок и форма — промежуточные события. После накопления продаж оптимизируем по ценности конверсии / целевому ROAS, а не по кликам.</span></div>
        <div><b>Яндекс Директ</b><strong>Цель Метрики × звонок × прибыль</strong><span>Коллтрекинг и офлайн-продажи связывают рекламу с кассой. При надёжной марже используем максимизацию прибыли, до неё — ограничение CPA/ДРР.</span></div>
      </div>
    </section>

    {canEdit && <div className="kd-ads-inputs">
      <SavePanel title="Аккаунт площадки" icon={Plus}><div className="kd-grid2"><label>Площадка<select value={accountForm.platform} onChange={(event) => setAccountForm({ ...accountForm, platform: event.target.value })}>{Object.entries(PLATFORM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Название<input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} placeholder="Например, Бренд KazDez" /></label></div><button className="kd-btn primary sm" disabled={busy || !accountForm.name.trim()} onClick={addAccount}>Добавить аккаунт</button></SavePanel>
      <SavePanel title="Объявление или кампания" icon={Sparkles}><div className="kd-grid2"><label>Аккаунт<select value={assetForm.account_id} onChange={(event) => setAssetForm({ ...assetForm, account_id: event.target.value })}><option value="">Выберите</option>{accounts.map((item) => <option key={item.id} value={item.id}>{PLATFORM_LABELS[item.platform]} · {item.name}</option>)}</select></label><label>Название<input value={assetForm.name} onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })} /></label><label>ID на площадке<input value={assetForm.external_id} onChange={(event) => setAssetForm({ ...assetForm, external_id: event.target.value })} /></label><label>Маржа до рекламы, %<input type="number" min="0" max="100" value={assetForm.margin_pct} onChange={(event) => setAssetForm({ ...assetForm, margin_pct: event.target.value })} /></label></div><button className="kd-btn primary sm" disabled={busy || !assetForm.account_id || !assetForm.name.trim()} onClick={addAsset}>Добавить</button></SavePanel>
      <SavePanel title="Дневные показатели" icon={BarChart3}><div className="kd-ads-metric-form"><label>Объявление<select value={metricForm.asset_id} onChange={(event) => setMetricForm({ ...metricForm, asset_id: event.target.value })}><option value="">Выберите</option>{assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Дата<input type="date" value={metricForm.metric_date} onChange={(event) => setMetricForm({ ...metricForm, metric_date: event.target.value })} /></label><label>Час<input type="number" min="0" max="23" value={metricForm.hour_slot} onChange={(event) => setMetricForm({ ...metricForm, hour_slot: event.target.value })} placeholder="не указан" /></label>{["views", "favorites", "phone_views", "messages", "clicks", "leads", "orders", "revenue", "gross_profit", "spend"].map((key) => <label key={key}>{({ views: "Просмотры", favorites: "Избранное", phone_views: "Телефон", messages: "Сообщения", clicks: "Клики", leads: "Лиды", orders: "Оплачено", revenue: "Выручка ₸", gross_profit: "Валовая прибыль ₸", spend: "Расход без OLX-промо ₸" })[key]}<input type="number" min="0" value={metricForm[key]} onChange={(event) => setMetricForm({ ...metricForm, [key]: event.target.value })} /></label>)}</div><button className="kd-btn primary sm" disabled={busy || !metricForm.asset_id} onClick={addMetric}>Сохранить замер</button></SavePanel>
      <SavePanel title="Покупка продвижения OLX" icon={Target}><div className="kd-grid2"><label>Объявление<select value={promoForm.asset_id} onChange={(event) => setPromoForm({ ...promoForm, asset_id: event.target.value })}><option value="">Выберите</option>{assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Услуга<select value={promoForm.promotion_type} onChange={(event) => setPromoForm({ ...promoForm, promotion_type: event.target.value })}>{Object.entries(PROMOTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Начало<input type="date" value={promoForm.started_on} onChange={(event) => setPromoForm({ ...promoForm, started_on: event.target.value })} /></label><label>Конец<input type="date" value={promoForm.ended_on} onChange={(event) => setPromoForm({ ...promoForm, ended_on: event.target.value })} /></label><label>Час активации<input type="number" min="0" max="23" value={promoForm.activated_hour} onChange={(event) => setPromoForm({ ...promoForm, activated_hour: event.target.value })} /></label><label>Стоимость, ₸<input type="number" min="0" value={promoForm.cost} onChange={(event) => setPromoForm({ ...promoForm, cost: event.target.value })} /></label></div><button className="kd-btn primary sm" disabled={busy || !promoForm.asset_id} onClick={addPromotion}>Записать покупку</button></SavePanel>
      <SavePanel title="Массовый импорт CSV" icon={Upload}><p className="kd-muted">Колонки: asset,date,hour,views,favorites,phone_views,messages,clicks,leads,orders,revenue,gross_profit,spend. В asset можно указать ID площадки или точное название.</p><textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={5} placeholder="asset;date;hour;views;favorites;phone_views;orders;revenue&#10;OLX-42;2026-09-17;18;120;8;11;2;90000" /><button className="kd-btn primary sm" disabled={busy || !csv.trim()} onClick={importCsv}>Импортировать</button></SavePanel>
    </div>}

    {notice && <div className={`kd-ads-notice ${notice.startsWith("Ошибка") ? "bad" : ""}`} role="status">{notice.startsWith("Ошибка") && <AlertTriangle size={15} />}{notice}</div>}
    <div className="kd-data-confidence warn">Алгоритм не обещает x2–x5 без данных. Он прекращает финансирование доказанных потерь, сохраняет тестовый бюджет и масштабирует только прибыльные связки с достаточной выборкой.</div>
  </div>;
}
