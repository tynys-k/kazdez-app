// KAZDEZ-WHATSAPP-FIX-V4-2026-07-17 — разные сообщения для администратора и дезинфектора
import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Trash2, Plus, MessageCircle, Pencil, UserPlus, X, ChevronRight, ChevronLeft, Info, Phone, MapPin } from "lucide-react";
import { AddressText, DOC_TYPES, DRIVE_LINKS, EQUIP_CATEGORIES, GUARANTEE_KINDS, REPEAT_POLICIES, STATUS, TAB_LABELS, TASK_TYPES, TENDER_STATUS, buildMsg, chemUnit, copyText, daysSince, fmt, fmtAmount, fmtTs, isoToRu, lineAmount, norm } from "./shared";

function roleWhatsappUrl(job, isAdmin) {
  const phone = String(job?.client_phone || "").replace(/\D/g, "");
  if (!phone) return "";
  // Администратору нужен обычный пустой чат без заготовленного текста.
  if (isAdmin) return `https://wa.me/${phone}`;
  // Дезинфектору подставляем время начала визита из заявки.
  const time = (String(job?.scheduled_time || "").match(/(?:[01]?\d|2[0-3]):[0-5]\d/) || [])[0];
  const message = time
    ? `Сәлеметсіз бе! Мен дезинфектормын, сізге дезинфекция бойынша жазып отырмын. Сіздерде сағат ${time}-де боламын.\n\nЗдравствуйте! Пишу по поводу дезинфекции. Я дезинфектор, приеду к вам к ${time}.`
    : "Сәлеметсіз бе! Мен дезинфектормын, сізге дезинфекция бойынша жазып отырмын. Сіздерде келісілген уақытта боламын.\n\nЗдравствуйте! Пишу по поводу дезинфекции. Я дезинфектор, приеду к вам в согласованное время.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function JobCard({ job, isAdmin, assignedName, partnerName, partnerRepeat, share, executorName, onExecutorDone, onExecutorPaid, onCopy, onReport, onAssign, onView, onEdit, onRepeat, onPayPartner, onCompPaid, onHistory, onOpenDetails, onCancel, onRestore, onTransferPaid, onTechExtras, onRequestEdit, onApproveEdit, onRejectEdit, onDelete, onCert, onAct }) {
  const st = STATUS[job.status] || STATUS.new;
  const brandLabel = job.brand === "Sanitex" ? "Sanitex" : job.brand === "partner" ? "Партнёр" : "KazDez";
  const needsFollowup = job.type === "Первичная" && job.status === "done" && !job.repeat_state && daysSince(job.reported_at) >= 5;
  const phoneDigits = String(job.client_phone || "").replace(/\D/g, "");
  const addressUrl = (String(job.address || "").match(/https?:\/\/[^\s]+/) || [])[0];
  const mapUrl = addressUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address || "")}`;
  const whatsappUrl = roleWhatsappUrl(job, isAdmin);
  return (
    <div className={`kd-card ${job.status === "done" ? "done" : ""} ${needsFollowup ? "low" : ""}`}>
      <div className="kd-card-head"><div className="kd-pest">{job.pest}</div><span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span></div>
      <div className="kd-meta">
        <span className="kd-brandtag">{brandLabel}</span>
        <span>{job.type}</span><span>·</span><span className="kd-datetimetag">{isoToRu(job.scheduled_date) || "без даты"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</span>
        {job.floor && (<><span>·</span><span>{job.floor} этаж</span></>)}
        {job.area && (<><span>·</span><span>{job.area} м²</span></>)}
      </div>
      <div className="kd-addr"><AddressText text={job.address} /></div>
      {job.note && <div className="kd-notebox">📝 {job.note}</div>}
      <div className="kd-prices">
        {(job.price_options || []).map((p, i) => (<span className="kd-price" key={i}>{fmt(p.amount)} ₸{p.label ? <em> · {p.label}</em> : null}</span>))}
        {job.source && <span className="kd-srctag">{job.source}</span>}
        {job.docs_needed && <span className="kd-doctag">{job.docs_done ? "Документы готовы" : "Нужны документы"}</span>}
        {job.repeat_state === "on_repeat" && <span className="kd-repeattag">на повторе</span>}
        {job.repeat_state === "finished" && <span className="kd-muted">завершена</span>}
        {needsFollowup && <span className="kd-followuptag">💬 пора связаться · {daysSince(job.reported_at)} дн. после первичной</span>}
      </div>
      <div className="kd-card-foot">
        <button className="kd-clientlink" onClick={onHistory} title="Показать все заявки этого клиента">Клиент: {job.client_phone}{job.contact_name ? ` (${job.contact_name})` : ""}</button>
        {Array.isArray(job.extra_contacts) && job.extra_contacts.length > 0 && job.extra_contacts.map((c, i) => (
          <a key={i} href={`tel:${(c.phone || "").replace(/\s/g, "")}`} className="kd-muted" style={{ fontWeight: 700, color: "var(--primary-d)" }}>☎ {c.phone}{c.role ? ` — ${c.role}` : ""}</a>
        ))}
        {isAdmin && job.partner_id && <span className="kd-muted">Партнёр: {partnerName || "?"}{job.joint_work ? ` · совместная работа · доля в прибыли ${job.partner_share ?? 0}%${job.joint_supplier === "us" ? ` · его расходы ${job.joint_cost_share ?? 0}%` : " · препараты партнёра"}` : ` · доля ${job.partner_share ?? 0}%`}</span>}
        {isAdmin && job.brand === "partner" && partnerRepeat && <span className="kd-muted">Повтор: {partnerRepeat}</span>}
        {isAdmin && share > 0 && <span className={job.partner_paid ? "kd-muted paid" : "kd-muted"}>Доля партнёру: {fmt(share)} ₸ · {job.partner_paid ? "выплачено" : "к выплате"}</span>}
        {isAdmin && job.partner_comp > 0 && <span className={job.partner_comp_paid ? "kd-muted paid" : "kd-muted"} style={{ color: job.partner_comp_paid ? undefined : "#B4650B", fontWeight: 700 }}>💳 Компенсация от партнёра нам: {fmt(job.partner_comp)} ₸ · {job.partner_comp_paid ? "получено" : "ожидаем на Kaspi"}</span>}
        {isAdmin && !job.executor_partner_id && <span className="kd-muted">{assignedName ? "Дезинфектор: " + assignedName : "Не назначен"}</span>}
        {job.executor_partner_id && <span className="kd-muted" style={{ fontWeight: 700 }}>🤝 Исполнитель: {executorName || "партнёр"} · его доля {job.executor_share_pct || 0}%</span>}
        {isAdmin && job.executor_partner_id && job.status === "done" && job.executor_settlement === "qr_full" && (
          <span className="kd-muted" style={{ color: job.executor_paid ? undefined : "#B42318", fontWeight: 700 }}>
            Доля исполнителю: {fmt(Math.round((Number(job.report_paid) || 0) * (Number(job.executor_share_pct) || 0) / 100))} ₸ · {job.executor_paid ? "выплачена" : "к выплате"}
          </span>
        )}
        {job.report_paid != null && <span className="kd-muted paid">Оплачено: {fmt(job.report_paid)} ₸</span>}
        {Number(job.report_transfer) > 0 && (
          <span className="kd-muted" style={{ color: job.transfer_paid ? "#0E7C66" : "#B4650B", fontWeight: 700 }}>
            💳 Перечисление {fmt(job.report_transfer)} ₸ — {job.transfer_paid ? `оплачено ${isoToRu(job.transfer_paid_date) || ""}` : "ждём оплату"}
          </span>
        )}
        {isAdmin && (Number(job.tech_bonus) > 0 || Number(job.tech_travel) > 0) && (
          <span className="kd-muted" style={{ color: "var(--violet)", fontWeight: 700 }}>
            🎁 {Number(job.tech_bonus) > 0 ? `бонус ${fmt(job.tech_bonus)} ₸` : ""}{Number(job.tech_bonus) > 0 && Number(job.tech_travel) > 0 ? " · " : ""}{Number(job.tech_travel) > 0 ? `дорожные ${fmt(job.tech_travel)} ₸` : ""}
          </span>
        )}
        {job.status === "canceled" && <span className="kd-muted" style={{ color: "#B3261E", fontWeight: 700 }}>Отменена{job.cancel_reason ? ": " + job.cancel_reason : ""}</span>}
        {job.edit_request_status === "requested" && <span className="kd-muted" style={{ color: "#B4650B", fontWeight: 700 }}>⏳ Запрос на изменение отчёта{job.edit_request_reason ? ": " + job.edit_request_reason : ""}{isAdmin ? " — нужно решение" : " — ждём ответа админа"}</span>}
        {job.edit_request_status === "approved" && <span className="kd-muted" style={{ color: "#0E7C66", fontWeight: 700 }}>✅ Изменение отчёта разрешено{!isAdmin ? " — можешь переоткрыть отчёт" : ""}</span>}
      </div>
      <div className="kd-quickactions" aria-label="Быстрые действия">
        {phoneDigits && <a className="kd-quickbtn" href={`tel:+${phoneDigits}`}><Phone size={15} />Позвонить</a>}
        {phoneDigits && <a className="kd-quickbtn wa" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a>}
        {job.address && <a className="kd-quickbtn" href={mapUrl} target="_blank" rel="noreferrer"><MapPin size={15} />Маршрут</a>}
      </div>
      <div className="kd-actions">
        {!isAdmin && job.status !== "done" && job.status !== "canceled" && <button className="kd-btn ghost" onClick={onOpenDetails}>Открыть</button>}
        {!job.executor_partner_id && job.status !== "done" && job.status !== "canceled" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
        {isAdmin && job.executor_partner_id && job.status !== "done" && job.status !== "canceled" && <button className="kd-btn primary" onClick={() => onExecutorDone()}>Выполнено (оплата)</button>}
        {job.status !== "done" && job.status !== "canceled" && <button className="kd-btn ghost danger" onClick={onCancel}>Клиент отказался</button>}
        {isAdmin && !job.executor_partner_id && job.status !== "canceled" && <button className="kd-btn ghost" onClick={onAssign}><UserPlus size={14} />{assignedName ? "Переназначить" : "Назначить"}</button>}
        {isAdmin && job.status !== "canceled" && <button className="kd-btn ghost" onClick={onEdit}><Pencil size={14} />Изменить</button>}
        {job.status === "done" && <button className="kd-btn ghost" onClick={onView}>Отчёт</button>}
        {isAdmin && job.status === "done" && job.type === "Первичная" && onAct && <button className="kd-btn ghost" onClick={onAct}>Акт</button>}
        {isAdmin && job.status === "done" && job.type !== "Первичная" && onCert && <button className="kd-btn ghost" onClick={onCert}>Сертификат</button>}
        {isAdmin && job.status === "done" && !job.repeat_state && <button className="kd-btn ghost" onClick={onRepeat}>На повтор</button>}
        {isAdmin && job.status === "canceled" && <button className="kd-btn primary" onClick={() => onRestore()}>Вернуть в работу</button>}
        {isAdmin && share > 0 && <button className="kd-btn ghost" onClick={() => onPayPartner(!job.partner_paid)}>{job.partner_paid ? "Отменить выплату" : "Выплатить долю"}</button>}
        {isAdmin && job.partner_comp > 0 && <button className="kd-btn ghost" onClick={() => onCompPaid(!job.partner_comp_paid)}>{job.partner_comp_paid ? "Компенсация не получена" : "Компенсация получена"}</button>}
        {isAdmin && job.status === "done" && Number(job.report_transfer) > 0 && !job.transfer_paid && <button className="kd-btn primary sm" onClick={() => onTransferPaid()}>💳 Зачесть оплату ({fmt(job.report_transfer)})</button>}
        {isAdmin && job.executor_partner_id && job.status === "done" && job.executor_settlement === "qr_full" && <button className="kd-btn ghost" onClick={() => onExecutorPaid(!job.executor_paid)}>{job.executor_paid ? "Доля не выплачена" : "Выплатить долю исполнителю"}</button>}
        {isAdmin && job.status === "done" && <button className="kd-btn ghost sm" onClick={() => onTechExtras()}>Бонус / дорожные</button>}
        {!isAdmin && job.status === "done" && !job.edit_request_status && <button className="kd-btn ghost sm" onClick={() => onRequestEdit()}>Запросить изменение</button>}
        {!isAdmin && job.status === "done" && job.edit_request_status === "approved" && <button className="kd-btn primary sm" onClick={onReport}>Изменить отчёт</button>}
        {isAdmin && job.edit_request_status === "requested" && <button className="kd-btn primary sm" onClick={() => onApproveEdit()}>Разрешить изменение</button>}
        {isAdmin && job.edit_request_status === "requested" && <button className="kd-btn ghost danger sm" onClick={() => onRejectEdit()}>Отклонить</button>}
        {isAdmin && <button className="kd-btn ghost danger sm" onClick={onDelete} title="Удалить"><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}

function RepeatCard({ job, onSaveNote, onCreate, onFinish, onUnset, repeatHint }) {
  const [note, setNote] = useState(job.repeat_note || "");
  const days = daysSince(job.repeat_since);
  const due = days >= 5;
  return (
    <div className={`kd-card ${due ? "low" : ""}`}>
      <div className="kd-card-head">
        <div className="kd-pest">{job.pest}</div>
        <span className="kd-badge" style={due ? { color: "#B42318", background: "#FCE6E4" } : { color: "#B45309", background: "#FCF1E2" }}>
          {due ? "пора связаться" : `${days} дн. назад`}
        </span>
      </div>
      <div className="kd-addr"><AddressText text={job.address} /></div>
      <div className="kd-card-foot"><span className="kd-muted">Клиент: {job.client_phone}</span></div>
      {repeatHint && <div className="kd-hint">💡 {repeatHint}</div>}
      <Field label="Как прошёл созвон / заметка">
        <textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: созвонился, согласен на субботу" />
      </Field>
      <div className="kd-actions">
        <button className="kd-btn ghost sm" onClick={() => onSaveNote(job, note)}>Сохранить заметку</button>
        <button className="kd-btn primary sm" onClick={() => onCreate(job)}>Создать повторную заявку</button>
        <button className="kd-btn ghost danger sm" onClick={() => onFinish(job)}>Отказался — завершить</button>
        <button className="kd-btn ghost sm" onClick={() => onUnset(job)}>Убрать с повтора</button>
      </div>
    </div>
  );
}

// ----------------------------- modals -----------------------------
function ConfirmModal({ message, onCancel, onConfirm, danger = true, confirmLabel }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-body" style={{ paddingTop: 22, textAlign: "center" }}>
          <div className={danger ? "kd-confirm-icon" : "kd-confirm-icon ok"}>{danger ? <Trash2 size={22} /> : <CheckCircle2 size={22} />}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 12, lineHeight: 1.4 }}>{message}</div>
        </div>
        <div className="kd-modal-foot" style={{ justifyContent: "center" }}>
          <button className="kd-btn ghost" onClick={onCancel}>Отмена</button>
          <button className={danger ? "kd-btn primary danger" : "kd-btn primary"} onClick={onConfirm}>{confirmLabel || (danger ? "Да, удалить" : "Подтвердить")}</button>
        </div>
      </div>
    </div>
  );
}

function ReportSuccessModal({ onClose }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-body" style={{ paddingTop: 26, paddingBottom: 6, textAlign: "center" }}>
          <div className="kd-success-icon"><CheckCircle2 size={26} /></div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, marginTop: 14 }}>Изменения сохранены!</div>
          <div className="kd-muted" style={{ marginTop: 6 }}>Красавчик 👏 Отчёт ушёл админу.</div>
        </div>
        <div className="kd-modal-foot" style={{ justifyContent: "center" }}>
          <button className="kd-btn primary" onClick={onClose}>Отлично</button>
        </div>
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-head"><h3>{title}</h3><button className="kd-x" onClick={onClose}><X size={16} /></button></div>
        <div className="kd-modal-body">{children}</div>
        {footer && <div className="kd-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => <label className="kd-field"><span>{label}</span>{children}</label>;

function AssignModal({ job, techs, onClose, onSave, assignInfo }) {
  const [techId, setTechId] = useState(job.assigned_to || "");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(job, techId || null); setSaving(false); }
  const infoOf = (id) => (assignInfo ? assignInfo(id) : { off: false, night: false, count: 0 });
  // приоритет: свободные и отдохнувшие сверху; выходной/ночной — вниз
  const ordered = [...techs].sort((a, b) => {
    const ia = infoOf(a.id), ib = infoOf(b.id);
    return (ia.off - ib.off) || (ia.night - ib.night) || (ia.count - ib.count);
  });
  return (
    <ModalShell title="Назначить дезинфектора" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}{job.scheduled_date ? ` · ${isoToRu(job.scheduled_date)}` : ""}</div>
      {techs.length === 0 && <div className="kd-muted" style={{ marginBottom: 12 }}>Дезинфекторов пока нет — добавь их в Supabase (Authentication → Add user).</div>}
      {!job.scheduled_date && <div className="kd-hint" style={{ marginBottom: 10 }}>У заявки нет даты — подсказки по загрузке появятся после её выбора.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button className={`kd-btn ${techId === "" ? "primary" : "ghost"}`} style={{ justifyContent: "flex-start" }} onClick={() => setTechId("")}>— не назначен —</button>
        {ordered.map((t) => {
          const inf = infoOf(t.id);
          return (
            <button key={t.id} className={`kd-btn ${techId === t.id ? "primary" : "ghost"}`} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 6 }} onClick={() => setTechId(t.id)}>
              <span>{t.full_name || t.id.slice(0, 6)}</span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                {inf.off && <span className="kd-assignwarn off">🌴 выходной</span>}
                {inf.night && <span className="kd-assignwarn night">🌙 ночной выезд — дай отдохнуть</span>}
                <span className="kd-assignload">{inf.count} заяв.</span>
              </span>
            </button>
          );
        })}
      </div>
      {(() => { const sel = techId && infoOf(techId); return sel && (sel.off || sel.night) ? <div className="kd-hint" style={{ marginTop: 10, background: "var(--rust-tint)", borderColor: "#F1C4BF", color: "#B3261E" }}>⚠ {sel.off ? "У этого сотрудника выходной в дату заявки." : "Он был на ночном выезде — лучше поставить другого."}</div> : null; })()}
    </ModalShell>
  );
}

function jobToForm(job) {
  const po = job.price_options || [];
  const [timeFrom, timeTo] = (job.scheduled_time || "").split(/[–-]/).map((s) => s.trim());
  return {
    status: job.status || "new",
    type: job.type || "Первичная", scheduled_date: job.scheduled_date || "", time_from: timeFrom || "", time_to: timeTo || "",
    address: job.address || "", floor: job.floor || "", area: job.area ?? "", source: job.source || "", pest: job.pest || "",
    p1label: po[0]?.label || "С запахом", p1amount: po[0]?.amount ?? "",
    p2label: po[1]?.label || "Без запаха", p2amount: po[1]?.amount ?? "",
    client_phone: job.client_phone || "+7 ", contact_name: job.contact_name || "", extra_contacts: Array.isArray(job.extra_contacts) ? job.extra_contacts : [], guarantee_months: job.guarantee_months ?? 6,
    brand: job.brand || "KazDez", partner_id: job.partner_id || "", partner_share: job.partner_share ?? "",
    note: job.note || "", assigned_to: job.assigned_to || "", executor_kind: job.executor_partner_id ? "partner" : "tech", executor_partner_id: job.executor_partner_id || "", executor_share_pct: job.executor_share_pct ?? "", joint_work: !!job.joint_work, joint_supplier: job.joint_supplier || "us", joint_cost_share: job.joint_cost_share ?? "", partner_comp: job.partner_comp ?? "",
  };
}

const JOB_DRAFT_KEY = "kazdez-new-job-draft-v2";
const emptyJobForm = (defaultGuarantee) => ({ type: "Первичная", scheduled_date: "", time_from: "", time_to: "", address: "", floor: "", area: "", source: "", pest: "", p1label: "Стоимость", p1amount: "", p2label: "Без запаха", p2amount: "", client_phone: "+7 ", contact_name: "", extra_contacts: [], guarantee_months: defaultGuarantee, brand: "KazDez", partner_id: "", partner_share: "", note: "", assigned_to: "", executor_kind: "tech", executor_partner_id: "", executor_share_pct: "", joint_work: false, joint_supplier: "us", joint_cost_share: "", partner_comp: "" });

function JobFormModal({ initial, title, submitLabel, keepStatus, partners = [], techs = [], existingJobs = [], sources = [], pestTypes = [], pestGuide = {}, defaultGuarantee = 6, onClose, onSave }) {
  const draftRef = useRef(undefined);
  if (draftRef.current === undefined) {
    try { draftRef.current = !initial ? JSON.parse(localStorage.getItem(JOB_DRAFT_KEY) || "null") : null; }
    catch { draftRef.current = null; }
  }
  const draft = draftRef.current;
  const startingForm = initial || draft?.form || emptyJobForm(defaultGuarantee);
  const [f, setF] = useState(startingForm);
  const [formMode, setFormMode] = useState(initial ? "expanded" : (draft?.mode || "quick"));
  const [draftRestored, setDraftRestored] = useState(!!draft?.form);
  const initialSnapshot = useRef(JSON.stringify(startingForm));
  const [pestInfoOpen, setPestInfoOpen] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const onBrand = (e) => { const brand = e.target.value; setF({ ...f, brand, partner_id: brand === "partner" ? f.partner_id : "", partner_share: brand === "partner" ? f.partner_share : "" }); };
  const onPartner = (e) => { const partner_id = e.target.value; const p = partners.find((x) => x.id === partner_id); setF({ ...f, partner_id, partner_share: p ? p.default_share : f.partner_share }); };
  const phoneDigits = String(f.client_phone || "").replace(/\D/g, "");
  const clientHistory = phoneDigits.length >= 10
    ? existingJobs.filter((j) => String(j.client_phone || "").replace(/\D/g, "") === phoneDigits).sort((a, b) => String(b.scheduled_date || "").localeCompare(String(a.scheduled_date || "")))
    : [];
  const latestClient = clientHistory[0];
  const activeGuarantee = clientHistory.find((j) => {
    if (j.status !== "done" || !j.scheduled_date || !j.guarantee_months) return false;
    const until = new Date(`${j.scheduled_date}T00:00:00`);
    until.setMonth(until.getMonth() + Number(j.guarantee_months || 0));
    return until.getTime() >= Date.now();
  });
  const ok = phoneDigits.length >= 10 && f.address && f.pest && (f.p1amount || f.p2amount || f.type === "Осмотр");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) return undefined;
    const meaningful = f.address || f.pest || f.p1amount || phoneDigits.length > 1;
    const timer = setTimeout(() => {
      if (meaningful) localStorage.setItem(JOB_DRAFT_KEY, JSON.stringify({ form: f, mode: formMode, savedAt: new Date().toISOString() }));
      else localStorage.removeItem(JOB_DRAFT_KEY);
    }, 350);
    return () => clearTimeout(timer);
  }, [f, formMode, initial, phoneDigits.length]);

  function requestClose() {
    const dirty = JSON.stringify(f) !== initialSnapshot.current;
    if (!dirty || window.confirm("Есть несохранённые изменения. Закрыть форму? Черновик новой заявки останется сохранённым.")) onClose();
  }

  function useClientData() {
    if (!latestClient) return;
    setF({ ...f, address: latestClient.address || f.address, contact_name: latestClient.contact_name || f.contact_name, source: latestClient.source || f.source });
  }

  function clearDraft() {
    localStorage.removeItem(JOB_DRAFT_KEY);
    setF(emptyJobForm(defaultGuarantee));
    setFormMode("quick");
    setDraftRestored(false);
  }

  async function save() {
    setSaving(true);
    const price_options = [];
    if (f.p1amount) price_options.push({ label: f.p1label, amount: Number(f.p1amount) });
    if (f.p2amount) price_options.push({ label: f.p2label, amount: Number(f.p2amount) });
    const scheduled_time = f.time_from ? (f.time_to ? `${f.time_from}–${f.time_to}` : f.time_from) : "";
    const isPartner = f.brand === "partner";
    const payload = { type: f.type, scheduled_date: f.scheduled_date || null, scheduled_time, address: f.address, floor: f.floor, area: f.area ? Number(f.area) : null, source: f.source, pest: f.pest, price_options, client_phone: f.client_phone, contact_name: (f.contact_name || "").trim() || null, extra_contacts: (f.extra_contacts || []).filter((c) => (c.phone || "").trim()), guarantee_months: Number(f.guarantee_months) || 6, brand: f.brand, partner_id: isPartner ? (f.partner_id || null) : null, partner_share: isPartner ? (Number(f.partner_share) || 0) : null, note: f.note || null, joint_work: isPartner && !!f.joint_work, joint_supplier: isPartner && f.joint_work ? f.joint_supplier : "us", joint_cost_share: isPartner && f.joint_work && f.joint_supplier === "us" ? (Number(f.joint_cost_share) || 0) : null, partner_comp: isPartner && f.partner_comp ? (Number(f.partner_comp) || 0) : null,
      executor_partner_id: f.executor_kind === "partner" ? (f.executor_partner_id || null) : null,
      executor_share_pct: f.executor_kind === "partner" ? (Number(f.executor_share_pct) || 0) : null };
    if (f.executor_kind !== "partner") payload.assigned_to = f.assigned_to || null;
    if (!keepStatus) payload.status = payload.assigned_to ? "assigned" : "new";
    else if (f.status === "new" || f.status === "assigned") payload.status = payload.assigned_to ? "assigned" : "new";
    const saved = await onSave(payload);
    if (saved !== false && !initial) localStorage.removeItem(JOB_DRAFT_KEY);
    setSaving(false);
  }
  return (
    <ModalShell title={title} onClose={requestClose} footer={<>
      <button className="kd-btn ghost" onClick={requestClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "Сохраняем…" : submitLabel}</button>
    </>}>
      {!initial && <div className="kd-formmode">
        <button type="button" className={formMode === "quick" ? "on" : ""} onClick={() => setFormMode("quick")}>Быстрая заявка</button>
        <button type="button" className={formMode === "expanded" ? "on" : ""} onClick={() => setFormMode("expanded")}>Расширенная</button>
      </div>}
      {draftRestored && <div className="kd-draftnotice"><span>Черновик восстановлен автоматически</span><button type="button" onClick={clearDraft}>Очистить</button></div>}
      <div className="kd-grid2">
        <Field label="Телефон клиента"><input value={f.client_phone} onChange={set("client_phone")} placeholder="+7 701 ..." inputMode="tel" autoFocus={!initial} /></Field>
        <Field label="Имя контактного лица"><input value={f.contact_name} onChange={set("contact_name")} placeholder="Айгуль" /></Field>
      </div>
      {latestClient && <div className={`kd-clientfound ${activeGuarantee ? "warning" : ""}`}>
        <div><strong>{activeGuarantee ? "⚠ У клиента есть действующая гарантия" : "Клиент уже обращался"}</strong><span>{clientHistory.length} заяв. · последняя: {isoToRu(latestClient.scheduled_date) || "без даты"} · {latestClient.pest || "—"}</span></div>
        <button type="button" className="kd-btn ghost sm" onClick={useClientData}>Подставить данные</button>
      </div>}
      {formMode === "expanded" && <>
        <div className="kd-grid2">
          <Field label="Бренд"><select value={f.brand} onChange={onBrand}><option value="KazDez">KazDez</option><option value="Sanitex">Sanitex</option><option value="partner">Партнёрская</option></select></Field>
          <Field label="Тип"><select value={f.type} onChange={set("type")}><option>Первичная</option><option>Вторичная</option><option>Плановая</option><option>Тендерная</option><option>Гарантийная</option><option>Осмотр</option></select></Field>
        </div>
      {f.brand === "partner" && (
        <>
          <div className="kd-grid2">
            <Field label="Партнёр"><select value={f.partner_id} onChange={onPartner}><option value="">— выбери —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label={f.joint_work ? "Доля партнёра в прибыли (%)" : "Доля партнёра (%)"}><input value={f.partner_share} onChange={set("partner_share")} inputMode="numeric" placeholder="50" /></Field>
          </div>
          <label className="kd-check"><input type="checkbox" checked={f.joint_work} onChange={(e) => setF({ ...f, joint_work: e.target.checked })} /><span>Совместная работа — едем на объект вместе, делим расходы и прибыль</span></label>
          {f.joint_work && (
            <div className="kd-grid2">
              <Field label="Кто привозит препараты"><select value={f.joint_supplier} onChange={set("joint_supplier")}><option value="us">Мы (со своего склада)</option><option value="partner">Партнёр (свои)</option></select></Field>
              {f.joint_supplier === "us" && <Field label="Доля партнёра в расходах (%)"><input value={f.joint_cost_share} onChange={set("joint_cost_share")} inputMode="numeric" placeholder="50" /></Field>}
            </div>
          )}
          <Field label="Компенсация от партнёра нам (₸) — на личный Kaspi, скрыто от дезинфектора">
            <input value={f.partner_comp} onChange={set("partner_comp")} inputMode="numeric" placeholder="напр. 8000 (если партнёр компенсирует нам)" />
          </Field>
        </>
      )}
      </>}
      <datalist id="kd-pests-list">{pestTypes.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <datalist id="kd-sources-list">{sources.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <div className="kd-grid2">
        <Field label="Вид (вредитель)">
          <div style={{ display: "flex", gap: 8 }}>
            <input list="kd-pests-list" value={f.pest} onChange={set("pest")} placeholder="Тараканы" style={{ flex: 1 }} />
            <button type="button" className="kd-btn ghost" title="Информация по вредителю" onClick={() => setPestInfoOpen((v) => !v)} style={{ minWidth: 46, padding: "0 12px" }}><Info size={17} /></button>
          </div>
        </Field>
        <Field label="Источник"><input list="kd-sources-list" value={f.source} onChange={set("source")} placeholder="OLX" /></Field>
      </div>
      {pestInfoOpen && (() => {
        const g = pestGuide[(f.pest || "").trim()] || null;
        return (
          <div className="kd-notebox" style={{ marginBottom: 12 }}>
            {!f.pest ? "Сначала выбери вид вредителя." : !g ? (
              <span>Нет данных по «{f.pest}». Заполни в Настройки → Справочник по вредителям.</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div><strong>{f.pest}</strong></div>
                {g.info ? <div>{g.info}</div> : null}
                {g.chems ? <div><span className="kd-muted">Препараты:</span> {g.chems}</div> : null}
                {g.times ? <div><span className="kd-muted">Обработок:</span> {g.times}</div> : null}
                {g.drive ? <div><a className="kd-btn ghost sm" href={g.drive} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>📄 Инструкция для клиента</a></div> : null}
              </div>
            )}
          </div>
        );
      })()}
      <div className="kd-grid3">
        <Field label="Дата"><input type="date" value={f.scheduled_date} onChange={set("scheduled_date")} /></Field>
        <Field label="Время с"><input type="time" value={f.time_from} onChange={set("time_from")} /></Field>
        <Field label="Время до (необязательно)"><input type="time" value={f.time_to} onChange={set("time_to")} /></Field>
      </div>
      <Field label="Адрес"><input value={f.address} onChange={set("address")} placeholder="ул. ..., кв. ..." /></Field>
      {formMode === "quick" ? (
        <Field label="Назначить дезинфектора">
          <select value={f.assigned_to || ""} onChange={set("assigned_to")}>
            <option value="">— назначить позже —</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>)}
          </select>
        </Field>
      ) : <>
        <div className="kd-section">Исполнитель</div>
        <div className="kd-seg" style={{ width: "100%", marginBottom: 12 }}>
          <button type="button" className={`kd-segbtn ${f.executor_kind !== "partner" ? "on" : ""}`} onClick={() => setF({ ...f, executor_kind: "tech", executor_partner_id: "", executor_share_pct: "" })}>Наш дезинфектор</button>
          <button type="button" className={`kd-segbtn ${f.executor_kind === "partner" ? "on" : ""}`} onClick={() => setF({ ...f, executor_kind: "partner", assigned_to: "" })}>Партнёр</button>
        </div>
        {f.executor_kind !== "partner" && <Field label="Наш дезинфектор">
          <select value={f.assigned_to || ""} onChange={set("assigned_to")}>
            <option value="">— назначить позже —</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>)}
          </select>
        </Field>}
      {f.executor_kind === "partner" && (
        <>
          <div className="kd-grid2">
            <Field label="Партнёр-исполнитель"><select value={f.executor_partner_id} onChange={(e) => { const pid = e.target.value; const p = partners.find((x) => x.id === pid); setF({ ...f, executor_partner_id: pid, executor_share_pct: f.executor_share_pct || (p ? p.default_share : "") }); }}><option value="">— выбери —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Доля партнёра (%)"><input value={f.executor_share_pct} onChange={set("executor_share_pct")} inputMode="numeric" placeholder="60" /></Field>
          </div>
          <div className="kd-muted" style={{ marginTop: -6, marginBottom: 12 }}>Партнёр отчёт не заполняет. Когда выполнит — нажмёшь «Выполнено (оплата)» и укажешь, как прошли деньги.</div>
        </>
      )}
      </>}
      {formMode === "expanded" && <div className="kd-grid2">
        <Field label="Этаж"><input value={f.floor} onChange={set("floor")} inputMode="numeric" placeholder="5" /></Field>
        <Field label="Метраж (м²)"><input value={f.area} onChange={set("area")} inputMode="numeric" placeholder="45" /></Field>
      </div>}
      {f.type === "Осмотр" && <div className="kd-muted" style={{ marginBottom: 10 }}>Для осмотра цену можно не заполнять.</div>}
      {formMode === "quick" ? (
        <Field label="Стоимость (₸)"><input value={f.p1amount} onChange={set("p1amount")} inputMode="numeric" placeholder="15000" /></Field>
      ) : <div className="kd-grid2">
          <Field label="Цена 1 — подпись"><input value={f.p1label} onChange={set("p1label")} /></Field>
          <Field label="Цена 1 — сумма (₸)"><input value={f.p1amount} onChange={set("p1amount")} inputMode="numeric" placeholder="15000" /></Field>
          <Field label="Цена 2 — подпись"><input value={f.p2label} onChange={set("p2label")} /></Field>
          <Field label="Цена 2 — сумма (₸)"><input value={f.p2amount} onChange={set("p2amount")} inputMode="numeric" placeholder="20000" /></Field>
        </div>}
      {formMode === "expanded" && <>
      <datalist id="kd-contact-roles">{["Муж", "Жена", "Сестра", "Брат", "Коллега", "Директор", "Диспетчер", "Охранник", "Бухгалтер", "Администратор", "Сосед"].map((r) => <option key={r} value={r} />)}</datalist>
      {(f.extra_contacts || []).map((c, i) => (
        <div className="kd-grid2" key={i}>
          <Field label={`Доп. номер ${i + 1}`}><input value={c.phone} onChange={(e) => { const n = [...f.extra_contacts]; n[i] = { ...n[i], phone: e.target.value }; setF({ ...f, extra_contacts: n }); }} placeholder="+7 707 ..." /></Field>
          <Field label="Кто это">
            <div style={{ display: "flex", gap: 6 }}>
              <input list="kd-contact-roles" value={c.role || ""} onChange={(e) => { const n = [...f.extra_contacts]; n[i] = { ...n[i], role: e.target.value }; setF({ ...f, extra_contacts: n }); }} placeholder="Муж / Директор / …" style={{ flex: 1 }} />
              <button type="button" className="kd-btn ghost danger sm" onClick={() => setF({ ...f, extra_contacts: f.extra_contacts.filter((_, x) => x !== i) })}><X size={13} /></button>
            </div>
          </Field>
        </div>
      ))}
      <button type="button" className="kd-btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setF({ ...f, extra_contacts: [...(f.extra_contacts || []), { phone: "+7 ", role: "" }] })}><Plus size={13} />Доп. номер для связи</button>
      <div className="kd-grid2">
        <Field label="Гарантия (мес.)"><input value={f.guarantee_months} onChange={set("guarantee_months")} inputMode="numeric" /></Field>
        <div />
      </div>
      </>}
      <Field label="Примечание / комментарий (видно только команде, клиенту не идёт)">
        <textarea className="kd-textarea" value={f.note} onChange={set("note")} placeholder="Напр.: домофон не работает, звонить за 30 мин, есть собака" />
      </Field>
    </ModalShell>
  );
}

function PartnerModal({ partner, onClose, onSave }) {
  const [name, setName] = useState(partner?.name || "");
  const [share, setShare] = useState(partner?.default_share ?? "");
  const [policy, setPolicy] = useState(partner?.repeat_policy || "half");
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() { setSaving(true); await onSave({ name: name.trim(), default_share: Number(share) || 0, repeat_policy: policy }, partner); setSaving(false); }
  return (
    <ModalShell title={partner ? "Изменить партнёра" : "Новый партнёр"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Имя партнёра"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Айдын" /></Field>
      <div className="kd-grid2">
        <Field label="Доля партнёра (%)"><input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" placeholder="50" /></Field>
        <Field label="Цена повтора"><select value={policy} onChange={(e) => setPolicy(e.target.value)}>{REPEAT_POLICIES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select></Field>
      </div>
      <div className="kd-muted">Правило повтора — подсказка при работе с заявками этого партнёра.</div>
    </ModalShell>
  );
}

function PartnerJobsModal({ partner, jobs, shareOf, onClose, onOpenClient }) {
  const share = shareOf;
  const list = [...jobs].sort((a, b) => new Date(b.scheduled_date || b.created_at || 0) - new Date(a.scheduled_date || a.created_at || 0));
  const owed = list.filter((j) => j.status === "done" && !j.partner_paid).reduce((s, j) => s + share(j), 0);
  return (
    <ModalShell title={`Заявки партнёра · ${partner.name}`} onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Всего заявок: {list.length} · к выплате: {fmt(owed)} ₸</div>
      {list.length === 0 && <div className="kd-empty">У этого партнёра пока нет заявок.</div>}
      {list.map((j) => {
        const st = STATUS[j.status] || STATUS.new;
        const sh = share(j);
        return (
          <div key={j.id} className="kd-histrow" style={{ cursor: "default" }}>
            <div>
              <div className="kd-histmain">{j.type} · {j.pest}</div>
              <div className="kd-muted">{isoToRu(j.scheduled_date) || "без даты"} · {j.address}</div>
              <button className="kd-clientlink" onClick={() => onOpenClient(j.client_phone)} style={{ marginTop: 3 }}>Клиент: {j.client_phone}</button>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
              {sh > 0 && <div className="kd-muted" style={{ marginTop: 4, color: j.partner_paid ? "#0E7C66" : "#B42318", fontWeight: 700 }}>{fmt(sh)} ₸ · {j.partner_paid ? "выплачено" : "к выплате"}</div>}
            </div>
          </div>
        );
      })}
    </ModalShell>
  );
}

function DocModal({ doc, partners, onClose, onSave }) {
  const [type, setType] = useState(doc?.type || DOC_TYPES[0]);
  const [partnerId, setPartnerId] = useState(doc?.partner_id || "");
  const [client, setClient] = useState(doc?.client || "");
  const [mode, setMode] = useState(doc?.amount_mode || "fixed");
  const [baseSum, setBaseSum] = useState(doc?.base_sum ?? "");
  const [percent, setPercent] = useState(doc?.percent ?? "");
  const [fixedAmount, setFixedAmount] = useState(doc && doc.amount_mode === "fixed" ? (doc.amount ?? "") : "");
  const [status, setStatus] = useState(doc?.status || "todo");
  const [note, setNote] = useState(doc?.note || "");
  const [saving, setSaving] = useState(false);
  const computed = mode === "percent" ? Math.round((Number(baseSum) || 0) * (Number(percent) || 0) / 100) : (Number(fixedAmount) || 0);
  const ok = computed > 0;
  async function save() {
    setSaving(true);
    await onSave({ type, partner_id: partnerId || null, client, amount_mode: mode, base_sum: mode === "percent" ? (Number(baseSum) || 0) : null, percent: mode === "percent" ? (Number(percent) || 0) : null, amount: computed, status, note }, doc);
    setSaving(false);
  }
  return (
    <ModalShell title={doc ? "Изменить запись" : "Документ / услуга"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Что делаем"><select value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Партнёр (если есть)"><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">— без партнёра —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      </div>
      <Field label="Клиент / описание"><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="ТОО «...», за что" /></Field>
      <Field label="Как считаем сумму">
        <select value={mode} onChange={(e) => setMode(e.target.value)}><option value="fixed">Фиксированная сумма</option><option value="percent">% от суммы клиента</option></select>
      </Field>
      {mode === "fixed" ? (
        <Field label="Сумма (₸)"><input value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} inputMode="numeric" placeholder="30000" /></Field>
      ) : (
        <div className="kd-grid2">
          <Field label="Сумма клиента (₸)"><input value={baseSum} onChange={(e) => setBaseSum(e.target.value)} inputMode="numeric" placeholder="300000" /></Field>
          <Field label="Процент (%)"><input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" placeholder="10" /></Field>
        </div>
      )}
      <div className="kd-paytotal"><span>Твой заработок</span><strong>{fmt(computed)} ₸</strong></div>
      <div className="kd-grid2">
        <Field label="Статус"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="todo">В работе</option><option value="done">Сделано</option><option value="paid">Оплачено</option></select></Field>
        <Field label="Заметка"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" /></Field>
      </div>
    </ModalShell>
  );
}

function ReportModal({ job, chemicals, primaryReport, onClose, onSave }) {
  const [cash, setCash] = useState(""); const [qr, setQr] = useState(""); const [note, setNote] = useState("");
  const [transfer, setTransfer] = useState("");
  const [chems, setChems] = useState([{ chemical_id: "", amount: "", unit: "small" }, { chemical_id: "", amount: "", unit: "small" }]);
  const [fuWanted, setFuWanted] = useState(false); const [fuDate, setFuDate] = useState(""); const [fuNote, setFuNote] = useState("");
  const [docNeeded, setDocNeeded] = useState(false); const [avr, setAvr] = useState(false); const [dogovor, setDogovor] = useState(false); const [docNote, setDocNote] = useState("");
  const [saving, setSaving] = useState(false);
  const total = (Number(cash) || 0) + (Number(qr) || 0) + (Number(transfer) || 0);
  const setChem = (i, k) => (e) => { const n = chems.slice(); n[i] = { ...n[i], [k]: e.target.value }; setChems(n); };
  function methodLabel() {
    const parts = [];
    if (Number(cash) > 0) parts.push("Наличные");
    if (Number(qr) > 0) parts.push("QR");
    if (Number(transfer) > 0) parts.push("Перечисление");
    return parts.join(" + ") || "Наличные";
  }
  async function save() {
    setSaving(true);
    const lines = chems.filter((c) => c.chemical_id && Number(c.amount) > 0).map((c) => {
      const ch = chemicals.find((x) => x.id === c.chemical_id);
      const f = chemUnit(ch?.unit_kind).factor || 1000;
      const base = c.unit === "big" ? (Number(c.amount) || 0) * f : (Number(c.amount) || 0);
      return { chemical_id: c.chemical_id, name: ch ? ch.name : "", amount: base };
    });
    await onSave(job, { paid: total, cash: Number(cash) || 0, qr: Number(qr) || 0, transfer: Number(transfer) || 0, method: methodLabel(), note, followUp: { wanted: fuWanted, date: fuDate, note: fuNote } }, lines, { needed: docNeeded, avr, dogovor, note: docNote, done: false });
    setSaving(false);
  }
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "Сохраняем…" : "Сохранить отчёт"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}</div>

      {primaryReport && (
        <div className="kd-card" style={{ marginBottom: 14, background: "var(--surface-sunk)", boxShadow: "none" }}>
          <div className="kd-section" style={{ marginTop: 0 }}>📋 Первичная обработка — от чего отталкиваться</div>
          <div className="kd-row"><span>Сумма</span><strong>{fmt(primaryReport.paid)} ₸</strong></div>
          <div className="kd-row"><span>Исполнитель</span><strong>{primaryReport.techName || "—"}</strong></div>
          {primaryReport.date && <div className="kd-row"><span>Дата</span><strong>{isoToRu(primaryReport.date)}</strong></div>}
          {primaryReport.chems && primaryReport.chems.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="kd-muted" style={{ marginBottom: 4, fontWeight: 700 }}>Препараты по первичной:</div>
              {primaryReport.chems.map((c, i) => <div key={i} className="kd-row" style={{ padding: "4px 0" }}><span>{c.name}</span><span className="kd-muted">{c.amount} мл/г</span></div>)}
            </div>
          )}
        </div>
      )}

      <div className="kd-section">Оплата</div>
      <div className="kd-grid2">
        <Field label="Наличными (₸)"><input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="numeric" placeholder="15000" /></Field>
        <Field label="QR (₸)"><input value={qr} onChange={(e) => setQr(e.target.value)} inputMode="numeric" placeholder="10000" /></Field>
      </div>
      <Field label="Через перечисление на счёт (₸)">
        <input value={transfer} onChange={(e) => setTransfer(e.target.value)} inputMode="numeric" placeholder="Юрлицо / тендер — оплата на счёт" />
      </Field>
      {Number(transfer) > 0 && <div className="kd-hint" style={{ marginTop: -4 }}>💳 Перечисление уйдёт админу со статусом «ждём оплату». Админ проставит счёт и дату, когда деньги придут.</div>}
      <div className="kd-paytotal"><span>Итого по заявке</span><strong>{fmt(total)} ₸</strong></div>
      <Field label="Примечание"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Было поднятие" /></Field>
      <div className="kd-section">Расход препаратов</div>
      {chemicals.length === 0 && <div className="kd-muted" style={{ marginBottom: 8 }}>Сначала добавь препараты на склад — тогда их можно будет выбирать здесь.</div>}
      {chems.map((c, i) => {
        const ch = chemicals.find((x) => x.id === c.chemical_id); const u = chemUnit(ch?.unit_kind);
        return (
          <div className="kd-chemrow3" key={i}>
            <select value={c.chemical_id} onChange={setChem(i, "chemical_id")}>
              <option value="">— препарат —</option>
              {chemicals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input placeholder="кол-во" inputMode="decimal" value={c.amount} onChange={setChem(i, "amount")} />
            <select value={c.unit} onChange={setChem(i, "unit")} disabled={u.factor === 1}>
              <option value="small">{u.small}</option>
              {u.factor !== 1 && <option value="big">{u.big}</option>}
            </select>
          </div>
        );
      })}
      <button className="kd-btn ghost sm" onClick={() => setChems([...chems, { chemical_id: "", amount: "", unit: "small" }])}>+ ещё препарат</button>
      <label className="kd-check"><input type="checkbox" checked={fuWanted} onChange={(e) => setFuWanted(e.target.checked)} /><span>Клиент просит повторный выезд</span></label>
      {fuWanted && (<div className="kd-grid2">
        <Field label="Когда"><input value={fuDate} onChange={(e) => setFuDate(e.target.value)} placeholder="27.06.2026" /></Field>
        <Field label="Что именно"><input value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="2-я квартира" /></Field>
      </div>)}
      <label className="kd-check"><input type="checkbox" checked={docNeeded} onChange={(e) => setDocNeeded(e.target.checked)} /><span>Клиент просит документы (АВР / Договор)</span></label>
      {docNeeded && (<>
        <div className="kd-doctypes">
          <label className="kd-minichk"><input type="checkbox" checked={avr} onChange={(e) => setAvr(e.target.checked)} /><span>АВР</span></label>
          <label className="kd-minichk"><input type="checkbox" checked={dogovor} onChange={(e) => setDogovor(e.target.checked)} /><span>Договор</span></label>
        </div>
        <Field label="Кому / реквизиты"><input value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder="ТОО «...», БИН ..." /></Field>
      </>)}
    </ModalShell>
  );
}

function DetailsModal({ job, header, onReport, onClose }) {
  const [view, setView] = useState("card");
  const [copied, setCopied] = useState(false);
  const msg = buildMsg(job, header);
  const prices = (job.price_options || []).filter((p) => p.amount);
  function doCopy() { copyText(msg, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }
  return (
    <ModalShell title="Заявка" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Закрыть</button>
      {job.status !== "done" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
    </>}>
      <div className="kd-seg" style={{ marginBottom: 16, width: "100%" }}>
        <button className={`kd-segbtn ${view === "card" ? "on" : ""}`} onClick={() => setView("card")}>Карточка</button>
        <button className={`kd-segbtn ${view === "wa" ? "on" : ""}`} onClick={() => setView("wa")}>Как в WhatsApp</button>
      </div>

      {view === "card" ? (
        <>
          <div className="kd-row"><span>Бренд</span><strong>{header}</strong></div>
          <div className="kd-row"><span>Тип</span><strong>{job.type}</strong></div>
          <div className="kd-row"><span>Вид</span><strong>{job.pest}</strong></div>
          <div className="kd-row"><span>Дата и время</span><strong>{isoToRu(job.scheduled_date) || "—"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</strong></div>
          <div className="kd-row"><span>Адрес</span><strong style={{ textAlign: "right", overflowWrap: "anywhere" }}><AddressText text={job.address} /></strong></div>
          {job.floor && <div className="kd-row"><span>Этаж</span><strong>{job.floor}</strong></div>}
          {job.area && <div className="kd-row"><span>Метраж</span><strong>{job.area} м²</strong></div>}
          {prices.length > 0 && (
            <>
              <div className="kd-section" style={{ marginTop: 12 }}>Цена</div>
              {prices.map((p, i) => (<div className="kd-row" key={i}><span>{p.label || "Вариант " + (i + 1)}</span><strong>{fmt(p.amount)} ₸</strong></div>))}
            </>
          )}
          <div className="kd-row"><span>Телефон клиента</span><strong><a href={`tel:${(job.client_phone || "").replace(/\s/g, "")}`} style={{ color: "var(--primary-d)" }}>{job.client_phone}</a></strong></div>
          {job.contact_name && <div className="kd-row"><span>Контактное лицо</span><strong>{job.contact_name}</strong></div>}
          {Array.isArray(job.extra_contacts) && job.extra_contacts.map((c, i) => (
            <div className="kd-row" key={i}><span>{c.role || "Доп. номер"}</span><strong><a href={`tel:${(c.phone || "").replace(/\s/g, "")}`} style={{ color: "var(--primary-d)" }}>{c.phone}</a></strong></div>
          ))}
          {job.type !== "Осмотр" && <div className="kd-row"><span>Гарантия</span><strong>{job.guarantee_months || 6} мес.</strong></div>}
          {job.note && <div className="kd-notebox" style={{ marginTop: 12 }}>📝 {job.note}</div>}
        </>
      ) : (
        <>
          <pre className="kd-watext">{msg}</pre>
          <button className="kd-btn wa wide" onClick={doCopy}><MessageCircle size={15} />{copied ? "Скопировано ✓" : "Скопировать текст"}</button>
        </>
      )}
    </ModalShell>
  );
}

function ViewModal({ job, chemicals, performedBy, onClose }) {
  const hasSplit = (job.report_cash || 0) > 0 && (job.report_qr || 0) > 0;
  const chemOf = (l) => (l.chemical_id ? (chemicals || []).find((x) => x.id === l.chemical_id) : (chemicals || []).find((x) => norm(x.name) === norm(l.name)));
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}</div>
      <div className="kd-row"><span>Выполнил</span><strong>{performedBy || "не указано"}</strong></div>
      {job.reported_at && <div className="kd-row"><span>Дата отчёта</span><strong>{fmtTs(job.reported_at)}</strong></div>}
      {hasSplit ? (<>
        <div className="kd-row"><span>Наличными</span><strong>{fmt(job.report_cash)} ₸</strong></div>
        <div className="kd-row"><span>QR / переводом</span><strong>{fmt(job.report_qr)} ₸</strong></div>
        <div className="kd-row total"><span>Итого</span><strong>{fmt(job.report_paid)} ₸</strong></div>
      </>) : (<>
        <div className="kd-row"><span>Оплата</span><strong>{fmt(job.report_paid)} ₸</strong></div>
        <div className="kd-row"><span>Способ</span><strong>{job.report_method}</strong></div>
      </>)}
      {job.report_note && <div className="kd-row"><span>Примечание</span><strong>{job.report_note}</strong></div>}
      <div className="kd-section" style={{ marginTop: 10 }}>Расход</div>
      {(job.chemicals || []).length === 0 && <div className="kd-muted">Не указан.</div>}
      {(job.chemicals || []).map((l) => { const c = chemOf(l); return (<div className="kd-row" key={l.id}><span>{l.name || (c && c.name)}</span><strong>{fmtAmount(lineAmount(l), c && c.unit_kind)}</strong></div>); })}
      {job.followup_wanted && <div className="kd-followbox"><strong>Повторный выезд:</strong> {job.followup_note || "по просьбе клиента"}{job.followup_date ? ` — ${job.followup_date}` : ""}</div>}
      {job.docs_needed && <div className="kd-docbox"><strong>Документы:</strong> {[job.docs_avr && "АВР", job.docs_dogovor && "Договор"].filter(Boolean).join(", ") || "да"}{job.docs_note ? ` — ${job.docs_note}` : ""}{job.docs_done ? " · готовы" : " · ожидают"}</div>}
    </ModalShell>
  );
}

function HistoryModal({ job, jobs, onClose, onOpen }) {
  const digits = (job.client_phone || "").replace(/\D/g, "");
  const list = jobs
    .filter((j) => (j.client_phone || "").replace(/\D/g, "") === digits && digits)
    .sort((a, b) => new Date(b.scheduled_date || b.created_at || 0) - new Date(a.scheduled_date || a.created_at || 0));
  const doneCount = list.filter((j) => j.status === "done").length;
  return (
    <ModalShell title={`История клиента · ${job.client_phone}`} onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Всего заявок: {list.length}{doneCount ? ` · выполнено: ${doneCount}` : ""}</div>
      {list.length <= 1 && <div className="kd-empty">Других заявок этого клиента не найдено — похоже, это новый клиент.</div>}
      {list.length > 1 && list.map((j) => {
        const st = STATUS[j.status] || STATUS.new;
        return (
          <div key={j.id} className="kd-histrow" onClick={() => onOpen(j)}>
            <div>
              <div className="kd-histmain">{j.type} · {j.pest}</div>
              <div className="kd-muted">{isoToRu(j.scheduled_date) || "без даты"} · {j.address}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
              {j.report_paid != null && <div className="kd-muted" style={{ marginTop: 4 }}>{fmt(j.report_paid)} ₸</div>}
            </div>
          </div>
        );
      })}
    </ModalShell>
  );
}

function AddChemModal({ onClose, onSave }) {
  const [name, setName] = useState(""); const [unitKind, setUnitKind] = useState("volume");
  const [qty, setQty] = useState(""); const [price, setPrice] = useState(""); const [minQ, setMinQ] = useState("1");
  const [saving, setSaving] = useState(false);
  const u = chemUnit(unitKind);
  const ok = name && qty && price;
  async function save() {
    setSaving(true);
    const f = u.factor || 1000;
    await onSave({ name, unit_kind: unitKind, purchased_ml: (Number(qty) || 0) * f, price_per_liter: Number(price) || 0, min_ml: (Number(minQ) || 0) * f });
    setSaving(false);
  }
  return (
    <ModalShell title="Препарат на склад" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Добавить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Культ / контейнеры / ловушки" /></Field>
        <Field label="Измеряется в">
          <select value={unitKind} onChange={(e) => setUnitKind(e.target.value)}>
            <option value="volume">Объём (мл/л)</option>
            <option value="weight">Вес (г/кг)</option>
            <option value="piece">Поштучно (шт)</option>
            <option value="pack">Упаковками (уп.)</option>
          </select>
        </Field>
      </div>
      <div className="kd-grid2">
        <Field label={`Куплено (${u.big})`}><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="5" /></Field>
        <Field label={`Цена (₸ за ${u.big})`}><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="18000" /></Field>
      </div>
      <Field label={`Сигнал «мало» при остатке (${u.big})`}><input value={minQ} onChange={(e) => setMinQ(e.target.value)} inputMode="decimal" placeholder="1" /></Field>
    </ModalShell>
  );
}

function StockInModal({ chem, onClose, onSave }) {
  const [qty, setQty] = useState(""); const [price, setPrice] = useState(""); const [saving, setSaving] = useState(false);
  const u = chemUnit(chem.unit_kind);
  async function save() {
    setSaving(true);
    await onSave(chem, (Number(qty) || 0) * (u.factor || 1000), price ? Number(price) : null);
    setSaving(false);
  }
  return (
    <ModalShell title={`Приход: ${chem.name}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!qty || saving} onClick={save}>{saving ? "…" : "Оформить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Текущая цена: {fmt(chem.price_per_liter)} ₸/{u.big}</div>
      <Field label={`Докуплено (${u.big})`}><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="5" /></Field>
      <Field label={`Новая цена за ${u.big} (если изменилась)`}><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="оставь пустым, если та же" /></Field>
    </ModalShell>
  );
}

