// Карточка лида в духе Bitrix: воронка сверху, слева сделка, справа форма
// касания и лента — касания, комментарии, стадии, КП, прошлые заявки и
// звонки обзвона по номеру клиента. Всё в одном окне, без отдельных модалок.
import React, { useEffect, useState } from "react";
import { MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { ClientHistoryNote } from "./HunterDeal";
import { CrmSection, Composer, Feed, InfoList, StageBar } from "./CrmCard";
import { clientTimelineItems, leadActivityItems, proposalItems } from "./crmFeed";
import { frequencyLabel, lostReasonLabel, missingText, objectPriority, objectTypeLabel } from "./hunterFunnelModel";

const ruDate = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "");
const money = (value) => (Number(value) > 0 ? `${Math.round(Number(value)).toLocaleString("ru-RU").replace(/[\s,]/g, " ")} ₸` : "");
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function LeadCard({
  lead, stages = [], activities = [], proposals = [], clientHistory, nextHint, actionState, waitingLabel,
  profileName = () => "", loadTimeline, onPickStage, onRecord, onEdit, onConvert, onDelete,
}) {
  const [timeline, setTimeline] = useState({ rows: [], loading: true, error: "" });
  useEffect(() => {
    let alive = true;
    if (!loadTimeline) { setTimeline({ rows: [], loading: false, error: "" }); return undefined; }
    setTimeline((prev) => ({ ...prev, loading: true }));
    loadTimeline(lead.id).then((result) => { if (alive) setTimeline({ rows: result?.rows || [], loading: false, error: result?.error || "" }); });
    return () => { alive = false; };
  }, [lead.id, loadTimeline]);

  const sorted = [...stages].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const exits = sorted.filter((s) => s.is_lost || s.code === "snoozed");
  const line = sorted.filter((s) => !exits.includes(s));
  const stage = sorted.find((s) => String(s.id) === String(lead.stage_id));
  const closed = !!stage?.is_final || !!stage?.is_lost;
  const digits = String(lead.lpr_phone || lead.phone || "").replace(/\D/g, "");
  const isCompany = lead.client_type === "company";
  const items = [...leadActivityItems(activities, profileName), ...clientTimelineItems(timeline.rows), ...proposalItems(proposals)];
  const actionLabels = { overdue: "Просрочено", today: "Сегодня", planned: "Запланировано", missing: "Не назначен" };

  return <div className="crm-card">
    <div className="crm-card-head">
      <div className="crm-card-title">
        <div className="crm-sub">
          <span className="kd-badge" style={{ color: isCompany ? "#2557B0" : "#6E3FCF", background: isCompany ? "#E9F0FC" : "#F0EAFC" }}>{isCompany ? "Юрлицо" : "Физлицо"}</span>
          {stage && <strong>{stage.name}</strong>}
          {lead.phone && <a href={`tel:+${String(lead.phone).replace(/\D/g, "")}`}>{lead.phone}</a>}
          {lead.source && <span>{lead.source}</span>}
          {lead.owner_id && <span>Ответственный: {profileName(lead.owner_id) || "—"}</span>}
          {waitingLabel && <span>{waitingLabel}</span>}
        </div>
      </div>
      <div className="crm-card-actions">
        {digits && <a className="kd-btn ghost sm" href={`tel:+${digits}`}><Phone size={14} />Позвонить</a>}
        {digits && <a className="kd-btn wa sm" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>}
        <button type="button" className="kd-btn ghost sm" onClick={onEdit}><Pencil size={14} />Изменить</button>
        {onConvert && !lead.converted_job_id && <button type="button" className="kd-btn ghost sm" onClick={onConvert}><Plus size={14} />Заявка</button>}
        {onDelete && <button type="button" className="kd-btn ghost danger sm" aria-label="Удалить из воронки" onClick={onDelete}><Trash2 size={14} /></button>}
      </div>
    </div>

    <StageBar stages={line} exits={exits} currentId={lead.stage_id} onPick={onPickStage} />

    <div className="crm-columns">
      <div className="crm-left">
        {!closed && <CrmSection title="Следующий шаг">
          <div className={`kd-leadnext ${actionState?.kind || ""}`} style={{ margin: 0 }}>
            <span><strong>{lead.next_action || "Шаг не назначен"}</strong>
              <small>{lead.next_action_at ? `${actionLabels[actionState?.kind] || ""} · ${dateTime(lead.next_action_at)}` : "Запиши касание — и назначь следующий шаг"}</small></span>
          </div>
        </CrmSection>}
        <ClientHistoryNote history={clientHistory} />
        {nextHint?.missing?.length > 0 && <div className="kd-hint">До «{nextHint.stage.label}» не хватает: {missingText(nextHint.missing)}</div>}
        <CrmSection title={isCompany ? "О сделке" : "О клиенте"} action={<button type="button" className="kd-btn ghost sm" onClick={onEdit}>Изменить</button>}>
          <InfoList rows={[
            ["Телефон", lead.phone],
            ["Адрес", lead.address],
            ["Источник", lead.source],
            ["Тип объекта", objectTypeLabel(lead.object_type) && `${objectTypeLabel(lead.object_type)}${objectPriority(lead.object_type) ? ` (${objectPriority(lead.object_type)})` : ""}`],
            ["Площадь", lead.area_m2 && `${lead.area_m2} м²`],
            ["ЛПР", lead.lpr_name && [lead.lpr_name, lead.lpr_position].filter(Boolean).join(", ")],
            ["Телефон ЛПР", lead.lpr_phone && lead.lpr_phone !== lead.phone ? lead.lpr_phone : ""],
            ["Вредители", (lead.pests || []).join(", ")],
            ["Договор сейчас", lead.current_provider],
            ["Хочет", frequencyLabel(lead.desired_frequency)],
            ["Цена за выезд", money(lead.quoted_price)],
            ["Периодичность", frequencyLabel(lead.agreed_frequency)],
            ["Выручка в месяц", money(lead.expected_mrr)],
            ["Подписант", lead.signer_name],
            ["Первая обработка", ruDate(lead.first_service_at)],
            ["Договор подписан", ruDate(lead.contract_signed_at)],
            ["След. выезд", ruDate(lead.next_service_at)],
            ["Удержание", lead.keeper_id && profileName(lead.keeper_id)],
            ["Отложено до", lead.snooze_until && `${ruDate(lead.snooze_until)}${lead.snooze_reason ? ` — ${lead.snooze_reason}` : ""}`],
            ["Причина отказа", stage?.is_lost && (lostReasonLabel(lead.lost_reason) || "не указана")],
            ["КП", lead.kp_url && <a href={lead.kp_url} target="_blank" rel="noopener noreferrer">Открыть файл</a>],
          ]} />
        </CrmSection>
        {lead.note && <CrmSection title="Важная заметка"><div style={{ whiteSpace: "pre-wrap" }}>{lead.note}</div></CrmSection>}
      </div>

      <div className="crm-right">
        <Composer closed={closed} kinds={closed ? ["note"] : ["note", "call", "whatsapp", "meeting"]}
          defaultNextAction={lead.next_action || "Позвонить клиенту"} onSubmit={onRecord} />
        {timeline.error && <div className="kd-hint">История заявок по номеру не загрузилась: {timeline.error}</div>}
        <Feed items={items} loading={timeline.loading} empty="Событий пока нет. Запиши первый звонок или комментарий." />
      </div>
    </div>
  </div>;
}
