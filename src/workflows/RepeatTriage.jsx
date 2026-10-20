import React from "react";
import { MessageCircle, Phone, PhoneCall, RefreshCw } from "lucide-react";
import { Badge } from "../ui/primitives";
import { formatPhone } from "../ui/formatters";
import { addressPlain, fmt, fmtTs, isoToRu, waLink } from "../shared";
import { REPEAT_DUE_DAYS, TRIAGE_BUCKETS } from "./repeatTriageModel";
import "./repeatTriage.css";

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Чем дольше без решения, тем меньше шанс продать вторичную.
export const urgencyOf = (days) => (days >= 14 ? "late" : days >= 9 ? "hot" : "due");

// Метка в строке «Выполненных»: решение по повтору одним взглядом.
export function RepeatTag({ entry }) {
  if (!entry) return null;
  if (entry.bucket === "pending") return <span className={`kd-repeat-tag ${urgencyOf(entry.days)}`}>повтор? · {entry.days} дн. без решения</span>;
  if (entry.bucket === "repeat") return <span className="kd-repeat-tag ok">на повтор · {entry.reason}</span>;
  if (entry.bucket === "closed") return <span className="kd-repeat-tag muted">повтор не нужен · {entry.reason}</span>;
  return null;
}

const BUCKET_ORDER = ["pending", "repeat", "closed", "soon"];

// Шапка «Выполненных»: сколько первичных ждут решения и сколько это денег.
export function RepeatTriageBar({ triage, value, onChange }) {
  const { totals, conversion, windowDays } = triage;
  const pending = totals.pending;
  return (
    <section className={`kd-repeat-bar ${pending.count ? "has-pending" : ""}`} aria-label="Повтор после первичной">
      <div className="kd-repeat-bar-head">
        <span className="kd-repeat-bar-icon"><RefreshCw size={18} /></span>
        <div className="kd-repeat-bar-text">
          <strong>
            {pending.count
              ? <>{pending.count} {plural(pending.count, "первичная ждёт", "первичные ждут", "первичных ждут")} решения по повтору</>
              : "Все первичные разобраны"}
          </strong>
          <span>
            {pending.count ? <>до <b>~{fmt(pending.value)} ₸</b> на вторичных · </> : null}
            через {REPEAT_DUE_DAYS} дней после выезда — посадить на повтор или закрыть
            {conversion != null ? ` · конверсия в повтор ${conversion}%` : ""}
            {` · за ${windowDays} дн.`}
          </span>
        </div>
      </div>
      <div className="kd-repeat-chips" role="group" aria-label="Решение по повтору">
        <button type="button" className={value === "all" ? "on" : ""} aria-pressed={value === "all"} onClick={() => onChange("all")}>Все выполненные</button>
        {BUCKET_ORDER.map((id) => (
          <button key={id} type="button" title={TRIAGE_BUCKETS[id].hint}
            className={`b-${id} ${value === id ? "on" : ""}`} aria-pressed={value === id} onClick={() => onChange(id)}>
            {TRIAGE_BUCKETS[id].label}<b>{totals[id].count}</b>
            {id === "repeat" && totals.repeat.value > 0 && <em>~{fmt(totals.repeat.value)} ₸</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function PendingRow({ entry, people, onCall, onRepeat, onOpenJob }) {
  const { job, state, days, value } = entry;
  const last = state.last;
  const lastAuthor = last ? people.find((p) => String(p.id) === String(last.created_by))?.full_name : "";
  const lastNote = state.calls.find((c) => c.note)?.note;
  const wa = waLink(job.client_phone);
  const urgency = urgencyOf(days);
  return (
    <div className={`kd-repeat-row ${urgency}`}>
      <div className="kd-repeat-days" aria-label={`${days} дней после первичной`}>
        <strong>{days}</strong><small>{plural(days, "день", "дня", "дней")}</small>
      </div>
      <button type="button" className="kd-repeat-main" onClick={() => onOpenJob?.(job)}>
        <strong>{job.contact_name ? `${job.contact_name} · ` : ""}{formatPhone(job.client_phone)}</strong>
        <span>{job.pest || "Обработка"} · {addressPlain(job.address) || "адрес не указан"}</span>
        <small>
          Первичная {isoToRu(job.scheduled_date)}
          {last
            ? ` · ${last.outcome === "no_answer" ? `не дозвонились (${state.attempts})` : last.outcome === "callback" ? `перезвонить ${isoToRu(state.callbackOn)}` : "был звонок"} ${fmtTs(last.created_at)}${lastAuthor ? ` · ${lastAuthor}` : ""}`
            : " · ещё не звонили"}
        </small>
        {lastNote && <small className="kd-repeat-note">«{lastNote}»</small>}
      </button>
      <div className="kd-repeat-side">
        {value > 0 && <span className="kd-repeat-value">~{fmt(value)} ₸</span>}
        <div className="kd-repeat-actions">
          {wa && <a className="kd-btn wa sm" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={14} /></a>}
          <a className="kd-btn ghost sm" href={`tel:+${String(job.client_phone || "").replace(/\D/g, "")}`} aria-label="Позвонить"><Phone size={14} /></a>
          {onCall && <button type="button" className="kd-btn ghost sm" onClick={() => onCall(job)}><PhoneCall size={14} />Итог звонка</button>}
          {onRepeat && <button type="button" className="kd-btn primary sm" onClick={() => onRepeat(job)}><RefreshCw size={14} />На повтор</button>}
        </div>
      </div>
    </div>
  );
}

// Рабочий список «Не разобрано»: дольше всех ждёт — сверху.
export function RepeatPendingList({ entries, people = [], onCall, onRepeat, onOpenJob }) {
  if (!entries.length) return <div className="kd-empty">Не разобранных первичных нет — каждой уже дали решение по повтору.</div>;
  const late = entries.filter((e) => urgencyOf(e.days) === "late").length;
  return (
    <>
      <div className="kd-muted kd-repeat-listhint">
        Позвони, предложи вторичную и отметь итог. «Посадил на вторичную» отправит заявку в «Повторные выезды», «Всё хорошо» или «Отказ» — закроет.
        {late ? ` ${late} ${plural(late, "клиент ждёт", "клиента ждут", "клиентов ждут")} больше двух недель — звонить первыми.` : ""}
      </div>
      <div className="kd-repeat-list">
        {entries.map((entry) => <PendingRow key={entry.job.id} entry={entry} people={people} onCall={onCall} onRepeat={onRepeat} onOpenJob={onOpenJob} />)}
      </div>
    </>
  );
}