function HandoutModal({ tech, chemicals, onClose, onSave }) {
  const [chemId, setChemId] = useState(""); const [amount, setAmount] = useState(""); const [unit, setUnit] = useState("small");
  const [kind, setKind] = useState("issue"); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false);
  const ch = chemicals.find((x) => x.id === chemId); const u = chemUnit(ch?.unit_kind);
  const ok = chemId && Number(amount) > 0;
  async function save() {
    setSaving(true);
    const base = unit === "big" ? (Number(amount) || 0) * (u.factor || 1000) : (Number(amount) || 0);
    await onSave({ tech_id: tech.id, chemical_id: chemId, amount: base, kind, note });
    setSaving(false);
  }
  return (
    <ModalShell title={`Выдать препарат — ${tech.full_name || "сотрудник"}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Записать"}</button>
    </>}>
      {chemicals.length === 0 && <div className="kd-muted" style={{ marginBottom: 10 }}>Сначала добавь препараты на склад.</div>}
      <Field label="Тип записи">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="issue">Выдача на руки</option>
          <option value="opening">Стартовый остаток (что уже было у сотрудника)</option>
        </select>
      </Field>
      <Field label="Препарат">
        <select value={chemId} onChange={(e) => { setChemId(e.target.value); setUnit("small"); }}>
          <option value="">— выбери —</option>
          {chemicals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <div className="kd-grid2">
        <Field label="Количество"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="4" /></Field>
        <Field label="Единица">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} disabled={u.factor === 1}>
            <option value="small">{u.small}</option>
            {u.factor !== 1 && <option value="big">{u.big}</option>}
          </select>
        </Field>
      </div>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="выдал на объект ..." /></Field>
    </ModalShell>
  );
}

function ExpenseModal({ tech, onClose, onSave }) {
  const [type, setType] = useState("salary");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("unpaid");
  const [saving, setSaving] = useState(false);
  const ok = Number(amount) > 0;
  async function save() {
    setSaving(true);
    await onSave({ tech_id: tech.id, type, amount: Number(amount) || 0, expense_date: expenseDate || null, note, status });
    setSaving(false);
  }
  return (
    <ModalShell title={`Выплата — ${tech.full_name || "сотрудник"}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Тип"><select value={type} onChange={(e) => setType(e.target.value)}><option value="salary">Зарплата</option><option value="travel">Дорожные</option><option value="other">Другое</option></select></Field>
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="30000" /></Field>
      </div>
      <div className="kd-grid2">
        <Field label="Дата"><input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></Field>
        <Field label="Статус"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="unpaid">К выплате</option><option value="paid">Выплачено</option></select></Field>
      </div>
      <Field label="Заметка"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="за какой период / комментарий" /></Field>
    </ModalShell>
  );
}

