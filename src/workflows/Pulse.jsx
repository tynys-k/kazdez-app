import React, { useState } from "react";
import { AlertTriangle, ArrowRight, BellOff, CheckCircle2, Clock3, Target, UserCheck, X } from "lucide-react";
import { Badge, Button, Card, DetailDrawer, Field, Hero, Textarea } from "../ui/primitives";
import { formatMoney } from "../ui/formatters";
import { PLAN_METRICS } from "./pulseModel";
import "./pulse.css";

const integer = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value) || 0);
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const unowned = (n) => `${n} ${plural(n, "отклонение", "отклонения", "отклонений")} без ответственного`;
const valueOf = (format, value) => (format === "money" ? formatMoney(value) : integer(value));
const short = (value) => {
  const abs = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)} тыс`;
  return `${sign}${Math.round(abs)}`;
};
const dayLabel = (iso) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)).replace(".", "");
const addDaysIso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const PLAN_STATUS = {
  done: { tone: "positive", label: "Цель выполнена" },
  on_track: { tone: "positive", label: "Успеваем" },
  at_risk: { tone: "warning", label: "Под угрозой" },
  behind: { tone: "danger", label: "Отстаём" },
  no_target: { tone: "neutral", label: "Цель не задана" },
};

function PlanCard({ row, elapsedShare, onSetTargets }) {
  const status = PLAN_STATUS[row.status];
  const fill = row.target ? Math.min(100, row.fact / row.target * 100) : 0;
  return <Card className={`pl-plan pl-${row.status}`}>
    <header><span>{row.label}</span><Badge tone={status.tone}>{status.label}</Badge></header>
    <strong>{valueOf(row.format, row.fact)}</strong>
    {row.target ? <>
      <div className="pl-bar" title={`Выполнено ${row.pct}% цели, прошло ${Math.round(elapsedShare * 100)}% месяца`}>
        <i style={{ width: `${fill}%` }} />
        {row.flow && <b style={{ left: `${elapsedShare * 100}%` }} aria-hidden="true" />}
      </div>
      <small>{row.pct}% из {valueOf(row.format, row.target)}</small>
      {row.flow
        ? <p>Прогноз: <b>{valueOf(row.format, row.forecast)}</b> · {row.forecastPct}%{row.perDayNeeded ? <><br />Нужно в день: <b>{valueOf(row.format, row.perDayNeeded)}</b></> : null}</p>
        : <p>{row.fact >= row.target ? "На уровне цели" : <>До цели: <b>{valueOf(row.format, row.target - row.fact)}</b></>}</p>}
    </> : <>
      <p>{row.flow ? <>По темпу к концу месяца: <b>{valueOf(row.format, row.forecast)}</b></> : "Текущее значение"}</p>
      <button type="button" className="pl-link" onClick={onSetTargets}>Задать цель <ArrowRight size={13} /></button>
    </>}
  </Card>;
}

const INFLOW = [["receivables", "Ждём переводы"], ["debts", "Долги клиентов"], ["jobs", "Плановые заявки"], ["contracts", "Абонентские выезды"]];
const OUTFLOW = [["payroll", "Долг по зарплате"], ["direct", "Прямые расходы"], ["opex", "Постоянные расходы"], ["salaries", "Оклады"], ["marketing", "Реклама"]];

function CashPanel({ runway, assumptions, onNavigate }) {
  const values = [runway.startBalance, ...runway.weeks.map((w) => w.closing)];
  // Нулевая линия делит высоту по размаху плюса и минуса: разрыв уходит вниз.
  const top = Math.max(0, ...values), bottom = Math.max(0, ...values.map((v) => -v));
  const span = Math.max(1, top + bottom);
  const gap = runway.firstGap != null;
  return <Card className="pl-panel pl-cash">
    <header><div><span className="pl-kicker">Деньги · 4 недели</span><h3>{gap ? `Кассовый разрыв на ${runway.firstGap + 1}-й неделе` : "Денег хватает на 4 недели"}</h3></div><button type="button" onClick={() => onNavigate("opex")}>Счета <ArrowRight size={14} /></button></header>
    <div className="pl-cash-chart" role="img" aria-label="Остаток денег на конец каждой недели" style={{ "--pl-rows": `auto minmax(0,${(top / span).toFixed(3)}fr) minmax(0,${(bottom / span).toFixed(3)}fr) auto` }}>
      {[{ key: "now", label: "Сейчас", value: runway.startBalance }, ...runway.weeks.map((w) => ({ key: w.from, label: <>{dayLabel(w.from)}<span className="pl-to">–{dayLabel(w.to)}</span></>, value: w.closing }))].map((col) => (
        <div key={col.key} className={col.value < 0 ? "negative" : ""}>
          <span>{short(col.value)}</span>
          <div className="up">{col.value >= 0 && <i style={{ height: `${Math.max(2, col.value / Math.max(1, top) * 100)}%` }} />}</div>
          <div className="down">{col.value < 0 && <i style={{ height: `${Math.max(2, -col.value / Math.max(1, bottom) * 100)}%` }} />}</div>
          <small>{col.label}</small>
        </div>
      ))}
    </div>
    <div className="pl-cash-table">
      <div className="head"><span /> {runway.weeks.map((w) => <span key={w.from}>{dayLabel(w.from)}</span>)}</div>
      {INFLOW.map(([key, label]) => runway.weeks.some((w) => w.inflow[key]) && <div key={key} className="in"><span>+ {label}</span>{runway.weeks.map((w) => <span key={w.from}>{w.inflow[key] ? short(w.inflow[key]) : "—"}</span>)}</div>)}
      {OUTFLOW.map(([key, label]) => runway.weeks.some((w) => w.outflow[key]) && <div key={key} className="out"><span>− {label}</span>{runway.weeks.map((w) => <span key={w.from}>{w.outflow[key] ? short(w.outflow[key]) : "—"}</span>)}</div>)}
      <div className="total"><span>Остаток</span>{runway.weeks.map((w) => <span key={w.from} className={w.closing < 0 ? "danger" : ""}>{short(w.closing)}</span>)}</div>
    </div>
    <small className="pl-note">
      Плановые заявки и абонентские выезды взяты с поправкой на долю выполняемых ({Math.round(assumptions.completionRate * 100)}%), прямые расходы — {Math.round(assumptions.directCostShare * 100)}% выручки за 90 дней. Постоянные расходы — среднее за 3 месяца.
      {runway.undatedDebts > 0 && <> Долги без срока оплаты ({formatMoney(runway.undatedDebts)}) в прогноз не вошли.</>}
      {assumptions.monthlyOpex == null && <> Истории постоянных расходов нет — они не учтены.</>}
    </small>
  </Card>;
}

function FunnelPanel({ funnel, onNavigate, onOpenLead }) {
  const maxCount = Math.max(1, ...funnel.stages.map((s) => s.count));
  return <Card className="pl-panel pl-funnel">
    <header><div><span className="pl-kicker">B2B · абонентка</span><h3>Воронка и MRR</h3></div><button type="button" onClick={() => onNavigate("leads")}>Лиды <ArrowRight size={14} /></button></header>
    <div className="pl-mrr">
      <div><span>MRR сейчас</span><strong>{formatMoney(funnel.mrr.current)}</strong><small>{funnel.mrr.subscribers} {plural(funnel.mrr.subscribers, "абонент", "абонента", "абонентов")}{funnel.mrr.paused ? ` · ${funnel.mrr.paused} приостановлено` : ""}</small></div>
      <div><span>Новые за месяц</span><strong>+{formatMoney(funnel.mrr.newMrr)}</strong><small>{funnel.mrr.newThisMonth} {plural(funnel.mrr.newThisMonth, "договор", "договора", "договоров")} · подписано сделок: {funnel.signedThisMonth}</small></div>
      <div><span>В воронке</span><strong>{formatMoney(funnel.pipeline.value)}</strong><small>{funnel.pipeline.count} {plural(funnel.pipeline.count, "сделка", "сделки", "сделок")} · отказов за месяц: {funnel.lostThisMonth}</small></div>
    </div>
    <div className="pl-stages">
      {funnel.stages.map((stage) => <div key={stage.code}>
        <span>{stage.label}</span>
        <div className="pl-stage-bar"><i style={{ width: `${Math.max(stage.count ? 4 : 0, stage.count / maxCount * 100)}%` }} /><b>{stage.count}</b></div>
        <span className="num">{stage.value ? short(stage.value) : "—"}</span>
        <span className="num conv">{stage.conversion == null ? "" : `→ ${stage.conversion}%`}</span>
        {stage.stuck > 0 && <em title="Сделки без движения 14 дней и дольше">{stage.stuck} стоят</em>}
      </div>)}
    </div>
    {funnel.stuckDeals.length > 0 && <div className="pl-stuck">
      <span className="pl-kicker">Застряли дольше 14 дней</span>
      {funnel.stuckDeals.slice(0, 4).map((deal) => <button type="button" key={deal.id} onClick={() => onOpenLead(deal.lead)}>
        <b>{deal.name}</b><small>{deal.stage} · {deal.days} дн.</small><span>{deal.value ? formatMoney(deal.value) : ""}</span><ArrowRight size={13} />
      </button>)}
    </div>}
    <small className="pl-note">MRR — цена абонентского договора в пересчёте на 30 дней. Сумма сделки — ожидаемый MRR, иначе согласованная цена. Конверсия — доля текущих сделок, прошедших стадию.</small>
  </Card>;
}

const STATE_VIEW = {
  none: { tone: "danger", label: "Нет ответственного" },
  task_done: { tone: "warning", label: "Задача закрыта, отклонение осталось" },
  overdue: { tone: "danger", label: "Срок решения прошёл" },
  assigned: { tone: "positive", label: "В работе" },
};

function DecisionRow({ row, people, onDecide, onOpen }) {
  const [mode, setMode] = useState(null);
  const [ownerId, setOwnerId] = useState("");
  const [due, setDue] = useState(addDaysIso(2));
  const [until, setUntil] = useState(addDaysIso(7));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const view = STATE_VIEW[row.state];
  const submit = async (action, payload) => {
    setBusy(true); setError("");
    const message = await onDecide(row.alert, action, payload);
    setBusy(false);
    if (message) setError(message); else setMode(null);
  };
  return <div className={`pl-decision ${row.alert.tone || ""} ${row.state}`}>
    <div className="pl-decision-main">
      <AlertTriangle size={16} />
      <button type="button" className="pl-decision-title" onClick={() => onOpen(row.alert)}><b>{row.alert.label}</b><span>{row.alert.value}</span></button>
      <div className="pl-decision-state">
        <Badge tone={view.tone}>{view.label}</Badge>
        {row.owner && <small><UserCheck size={12} />{row.owner}{row.due ? ` · до ${dayLabel(row.due)}` : ""}</small>}
        {row.wokeUp && <small><Clock3 size={12} />перенос закончился</small>}
      </div>
      <div className="pl-decision-actions">
        <Button size="sm" variant={row.state === "assigned" ? "secondary" : "primary"} onClick={() => setMode(mode === "assign" ? null : "assign")}><UserCheck />{row.owner ? "Переназначить" : "Назначить"}</Button>
        <Button size="sm" onClick={() => setMode(mode === "snooze" ? null : "snooze")}><BellOff />Отложить</Button>
        {row.decision && <Button size="sm" variant="ghost" iconOnly aria-label="Снять решение" title="Снять решение" disabled={busy} onClick={() => submit("close", {})}><X /></Button>}
      </div>
    </div>
    {mode === "assign" && <form className="pl-decision-form" onSubmit={(event) => { event.preventDefault(); submit("assign", { ownerId, due, note }); }}>
      <Field label="Ответственный"><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required><option value="">Выберите</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.phone || "Сотрудник"}</option>)}</select></Field>
      <Field label="Срок"><input type="date" value={due} min={addDaysIso(0)} onChange={(event) => setDue(event.target.value)} required /></Field>
      <Field label="Что сделать" className="wide"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Необязательно: попадёт в описание задачи" /></Field>
      <Button type="submit" variant="primary" size="sm" disabled={busy || !ownerId || !due}>Создать задачу</Button>
    </form>}
    {mode === "snooze" && <form className="pl-decision-form" onSubmit={(event) => { event.preventDefault(); submit("snooze", { until, note }); }}>
      <Field label="Вернуть в очередь"><input type="date" value={until} min={addDaysIso(1)} onChange={(event) => setUntil(event.target.value)} required /></Field>
      <Field label="Почему откладываем" className="wide"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Необязательно" /></Field>
      <Button type="submit" size="sm" disabled={busy || !until}>Отложить</Button>
    </form>}
    {error && <p className="pl-error">{error}</p>}
  </div>;
}

function DecisionPanel({ queue, people, onDecide, onOpenAlert, ready }) {
  const [showSnoozed, setShowSnoozed] = useState(false);
  return <Card className="pl-panel pl-decisions">
    <header><div><span className="pl-kicker">Центр решений</span><h3>{queue.totals.unowned ? unowned(queue.totals.unowned) : queue.rows.length ? "У каждого отклонения есть ответственный" : "Отклонений нет"}</h3></div>
      <div className="pl-decision-totals"><span className="danger">{queue.totals.unowned} без решения</span><span className="danger">{queue.totals.overdue} просрочено</span><span>{queue.totals.assigned} в работе</span><span>{queue.totals.snoozed} отложено</span></div>
    </header>
    {!ready && <p className="pl-error">Назначать ответственных можно после применения supabase/2026-10-20_company_pulse.sql.</p>}
    {queue.rows.length
      ? queue.rows.map((row) => <DecisionRow key={row.alert.id} row={row} people={people} onDecide={onDecide} onOpen={onOpenAlert} />)
      : <div className="pl-clear"><CheckCircle2 size={18} /><span>По загруженным данным отклонений нет.</span></div>}
    {queue.snoozed.length > 0 && <>
      <button type="button" className="pl-link" onClick={() => setShowSnoozed(!showSnoozed)}>{showSnoozed ? "Скрыть отложенные" : `Показать отложенные · ${queue.snoozed.length}`}</button>
      {showSnoozed && queue.snoozed.map((row) => <div key={row.alert.id} className="pl-snoozed"><BellOff size={14} /><span>{row.alert.label} · {row.alert.value}</span><small>до {dayLabel(row.until)}{row.decision.note ? ` · ${row.decision.note}` : ""}</small><Button size="sm" variant="ghost" onClick={() => onDecide(row.alert, "close", {})}>Вернуть</Button></div>)}
    </>}
  </Card>;
}

function TargetsDrawer({ open, monthLabel, target, onClose, onSave }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  React.useEffect(() => {
    if (open) setValues(Object.fromEntries(PLAN_METRICS.map((m) => [m.key, target?.[m.key] ?? ""])));
  }, [open, target]);
  const save = async () => {
    setBusy(true); setError("");
    const message = await onSave(Object.fromEntries(PLAN_METRICS.map((m) => [m.key, values[m.key] === "" || values[m.key] == null ? null : Number(values[m.key])])));
    setBusy(false);
    if (message) setError(message); else onClose();
  };
  return <DetailDrawer open={open} title={`Цели на ${monthLabel}`} onClose={onClose} placement="center"
    footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={busy} onClick={save}>Сохранить цели</Button></>}>
    <div className="pl-targets">
      <p>Пустое поле — цели по показателю нет. Прогноз и «нужно в день» появятся сразу после сохранения.</p>
      {PLAN_METRICS.map((m) => <Field key={m.key} label={m.label} hint={m.key === "mrr" ? "Цель по абонентской выручке на конец месяца" : m.format === "money" ? "₸ за месяц" : "за месяц"}>
        <input type="number" inputMode="numeric" min={m.key === "profit" ? undefined : 0} value={values[m.key] ?? ""} onChange={(event) => setValues({ ...values, [m.key]: event.target.value })} />
      </Field>)}
      {error && <p className="pl-error">{error}</p>}
    </div>
  </DetailDrawer>;
}

export default function Pulse({ monthLabel, elapsedShare, plan, target, runway, assumptions, funnel, queue, people, ready, onSaveTargets, onDecide, onNavigate, onOpenLead, onOpenAlert }) {
  const [targetsOpen, setTargetsOpen] = useState(false);
  const revenue = plan.find((row) => row.key === "revenue");
  const headline = [
    revenue?.target ? `выручка: прогноз ${revenue.forecastPct}% плана` : "цели месяца не заданы",
    runway.firstGap != null ? `кассовый разрыв на ${runway.firstGap + 1}-й неделе` : "денег хватает на 4 недели",
    queue.totals.unowned ? unowned(queue.totals.unowned) : null,
  ].filter(Boolean).join(" · ");
  return <div className="pl-dashboard">
    <Hero eyebrow={`Пульс · ${monthLabel}`} title={headline.charAt(0).toUpperCase() + headline.slice(1)} subtitle="План и прогноз месяца, деньги на 4 недели, абонентская база и решения по отклонениям — на одном экране."
      action={<Button variant="secondary" size="sm" onClick={() => setTargetsOpen(true)} disabled={!ready}><Target />Цели месяца</Button>} />

    <section className="pl-plan-grid" aria-label="План и факт месяца">
      {plan.map((row) => <PlanCard key={row.key} row={row} elapsedShare={elapsedShare} onSetTargets={() => setTargetsOpen(true)} />)}
    </section>

    <div className="pl-grid">
      <CashPanel runway={runway} assumptions={assumptions} onNavigate={onNavigate} />
      <FunnelPanel funnel={funnel} onNavigate={onNavigate} onOpenLead={onOpenLead} />
    </div>

    <DecisionPanel queue={queue} people={people} onDecide={ready ? onDecide : async () => "Сначала примените миграцию пульса."} onOpenAlert={onOpenAlert} ready={ready} />

    <TargetsDrawer open={targetsOpen} monthLabel={monthLabel} target={target} onClose={() => setTargetsOpen(false)} onSave={onSaveTargets} />
  </div>;
}
