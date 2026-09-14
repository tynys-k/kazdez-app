import React from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { fmt, isoToRu } from "../shared";
import { buildMarketingMonthHistory, buildMarketingMonthReport } from "./marketingMonthModel";
import "./marketingMonthReport.css";

export default function MarketingMonthReport({
  jobs,
  channels,
  topups,
  settings,
  monthOffset,
  onMonthOffsetChange,
  onAddChannel,
  onEditChannel,
  onRemoveChannel,
  onAddTopup,
  onRemoveTopup,
  accountName,
}) {
  const report = buildMarketingMonthReport({ jobs, channels, topups, offset: monthOffset });
  const history = buildMarketingMonthHistory({ jobs, channels, topups, months: 6 });
  const goal = Number(settings.mkt_revenue_goal) || 15000000;
  const adPct = Number(settings.mkt_ad_percent) || 10;
  const budget = Math.round(goal * adPct / 100);
  const overallRoi = report.totalSpent > 0 ? report.totalRevenue / report.totalSpent : null;

  return <>
    <div className="kd-tabbar kd-marketing-head">
      <div>
        <div className="kd-title" style={{ fontSize: 18 }}>Маркетинг</div>
        <div className="kd-muted">Расходы, выручка и ROI за один календарный месяц</div>
      </div>
      <button className="kd-btn primary" onClick={onAddChannel}><Plus size={15} />Канал</button>
    </div>

    <div className="kd-marketing-period" aria-label="Месяц отчёта">
      <button type="button" className="kd-arrow" aria-label="Предыдущий месяц" onClick={() => onMonthOffsetChange(monthOffset - 1)}><ChevronLeft size={18} /></button>
      <div><span>Отчётный месяц</span><strong>{report.label}</strong></div>
      <button type="button" className="kd-arrow" aria-label="Следующий месяц" disabled={monthOffset >= 0} onClick={() => onMonthOffsetChange(monthOffset + 1)}><ChevronRight size={18} /></button>
    </div>

    <div className="kd-marketing-kpis">
      <div><span>Расходы</span><strong>{fmt(report.totalSpent)} ₸</strong><small>{report.totalPlan ? `${Math.round(report.totalSpent / report.totalPlan * 100)}% текущего плана` : "План не задан"}</small></div>
      <div><span>Выручка из рекламы</span><strong>{fmt(report.totalRevenue)} ₸</strong><small>{report.attributedJobs} выполненных заявок</small></div>
      <div><span>ROI</span><strong className={overallRoi != null && overallRoi >= 10 ? "good" : overallRoi != null ? "warn" : ""}>{overallRoi != null ? `${overallRoi.toFixed(1)}×` : "—"}</strong><small>Цель: от 10×</small></div>
      <div><span>Осталось по плану</span><strong>{fmt(Math.max(0, report.totalPlan - report.totalSpent))} ₸</strong><small>План каналов: {fmt(report.totalPlan)} ₸</small></div>
    </div>

    <div className="kd-card kd-marketing-goal">
      <div className="kd-section">Текущий ориентир месяца</div>
      <div className="kd-row"><span>Цель по выручке</span><strong>{fmt(goal)} ₸</strong></div>
      <div className="kd-row"><span>Доля на рекламу</span><strong>{adPct}%</strong></div>
      <div className="kd-row total"><span>Бюджет на рекламу</span><strong style={{ color: "var(--primary-d)" }}>{fmt(budget)} ₸</strong></div>
      <div className="kd-muted" style={{ marginTop: 8 }}>Цель, процент и планы каналов — текущие нормативы. Расходы и выручка ниже считаются строго за выбранный месяц.</div>
    </div>

    <section className="kd-card kd-marketing-history">
      <div className="kd-section">Последние 6 месяцев</div>
      <div className="kd-marketing-history-table" role="table" aria-label="Расходы и отдача по месяцам">
        <div className="head" role="row"><span>Месяц</span><span>Расходы</span><span>Выручка</span><span>ROI</span></div>
        {history.map((month, index) => {
          const roi = month.totalSpent > 0 ? month.totalRevenue / month.totalSpent : null;
          return <button type="button" role="row" className={month.key === report.key ? "active" : ""} key={month.key} onClick={() => onMonthOffsetChange(-index)}>
            <span>{month.label}</span><strong>{fmt(month.totalSpent)} ₸</strong><strong>{fmt(month.totalRevenue)} ₸</strong><strong>{roi == null ? "—" : `${roi.toFixed(1)}×`}</strong>
          </button>;
        })}
      </div>
    </section>

    <div className="kd-list">
      {report.channels.length === 0 && <div className="kd-empty">Каналов нет. Добавь через «+ Канал».</div>}
      {report.channels.map((channel) => <div key={channel.id} className="kd-card kd-marketing-channel">
        <div className="kd-card-head">
          <div className="kd-pest">{channel.name}{channel.is_fixed && <span className="kd-brandtag" style={{ marginLeft: 8 }}>фикс</span>}</div>
          <span className="kd-badge" style={{ color: channel.filled >= 100 ? "#0E7C66" : "#B4650B", background: channel.filled >= 100 ? "#E4F3EE" : "#FBEDD9" }}>{channel.filled}% плана</span>
        </div>
        <div className="kd-mktbar"><div className="kd-mktbarfill" style={{ width: `${channel.filled}%` }} /></div>
        <div className="kd-tenderfin">
          <div><span className="kd-muted">План/мес</span><strong>{fmt(channel.plan)} ₸</strong></div>
          <div><span className="kd-muted">Расходы</span><strong>{fmt(channel.spent)} ₸</strong></div>
          {channel.source_key && <div><span className="kd-muted">Выручка ({channel.source_key})</span><strong>{fmt(channel.revenue)} ₸</strong></div>}
          {channel.source_key && <div><span className="kd-muted">ROI</span><strong style={{ color: channel.roi != null && channel.roi >= 10 ? "#0E7C66" : channel.roi != null ? "#B42318" : "var(--muted)" }}>{channel.roi != null ? `${channel.roi.toFixed(1)}×` : "—"}</strong></div>}
        </div>
        {channel.topups.length > 0 && <div className="kd-returns" style={{ marginTop: 8 }}>
          {channel.topups.map((topup) => <div key={topup.id} className="kd-returnrow">
            <span>✓ {fmt(topup.amount)} ₸ · {isoToRu(topup.topup_date)}{topup.account_id ? ` · ${accountName(topup.account_id)}` : ""}</span>
            <button className="kd-btn ghost danger sm" onClick={() => onRemoveTopup(topup)} aria-label={`Удалить пополнение ${fmt(topup.amount)} ₸`}><X size={12} /></button>
          </div>)}
        </div>}
        <div className="kd-actions">
          <button className="kd-btn primary sm" onClick={() => onAddTopup(channel)}><Plus size={13} />Пополнил</button>
          <button className="kd-btn ghost sm" onClick={() => onEditChannel(channel)}><Pencil size={13} />Изменить</button>
          <button className="kd-btn ghost danger sm" onClick={() => onRemoveChannel(channel)}><Trash2 size={13} /></button>
        </div>
        {!channel.source_key && <div className="kd-muted" style={{ marginTop: 6 }}>ROI не считается — не привязан источник заявок.</div>}
      </div>)}
    </div>
  </>;
}
