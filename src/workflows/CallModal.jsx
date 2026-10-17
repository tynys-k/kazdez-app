import React, { useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { ModalShell } from "../modals";
import { formatPhone } from "../ui/formatters";
import { addressPlain, isoToRu, waLink } from "../shared";
import { CallLog } from "./ClientCalls";
import { CALL_OUTCOMES, CALL_STAGES, addDaysIso, callStageOf, outcomeLabel } from "./clientCallsModel";

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ORDER = ["no_answer", "callback", "agreed", "all_good", "declined", "complaint", "unreachable", "note"];

// Окно звонка клиенту. Сначала — что ответил клиент, затем комментарий.
// Итог сохраняется отдельной записью: прошлые попытки остаются в истории.
export default function CallModal({ job, calls = [], people = [], userId, isAdmin, onClose, onSave, onDelete }) {
  const stage = callStageOf(job);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState("");
  const [callbackOn, setCallbackOn] = useState(addDaysIso(today(), 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const meta = CALL_OUTCOMES[outcome];
  const digits = String(job.client_phone || "").replace(/\D/g, "");
  const wa = waLink(job.client_phone);

  async function save() {
    if (!outcome) { setError("Выберите, чем закончился звонок"); return; }
    if (meta.needsNote && !note.trim()) { setError("Напишите, что ответил клиент"); return; }
    if (outcome === "callback" && !callbackOn) { setError("Укажите, когда перезвонить"); return; }
    setSaving(true); setError("");
    const message = await onSave({ outcome, note: note.trim() || null, rating: meta.rating && rating ? Number(rating) : null, callback_on: outcome === "callback" ? callbackOn : null });
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <ModalShell wide title="Связаться с клиентом" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Закрыть</button>
      <button className="kd-btn primary" disabled={saving || !outcome} onClick={save}>{saving ? "Сохраняем…" : "Сохранить звонок"}</button>
    </>}>
      <div className="kd-callmodal">
        <div className="kd-callmodal-main">
          <div className="kd-callmodal-client">
            <div>
              <strong>{job.contact_name || "Клиент"} · {formatPhone(job.client_phone)}</strong>
              <span>{job.type} {isoToRu(job.scheduled_date)} · {job.pest} · {addressPlain(job.address)}</span>
              {CALL_STAGES[stage] && <small>{CALL_STAGES[stage].label}</small>}
            </div>
            <div className="kd-callmodal-dial">
              {digits && <a className="kd-btn ghost sm" href={`tel:+${digits}`}><Phone size={14} />Позвонить</a>}
              {wa && <a className="kd-btn wa sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>}
            </div>
          </div>

          <div className="kd-section">Чем закончился звонок</div>
          <div className="kd-call-outcomes" role="radiogroup" aria-label="Результат звонка">
            {ORDER.map((key) => (
              <button key={key} type="button" role="radio" aria-checked={outcome === key}
                className={`kd-call-outcome tone-${CALL_OUTCOMES[key].tone} ${outcome === key ? "on" : ""}`}
                onClick={() => { setOutcome(key); setError(""); }}>
                {outcomeLabel(key, stage)}
              </button>
            ))}
          </div>

          {outcome === "agreed" && <div className="kd-hint">Заявка уйдёт в «Повторные выезды» — там создаёшь вторичную заявку на удобную дату. Договорённость (день, время) напиши в комментарий.</div>}
          {outcome === "no_answer" && <div className="kd-hint">Клиент останется в очереди обзвона, попытка засчитается.</div>}
          {outcome === "unreachable" && <div className="kd-hint">Клиент уйдёт из очереди. Используй, когда дозвониться не получается уже несколько раз.</div>}

          {outcome === "callback" && (
            <label className="kd-field"><span>Когда перезвонить</span>
              <div className="kd-call-dates">
                <input type="date" value={callbackOn} min={today()} onChange={(e) => setCallbackOn(e.target.value)} />
                {[[1, "Завтра"], [3, "Через 3 дня"], [7, "Через неделю"]].map(([n, label]) => (
                  <button key={n} type="button" className={`kd-datechip ${callbackOn === addDaysIso(today(), n) ? "on" : ""}`} onClick={() => setCallbackOn(addDaysIso(today(), n))}>{label}</button>
                ))}
              </div>
            </label>
          )}

          {meta?.rating && (
            <label className="kd-field"><span>Оценка клиента (если назвал)</span>
              <div className="kd-call-rating">
                {[5, 4, 3, 2, 1].map((n) => <button key={n} type="button" className={`kd-datechip ${String(rating) === String(n) ? "on" : ""}`} onClick={() => setRating(String(rating) === String(n) ? "" : String(n))}>{n}</button>)}
              </div>
            </label>
          )}

          <label className="kd-field"><span>{meta?.needsNote ? "Что ответил клиент *" : "Комментарий"}</span>
            <textarea className="kd-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={outcome === "agreed" ? "Например: согласен на субботу после 14:00" : outcome === "declined" ? "Причина отказа" : "Что сказал клиент, о чём договорились…"} />
          </label>
          {error && <div className="kd-err">{error}</div>}
        </div>

        <div className="kd-callmodal-side">
          <div className="kd-section">История обращений · {calls.length}</div>
          <CallLog calls={calls} people={people} userId={userId} isAdmin={isAdmin} onDelete={onDelete} empty="Это первое обращение по заявке." />
        </div>
      </div>
    </ModalShell>
  );
}