function TechEditModal({ tech, onClose, onSave }) {
  const [fullName, setFullName] = useState(tech.full_name || "");
  const [phone, setPhone] = useState(tech.phone || "");
  const [role, setRole] = useState(tech.role || "tech");
  const [openBal, setOpenBal] = useState(tech.cash_opening_balance ?? "");
  const [openDate, setOpenDate] = useState(tech.cash_opening_date || "");
  const [saving, setSaving] = useState(false);
  const ok = fullName.trim();
  async function save() { setSaving(true); await onSave({ full_name: fullName.trim(), phone: phone.trim() || null, role, cash_opening_balance: Number(openBal) || 0, cash_opening_date: openDate || null }); setSaving(false); }
  return (
    <ModalShell title="Данные сотрудника" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Логин и пароль этим не затрагиваются — меняется только отображаемое имя, телефон и роль в приложении.</div>
      <Field label="Имя (как будет видно в приложении)"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Байсеит" /></Field>
      <Field label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 701 ..." /></Field>
      <Field label="Роль">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="tech">Дезинфектор (заявки, своя касса, оборудование)</option>
          <option value="manager">Менеджер (ставит задачи, без доступа к финансам)</option>
        </select>
      </Field>
      <div className="kd-section">Начальный остаток наличных (П.8)</div>
      <div className="kd-grid2">
        <Field label="На руках на дату старта (₸)"><input value={openBal} onChange={(e) => setOpenBal(e.target.value)} inputMode="numeric" placeholder="0" /></Field>
        <Field label="Дата старта учёта"><input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} /></Field>
      </div>
      <div className="kd-muted" style={{ marginBottom: 10 }}>Заявки и внесения ДО этой даты не влияют на «на руках» — можно спокойно заполнять историю задним числом ради аналитики.</div>
      <div className="kd-muted">Менеджер — «ключевой человек»: может создавать задачи и назначать их. Роль администратора меняется только напрямую в базе для безопасности.</div>
    </ModalShell>
  );
}

