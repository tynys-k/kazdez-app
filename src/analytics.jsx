import React, { useMemo, useState } from "react";
import { BarChart3, BookOpen, CalendarRange, ExternalLink, Megaphone, Target } from "lucide-react";
import { SEASONALITY_DATA } from "./seasonalityData";

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const EXCLUDED_VISITS = new Set(["guarantee", "control"]);

const money = (value) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))} ₸`;
const normalize = (value) => String(value || "").trim().toLocaleLowerCase("ru-RU");

export function realDemandJobs(jobs) {
  return (jobs || []).filter((job) => job.status === "done" && !EXCLUDED_VISITS.has(job.visit_kind));
}

export function buildInternalSeasonality(jobs, year, pest = "all") {
  const demand = realDemandJobs(jobs).filter((job) => {
    const date = String(job.scheduled_date || job.reported_at || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== Number(year)) return false;
    return pest === "all" || normalize(job.pest) === normalize(pest);
  });
  const months = Array.from({ length: 12 }, (_, month) => ({ month, jobs: 0, revenue: 0 }));
  const byPest = new Map();
  for (const job of demand) {
    const date = String(job.scheduled_date || job.reported_at).slice(0, 10);
    const month = Number(date.slice(5, 7)) - 1;
    const revenue = Number(job.report_paid) || 0;
    months[month].jobs += 1;
    months[month].revenue += revenue;
    const name = String(job.pest || "Не указан").trim() || "Не указан";
    const row = byPest.get(name) || { name, jobs: 0, revenue: 0, months: Array(12).fill(0) };
    row.jobs += 1;
    row.revenue += revenue;
    row.months[month] += 1;
    byPest.set(name, row);
  }
  const pests = [...byPest.values()].map((row) => {
    const peak = Math.max(...row.months);
    return { ...row, avg: row.jobs ? Math.round(row.revenue / row.jobs) : 0, peakMonth: peak ? row.months.indexOf(peak) : null };
  }).sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue);
  const totalRevenue = demand.reduce((sum, job) => sum + (Number(job.report_paid) || 0), 0);
  const bestMonth = months.reduce((best, row) => row.jobs > best.jobs ? row : best, months[0]);
  return {
    jobs: demand.length,
    revenue: totalRevenue,
    avg: demand.length ? Math.round(totalRevenue / demand.length) : 0,
    months,
    pests,
    bestMonth: bestMonth.jobs ? bestMonth.month : null,
    monthsWithData: months.filter((row) => row.jobs > 0).length,
  };
}

export function buildExternalMonthPlan(monthIndex, budget) {
  const rawTotal = SEASONALITY_DATA.directions.reduce((sum, direction) => sum + direction.months[monthIndex].budgetShare, 0) || 100;
  const totalBudget = Math.round(Number(budget) || 0);
  const rows = SEASONALITY_DATA.directions.map((direction) => {
    const budgetShare = direction.months[monthIndex].budgetShare / rawTotal * 100;
    return { ...direction, ...direction.months[monthIndex], budgetShare, amount: Math.round(totalBudget * budgetShare / 100) };
  }).sort((a, b) => b.budgetShare - a.budgetShare || b.adIndex - a.adIndex);
  if (rows.length) rows[rows.length - 1].amount += totalBudget - rows.reduce((sum, row) => sum + row.amount, 0);
  return rows;
}

export function buildChannelPlan(channels, jobs, topups, budget) {
  if (!(channels || []).length) return [];
  const manualTotal = channels.reduce((sum, channel) => sum + Math.max(0, Number(channel.monthly_plan) || 0), 0);
  const equalWeight = 1 / channels.length;
  const rows = channels.map((channel) => {
    const share = manualTotal > 0 ? Math.max(0, Number(channel.monthly_plan) || 0) / manualTotal : equalWeight;
    const linkedJobs = realDemandJobs(jobs).filter((job) => channel.source_key && normalize(job.source) === normalize(channel.source_key));
    const revenue = linkedJobs.reduce((sum, job) => sum + (Number(job.report_paid) || 0), 0);
    const spent = (topups || []).filter((topup) => topup.channel_id === channel.id).reduce((sum, topup) => sum + (Number(topup.amount) || 0), 0);
    return {
      ...channel,
      share: share * 100,
      amount: Math.round((Number(budget) || 0) * share),
      jobs: linkedJobs.length,
      revenue,
      spent,
      roi: spent > 0 ? revenue / spent : null,
    };
  }).sort((a, b) => b.amount - a.amount);
  if (rows.length) rows[rows.length - 1].amount += Math.round(Number(budget) || 0) - rows.reduce((sum, row) => sum + row.amount, 0);
  return rows;
}

function HorizontalBars({ rows, valueKey, labelKey = "label", moneyValues = false }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey]) || 0));
  return <div className="kd-analytics-bars">
    {rows.map((row) => <div className="kd-analytics-bar" key={row.id || row[labelKey]}>
      <span>{row[labelKey]}</span>
      <div><i style={{ width: `${Math.max(row[valueKey] ? 2 : 0, Math.round((Number(row[valueKey]) || 0) / max * 100))}%` }} /></div>
      <strong>{moneyValues ? money(row[valueKey]) : row[valueKey]}</strong>
    </div>)}
  </div>;
}

function InternalAnalytics({ jobs }) {
  const allDemand = useMemo(() => realDemandJobs(jobs), [jobs]);
  const years = useMemo(() => [...new Set(allDemand.map((job) => Number(String(job.scheduled_date || job.reported_at || "").slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a), [allDemand]);
  const [year, setYear] = useState(() => years[0] || new Date().getFullYear());
  const [pest, setPest] = useState("all");
  const currentYear = years.includes(Number(year)) ? Number(year) : (years[0] || new Date().getFullYear());
  const allForYear = useMemo(() => buildInternalSeasonality(jobs, currentYear), [jobs, currentYear]);
  const stats = useMemo(() => buildInternalSeasonality(jobs, currentYear, pest), [jobs, currentYear, pest]);
  const maxJobs = Math.max(1, ...stats.months.map((row) => row.jobs));
  const firstDate = allDemand.map((job) => String(job.scheduled_date || job.reported_at || "").slice(0, 10)).filter(Boolean).sort()[0];
  const lastDate = allDemand.map((job) => String(job.scheduled_date || job.reported_at || "").slice(0, 10)).filter(Boolean).sort().at(-1);

  return <div className="kd-stage2">
    <div className="kd-analytics-toolbar kd-card">
      <div><div className="kd-section">Реальный спрос по выполненным работам</div><div className="kd-muted">Гарантийные и контрольные выезды не считаются новым спросом.</div></div>
      <div className="kd-analytics-filters">
        <label>Год<select value={currentYear} onChange={(event) => { setYear(Number(event.target.value)); setPest("all"); }}>{years.length ? years.map((item) => <option key={item}>{item}</option>) : <option>{currentYear}</option>}</select></label>
        <label>Вид работы<select value={pest} onChange={(event) => setPest(event.target.value)}><option value="all">Все виды</option>{allForYear.pests.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}</select></label>
      </div>
    </div>

    <div className="kd-kpigrid">
      <div className="kd-kpicard"><span>Выполнено</span><strong>{stats.jobs}</strong><small>платных и обычных выездов</small></div>
      <div className="kd-kpicard"><span>Выручка</span><strong>{money(stats.revenue)}</strong><small>по фактическим отчётам</small></div>
      <div className="kd-kpicard"><span>Средний чек</span><strong>{money(stats.avg)}</strong><small>на выполненную работу</small></div>
      <div className="kd-kpicard"><span>Самый активный месяц</span><strong>{stats.bestMonth == null ? "—" : SEASONALITY_DATA.months[stats.bestMonth]}</strong><small>{stats.bestMonth == null ? "нет данных" : `${stats.months[stats.bestMonth].jobs} заявок`}</small></div>
    </div>

    <section className="kd-card">
      <div className="kd-stage2head"><div><div className="kd-title">Сезон по месяцам</div><div className="kd-muted">Высота столбца — количество выполненных работ, подпись — выручка.</div></div><CalendarRange size={20} /></div>
      <div className="kd-month-chart" aria-label="Выполненные работы по месяцам">
        {stats.months.map((row) => <div key={row.month} title={`${SEASONALITY_DATA.months[row.month]}: ${row.jobs} заявок, ${money(row.revenue)}`}>
          <strong>{row.jobs || ""}</strong><span><i style={{ height: `${Math.max(row.jobs ? 6 : 0, Math.round(row.jobs / maxJobs * 100))}%` }} /></span><small>{MONTHS_SHORT[row.month]}</small><em>{row.revenue ? money(row.revenue) : "—"}</em>
        </div>)}
      </div>
      <div className={`kd-data-confidence ${stats.monthsWithData >= 10 ? "ok" : "warn"}`}>
        {stats.monthsWithData >= 10
          ? `Данных достаточно для сезонного сравнения: заполнено ${stats.monthsWithData} месяцев.`
          : `Пока заполнено ${stats.monthsWithData} из 12 месяцев. Это честный предварительный рисунок, а не окончательный сезонный вывод.`}
      </div>
    </section>

    <section className="kd-card">
      <div className="kd-stage2head"><div><div className="kd-title">Что заказывают чаще</div><div className="kd-muted">Нажми на вид работы, чтобы увидеть только его сезон.</div></div><BarChart3 size={20} /></div>
      {allForYear.pests.length ? <HorizontalBars rows={allForYear.pests.slice(0, 12).map((row) => ({ ...row, label: row.name }))} valueKey="jobs" /> : <div className="kd-empty">За выбранный год выполненных работ пока нет.</div>}
      {allForYear.pests.length > 0 && <div className="kd-analytics-pest-buttons">{allForYear.pests.slice(0, 12).map((row) => <button className={pest === row.name ? "on" : ""} key={row.name} onClick={() => setPest(row.name)}>{row.name}<span>{row.jobs}</span></button>)}</div>}
    </section>

    <div className="kd-muted kd-analytics-footnote">Период данных: {firstDate || "—"} — {lastDate || "—"}. Нулевые цены не ломают сезонность по количеству заявок, но уменьшают средний чек и выручку.</div>
  </div>;
}

function ExternalAnalytics({ jobs, channels, topups, settings, onOpenMarketing }) {
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [selectedId, setSelectedId] = useState("");
  const goal = Number(settings?.mkt_revenue_goal) || 15000000;
  const adPercent = Number(settings?.mkt_ad_percent) || 10;
  const budget = Math.round(goal * adPercent / 100);
  const plan = useMemo(() => buildExternalMonthPlan(monthIndex, budget), [monthIndex, budget]);
  const selected = plan.find((row) => row.id === selectedId) || plan[0];
  const shown = plan.slice(0, 10);
  const shownShare = shown.reduce((sum, row) => sum + row.budgetShare, 0);
  const channelPlan = useMemo(() => buildChannelPlan(channels, jobs, topups, budget), [channels, jobs, topups, budget]);
  const linkedSources = selected ? SEASONALITY_DATA.sources.filter((source) => selected.sourceIds.includes(source.id)) : [];

  return <div className="kd-stage2">
    <div className="kd-analytics-toolbar kd-card">
      <div><div className="kd-section">Внешняя сезонность и медиаплан</div><div className="kd-muted">Модель для Алматы и юго-востока Казахстана: 34 направления и 39 проверенных источников.</div></div>
      <label>Месяц<select value={monthIndex} onChange={(event) => { setMonthIndex(Number(event.target.value)); setSelectedId(""); }}>{SEASONALITY_DATA.months.map((month, index) => <option value={index} key={month}>{month}</option>)}</select></label>
    </div>

    <div className="kd-analytics-callout">
      <Target size={20} /><div><strong>План на {SEASONALITY_DATA.months[monthIndex].toLocaleLowerCase("ru-RU")}: {money(budget)}</strong><span>Цель {money(goal)} × {adPercent}% на рекламу. Проценты распределены с учётом сезона и того, за сколько недель рекламу надо запускать.</span></div>
      <button className="kd-btn ghost sm" onClick={onOpenMarketing}>Изменить бюджет</button>
    </div>

    <div className="kd-stage2grid">
      <section className="kd-card">
        <div className="kd-stage2head"><div><div className="kd-title">Что рекламировать</div><div className="kd-muted">Топ-10 направлений из Excel. Нажми на строку — увидишь объяснение и источники.</div></div><Megaphone size={20} /></div>
        <div className="kd-season-plan">
          {shown.map((row, index) => <button className={selected?.id === row.id ? "on" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
            <b>{index + 1}</b><span><strong>{row.name}</strong><small>{row.phase} · активность {row.activity}%</small></span><em>{row.budgetShare.toFixed(1)}%</em><strong>{money(row.amount)}</strong>
          </button>)}
          {shownShare < 99.95 && <div className="kd-season-plan-rest"><span>Остальные направления</span><strong>{money(budget * (100 - shownShare) / 100)}</strong></div>}
        </div>
      </section>

      <section className="kd-card kd-season-detail">
        <div className="kd-stage2head"><div><div className="kd-title">{selected?.name || "Направление"}</div><div className="kd-muted">{selected?.group}</div></div><BookOpen size={20} /></div>
        {selected && <>
          <div className="kd-season-detail-kpis"><div><span>Биоактивность</span><strong>{selected.activity}%</strong></div><div><span>Рекламный индекс</span><strong>{selected.adIndex}%</strong></div><div><span>Запуск заранее</span><strong>{selected.leadWeeks} нед.</strong></div></div>
          <p><strong>Когда:</strong> {selected.seasonality}</p>
          <p><strong>Рекламный посыл:</strong> {selected.angle}</p>
          <p><strong>Кому:</strong> {selected.objects}</p>
          <p><strong>Регион:</strong> {selected.region}</p>
          <details><summary>Источники по этому направлению · {linkedSources.length}</summary>{linkedSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><span><strong>{source.organization} · {source.topic}</strong><small>{source.supports}</small></span><ExternalLink size={14} /></a>)}</details>
        </>}
      </section>
    </div>

    <section className="kd-card">
      <div className="kd-stage2head"><div><div className="kd-title">Куда вложить — по рекламным каналам</div><div className="kd-muted">Общий бюджет делится в тех же пропорциях, которые уже заданы в планах каналов.</div></div><Target size={20} /></div>
      {channelPlan.length ? <div className="kd-channel-plan"><div className="head"><span>Канал</span><span>Доля</span><span>План на месяц</span><span>Факт за всю историю</span></div>{channelPlan.map((channel) => <div key={channel.id}><span><strong>{channel.name}</strong><small>{channel.source_key ? `источник: ${channel.source_key}` : "источник не привязан"}</small></span><b>{channel.share.toFixed(1)}%</b><strong>{money(channel.amount)}</strong><span><b>{channel.jobs} заявок</b><small>{channel.roi == null ? "ROI пока не считается" : `ROI ${channel.roi.toFixed(1)}×`}</small></span></div>)}</div> : <div className="kd-empty">Сначала добавь рекламные каналы и их месячные планы в разделе «Счета и расходы» → «Маркетинг».</div>}
      <div className="kd-muted" style={{ marginTop: 10 }}>Здесь сезон отвечает на вопрос «что рекламировать», а ваши планы каналов — «где рекламировать». Фактическую отдачу каналов приложение продолжает считать по источникам заявок.</div>
    </section>

    <details className="kd-card kd-all-sources"><summary>Все внешние источники · {SEASONALITY_DATA.sources.length}</summary><div>{SEASONALITY_DATA.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><span><strong>{source.id} · {source.organization}</strong><small>{source.topic} · {source.type}</small></span><ExternalLink size={14} /></a>)}</div></details>
    <div className="kd-data-confidence warn">{SEASONALITY_DATA.meta.note} Данные источников проверены {SEASONALITY_DATA.meta.checked}.</div>
  </div>;
}

export function AnalyticsTab({ jobs, channels, topups, settings, onOpenMarketing }) {
  const [view, setView] = useState("internal");
  return <div className="kd-analytics">
    <div className="kd-analytics-switch" role="tablist" aria-label="Источник аналитики">
      <button className={view === "internal" ? "on" : ""} onClick={() => setView("internal")}><BarChart3 size={18} /><span><strong>Наши реальные данные</strong><small>Что уже заказывали и оплачивали</small></span></button>
      <button className={view === "external" ? "on" : ""} onClick={() => setView("external")}><BookOpen size={18} /><span><strong>Внешние источники</strong><small>Сезонность из Excel и медиаплан</small></span></button>
    </div>
    {view === "internal"
      ? <InternalAnalytics jobs={jobs} />
      : <ExternalAnalytics jobs={jobs} channels={channels} topups={topups} settings={settings} onOpenMarketing={onOpenMarketing} />}
  </div>;
}
