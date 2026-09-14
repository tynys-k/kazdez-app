import React, { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Banknote, BriefcaseBusiness,
  CheckCircle2, Clock3, Copy, Cpu, Megaphone,
  Minus, Route, ShieldAlert, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import "./executivePulse.css";

const ROLE_LENSES = [
  { id: "ceo", label: "CEO", title: "Вся компания", icon: BriefcaseBusiness },
  { id: "cfo", label: "CFO", title: "Деньги", icon: Banknote },
  { id: "cmo", label: "CMO", title: "Продажи", icon: Megaphone },
  { id: "coo", label: "COO", title: "Операции", icon: Route },
  { id: "people", label: "CHRO", title: "Команда", icon: Users },
  { id: "cto", label: "CTO", title: "Система", icon: Cpu },
];

const money = (value) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value) || 0)} ₸`;
const integer = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value) || 0);

function Delta({ value }) {
  if (value == null) return <span className="ep-delta neutral"><Minus size={12} />нет базы сравнения</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return <span className={`ep-delta ${value > 0 ? "up" : value < 0 ? "down" : "neutral"}`}><Icon size={12} />{Math.abs(value)}% к прошлому месяцу</span>;
}

function MetricCard({ card, onNavigate }) {
  const content = <>
    <span className="ep-metric-label">{card.label}</span>
    <strong className={card.tone || ""}>{card.format === "money" ? money(card.value) : card.format === "percent" ? `${integer(card.value)}%` : integer(card.value)}</strong>
    {card.delta !== undefined ? <Delta value={card.delta} /> : <small>{card.detail}</small>}
    {card.delta !== undefined && card.detail && <small>{card.detail}</small>}
    {card.tab && <ArrowRight className="ep-metric-arrow" size={15} aria-hidden="true" />}
  </>;
  return card.tab
    ? <button type="button" className="ep-metric" onClick={() => onNavigate(card.tab)}>{content}</button>
    : <div className="ep-metric">{content}</div>;
}

function TrendChart({ rows }) {
  const max = Math.max(1, ...rows.flatMap((row) => [Math.abs(row.revenue), Math.abs(row.profit)]));
  return <div className="ep-trend" role="img" aria-label="Выручка и полная прибыль за шесть месяцев">
    <div className="ep-chart-legend"><span className="revenue">Выручка</span><span className="profit">Полная прибыль</span></div>
    <div className="ep-chart-area">
      {rows.map((row) => (
        <div className="ep-chart-column" key={row.key} title={`${row.label}: выручка ${money(row.revenue)}, полная прибыль ${money(row.profit)}`}>
          <div className="ep-bars">
            <i className="revenue" style={{ height: `${Math.max(3, Math.abs(row.revenue) / max * 100)}%` }} />
            <i className={row.profit < 0 ? "profit negative" : "profit"} style={{ height: `${Math.max(3, Math.abs(row.profit) / max * 100)}%` }} />
          </div>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  </div>;
}

function OperationsPanel({ data, onNavigate }) {
  const completion = data.today.total ? Math.round(data.today.done / data.today.total * 100) : 0;
  return <section className="ep-panel ep-operations">
    <header><div><span className="ep-kicker">Операции сегодня</span><h3>{data.today.total ? `${data.today.done} из ${data.today.total} выполнено` : "Выездов на сегодня нет"}</h3></div><button type="button" onClick={() => onNavigate("jobs")}>Все заявки <ArrowRight size={14} /></button></header>
    <div className="ep-progress"><i style={{ width: `${completion}%` }} /><span>{completion}%</span></div>
    <div className="ep-oper-grid">
      <div><CheckCircle2 size={16} /><span>Выполнено</span><strong>{data.today.done}</strong></div>
      <div><Route size={16} /><span>Сейчас в поле</span><strong>{data.today.inField}</strong></div>
      <div className={data.today.overdue ? "danger" : ""}><Clock3 size={16} /><span>Просрочено</span><strong>{data.today.overdue}</strong></div>
      <div className={data.today.unassigned ? "warning" : ""}><Users size={16} /><span>Без исполнителя</span><strong>{data.today.unassigned}</strong></div>
    </div>
    <div className="ep-oper-money"><span>Выручка дня <b>{money(data.today.revenue)}</b></span><span>План заявок <b>{money(data.today.plan)}</b></span></div>
    {data.today.jobs.length > 0 && <div className="ep-next-jobs">
      {data.today.jobs.map((job) => <button type="button" key={job.id} onClick={() => onNavigate("jobs")}>
        <time>{job.time || "—"}</time><span><b>{job.title}</b><small>{job.address}</small></span><ArrowRight size={13} />
      </button>)}
    </div>}
  </section>;
}

function ChannelPanel({ channels, onNavigate }) {
  return <section className="ep-panel ep-channels">
    <header><div><span className="ep-kicker">CMO · текущий месяц</span><h3>Каналы привлечения</h3></div><button type="button" onClick={() => onNavigate("analytics")}>Аналитика <ArrowRight size={14} /></button></header>
    <div className="ep-channel-head"><span>Канал</span><span>Заявки</span><span>Выручка</span><span>ROMI*</span></div>
    <div className="ep-channel-list">
      {channels.length ? channels.slice(0, 5).map((row) => <div key={row.key}>
        <strong>{row.label}</strong><span>{row.total}</span><span>{money(row.revenue)}</span><span className={row.roi != null && row.roi < 1 ? "danger" : ""}>{row.roi == null ? "—" : `${row.roi.toFixed(1)}×`}</span>
      </div>) : <p>За текущий месяц данных по каналам ещё нет.</p>}
    </div>
    <small>* Выручка ÷ рекламные расходы. «—» означает, что расход по каналу не зафиксирован.</small>
  </section>;
}

export default function ExecutivePulse({ data, alerts, channels, onNavigate, onCopy }) {
  const [lens, setLens] = useState("ceo");
  const cards = useMemo(() => ({
    ceo: [
      { label: "Выручка месяца", value: data.month.revenue, format: "money", delta: data.month.revenueDelta, detail: `${data.month.done} выполненных заявок`, tab: "finance" },
      { label: "Полная прибыль", value: data.month.profit, format: "money", delta: data.month.profitDelta, detail: "после зарплат, рекламы и постоянных затрат", tone: data.month.profit < 0 ? "danger" : "", tab: "growth" },
      { label: "Деньги сейчас", value: data.finance.cash, format: "money", detail: `счета ${money(data.finance.accounts)} · у бригад ${money(data.finance.inHands)}`, tab: "opex" },
      { label: "Отклонения", value: alerts.length, detail: data.criticalCount ? `${data.criticalCount} критических` : "критических нет", tone: data.criticalCount ? "danger" : "ok" },
    ],
    cfo: [
      { label: "Деньги сейчас", value: data.finance.cash, format: "money", detail: "счета и наличные у бригад", tab: "opex" },
      { label: "На счетах", value: data.finance.accounts, format: "money", detail: "расчётные и кассовые счета", tab: "opex" },
      { label: "Ждём оплату", value: data.finance.receivables, format: "money", detail: `${data.finance.overdueTransfers} оплат просрочено более 3 дней`, tone: data.finance.overdueTransfers ? "danger" : "", tab: "done" },
      { label: "Долг по зарплате", value: data.finance.payrollOwed, format: "money", detail: `${data.finance.payrollPeople} сотрудников ждут выплату`, tone: data.finance.payrollOwed > 0 ? "warning" : "", tab: "payroll" },
    ],
    cmo: [
      { label: "Активные лиды", value: data.growth.activeLeads, detail: "в работе у менеджеров", tab: "leads" },
      { label: "Без ответа по SLA", value: data.growth.lateLeads, detail: `дольше ${data.growth.reactionHours} часов`, tone: data.growth.lateLeads ? "danger" : "ok", tab: "leads" },
      { label: "Расход на рекламу", value: data.growth.marketingSpend, format: "money", detail: "за текущий месяц", tab: "analytics" },
      { label: "Выполнено за месяц", value: data.month.done, delta: data.month.doneDelta, detail: "заявок", tab: "done" },
    ],
    coo: [
      { label: "Заявки сегодня", value: data.today.total, detail: `${data.today.active} ещё в работе`, tab: "jobs" },
      { label: "Выполнение дня", value: data.today.total ? Math.round(data.today.done / data.today.total * 100) : 0, format: "percent", detail: `${data.today.done} завершено`, tab: "done" },
      { label: "Просроченные заявки", value: data.today.overdue, detail: "требуют решения", tone: data.today.overdue ? "danger" : "ok", tab: "jobs" },
      { label: "Без назначения", value: data.today.unassigned, detail: "на сегодня и завтра", tone: data.today.unassigned ? "warning" : "ok", tab: "jobs" },
    ],
    people: [
      { label: "Активная команда", value: data.people.active, detail: "сотрудников с доступом", tab: "team" },
      { label: "Ждут зарплату", value: data.finance.payrollPeople, detail: money(data.finance.payrollOwed), tone: data.finance.payrollPeople ? "warning" : "ok", tab: "payroll" },
      { label: "Просрочены допуски", value: data.people.docsExpired, detail: "регуляторный риск", tone: data.people.docsExpired ? "danger" : "ok", tab: "team" },
      { label: "Обучение к проверке", value: data.people.trainingDue, detail: `${data.people.docsSoon} допусков истекают в этом месяце`, tone: data.people.trainingDue || data.people.docsSoon ? "warning" : "ok", tab: "team" },
    ],
    cto: [
      { label: "Ошибки за 24 часа", value: data.system.errors24h, detail: "зафиксировано приложением", tone: data.system.errors24h ? "danger" : "ok", tab: "journal" },
      { label: "Неполные разделы", value: data.system.warnings, detail: "источников загрузились с предупреждением", tone: data.system.warnings ? "warning" : "ok" },
      { label: "Офлайн-изменения", value: data.system.offlineQueued, detail: "ещё не синхронизированы", tone: data.system.offlineQueued ? "warning" : "ok" },
      { label: "Свежесть данных", value: data.system.freshness, detail: data.system.online ? "подключение активно" : "нет подключения", tone: data.system.online ? "ok" : "danger" },
    ],
  }), [alerts.length, data]);

  const currentLens = ROLE_LENSES.find((item) => item.id === lens);
  const critical = alerts.filter((item) => item.tone === "danger");
  const headline = data.system.warnings
    ? "Часть данных требует обновления"
    : critical.length ? `${critical.length} критических отклонений требуют решения`
      : alerts.length ? `${alerts.length} контрольных точек требуют внимания` : "Критических отклонений по загруженным данным нет";

  return <div className="ep-dashboard">
    <section className="ep-command">
      <div className="ep-command-copy">
        <span className="ep-live"><i /> Пульс компании · {data.dateLabel}</span>
        <h2>{headline}</h2>
        <p>Единый экран решений: деньги, клиенты, загрузка, команда и системные риски.</p>
      </div>
      <div className="ep-command-actions">
        <span className={data.system.online ? "online" : "offline"}>{data.system.online ? "Данные в сети" : "Нет подключения"} · {data.system.freshness}</span>
        <button type="button" onClick={onCopy}><Copy size={15} />Скопировать сводку</button>
      </div>
    </section>

    <nav className="ep-lenses" aria-label="Управленческий взгляд">
      {ROLE_LENSES.map(({ id, label, title, icon: Icon }) => <button type="button" key={id} className={lens === id ? "active" : ""} onClick={() => setLens(id)} aria-pressed={lens === id}><Icon size={15} /><span><b>{label}</b><small>{title}</small></span></button>)}
    </nav>

    <div className="ep-lens-title"><span>{currentLens.label}</span><h3>{currentLens.title}</h3><p>Показатели рассчитаны по фактам в системе, без вручную придуманных целей.</p></div>
    <section className="ep-metrics">{cards[lens].map((card) => <MetricCard key={card.label} card={card} onNavigate={onNavigate} />)}</section>

    <div className="ep-main-grid">
      <section className="ep-panel ep-performance">
        <header><div><span className="ep-kicker">CEO / CFO · 6 месяцев</span><h3>Выручка и полная прибыль</h3></div><button type="button" onClick={() => onNavigate("growth")}>Подробнее <ArrowRight size={14} /></button></header>
        <TrendChart rows={data.trend} />
        <div className="ep-performance-foot"><span>Полная прибыль учитывает прямые расходы, зарплату, маркетинг и постоянные затраты.</span></div>
      </section>
      <OperationsPanel data={data} onNavigate={onNavigate} />
    </div>

    <div className="ep-main-grid ep-lower-grid">
      <ChannelPanel channels={channels} onNavigate={onNavigate} />
      <section className="ep-panel ep-alerts">
        <header><div><span className="ep-kicker">Центр решений</span><h3>Что требует внимания</h3></div><span className={critical.length ? "ep-alert-count danger" : "ep-alert-count"}>{alerts.length}</span></header>
        {alerts.length ? <div className="ep-alert-list">{alerts.slice(0, 7).map((alert) => <button type="button" key={alert.id} className={alert.tone} onClick={() => onNavigate(alert.tab)}><AlertTriangle size={15} /><span>{alert.label}</span><strong>{alert.value}</strong><ArrowRight size={14} /></button>)}</div>
          : <div className="ep-clear"><CheckCircle2 size={18} /><span><b>Очередь пуста</b><small>По загруженным данным критичных предупреждений нет.</small></span></div>}
        {alerts.length > 7 && <button type="button" className="ep-more-alerts" onClick={() => onNavigate(alerts[7].tab)}>Ещё {alerts.length - 7} контрольных точек <ArrowRight size={14} /></button>}
      </section>
    </div>

    {data.system.warnings > 0 && <div className="ep-data-note"><ShieldAlert size={17} /><span><b>Показатели могут быть неполными.</b> {data.system.warnings} разделов вернули предупреждение при последней загрузке.</span></div>}
  </div>;
}
