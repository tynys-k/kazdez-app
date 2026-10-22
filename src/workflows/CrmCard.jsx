// Общие части карточки CRM в духе Bitrix: воронка стадий сверху, слева
// данные, справа форма касания и лента всех событий клиента.
import React, { useState } from "react";
import { CalendarClock, ClipboardList, FileSignature, GitCommitHorizontal, MessageCircle, MessageSquareText, Phone, PhoneCall, Settings2, Users } from "lucide-react";
import { LEAD_ACTIVITY_OUTCOMES } from "../leadActivities";
import { FEED_FILTERS, composerBlockers, feedCounts, groupFeed } from "./crmFeed";
import "./crmCard.css";

const ICONS = {
  call: Phone, whatsapp: MessageCircle, message: MessageSquareText, meeting: Users, note: MessageSquareText,
  stage: GitCommitHorizontal, system: Settings2, job: ClipboardList, retention: PhoneCall, proposal: FileSignature,
};

// Воронка: пройденные стадии залиты, текущая выделена. Клик — перевод
// (проверку полей делает окно смены стадии).
export function StageBar({ stages = [], currentId, onPick, exits = [] }) {
  const index = stages.findIndex((stage) => String(stage.id) === String(currentId));
  return <div className="crm-stagebar">
    <div className="crm-stages" role="list">
      {stages.map((stage, i) => <button type="button" role="listitem" key={stage.id}
        className={`crm-stage ${i < index ? "done" : ""} ${i === index ? "on" : ""}`}
        title={stage.name} onClick={() => onPick?.(stage)}>{stage.name}</button>)}
    </div>
    {exits.length > 0 && <div className="crm-exits">{exits.map((stage) => <button type="button" key={stage.id}
      className={`kd-btn ghost sm ${String(stage.id) === String(currentId) ? "on" : ""}`} onClick={() => onPick?.(stage)}>{stage.name}</button>)}</div>}
  </div>;
}

export function InfoList({ rows = [] }) {
  const visible = rows.filter((row) => row && row[1] !== null && row[1] !== undefined && row[1] !== "" && row[1] !== false);
  if (!visible.length) return null;
  return <dl className="crm-info">{visible.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>;
}

export function CrmSection({ title, action, children }) {
  return <section className="crm-section"><header><h3>{title}</h3>{action}</header>{children}</section>;
}

const localInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const tomorrowAt = (hours = 10) => { const d = new Date(Date.now() + 86400000); d.setHours(hours, 0, 0, 0); return d; };

// Форма касания прямо в карточке: комментарий или звонок/WhatsApp/встреча
// с итогом и обязательным следующим шагом. Почему нельзя сохранить — пишет.
export function Composer({ kinds = ["note", "call", "whatsapp", "meeting"], closed = false, defaultNextAction = "Позвонить клиенту", onSubmit, notePlaceholder = "Комментарий: что важно знать по клиенту" }) {
  const labels = { note: "Комментарий", call: "Звонок", whatsapp: "WhatsApp", meeting: "Встреча", message: "Сообщение" };
  const [kind, setKind] = useState(kinds[0]);
  const [outcome, setOutcome] = useState("connected");
  const [comment, setComment] = useState("");
  const [nextAction, setNextAction] = useState(defaultNextAction);
  const [nextActionAt, setNextActionAt] = useState(localInput(tomorrowAt()));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [touched, setTouched] = useState(false);
  const isNote = kind === "note";
  const blockers = composerBlockers({ kind, outcome, comment, nextAction, nextActionAt, closed });
  async function submit() {
    setTouched(true);
    if (blockers.length || saving) return;
    setSaving(true); setProblem("");
    const error = await onSubmit({
      kind, outcome: isNote ? "note" : outcome, comment: comment.trim(),
      occurredAt: new Date().toISOString(),
      nextAction: isNote || closed ? null : nextAction.trim(),
      nextActionAt: isNote || closed ? null : new Date(nextActionAt).toISOString(),
    });
    setSaving(false);
    if (error) { setProblem(error); return; }
    setComment(""); setTouched(false);
    if (!isNote) { setNextAction(defaultNextAction); setNextActionAt(localInput(tomorrowAt())); }
  }
  return <div className="crm-composer">
    <div className="crm-composer-tabs" role="tablist">{kinds.map((id) => <button type="button" role="tab" aria-selected={kind === id} key={id}
      className={kind === id ? "on" : ""} onClick={() => { setKind(id); setProblem(""); }}>{labels[id]}</button>)}</div>
    {!isNote && <label className="crm-field"><span>Итог</span><select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
      {LEAD_ACTIVITY_OUTCOMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    <textarea className="crm-composer-text" rows={isNote ? 3 : 2} value={comment} onChange={(e) => setComment(e.target.value)}
      placeholder={isNote ? notePlaceholder : outcome === "no_answer" ? "Можно оставить пустым" : "Что сказал клиент, о чём договорились"} />
    {!isNote && !closed && <div className="crm-composer-next">
      <label className="crm-field"><span>Следующий шаг</span><input value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>
      <label className="crm-field"><span>Когда</span><input type="datetime-local" value={nextActionAt} min={localInput(new Date())} onChange={(e) => setNextActionAt(e.target.value)} /></label>
    </div>}
    {touched && blockers.length > 0 && <div className="kd-err">{blockers.join(" ")}</div>}
    {problem && <div className="kd-err">{problem}</div>}
    <div className="crm-composer-foot">
      {!touched && blockers.length > 0 && <span className="kd-muted">{blockers[0]}</span>}
      <button type="button" className="kd-btn primary sm" disabled={saving} onClick={submit}>{saving ? "Сохраняем…" : isNote ? "Добавить комментарий" : "Сохранить касание"}</button>
    </div>
  </div>;
}

export function Feed({ items = [], loading = false, empty = "Событий пока нет." }) {
  const [filter, setFilter] = useState("all");
  const counts = feedCounts(items);
  const days = groupFeed(items, { filter });
  return <div className="crm-feed">
    <div className="crm-feed-filters">{FEED_FILTERS.filter((f) => f.id === "all" || counts[f.id]).map((f) => <button type="button" key={f.id}
      className={`kd-datechip ${filter === f.id ? "on" : ""}`} onClick={() => setFilter(f.id)}>{f.label}{counts[f.id] ? ` · ${counts[f.id]}` : ""}</button>)}</div>
    {loading && <div className="kd-muted">Загружаем историю клиента…</div>}
    {!days.length && !loading && <div className="kd-empty">{empty}</div>}
    {days.map((day) => <div className="crm-day" key={day.key}>
      <div className="crm-day-label"><span>{day.label}</span></div>
      {day.items.map((item) => {
        const Icon = ICONS[item.icon] || CalendarClock;
        const time = item.dateOnly ? "" : new Date(item.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        return <article className={`crm-event ${item.group} ${item.tone || ""}`} key={item.id}>
          <span className="crm-event-icon"><Icon size={15} /></span>
          <div className="crm-event-body">
            <header><strong>{item.title}</strong><time>{time}</time></header>
            {item.body && <p>{item.body}</p>}
            {item.meta && <small>{item.meta}</small>}
          </div>
        </article>;
      })}
    </div>)}
  </div>;
}