function EquipModal({ item, onClose, onSave }) {
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "equipment");
  const [unit, setUnit] = useState(item?.unit || "шт");
  const [price, setPrice] = useState(item?.price ?? "");
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() { setSaving(true); await onSave({ name: name.trim(), category, unit: unit.trim() || "шт", price: Number(price) || 0 }, item); setSaving(false); }
  return (
    <ModalShell title={item ? "Изменить позицию" : "Новая позиция на склад"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Генератор холодного тумана" /></Field>
      <div className="kd-grid2">
        <Field label="Категория"><select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(EQUIP_CATEGORIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <Field label="Единица"><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт / пара / компл." /></Field>
      </div>
      <Field label="Цена за единицу (₸) — видно только админу"><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="450000" /></Field>
    </ModalShell>
  );
}

function IssueEquipModal({ tech, equipment, onClose, onSave }) {
  const [equipId, setEquipId] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = equipId && Number(qty) > 0;
  async function save() { setSaving(true); await onSave({ tech_id: tech.id, equipment_id: equipId, qty: Number(qty) || 1, handout_date: date || null, note, status: "with_tech" }); setSaving(false); }
  return (
    <ModalShell title={`Выдать оборудование — ${tech.full_name || "сотрудник"}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Выдать"}</button>
    </>}>
      {equipment.length === 0 && <div className="kd-muted" style={{ marginBottom: 10 }}>Сначала заведи позицию на складе (вкладка «Склад» → «Оборудование и СИЗ»).</div>}
      <Field label="Позиция"><select value={equipId} onChange={(e) => setEquipId(e.target.value)}><option value="">— выбери —</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      <div className="kd-grid2">
        <Field label="Количество"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="1" /></Field>
        <Field label="Дата выдачи"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="на какой объект / комментарий" /></Field>
    </ModalShell>
  );
}

function TransferEquipModal({ handout, techs, onClose, onSave }) {
  const [newTechId, setNewTechId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(newTechId, note); setSaving(false); }
  return (
    <ModalShell title="Передать другому сотруднику" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!newTechId || saving} onClick={save}>{saving ? "…" : "Передать"}</button>
    </>}>
      {techs.length === 0 && <div className="kd-muted" style={{ marginBottom: 10 }}>Больше некому передать — нет других дезинфекторов.</div>}
      <Field label="Кому передать"><select value={newTechId} onChange={(e) => setNewTechId(e.target.value)}><option value="">— выбери —</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>)}</select></Field>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="причина передачи" /></Field>
    </ModalShell>
  );
}

function ReportEquipModal({ equip, status, onClose, onSave }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(note); setSaving(false); }
  return (
    <ModalShell title={status === "broken" ? "Сообщить о поломке" : "Сообщить о потере"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Отправить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{equip?.name}. Админ увидит это в журнале и решит вопрос с заменой.</div>
      <Field label="Что случилось (по возможности опиши)"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: не заводится, разбит бак и т.п." /></Field>
    </ModalShell>
  );
}

function CatalogList({ items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = useState("");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 }} />
        <button className="kd-btn primary sm" onClick={() => { onAdd(val); setVal(""); }} disabled={!val.trim()}><Plus size={14} /></button>
      </div>
      {items.length === 0 && <div className="kd-muted">Список пуст.</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((it) => (
          <span key={it.id} className="kd-price" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {it.name}
            <button onClick={() => onRemove(it)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}><X size={13} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function SettingsSection({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="kd-setsection">
      <button className="kd-sethead" onClick={onToggle}>
        <div>
          <div className="kd-setname">{title}</div>
          {subtitle && <div className="kd-setsub">{subtitle}</div>}
        </div>
        <ChevronRight size={18} className="kd-setchevron" style={{ transform: open ? "rotate(90deg)" : "none" }} />
      </button>
      {open && <div className="kd-setbody">{children}</div>}
    </div>
  );
}

function SettingsModal({ settings, sources, pestTypes, expCats, accounts = [], tabOrder = [], leadStages = [], onAddLeadStage, onRemoveLeadStage, onMoveLeadStage, onClose, onSaveSetting, onSetTheme, onAddSource, onRemoveSource, onAddPest, onRemovePest, onAddExpCat, onRemoveExpCat }) {
  const [newStage, setNewStage] = useState("");
  const [theme, setThemeLocal] = useState(localStorage.getItem("kd-theme") || "light");
  const [qrRate, setQrRate] = useState(settings.qr_fee_rate ?? 0.95);
  const [guarantee, setGuarantee] = useState(settings.default_guarantee_months ?? 6);
  const [newCat, setNewCat] = useState("");
  const [subInputs, setSubInputs] = useState({});
  const [openSection, setOpenSection] = useState("appearance");
  const [order, setOrder] = useState(tabOrder);
  const toggle = (id) => setOpenSection(openSection === id ? "" : id);
  function pickTheme(t) { setThemeLocal(t); onSetTheme(t); }
  function moveTab(idx, dir) {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = [...order];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setOrder(next);
    onSaveSetting("tab_order", next);
  }
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subsOf = (pid) => (expCats || []).filter((c) => c.parent_id === pid);
  // справочник по вредителям (хранится JSON-ом в settings.pest_guide)
  const pestGuideMap = (() => { try { return JSON.parse(settings.pest_guide || "{}"); } catch { return {}; } })();
  const firstPest = (pestTypes[0] && pestTypes[0].name) || "";
  const [pgPest, setPgPest] = useState(firstPest);
  const [pg, setPg] = useState(pestGuideMap[firstPest] || { info: "", chems: "", times: "", drive: "" });
  const loadPg = (name) => { setPgPest(name); setPg(pestGuideMap[name] || { info: "", chems: "", times: "", drive: "" }); };
  const savePg = () => {
    const map = { ...pestGuideMap };
    const val = { info: (pg.info || "").trim(), chems: (pg.chems || "").trim(), times: (pg.times || "").trim(), drive: (pg.drive || "").trim() };
    if (!val.info && !val.chems && !val.times && !val.drive) delete map[pgPest];
    else map[pgPest] = val;
    onSaveSetting("pest_guide", JSON.stringify(map));
  };
  // загрузка картинки (печать/подпись) → сохраняем как data-URL в настройках
  const onPickImage = (key) => (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 700 * 1024) { alert("Файл великоват (лучше до 500 КБ). Уменьшите картинку и попробуйте снова."); e.target.value = ""; return; }
    const r = new FileReader();
    r.onload = () => onSaveSetting(key, r.result);
    r.readAsDataURL(file);
  };
  const inputStyle = { flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 };
  return (
    <ModalShell title="Настройки" onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Готово</button>}>
      <div className="kd-setlist">
        <SettingsSection title="Оформление" subtitle="Тема приложения" open={openSection === "appearance"} onToggle={() => toggle("appearance")}>
          <div className="kd-seg" style={{ width: "100%", marginBottom: 10 }}>
            <button className={`kd-segbtn ${theme === "light" ? "on" : ""}`} onClick={() => pickTheme("light")}>Светлая</button>
            <button className={`kd-segbtn ${theme === "dark" ? "on" : ""}`} onClick={() => pickTheme("dark")}>Тёмная</button>
          </div>
          <div className="kd-muted">Применяется на этом устройстве сразу, без перезагрузки.</div>
        </SettingsSection>

        <SettingsSection title="Порядок вкладок" subtitle="Общий для всех — двигай вверх/вниз" open={openSection === "taborder"} onToggle={() => toggle("taborder")}>
          <div className="kd-muted" style={{ marginBottom: 10 }}>Порядок верхнего меню. Меняется сразу для всех сотрудников.</div>
          {order.map((id, i) => (
            <div key={id} className="kd-orderrow">
              <span className="kd-ordernum">{i + 1}</span>
              <span className="kd-ordername">{TAB_LABELS[id] || id}</span>
              <div className="kd-orderbtns">
                <button className="kd-btn ghost sm" disabled={i === 0} onClick={() => moveTab(i, -1)} aria-label="Вверх"><ChevronRight size={16} style={{ transform: "rotate(-90deg)" }} /></button>
                <button className="kd-btn ghost sm" disabled={i === order.length - 1} onClick={() => moveTab(i, 1)} aria-label="Вниз"><ChevronRight size={16} style={{ transform: "rotate(90deg)" }} /></button>
              </div>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title="Ссылки на Google Диск" subtitle="Тендеры, договоры, маркетинг, ТБ, обучение, КП" open={openSection === "drivelinks"} onToggle={() => toggle("drivelinks")}>
          <div className="kd-muted" style={{ marginBottom: 12 }}>Вставь ссылку на папку Google Диск для каждого раздела. Пустые не показываются сотрудникам. Тендерная — во вкладке «Тендеры», КП — во вкладке «Клиенты», остальные — в «Материалах» и «Базе знаний».</div>
          {DRIVE_LINKS.map((l) => (
            <div key={l.key} className="kd-field">
              <span>{l.emoji} {l.label}</span>
              <input defaultValue={settings[l.key] || ""} placeholder="https://drive.google.com/..."
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (settings[l.key] || "")) onSaveSetting(l.key, v || null); }} />
            </div>
          ))}
          <div className="kd-muted">Сохраняется при выходе из поля.</div>
        </SettingsSection>

        <SettingsSection title="Стадии воронки" subtitle={`${leadStages.length} стадий · CRM «Клиенты»`} open={openSection === "leadstages"} onToggle={() => toggle("leadstages")}>
          <div className="kd-muted" style={{ marginBottom: 10 }}>Этапы, по которым клиент движется в воронке. Двигай порядок стрелками. Физлица обычно пропускают «КП выдано» и «Договор».</div>
          {[...leadStages].sort((a, b) => a.sort - b.sort).map((st, i, arr) => (
            <div key={st.id} className="kd-orderrow">
              <span className="kd-ordernum">{i + 1}</span>
              <span className="kd-ordername">{st.name}{st.is_lost ? " ✕" : ""}</span>
              <div className="kd-orderbtns">
                <button className="kd-btn ghost sm" disabled={i === 0} onClick={() => onMoveLeadStage(st, -1)}><ChevronRight size={16} style={{ transform: "rotate(-90deg)" }} /></button>
                <button className="kd-btn ghost sm" disabled={i === arr.length - 1} onClick={() => onMoveLeadStage(st, 1)}><ChevronRight size={16} style={{ transform: "rotate(90deg)" }} /></button>
                <button className="kd-btn ghost danger sm" onClick={() => onRemoveLeadStage(st)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Новая стадия" style={{ flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 }} />
            <button className="kd-btn primary sm" disabled={!newStage.trim()} onClick={() => { onAddLeadStage(newStage); setNewStage(""); }}><Plus size={14} />Добавить</button>
          </div>
        </SettingsSection>

        <SettingsSection title="Источники клиентов" subtitle={`${sources.length} шт. · откуда пришёл клиент`} open={openSection === "sources"} onToggle={() => toggle("sources")}>
          <CatalogList items={sources} onAdd={onAddSource} onRemove={onRemoveSource} placeholder="Напр.: Facebook" />
        </SettingsSection>

        <SettingsSection title="Виды вредителей" subtitle={`${pestTypes.length} шт.`} open={openSection === "pests"} onToggle={() => toggle("pests")}>
          <CatalogList items={pestTypes} onAdd={onAddPest} onRemove={onRemovePest} placeholder="Напр.: Муравьи" />
        </SettingsSection>

        <SettingsSection title="Справочник по вредителям" subtitle="Инфо и инструкции для формы заявки" open={openSection === "pestguide"} onToggle={() => toggle("pestguide")}>
          {pestTypes.length === 0 ? (
            <div className="kd-muted">Сначала добавь виды вредителей в разделе выше.</div>
          ) : (
            <>
              <Field label="Вредитель"><select value={pgPest} onChange={(e) => loadPg(e.target.value)}>{pestTypes.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></Field>
              <Field label="О вредителе (описание)"><textarea rows={2} value={pg.info} onChange={(e) => setPg({ ...pg, info: e.target.value })} placeholder="Коротко: чем опасен, где прячется…" /></Field>
              <Field label="Препараты"><textarea rows={2} value={pg.chems} onChange={(e) => setPg({ ...pg, chems: e.target.value })} placeholder="Напр.: Гет, Дельта Зона, Ксулат…" /></Field>
              <div className="kd-grid2">
                <Field label="Сколько обработок"><input value={pg.times} onChange={(e) => setPg({ ...pg, times: e.target.value })} placeholder="2 (первичная + повтор)" /></Field>
                <Field label="Инструкция клиенту (Google Drive)"><input value={pg.drive} onChange={(e) => setPg({ ...pg, drive: e.target.value })} placeholder="https://drive.google.com/..." /></Field>
              </div>
              <button className="kd-btn primary" onClick={savePg}>Сохранить по «{pgPest || "—"}»</button>
              <div className="kd-muted" style={{ marginTop: 8 }}>Показывается в форме заявки по кнопке ⓘ рядом с выбором вредителя. У каждого вредителя своя инструкция в Google Drive.</div>
            </>
          )}
        </SettingsSection>

        <SettingsSection title="Категории расходов" subtitle={`${parents.length} категорий · для учёта в Финансах`} open={openSection === "expcats"} onToggle={() => toggle("expcats")}>
          <div className="kd-muted" style={{ marginBottom: 10 }}>Категория → внутри неё подкатегории. Например: «Реклама» → OLX, Instagram, Google.</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Новая категория (напр.: Аренда)" style={inputStyle} />
            <button className="kd-btn primary sm" disabled={!newCat.trim()} onClick={() => { onAddExpCat(newCat, null); setNewCat(""); }}><Plus size={14} />Добавить</button>
          </div>
          {parents.length === 0 && <div className="kd-muted">Категорий пока нет.</div>}
          {parents.map((cat) => (
            <div key={cat.id} className="kd-catbox">
              <div className="kd-card-head" style={{ marginBottom: 8 }}>
                <div className="kd-pest" style={{ fontSize: 15 }}>{cat.name}</div>
                <button className="kd-btn ghost danger sm" onClick={() => onRemoveExpCat(cat)}><Trash2 size={13} /></button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                {subsOf(cat.id).length === 0 && <span className="kd-muted">Без подкатегорий</span>}
                {subsOf(cat.id).map((sub) => (
                  <span key={sub.id} className="kd-price" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    {sub.name}
                    <button onClick={() => onRemoveExpCat(sub)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}><X size={13} /></button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={subInputs[cat.id] || ""} onChange={(e) => setSubInputs({ ...subInputs, [cat.id]: e.target.value })} placeholder="Добавить подкатегорию" style={{ ...inputStyle, minHeight: 40, padding: "9px 12px" }} />
                <button className="kd-btn ghost sm" disabled={!(subInputs[cat.id] || "").trim()} onClick={() => { onAddExpCat(subInputs[cat.id], cat.id); setSubInputs({ ...subInputs, [cat.id]: "" }); }}><Plus size={13} /></button>
              </div>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title="Финансы" subtitle="Комиссия, гарантия, счета для авто-зачисления" open={openSection === "finance"} onToggle={() => toggle("finance")}>
          <div className="kd-grid2">
            <Field label="Комиссия банка по QR (%)"><input value={qrRate} onChange={(e) => setQrRate(e.target.value)} inputMode="decimal" onBlur={() => onSaveSetting("qr_fee_rate", Number(qrRate) || 0)} /></Field>
            <Field label="Гарантия по умолчанию (мес.)"><input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} inputMode="numeric" onBlur={() => onSaveSetting("default_guarantee_months", Number(guarantee) || 6)} /></Field>
          </div>
          {accounts.length > 0 && (
            <div className="kd-grid2">
              <Field label="Счёт для QR-оплат (Kaspi Pay)"><select value={settings.qr_account_id || ""} onChange={(e) => onSaveSetting("qr_account_id", e.target.value || null)}><option value="">— не выбран —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="Счёт для сдачи налички (Kaspi Gold)"><select value={settings.cash_account_id || ""} onChange={(e) => onSaveSetting("cash_account_id", e.target.value || null)}><option value="">— не выбран —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
          )}
          <div className="kd-muted">QR-оплаты по заявкам автоматически приходят на выбранный счёт (минус комиссия). Сдача налички дезинфектором — на второй счёт, когда ты подтверждаешь поступление.</div>
        </SettingsSection>

        <SettingsSection title="Маркетинг" subtitle="Цель выручки и % на рекламу" open={openSection === "marketing"} onToggle={() => toggle("marketing")}>
          <div className="kd-grid2">
            <Field label="Цель по выручке в месяц (₸)"><input defaultValue={settings.mkt_revenue_goal ?? 15000000} inputMode="numeric" onBlur={(e) => onSaveSetting("mkt_revenue_goal", Number(e.target.value) || 0)} /></Field>
            <Field label="Доля на рекламу (%)"><input defaultValue={settings.mkt_ad_percent ?? 10} inputMode="decimal" onBlur={(e) => onSaveSetting("mkt_ad_percent", Number(e.target.value) || 0)} /></Field>
          </div>
          <div className="kd-muted">Бюджет на рекламу = цель × %. Напр.: 15 000 000 × 10% = 1 500 000 ₸. Сами каналы и пополнения — во вкладке «Финансы» → «Маркетинг». Сохраняется при выходе из поля.</div>
        </SettingsSection>

        <SettingsSection title="Реквизиты компании" subtitle="Для гарантийного сертификата и акта" open={openSection === "company"} onToggle={() => toggle("company")}>
          <Field label="Название компании"><input defaultValue={settings.company_name ?? ""} onBlur={(e) => onSaveSetting("company_name", e.target.value.trim() || null)} placeholder="ТОО «KazDez»" /></Field>
          <div className="kd-grid2">
            <Field label="БИН"><input defaultValue={settings.company_bin ?? ""} inputMode="numeric" onBlur={(e) => onSaveSetting("company_bin", e.target.value.trim() || null)} placeholder="000000000000" /></Field>
            <Field label="Телефон"><input defaultValue={settings.company_phone ?? ""} onBlur={(e) => onSaveSetting("company_phone", e.target.value.trim() || null)} placeholder="+7 700 000 00 00" /></Field>
          </div>
          <Field label="Адрес"><input defaultValue={settings.company_address ?? ""} onBlur={(e) => onSaveSetting("company_address", e.target.value.trim() || null)} placeholder="г. Алматы, ул. …, д. …" /></Field>
          <Field label="ФИО директора (для строки под подписью)"><input defaultValue={settings.company_director ?? ""} onBlur={(e) => onSaveSetting("company_director", e.target.value.trim() || null)} placeholder="Директор Тыныспаев К." /></Field>

          <div className="kd-section" style={{ marginTop: 6 }}>Акт: срок второй обработки</div>
          <div className="kd-grid2">
            <Field label="Повтор через, дней (от)"><input defaultValue={settings.repeat_days_min ?? 5} inputMode="numeric" onBlur={(e) => onSaveSetting("repeat_days_min", Number(e.target.value) || 5)} /></Field>
            <Field label="Повтор через, дней (до)"><input defaultValue={settings.repeat_days_max ?? 14} inputMode="numeric" onBlur={(e) => onSaveSetting("repeat_days_max", Number(e.target.value) || 14)} /></Field>
          </div>

          <div className="kd-section" style={{ marginTop: 6 }}>Печать и подпись</div>
          <div className="kd-grid2">
            <div>
              <div className="kd-muted" style={{ marginBottom: 6 }}>Печать (PNG без фона)</div>
              {settings.company_stamp ? (
                <div>
                  <img src={settings.company_stamp} alt="печать" style={{ maxHeight: 74, maxWidth: "100%", background: "#fff", borderRadius: 8, padding: 4 }} />
                  <div><button className="kd-btn ghost sm" style={{ marginTop: 6 }} onClick={() => onSaveSetting("company_stamp", null)}>Удалить</button></div>
                </div>
              ) : (
                <input type="file" accept="image/png,image/jpeg" onChange={onPickImage("company_stamp")} />
              )}
            </div>
            <div>
              <div className="kd-muted" style={{ marginBottom: 6 }}>Подпись (PNG без фона)</div>
              {settings.company_signature ? (
                <div>
                  <img src={settings.company_signature} alt="подпись" style={{ maxHeight: 74, maxWidth: "100%", background: "#fff", borderRadius: 8, padding: 4 }} />
                  <div><button className="kd-btn ghost sm" style={{ marginTop: 6 }} onClick={() => onSaveSetting("company_signature", null)}>Удалить</button></div>
                </div>
              ) : (
                <input type="file" accept="image/png,image/jpeg" onChange={onPickImage("company_signature")} />
              )}
            </div>
          </div>

          <div className="kd-muted">Эти данные печатаются в шапке гарантийного сертификата и акта выполненных работ. Сохраняется автоматически при выходе из поля.</div>
        </SettingsSection>
      </div>
    </ModalShell>
  );
}

function OpexModal({ opex, expCats, onClose, onSave }) {
  const [categoryId, setCategoryId] = useState(opex?.category_id || "");
  const [subcategoryId, setSubcategoryId] = useState(opex?.subcategory_id || "");
  const [amount, setAmount] = useState(opex?.amount ?? "");
  const [spentDate, setSpentDate] = useState(opex?.spent_date || new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(opex?.note || "");
  const [saving, setSaving] = useState(false);
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subs = (expCats || []).filter((c) => c.parent_id === categoryId);
  const ok = categoryId && Number(amount) > 0;
  function onCat(e) { setCategoryId(e.target.value); setSubcategoryId(""); }
  async function save() {
    setSaving(true);
    await onSave({ category_id: categoryId || null, subcategory_id: subcategoryId || null, amount: Number(amount) || 0, spent_date: spentDate || null, note: note || null }, opex);
    setSaving(false);
  }
  return (
    <ModalShell title={opex ? "Изменить расход" : "Новый расход"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      {parents.length === 0 && <div className="kd-muted" style={{ marginBottom: 12 }}>Сначала заведи категории в Настройках (шестерёнка вверху) → «Категории расходов».</div>}
      <Field label="Категория"><select value={categoryId} onChange={onCat}><option value="">— выбери —</option>{parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {subs.length > 0 && <Field label="Подкатегория"><select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}><option value="">— без подкатегории —</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <div className="kd-grid2">
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" /></Field>
        <Field label="Дата"><input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} /></Field>
      </div>
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="за что именно / за какой месяц" /></Field>
    </ModalShell>
  );
}

function MoveModal({ move, accounts, expCats, onClose, onSave }) {
  const [direction, setDirection] = useState(move?.direction || "expense");
  const [accountId, setAccountId] = useState(move?.account_id || (accounts[0]?.id || ""));
  const [toAccountId, setToAccountId] = useState(move?.to_account_id || "");
  const [amount, setAmount] = useState(move?.amount ?? "");
  const [moveDate, setMoveDate] = useState(move?.move_date || new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(move?.category_id || "");
  const [subcategoryId, setSubcategoryId] = useState(move?.subcategory_id || "");
  const [note, setNote] = useState(move?.note || "");
  const [saving, setSaving] = useState(false);
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subs = (expCats || []).filter((c) => c.parent_id === categoryId);
  const ok = accountId && Number(amount) > 0 && (direction !== "transfer" || (toAccountId && toAccountId !== accountId));
  async function save() {
    setSaving(true);
    await onSave({
      direction, account_id: accountId, to_account_id: direction === "transfer" ? toAccountId : null,
      amount: Number(amount) || 0, move_date: moveDate || null,
      category_id: direction === "expense" ? (categoryId || null) : null,
      subcategory_id: direction === "expense" ? (subcategoryId || null) : null, note: note || null,
    }, move);
    setSaving(false);
  }
  return (
    <ModalShell title={move ? "Изменить движение" : "Новое движение"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-seg" style={{ width: "100%", marginBottom: 14 }}>
        <button className={`kd-segbtn ${direction === "income" ? "on" : ""}`} onClick={() => setDirection("income")}>Доход</button>
        <button className={`kd-segbtn ${direction === "expense" ? "on" : ""}`} onClick={() => setDirection("expense")}>Расход</button>
        <button className={`kd-segbtn ${direction === "transfer" ? "on" : ""}`} onClick={() => setDirection("transfer")}>Перевод</button>
      </div>
      <Field label={direction === "transfer" ? "Со счёта" : "Счёт"}><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      {direction === "transfer" && <Field label="На счёт"><select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">— выбери —</option>{accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
      <div className="kd-grid2">
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" /></Field>
        <Field label="Дата"><input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} /></Field>
      </div>
      {direction === "expense" && parents.length > 0 && (
        <>
          <Field label="Статья расхода"><select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}><option value="">— без статьи —</option>{parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          {subs.length > 0 && <Field label="Подстатья"><select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}><option value="">— без подстатьи —</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        </>
      )}
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="за что / откуда / комментарий" /></Field>
    </ModalShell>
  );
}

function AccountModal({ item, onClose, onSave, onRemove }) {
  const [name, setName] = useState(item?.name || "");
  const [kind, setKind] = useState(item?.kind || "bank");
  const [openingBalance, setOpeningBalance] = useState(item?.opening_balance ?? "");
  const [openingDate, setOpeningDate] = useState(item?.opening_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() { setSaving(true); await onSave({ name: name.trim(), kind, opening_balance: Number(openingBalance) || 0, opening_date: openingDate || null }, item); setSaving(false); }
  return (
    <ModalShell title={item ? "Счёт" : "Новый счёт"} onClose={onClose} footer={<>
      {item && <button className="kd-btn ghost danger" onClick={() => onRemove(item)} style={{ marginRight: "auto" }}>Удалить</button>}
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Название счёта"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр.: Halyk Bank" /></Field>
      <Field label="Тип"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="bank">Банковский счёт</option><option value="cash">Наличные</option><option value="other">Другое</option></select></Field>
      <div className="kd-hint">Начальный остаток — сколько реально лежит на счёте на указанную дату. С неё система начнёт считать. Так баланс в приложении сойдётся с банком.</div>
      <div className="kd-grid2">
        <Field label="Начальный остаток (₸)"><input value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} inputMode="numeric" placeholder="0" /></Field>
        <Field label="На дату"><input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} /></Field>
      </div>
    </ModalShell>
  );
}

function ConfirmDepositModal({ dep, techName, accounts, defaultAccountId, onClose, onConfirm }) {
  const [accId, setAccId] = useState(defaultAccountId || accounts[0]?.id || "");
  return (
    <ModalShell title="Подтвердить поступление" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!accId} onClick={() => onConfirm(accId)}>Да, подтвердить</button>
    </>}>
      <div className="kd-paytotal"><span>{techName || "Дезинфектор"}</span><strong>{fmt(dep.amount)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Деньги придут на выбранный счёт (сдача налички через банкомат). Это перевод из «на руках» дезинфектора на счёт — без двойного счёта.</div>
      <Field label="На какой счёт поступило"><select value={accId} onChange={(e) => setAccId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </ModalShell>
  );
}

function CancelJobModal({ job, onClose, onSave }) {
  const COMMON = ["Клиент передумал", "Слишком дорого", "Нашёл дешевле", "Не дозвонились", "Перенёс на потом", "Клиент не отвечает"];
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(reason.trim()); setSaving(false); }
  return (
    <ModalShell title="Клиент отказался" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Назад</button>
      <button className="kd-btn primary danger" disabled={saving} onClick={save}>{saving ? "…" : "Отменить заявку"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}. Заявка уйдёт в «Отменённые», в выручку не попадёт. Позже можно вернуть в работу.</div>
      <div className="kd-field"><span>Частые причины</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {COMMON.map((c) => (
            <button key={c} type="button" onClick={() => setReason(c)} className="kd-price" style={{ cursor: "pointer", border: reason === c ? "1px solid var(--primary)" : "1px solid var(--line-soft)", color: reason === c ? "var(--primary-d)" : "var(--ink)" }}>{c}</button>
          ))}
        </div>
      </div>
      <Field label="Причина / комментарий"><textarea className="kd-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Что, где, как — своими словами" /></Field>
    </ModalShell>
  );
}

function TaskModal({ task, people, onClose, onSave }) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [type, setType] = useState(task?.type || "errand");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || "");
  const [dueMode, setDueMode] = useState(task?.due_date ? "date" : "none");
  const [dueDate, setDueDate] = useState(task?.due_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const ok = title.trim();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  async function save() {
    setSaving(true);
    const due = dueMode === "today" ? today : dueMode === "tomorrow" ? tomorrow : dueMode === "date" ? (dueDate || null) : null;
    await onSave({ title: title.trim(), description: description.trim() || null, type, priority, assignee_id: assigneeId || null, due_date: due }, task);
    setSaving(false);
  }
  return (
    <ModalShell title={task ? "Изменить задачу" : "Новая задача"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Что нужно сделать"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Забрать документы у FishProDex" /></Field>
      <Field label="Подробности (необязательно)"><textarea className="kd-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Адрес, что именно, детали..." /></Field>
      <div className="kd-grid2">
        <Field label="Тип"><select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TASK_TYPES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <Field label="Приоритет"><select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">Обычный</option><option value="urgent">🔴 Срочный</option></select></Field>
      </div>
      <Field label="Исполнитель"><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">— не назначен —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 6)}</option>)}</select></Field>
      <div className="kd-field"><span>Срок</span>
        <div className="kd-seg" style={{ width: "100%" }}>
          {[{ id: "none", label: "Без срока" }, { id: "today", label: "Сегодня" }, { id: "tomorrow", label: "Завтра" }, { id: "date", label: "Дата" }].map((m) => (
            <button key={m.id} type="button" className={`kd-segbtn ${dueMode === m.id ? "on" : ""}`} onClick={() => setDueMode(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>
      {dueMode === "date" && <Field label="Выбери дату"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
    </ModalShell>
  );
}

function ExecutorDoneModal({ job, partnerName, accounts, defaultAccountId, onClose, onConfirm }) {
  const po = job.price_options || [];
  const [amount, setAmount] = useState(String(po[0]?.amount || ""));
  const [settlement, setSettlement] = useState("qr_full");
  const [accId, setAccId] = useState(defaultAccountId || accounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const sharePct = Number(job.executor_share_pct) || 0;
  const amt = Number(amount) || 0;
  const partnerPart = Math.round(amt * sharePct / 100);
  const ourPart = amt - partnerPart;
  const ok = amt > 0;
  async function save() { setSaving(true); await onConfirm(amt, settlement, settlement === "net_to_us" ? (accId || null) : null, date || null); setSaving(false); }
  return (
    <ModalShell title="Партнёр выполнил заявку" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Закрыть заявку"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address} · исполнитель: <strong>{partnerName || "партнёр"}</strong> (доля {sharePct}%)</div>
      <Field label="Полная сумма заявки (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="20000" /></Field>
      <div className="kd-paytotal"><span>Доля партнёра {sharePct}%</span><strong>{fmt(partnerPart)} ₸</strong></div>
      <div className="kd-paytotal" style={{ marginTop: 6 }}><span>Наша доля</span><strong style={{ color: "var(--primary-d)" }}>{fmt(ourPart)} ₸</strong></div>
      <div className="kd-section">Как прошла оплата</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <button className={`kd-btn ${settlement === "qr_full" ? "primary" : "ghost"}`} style={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => setSettlement("qr_full")}>💳 Клиент оплатил нам QR всю сумму — мы должны партнёру его долю</button>
        <button className={`kd-btn ${settlement === "net_to_us" ? "primary" : "ghost"}`} style={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => setSettlement("net_to_us")}>💵 Партнёр перевёл нам нашу долю (напр. на Kaspi Gold)</button>
      </div>
      {settlement === "qr_full" && <div className="kd-hint">Вся сумма {fmt(amt)} ₸ упадёт на QR-счёт автоматически (как обычная QR-оплата). На карточке появится «доля исполнителю к выплате {fmt(partnerPart)} ₸».</div>}
      {settlement === "net_to_us" && (
        <div className="kd-grid2">
          <Field label="На какой счёт пришло"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не привязывать —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Дата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      )}
    </ModalShell>
  );
}

function RequestEditModal({ job, onClose, onSave }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = reason.trim();
  async function save() { setSaving(true); await onSave(reason.trim()); setSaving(false); }
  return (
    <ModalShell title="Запросить изменение отчёта" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Отправить запрос"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}. Отчёт менять сразу нельзя — сначала админ подтвердит после созвона. Опиши, что нужно исправить.</div>
      <Field label="Причина / что исправить"><textarea className="kd-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Напр.: ошибся в сумме, было перечисление 80 000, а не 0" /></Field>
    </ModalShell>
  );
}

function TransferPayModal({ job, accounts, onClose, onConfirm }) {
  const [accId, setAccId] = useState(accounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onConfirm(accId || null, date || null); setSaving(false); }
  return (
    <ModalShell title="Зачесть оплату перечислением" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Да, оплата пришла"}</button>
    </>}>
      <div className="kd-paytotal"><span>{job.pest} · {job.address}</span><strong>{fmt(job.report_transfer)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Отметь, когда деньги реально пришли. Сумма зачислится на выбранный счёт в «Финансах».</div>
      <Field label="На какой счёт пришло"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не привязывать к счёту —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Дата оплаты"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </ModalShell>
  );
}

function TechExtrasModal({ job, techName, onClose, onSave }) {
  const [bonus, setBonus] = useState(job.tech_bonus ?? "");
  const [travel, setTravel] = useState(job.tech_travel ?? "");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(bonus, travel); setSaving(false); }
  return (
    <ModalShell title="Бонус и дорожные" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Сотрудник: <strong>{techName || "не назначен"}</strong>. Суммы попадут в его выплаты (расходы по сотруднику).</div>
      <div className="kd-grid2">
        <Field label="Бонус за заявку (₸)"><input value={bonus} onChange={(e) => setBonus(e.target.value)} inputMode="numeric" placeholder="напр. % от суммы" /></Field>
        <Field label="Дорожные (₸)"><input value={travel} onChange={(e) => setTravel(e.target.value)} inputMode="numeric" placeholder="2000" /></Field>
      </div>
    </ModalShell>
  );
}

function DayOffModal({ techs, defaultDate, daysOff, personName, onClose, onAdd, onRemove }) {
  const [techId, setTechId] = useState(techs[0]?.id || "");
  const [offDate, setOffDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = techId && offDate;
  const upcoming = [...daysOff].filter((d) => d.off_date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.off_date.localeCompare(b.off_date)).slice(0, 12);
  async function save() { setSaving(true); await onAdd(techId, offDate, note.trim() || null); setSaving(false); }
  return (
    <ModalShell title="Выходной сотрудника" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Закрыть</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Отметить выходной"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Сотрудник"><select value={techId} onChange={(e) => setTechId(e.target.value)}>{techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || "—"}</option>)}</select></Field>
        <Field label="Дата"><input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} /></Field>
      </div>
      <Field label="Причина (необязательно)"><input list="kd-dayoff-reasons" value={note} onChange={(e) => setNote(e.target.value)} placeholder="отгул / больничный / отпуск / отпросился / свой выходной" /></Field>
      <datalist id="kd-dayoff-reasons">
        <option value="Свой выходной" />
        <option value="Отгул" />
        <option value="Больничный (БС)" />
        <option value="Отпуск" />
        <option value="Отпросился" />
      </datalist>
      {upcoming.length > 0 && (
        <>
          <div className="kd-section" style={{ marginTop: 6 }}>Ближайшие выходные</div>
          {upcoming.map((d) => (
            <div key={d.id} className="kd-returnrow" style={{ fontSize: 13.5 }}>
              <span>🌴 {personName(d.tech_id)} · {isoToRu(d.off_date)}{d.note ? " · " + d.note : ""}</span>
              <button className="kd-btn ghost danger sm" onClick={() => onRemove(d)}><X size={12} /></button>
            </div>
          ))}
        </>
      )}
    </ModalShell>
  );
}

function MktChannelModal({ item, sources, onClose, onSave }) {
  const [name, setName] = useState(item?.name || "");
  const [sourceKey, setSourceKey] = useState(item?.source_key || "");
  const [plan, setPlan] = useState(item?.monthly_plan ?? "");
  const [isFixed, setIsFixed] = useState(item?.is_fixed || false);
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() {
    setSaving(true);
    await onSave({ name: name.trim(), source_key: sourceKey.trim() || null, monthly_plan: Number(plan) || 0, is_fixed: isFixed }, item);
    setSaving(false);
  }
  return (
    <ModalShell title={item ? "Канал" : "Новый канал"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Название канала"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="2ГИС / OLX / Instagram / TikTok" /></Field>
      <datalist id="kd-mkt-sources">{sources.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <Field label="Источник заявок для ROI (из справочника)"><input list="kd-mkt-sources" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} placeholder="напр.: 2gis / olx / instagram" /></Field>
      <div className="kd-muted" style={{ marginTop: -6, marginBottom: 12 }}>Система посчитает выручку по заявкам с этим источником. Если не указать — ROI не считается (для «Резерв» можно оставить пустым).</div>
      <Field label="Плановый бюджет в месяц (₸)"><input value={plan} onChange={(e) => setPlan(e.target.value)} inputMode="numeric" placeholder="450000" /></Field>
      <label className="kd-check"><input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} /> Фиксированный (сумма не меняется, напр. 2ГИС)</label>
    </ModalShell>
  );
}

function MktTopupModal({ channel, accounts, onClose, onSave }) {
  const [amount, setAmount] = useState(String(channel?.monthly_plan || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accId, setAccId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = Number(amount) > 0 && date;
  async function save() { setSaving(true); await onSave(Number(amount) || 0, date, accId || null, note.trim() || null); setSaving(false); }
  return (
    <ModalShell title={`Пополнение · ${channel.name}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Записать пополнение"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="200000" /></Field>
        <Field label="Дата пополнения"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="С какого счёта (необязательно)"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не списывать со счёта —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <div className="kd-muted" style={{ marginTop: -6, marginBottom: 12 }}>Если выберешь счёт — сумма спишется с него как расход в «Финансах».</div>
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр.: первая половина месяца" /></Field>
    </ModalShell>
  );
}

function LeadModal({ lead, stages, sources, onClose, onSave }) {
  const [name, setName] = useState(lead?.name || "");
  const [clientType, setClientType] = useState(lead?.client_type || "person");
  const [phone, setPhone] = useState(lead?.phone || "+7 ");
  const [address, setAddress] = useState(lead?.address || "");
  const [source, setSource] = useState(lead?.source || "");
  const [stageId, setStageId] = useState(lead?.stage_id || (stages[0]?.id || ""));
  const [kpUrl, setKpUrl] = useState(lead?.kp_url || "");
  const [note, setNote] = useState(lead?.note || "");
  const [saving, setSaving] = useState(false);
  const ok = (name.trim() || (phone.trim() && phone.trim() !== "+7"));
  async function save() {
    setSaving(true);
    await onSave({ name: name.trim() || null, client_type: clientType, phone: phone.trim() || null, address: address.trim() || null, source: source.trim() || null, stage_id: stageId || null, kp_url: kpUrl.trim() || null, note: note.trim() || null }, lead);
    setSaving(false);
  }
  return (
    <ModalShell title={lead ? "Клиент" : "Новый клиент"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-seg" style={{ width: "100%", marginBottom: 14 }}>
        <button className={`kd-segbtn ${clientType === "person" ? "on" : ""}`} onClick={() => setClientType("person")}>Физлицо</button>
        <button className={`kd-segbtn ${clientType === "company" ? "on" : ""}`} onClick={() => setClientType("company")}>Юрлицо</button>
      </div>
      <Field label={clientType === "company" ? "Название организации" : "Имя клиента"}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={clientType === "company" ? "ТОО ..." : "Иван"} /></Field>
      <div className="kd-grid2">
        <Field label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 701 ..." /></Field>
        <Field label="Стадия"><select value={stageId} onChange={(e) => setStageId(e.target.value)}>{[...stages].sort((a, b) => a.sort - b.sort).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      <Field label="Адрес"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Алматы, ..." /></Field>
      <datalist id="kd-lead-sources">{sources.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <Field label="Источник"><input list="kd-lead-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="OLX / Instagram / рекомендация" /></Field>
      <Field label="Ссылка на файл КП (Google Диск)"><input value={kpUrl} onChange={(e) => setKpUrl(e.target.value)} placeholder="https://drive.google.com/... (файл этого клиента)" /></Field>
      <Field label="Заметка"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что обсудили, детали..." /></Field>
    </ModalShell>
  );
}

function LeadStageSelectModal({ lead, stages, onClose, onPick }) {
  return (
    <ModalShell title="Перевести на стадию" onClose={onClose} footer={<button className="kd-btn ghost" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{lead.name || lead.phone || "Клиент"} — выбери стадию:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...stages].sort((a, b) => a.sort - b.sort).map((s) => (
          <button key={s.id} className={`kd-btn ${lead.stage_id === s.id ? "primary" : "ghost"}`} style={{ justifyContent: "flex-start" }} onClick={() => onPick(s.id)}>{s.name}{lead.stage_id === s.id ? " ✓" : ""}</button>
        ))}
      </div>
    </ModalShell>
  );
}

function TenderModal({ tender, partners, onClose, onSave }) {
  const [contractNo, setContractNo] = useState(tender?.contract_no || "");
  const [customer, setCustomer] = useState(tender?.customer || "");
  const [title, setTitle] = useState(tender?.title || "");
  const [address, setAddress] = useState(tender?.address || "");
  const [amount, setAmount] = useState(tender?.amount ?? "");
  const [ourShare, setOurShare] = useState(tender?.our_share_pct ?? "");
  const [partnerId, setPartnerId] = useState(tender?.partner_id || "");
  const [status, setStatus] = useState(tender?.status || "participating");
  const [startDate, setStartDate] = useState(tender?.start_date || "");
  const [endDate, setEndDate] = useState(tender?.end_date || "");
  const [note, setNote] = useState(tender?.note || "");
  const [freq, setFreq] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = (contractNo.trim() || title.trim()) && Number(amount) >= 0;
  const ourAmount = Math.round((Number(amount) || 0) * (Number(ourShare) || 0) / 100);

  // равномерные даты обработок по кратности в пределах start..end
  function buildServices() {
    const n = Number(freq) || 0;
    if (!n || n < 1 || !startDate) return [];
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(new Date(startDate).setFullYear(start.getFullYear() + 1));
    const span = end.getTime() - start.getTime();
    const step = span / n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getTime() + step * i + step / 2);
      out.push({ due_date: d.toISOString().slice(0, 10) });
    }
    return out;
  }

  async function save() {
    setSaving(true);
    const payload = { contract_no: contractNo.trim() || null, customer: customer.trim() || null, title: title.trim() || null, address: address.trim() || null, amount: Number(amount) || 0, our_share_pct: Number(ourShare) || 0, partner_id: partnerId || null, status, start_date: startDate || null, end_date: endDate || null, note: note.trim() || null };
    await onSave(payload, tender ? null : buildServices(), tender);
    setSaving(false);
  }
  return (
    <ModalShell title={tender ? "Изменить тендер" : "Новый тендер"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Номер договора"><input value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="№ 123-45" /></Field>
        <Field label="Статус"><select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(TENDER_STATUS).map(([code, s]) => <option key={code} value={code}>{s.label}</option>)}</select></Field>
      </div>
      <Field label="Заказчик"><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Напр.: ГУ «Управление ...»" /></Field>
      <Field label="Название / предмет"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Дезинфекция объекта ..." /></Field>
      <Field label="Адрес объекта"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Алматы, ..." /></Field>
      <div className="kd-grid2">
        <Field label="Сумма договора (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="1000000" /></Field>
        <Field label="Наша доля (%)"><input value={ourShare} onChange={(e) => setOurShare(e.target.value)} inputMode="numeric" placeholder="25" /></Field>
      </div>
      {Number(amount) > 0 && Number(ourShare) > 0 && <div className="kd-paytotal"><span>Наша доля составит</span><strong style={{ color: "var(--primary-d)" }}>{fmt(ourAmount)} ₸</strong></div>}
      <Field label="Партнёр (выиграл через нас)"><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">— не выбран —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <div className="kd-grid2">
        <Field label="Начало действия"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Конец действия"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      </div>
      {!tender && (
        <Field label="Кратность обработок (сколько раз за период)">
          <input value={freq} onChange={(e) => setFreq(e.target.value)} inputMode="numeric" placeholder="напр. 4" />
        </Field>
      )}
      {!tender && Number(freq) > 0 && startDate && <div className="kd-muted" style={{ marginTop: -6, marginBottom: 10 }}>Создам {freq} обработок с равномерными датами — потом сможешь поправить каждую в карточке тендера.</div>}
      {!tender && Number(freq) > 0 && !startDate && <div className="kd-err" style={{ marginTop: -6 }}>Укажи «Начало действия», чтобы построить график.</div>}
      <Field label="Примечание"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Условия, детали..." /></Field>
      {tender && <div className="kd-muted">График обработок и обеспечения редактируются прямо в карточке тендера.</div>}
    </ModalShell>
  );
}

function GuaranteeModal({ tenderId, onClose, onSave }) {
  const [kind, setKind] = useState("application");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = Number(amount) > 0;
  async function save() { setSaving(true); await onSave({ tender_id: tenderId, kind, amount: Number(amount) || 0, note: note.trim() || null }); setSaving(false); }
  return (
    <ModalShell title="Обеспечение (залог)" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Добавить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Залог — это временно замороженные деньги, которые потом возвращаются. Не доход и не расход.</div>
      <Field label="Тип обеспечения"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(GUARANTEE_KINDS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
      <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" /></Field>
      <Field label="Примечание"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="реквизиты / условия возврата" /></Field>
    </ModalShell>
  );
}

function PayGuaranteeModal({ g, accounts, onClose, onConfirm }) {
  const [accId, setAccId] = useState(accounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onConfirm(accId || null, date || null); setSaving(false); }
  return (
    <ModalShell title="Внести обеспечение" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Да, внести"}</button>
    </>}>
      <div className="kd-paytotal"><span>{GUARANTEE_KINDS[g.kind] || g.kind}</span><strong>{fmt(g.amount)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Деньги спишутся с выбранного счёта как замороженный залог (уменьшат его остаток в «Финансах»).</div>
      <Field label="С какого счёта внесено"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не привязывать к счёту —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Дата внесения"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </ModalShell>
  );
}

function ReturnGuaranteeModal({ g, remaining, accounts, onClose, onConfirm }) {
  const [amount, setAmount] = useState(String(remaining || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accId, setAccId] = useState(g.account_id || accounts[0]?.id || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const val = Number(amount) || 0;
  const ok = val > 0 && val <= remaining;
  async function save() { setSaving(true); await onConfirm(val, date || null, accId || null, note.trim() || null); setSaving(false); }
  return (
    <ModalShell title="Возврат обеспечения" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Да, добавить возврат"}</button>
    </>}>
      <div className="kd-paytotal"><span>Осталось вернуть</span><strong style={{ color: "#B4650B" }}>{fmt(remaining)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Государство возвращает частями — добавляй каждый возврат отдельно. Деньги придут на выбранный счёт (увеличат его остаток).</div>
      <div className="kd-grid2">
        <Field label={`Сумма возврата (макс ${fmt(remaining)})`}><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="25000" /></Field>
        <Field label="Дата возврата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {val > remaining && <div className="kd-err" style={{ marginTop: -6 }}>Нельзя вернуть больше, чем заморожено.</div>}
      <Field label="На какой счёт вернулось"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не привязывать к счёту —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Примечание (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр.: после 1-й обработки" /></Field>
    </ModalShell>
  );
}

function DepositModal({ max, onClose, onSave }) {
  const [mode, setMode] = useState("all");
  const [amount, setAmount] = useState(String(max || 0));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const value = mode === "all" ? max : Number(amount) || 0;
  const ok = value > 0 && value <= max;
  async function save() { setSaving(true); await onSave(value, note); setSaving(false); }
  return (
    <ModalShell title="Внести через банкомат" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Отправить на подтверждение"}</button>
    </>}>
      <div className="kd-hint">Перевод по ИИН <strong>980515351225 — Тыныс Қ.</strong></div>
      <div className="kd-paytotal"><span>На руках сейчас</span><strong>{fmt(max)} ₸</strong></div>
      <div className="kd-seg" style={{ width: "100%", marginBottom: 14 }}>
        <button className={`kd-segbtn ${mode === "all" ? "on" : ""}`} onClick={() => setMode("all")}>Всю сумму</button>
        <button className={`kd-segbtn ${mode === "part" ? "on" : ""}`} onClick={() => setMode("part")}>Часть</button>
      </div>
      {mode === "part" && (
        <Field label={`Сумма к внесению (не больше ${fmt(max)} ₸)`}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" />
        </Field>
      )}
      {mode === "part" && value > max && <div className="kd-err" style={{ marginTop: -6 }}>Нельзя внести больше, чем на руках.</div>}
      <Field label="Комментарий (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="номер чека / время внесения" /></Field>
      <div className="kd-muted">После отправки заявка появится у админа. Он подтвердит поступление, когда проверит.</div>
    </ModalShell>
  );
}

function RejectDepositModal({ dep, techName, onClose, onSave }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(reason); setSaving(false); }
  return (
    <ModalShell title="Отклонить внесение" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary danger" disabled={saving} onClick={save}>{saving ? "…" : "Отклонить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{techName || "Сотрудник"} · {fmt(dep.amount)} ₸. Сумма вернётся в «на руках» у сотрудника.</div>
      <Field label="Причина (увидит сотрудник)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="напр.: не вижу поступления" /></Field>
    </ModalShell>
  );
}

function OffCalendarModal({ techs, daysOff, personName, defaultDate, onClose, onPickDay }) {
  const start = defaultDate ? new Date(defaultDate) : new Date();
  const [ym, setYm] = useState({ y: start.getFullYear(), m: start.getMonth() });

  const COLORS = ["#34D399", "#F5B454", "#7CB2F5", "#B79BF0", "#F2726A", "#25D366", "#E9A23B", "#5FD0C4", "#EF8FBE", "#9DD35F"];
  const techColor = (id) => {
    const i = (techs || []).findIndex((t) => t.id === id);
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  };
  const firstName = (id) => ((personName(id) || "—").split(" ")[0]);

  const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  // карта: дата → [строка выходного {tech_id, note, ...}]
  const offByDate = {};
  (daysOff || []).forEach((d) => { (offByDate[d.off_date] = offByDate[d.off_date] || []).push(d); });

  const first = new Date(ym.y, ym.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const todayIso = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD локально

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, iso, offs: offByDate[iso] || [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const prev = () => setYm((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }));
  const next = () => setYm((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }));
  const today = () => { const d = new Date(); setYm({ y: d.getFullYear(), m: d.getMonth() }); };

  // сотрудники, у кого есть выходные в этом месяце — для легенды
  const monthPrefix = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const activeTechIds = [...new Set((daysOff || []).filter((d) => String(d.off_date).startsWith(monthPrefix)).map((d) => d.tech_id))];

  const cellStyle = {
    minHeight: 84, borderRadius: 10, border: "1px solid var(--line)",
    background: "var(--surface-sunk)", padding: "5px 6px", display: "flex",
    flexDirection: "column", gap: 3, cursor: onPickDay ? "pointer" : "default", overflow: "hidden",
  };

  return (
    <div className="kd-overlay" onClick={onClose}>
      <div className="kd-modal" style={{ maxWidth: 760, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-head">
          <h3>🌴 Выходные сотрудников</h3>
          <button className="kd-x" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="kd-modal-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="kd-arrow" onClick={prev}><ChevronLeft size={18} /></button>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, minWidth: 150, textAlign: "center" }}>{MONTHS[ym.m]} {ym.y}</div>
              <button className="kd-arrow" onClick={next}><ChevronRight size={18} /></button>
            </div>
            <button className="kd-btn ghost sm" onClick={today}>Сегодня</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
            {WD.map((w, i) => (
              <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".4px", color: i >= 5 ? "var(--rust)" : "var(--muted)", textTransform: "uppercase" }}>{w}</div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
              {week.map((cell, ci) => {
                if (!cell) return <div key={ci} style={{ ...cellStyle, background: "transparent", border: "1px solid transparent", cursor: "default" }} />;
                const isToday = cell.iso === todayIso;
                return (
                  <div
                    key={ci}
                    onClick={onPickDay ? () => onPickDay(cell.iso) : undefined}
                    style={{ ...cellStyle, borderColor: isToday ? "var(--primary)" : "var(--line)", boxShadow: isToday ? "0 0 0 1px var(--primary), 0 6px 18px -10px var(--em-glow)" : "none" }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? "var(--primary-d)" : (ci >= 5 ? "var(--muted)" : "var(--ink-soft)") }}>{cell.day}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {cell.offs.map((row, k) => (
                        <span key={k} title={personName(row.tech_id) + (row.note ? " · " + row.note : "")} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface-hi)", borderRadius: 6, padding: "2px 5px", fontSize: 10.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: techColor(row.tech_id), flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{firstName(row.tech_id)}{row.note ? <span style={{ color: "var(--muted)", fontWeight: 600 }}> · {row.note}</span> : null}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {activeTechIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              {activeTechIds.map((tid) => (
                <span key={tid} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: techColor(tid) }} />
                  {personName(tid)}
                </span>
              ))}
            </div>
          )}
          {onPickDay && <div className="kd-muted" style={{ marginTop: 10 }}>Нажми на день, чтобы отметить или снять выходной.</div>}
        </div>
      </div>
    </div>
  );
}

export { AccountModal, AddChemModal, AssignModal, CancelJobModal, CatalogList, ConfirmDepositModal, ConfirmModal, DayOffModal, DepositModal, DetailsModal, DocModal, EquipModal, ExecutorDoneModal, ExpenseModal, Field, GuaranteeModal, HandoutModal, HistoryModal, IssueEquipModal, JobCard, JobFormModal, LeadModal, LeadStageSelectModal, MktChannelModal, MktTopupModal, ModalShell, MoveModal, OffCalendarModal, OpexModal, PartnerJobsModal, PartnerModal, PayGuaranteeModal, RejectDepositModal, RepeatCard, ReportEquipModal, ReportModal, ReportSuccessModal, RequestEditModal, ReturnGuaranteeModal, SettingsModal, SettingsSection, StockInModal, TaskModal, TechEditModal, TechExtrasModal, TenderModal, TransferEquipModal, TransferPayModal, ViewModal, jobToForm };
