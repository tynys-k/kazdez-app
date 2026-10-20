import React, { useState } from "react";
import { MessageCircle, Phone, PhoneCall, Trash2 } from "lucide-react";
import { Badge } from "../ui/primitives";
import { formatPhone } from "../ui/formatters";
import { addressPlain, fmtTs, isoToRu, waLink } from "../shared";
import { CALL_OUTCOMES, CALL_STAGES, CLOSED_BY_LABELS, RESULT_FILTERS, addDaysIso, buildCallJournal, daysSinceIso, outcomeLabel } from "./clientCallsModel";
import "./clientCalls.css";

export const canDeleteCall = (call, { userId, isAdmin }) => !!call && (isAdmin || String(call.created_by) === String(userId));

// Одна запись журнала: исход, кто и когда звонил, что ответил клиент.
function CallEntry({ call, people, job, userId, isAdmin, onDelete, showJob }) {
  const meta = CALL_OUTCOMES[call.outcome] || CALL_OUTCOMES.note;
  const author = people.find((p) => String(p.id) === String(call.created_by))?.full_name || "Сотрудник";
  return (
    <li className={`kd-call-entry tone-${meta.tone}`}>
      <span className="kd-call-dot" aria-hidden="true" />
      <div className="kd-call-body">
        <div className="kd-call-top">
          <strong>{outcomeLabel(call.outcome, call.stage)}</strong>
          {call.rating && <Badge tone={call.rating >= 4 ? "positive" : call.rating <= 3 ? "danger" : "neutral"}>{call.rating}/5</Badge>}
          {call.outcome === "callback" && call.callback_on && <Badge tone="info">перезвонить {isoToRu(call.callback_on)}</Badge>}
        </div>
        {call.note && <p>{call.note}</p>}
        <small>
          {fmtTs(call.created_at)} · {author}
          {CALL_STAGES[call.stage] ? ` · ${CALL_STAGES[call.stage].label.toLowerCase()}` : ""}
          {showJob && job ? ` · ${job.type || "выезд"} ${isoToRu(job.scheduled_date)}${job.pest ? ` · ${job.pest}` : ""}` : ""}
        </small>
      </div>
      {onDelete && canDeleteCall(call, { userId, isAdmin }) && (
        <button type="button" className="kd-call-del" title="Удалить ошибочную запись" aria-label="Удалить запись" onClick={() => onDelete(call)}>
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}

export function CallLog({ calls = [], people = [], jobs = [], userId, isAdmin, onDelete, showJob = false, empty = "Обращений пока не было." }) {
  if (!calls.length) return <div className="kd-call-empty">{empty}</div>;
  const jobById = new Map(jobs.map((j) => [String(j.id), j]));
  return (
    <ul className="kd-call-log">
      {calls.map((call) => <CallEntry key={call.id} call={call} people={people} job={jobById.get(String(call.job_id))} userId={userId} isAdmin={isAdmin} onDelete={onDelete} showJob={showJob} />)}
    </ul>
  );
}

// Правая колонка карточки заявки: статус обзвона и последние обращения.
export function JobCallPanel({ job, state, people, userId, isAdmin, onCall, onDelete }) {
  if (!state) return null;
  if ((state.stage === "other" || job.status !== "done") && !state.calls.length) return null;
  const status = state.closed
    ? { tone: "positive", text: state.closingCall ? outcomeLabel(state.closingCall.outcome, state.stage) : CLOSED_BY_LABELS[state.closedBy] }
    : state.callbackOn
      ? { tone: "info", text: `Перезвонить ${isoToRu(state.callbackOn)}` }
      : state.attempts
        ? { tone: "warning", text: `Не дозвонились · ${state.attempts} ${state.attempts === 1 ? "попытка" : state.attempts < 5 ? "попытки" : "попыток"}` }
        : { tone: "warning", text: state.dueOn && daysSinceIso(state.dueOn) === 0 && new Date(`${state.dueOn}T00:00:00`) > new Date() ? `Звонок с ${isoToRu(state.dueOn)}` : "Пора связаться" };
  return (
    <aside className="kd-job-calls" aria-label="Обращения к клиенту">
      <div className="kd-job-calls-head">
        <div>
          <div className="kd-section">Обращения</div>
          {CALL_STAGES[state.stage] && <small>{CALL_STAGES[state.stage].label}</small>}
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      {onCall && <button type="button" className="kd-btn primary sm kd-job-calls-cta" onClick={onCall}><PhoneCall size={14} />Связаться с клиентом</button>}
      <CallLog calls={state.calls.slice(0, 6)} people={people} userId={userId} isAdmin={isAdmin} onDelete={onDelete} empty="Клиенту ещё не звонили по этой заявке." />
      {state.calls.length > 6 && <small className="kd-muted">Ещё {state.calls.length - 6} — в истории клиента.</small>}
      {state.legacy && <small className="kd-muted">Старый контроль качества: {({ positive: "всё хорошо", repeat: "нужен повтор", complaint: "претензия", no_answer: "не ответил" })[state.legacy.result] || state.legacy.result}{state.legacy.rating ? ` · ${state.legacy.rating}/5` : ""}</small>}
    </aside>
  );
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function QueueRow({ item, people, onCall, onOpenJob }) {
  const { job } = item;
  const last = item.last;
  const lastAuthor = last ? people.find((p) => String(p.id) === String(last.created_by))?.full_name : "";
  const wa = waLink(job.client_phone);
  const overdueDays = daysSinceIso(item.nextOn);
  return (
    <div className={`kd-callq-row ${item.attempts ? "retry" : ""}`}>
      <button type="button" className="kd-callq-main" onClick={() => onOpenJob?.(job)}>
        <strong>{job.contact_name ? `${job.contact_name} · ` : ""}{formatPhone(job.client_phone)}</strong>
        <span>{job.pest || job.type} · {addressPlain(job.address) || "адрес не указан"}</span>
        <small>
          {job.type} {isoToRu(job.scheduled_date)} · {daysSinceIso(item.doneDay)} дн. назад
          {last ? ` · последний звонок ${fmtTs(last.created_at)}${lastAuthor ? ` (${lastAuthor})` : ""}` : ""}
        </small>
        {last?.note && <small className="kd-callq-note">«{last.note}»</small>}
      </button>
      <div className="kd-callq-side">
        {item.callbackOn
          ? <Badge tone="info">перезвонить {isoToRu(item.callbackOn)}</Badge>
          : item.attempts
            ? <Badge tone={item.attempts >= 3 ? "danger" : "warning"} title={item.attempts >= 3 ? "Можно закрыть как «Не выходит на связь»" : undefined}>
                {item.attempts} {plural(item.attempts, "попытка", "попытки", "попыток")} · не ответил{item.retryOn && new Date(`${item.retryOn}T00:00:00`) > new Date() ? " · набирали сегодня" : ""}
              </Badge>
            : <Badge tone={overdueDays > 3 ? "danger" : "neutral"}>{overdueDays ? `ждёт ${overdueDays} дн.` : "сегодня"}</Badge>}
        <div className="kd-callq-actions">
          {wa && <a className="kd-btn wa sm" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={14} /></a>}
          <a className="kd-btn ghost sm" href={`tel:+${String(job.client_phone || "").replace(/\D/g, "")}`} aria-label="Позвонить"><Phone size={14} /></a>
          <button type="button" className="kd-btn primary sm" onClick={() => onCall(job)}><PhoneCall size={14} />Связаться</button>
        </div>
      </div>
    </div>
  );
}

// Итог заявки в журнале «Обзвонили».
function resultBadge(entry) {
  if (entry.result === "pending") {
    const last = entry.calls.find((c) => c.outcome !== "note");
    if (last?.outcome === "callback") return <Badge tone="info">перезвонить {isoToRu(last.callback_on)}</Badge>;
    const attempts = entry.calls.filter((c) => c.outcome === "no_answer").length;
    return <Badge tone="warning">не дозвонились · {attempts} {plural(attempts, "попытка", "попытки", "попыток")}</Badge>;
  }
  if (entry.result === "note") return <Badge tone="neutral">только комментарий</Badge>;
  const tone = CALL_OUTCOMES[entry.result]?.tone;
  return <Badge tone={tone === "positive" || tone === "danger" ? tone : "neutral"}>{outcomeLabel(entry.result, entry.stage)}</Badge>;
}

function JournalRow({ entry, people, jobs, userId, isAdmin, onDelete, onCall, onOpenJob }) {
  const [open, setOpen] = useState(false);
  const { job } = entry;
  const lastNote = entry.calls.find((c) => c.note)?.note;
  return (
    <div className={`kd-calljr-row ${open ? "open" : ""}`}>
      <div className="kd-calljr-head">
        <button type="button" className="kd-callq-main" onClick={() => job && onOpenJob?.(job)}>
          <strong>{job?.contact_name ? `${job.contact_name} · ` : ""}{formatPhone(entry.phone)}</strong>
          {job && <span>{job.pest || job.type} · {addressPlain(job.address) || "адрес не указан"}</span>}
          <small>
            {CALL_STAGES[entry.stage]?.label || "Обзвон"}
            {job ? ` · ${job.type} ${isoToRu(job.scheduled_date)}` : ""}
            {` · последний звонок ${fmtTs(entry.lastAt)}`}
          </small>
          {!open && lastNote && <small className="kd-callq-note">«{lastNote}»</small>}
        </button>
        <div className="kd-callq-side">
          <div className="kd-calljr-badges">
            {resultBadge(entry)}
            {entry.rating && <Badge tone={entry.rating >= 4 ? "positive" : entry.rating <= 3 ? "danger" : "neutral"}>{entry.rating}/5</Badge>}
          </div>
          <div className="kd-callq-actions">
            <button type="button" className="kd-btn ghost sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Свернуть" : `Все записи · ${entry.calls.length}`}
            </button>
            {job && <button type="button" className="kd-btn ghost sm" onClick={() => onCall(job)}><PhoneCall size={14} />Связаться</button>}
          </div>
        </div>
      </div>
      {open && <CallLog calls={entry.calls} people={people} jobs={jobs} userId={userId} isAdmin={isAdmin} onDelete={onDelete} />}
    </div>
  );
}

function journalSince(windowDays) {
  if (!windowDays) return "";
  const now = new Date();
  return addDaysIso(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, -windowDays);
}

const JOURNAL_STAGES =[["all", "Все этапы"], ["after_primary", "После первичной"], ["after_secondary", "После вторичной"]];

// «Согласился» после первичной — посадили на вторичную, после вторичной — нужен повтор.
const resultFilterLabel = (id, label, stage) => (id !== "agreed" ? label : stage === "after_primary" ? "Посадили на вторичную" : stage === "after_secondary" ? "Нужен повтор" : label);

function CallJournal({ jobs, calls, people, windowDays, userId, isAdmin, onDelete, onCall, onOpenJob }) {
  const [stage, setStage] = useState("all");
  const [result, setResult] = useState("all");
  const [authorId, setAuthorId] = useState("");
  const sinceIso = journalSince(windowDays);
  const { items, counts } = buildCallJournal(jobs, calls, { sinceIso, stage, result, authorId });
  const authorIds = new Set(calls.filter((c) => !c.deleted_at).map((c) => String(c.created_by)));
  const authors = people.filter((p) => authorIds.has(String(p.id)));
  return (
    <>
      <div className="kd-calljr-filters">
        <div className="kd-calljr-chips" role="group" aria-label="Этап">
          {JOURNAL_STAGES.map(([id, label]) => (
            <button key={id} type="button" className={stage === id ? "on" : ""} aria-pressed={stage === id} onClick={() => setStage(id)}>{label}<b>{counts.stage[id]}</b></button>
          ))}
        </div>
        <div className="kd-calljr-chips" role="group" aria-label="Ответ клиента">
          {RESULT_FILTERS.map(([id, label]) => (
            <button key={id} type="button" className={result === id ? "on" : ""} aria-pressed={result === id} onClick={() => setResult(id)}>{resultFilterLabel(id, label, stage)}<b>{counts.result[id]}</b></button>
          ))}
        </div>
        {authors.length > 1 && (
          <select className="kd-calljr-author" value={authorId} onChange={(e) => setAuthorId(e.target.value)} aria-label="Кто звонил">
            <option value="">Все сотрудники</option>
            {authors.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>
      {items.length === 0
        ? <div className="kd-empty">За выбранный период таких звонков нет.</div>
        : <div className="kd-callq-list">{items.slice(0, 100).map((entry) => <JournalRow key={entry.jobId} entry={entry} people={people} jobs={jobs} userId={userId} isAdmin={isAdmin} onDelete={onDelete} onCall={onCall} onOpenJob={onOpenJob} />)}</div>}
      {items.length > 100 && <div className="kd-muted" style={{ marginTop: 8 }}>Показаны последние 100 из {items.length}. Сузь фильтр или период.</div>}
    </>
  );
}

const WINDOWS =[["30", "30 дн."], ["60", "60 дн."], ["90", "90 дн."], ["0", "Все"]];

// Очередь обзвона на вкладке «Обзвон и качество».
export function CallQueue({ queue, view, onViewChange, windowDays, onWindowChange, people = [], onCall, onOpenJob, jobs = [], calls = [], userId, isAdmin, onDelete }) {
  const views = [
    { id: "after_primary", label: "После первичной", count: queue.after_primary.length },
    { id: "after_secondary", label: "После вторичной", count: queue.after_secondary.length },
    { id: "later", label: "Перезвонить позже", count: queue.later.length },
    { id: "journal", label: "Обзвонили", count: buildCallJournal(jobs, calls, { sinceIso: journalSince(windowDays) }).items.length },
  ];
  const items = queue[view] || [];
  const hint = {
    after_primary: "Клиенты через 5+ дней после первичной. Цель — посадить на вторичную. Кого посадили, уходят в «Повторные выезды»; «не дозвонился» остаётся здесь до ответа.",
    after_secondary: "Клиенты через 7+ дней после вторичной: проверить результат. Если всё хорошо — закрыть; если нужна ещё обработка — на повтор.",
    later: "Клиенты попросили перезвонить. Появятся в своих списках в назначенный день.",
    journal: "Все, кому уже звонили: что ответил клиент, оценка и комментарии. Период — по дате последнего звонка.",
  }[view];
  return (
    <section className="kd-card kd-callq">
      <div className="kd-stage2head">
        <div>
          <div className="kd-title">Обзвон после выездов</div>
          <div className="kd-muted">{hint}</div>
        </div>
        <div className="kd-seg" role="group" aria-label={view === "journal" ? "Период звонков" : "Давность выезда"}>
          {WINDOWS.map(([value, label]) => <button key={value} type="button" className={`kd-segbtn ${String(windowDays) === value ? "on" : ""}`} onClick={() => onWindowChange(Number(value))}>{label}</button>)}
        </div>
      </div>
      <div className="kd-callq-tabs" role="tablist">
        {views.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? "on" : ""} onClick={() => onViewChange(v.id)}>
            {v.label}<b>{v.count}</b>
          </button>
        ))}
      </div>
      {view === "journal"
        ? <CallJournal jobs={jobs} calls={calls} people={people} windowDays={windowDays} userId={userId} isAdmin={isAdmin} onDelete={onDelete} onCall={onCall} onOpenJob={onOpenJob} />
        : items.length === 0
        ? <div className="kd-empty">{view === "later" ? "Отложенных звонков нет." : "Всех обзвонили — очередь пуста."}{queue.upcoming && view !== "later" ? ` Ещё ${queue.upcoming} ${plural(queue.upcoming, "клиент подойдёт", "клиента подойдут", "клиентов подойдут")} в ближайшие дни.` : ""}</div>
        : <div className="kd-callq-list">{items.slice(0, 60).map((item) => <QueueRow key={item.job.id} item={item} people={people} onCall={onCall} onOpenJob={onOpenJob} />)}</div>}
      {view !== "journal" && items.length > 60 && <div className="kd-muted" style={{ marginTop: 8 }}>Показаны первые 60 из {items.length}. Сначала те, кто ждёт дольше.</div>}
    </section>
  );
}
