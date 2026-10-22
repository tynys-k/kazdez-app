import React, { useMemo, useState } from "react";
import { ClientStatusBadges } from "./workflows/ClientStatus";
import { CLIENT_LABELS } from "./workflows/clientStatusModel";
import QualityHistory, { qualityHistoryForPhone } from "./workflows/QualityHistory";
import { CallLog } from "./workflows/ClientCalls";
import { callsForClient, outcomeLabel } from "./workflows/clientCallsModel";
import { Building2, Camera, FileText, FolderOpen, Mail, MapPin, MessageCircle, Paperclip, Pencil, Phone, PhoneCall, Plus, Trash2, UserRound } from "lucide-react";
import { addressPlain, fmt, fmtTs, isoToRu, samePhone } from "./shared";
import { clientAddresses as collectAddresses, clientContracts, clientJobs, clientSummary } from "./clientDirectory";
import { DetailDrawer } from "./ui/primitives";
import { Composer, CrmSection, Feed, InfoList } from "./workflows/CrmCard";
import { leadActivityItems } from "./workflows/crmFeed";

const blankContact = () => ({ name: "", role: "", phone: "", email: "", note: "" });
const blankAddress = () => ({ label: "", address: "", contact_name: "", contact_phone: "", note: "" });
const cleanRows = (rows, key) => rows.map(({ id, client_id, created_at, updated_at, fromHistory, ...row }) => row).filter((row) => String(row[key] || "").trim());

function Shell({ title, children, footer, onClose }) {
  return <div className="kd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="kd-modal wide" role="dialog" aria-modal="true">
    <div className="kd-modal-head"><h3>{title}</h3><button className="kd-x" onClick={onClose}>×</button></div>
    <div className="kd-modal-body">{children}</div>{footer && <div className="kd-modal-foot">{footer}</div>}
  </div></div>;
}

const Field = ({ label, children }) => <label className="kd-field"><span>{label}</span>{children}</label>;

export function ClientProfileModal({ client, contacts = [], addresses = [], onClose, onSave }) {
  const [profile, setProfile] = useState({
    client_labels: client?.client_labels || [],
    name: client?.name || "", phone: client?.phone || "+7 ", email: client?.email || "",
    client_type: client?.client_type || "person", legal_name: client?.legal_name || "", bin_iin: client?.bin_iin || "", note: client?.note || "",
  });
  const [people, setPeople] = useState(contacts.length ? contacts : []);
  const [places, setPlaces] = useState(addresses.length ? addresses : []);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setProfile((row) => ({ ...row, [key]: value }));
  const updateRow = (setter, index, key, value) => setter((rows) => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  async function save() {
    setSaving(true);
    await onSave(profile, cleanRows(people, "phone").concat(cleanRows(people.filter((row) => !row.phone), "email")), cleanRows(places, "address"), client);
    setSaving(false);
  }
  return <Shell title={client ? "Данные клиента" : "Новый клиент"} onClose={onClose} footer={<><button className="kd-btn ghost" onClick={onClose}>Отмена</button><button className="kd-btn primary" disabled={saving || profile.phone.replace(/\D/g, "").length < 10} onClick={save}>{saving ? "Сохраняем…" : "Сохранить"}</button></>}>
    <div className="kd-client-form-section"><div className="kd-section">Основные данные</div><div className="kd-grid2">
      <Field label="Имя / короткое название"><input value={profile.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Основной телефон"><input value={profile.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
      <Field label="Тип клиента"><select value={profile.client_type} onChange={(e) => set("client_type", e.target.value)}><option value="person">Физическое лицо</option><option value="company">ТОО / ИП</option></select></Field>
      <Field label="E-mail"><input type="email" value={profile.email} onChange={(e) => set("email", e.target.value)} /></Field>
    </div>{profile.client_type === "company" && <div className="kd-grid2"><Field label="Юридическое наименование"><input value={profile.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder="ТОО «…» / ИП …" /></Field><Field label="БИН / ИИН"><input value={profile.bin_iin} onChange={(e) => set("bin_iin", e.target.value)} inputMode="numeric" /></Field></div>}<Field label="Важная информация"><textarea className="kd-textarea" value={profile.note} onChange={(e) => set("note", e.target.value)} placeholder="Условия доступа, предпочтения, особенности клиента…" /></Field></div>

    <fieldset className="wf-section"><legend>Статусы клиента</legend><div className="wf-members">{Object.entries(CLIENT_LABELS).map(([id, label]) => <label key={id}><input type="checkbox" checked={profile.client_labels.includes(id)} onChange={(e) => set("client_labels", e.target.checked ? [...profile.client_labels, id] : profile.client_labels.filter((key) => key !== id))} />{label}</label>)}</div><p className="kd-muted">«Постоянный» также назначается автоматически по числу завершённых первичных заявок.</p></fieldset>
    <div className="kd-client-form-section"><div className="kd-client-form-head"><div><div className="kd-section">Контактные лица</div><small>Сотрудники, родственники и другие контакты</small></div><button className="kd-btn ghost sm" onClick={() => setPeople((rows) => [...rows, blankContact()])}><Plus size={14} />Контакт</button></div>
      {people.length === 0 && <div className="kd-muted">Дополнительных контактов нет.</div>}{people.map((row, index) => <div className="kd-client-edit-row" key={row.id || index}><div className="kd-grid2"><Field label="Имя"><input value={row.name || ""} onChange={(e) => updateRow(setPeople, index, "name", e.target.value)} /></Field><Field label="Роль / должность"><input value={row.role || ""} onChange={(e) => updateRow(setPeople, index, "role", e.target.value)} placeholder="Управляющий, бухгалтер…" /></Field><Field label="Телефон"><input value={row.phone || ""} onChange={(e) => updateRow(setPeople, index, "phone", e.target.value)} /></Field><Field label="E-mail"><input value={row.email || ""} onChange={(e) => updateRow(setPeople, index, "email", e.target.value)} /></Field><Field label="График / примечание"><input value={row.note || ""} onChange={(e) => updateRow(setPeople, index, "note", e.target.value)} placeholder="Смена, дни работы, кого встречать" /></Field></div><button className="kd-iconbtn danger" onClick={() => setPeople((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}
    </div>

    <div className="kd-client-form-section"><div className="kd-client-form-head"><div><div className="kd-section">Адреса клиента</div><small>Объекты, офисы и адреса для документов</small></div><button className="kd-btn ghost sm" onClick={() => setPlaces((rows) => [...rows, blankAddress()])}><Plus size={14} />Адрес</button></div>
      {places.length === 0 && <div className="kd-muted">Сохранённых адресов нет — адреса заявок всё равно будут видны в карточке.</div>}{places.map((row, index) => <div className="kd-client-edit-row" key={row.id || index}><div><div className="kd-grid2"><Field label="Название"><input value={row.label || ""} onChange={(e) => updateRow(setPlaces, index, "label", e.target.value)} placeholder="Основной объект / офис" /></Field><Field label="Адрес"><input value={row.address || ""} onChange={(e) => updateRow(setPlaces, index, "address", e.target.value)} /></Field><Field label="Контакт на объекте"><input value={row.contact_name || ""} onChange={(e) => updateRow(setPlaces, index, "contact_name", e.target.value)} /></Field><Field label="Телефон объекта"><input value={row.contact_phone || ""} onChange={(e) => updateRow(setPlaces, index, "contact_phone", e.target.value)} /></Field></div></div><button className="kd-iconbtn danger" onClick={() => setPlaces((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}
    </div>
  </Shell>;
}

// Карточка клиента в духе Bitrix: слева данные клиента, справа комментарий и
// единая лента — заявки, касания из воронки, обзвон, заметки, договоры, файлы.
// История по заявкам, обзвон, контроль и файлы — отдельными вкладками.
export function ClientDetailsModal({ regularClientThreshold = 3, onBlock, onOpenLegalContract, qualityChecks = [], people = [], legalContracts = [], client, jobs = [], contacts = [], addresses = [], contracts = [], followups = [], events = [], leads = [], leadActivities = [], attachments = [], jobProofs = [], calls = [], callPeople = [], userId, isAdmin, onCall, onDeleteCall, canEdit, onClose, onEdit, onAddNote, onUpload, onOpenAttachment, onOpenJob, onOpenContract, onOpenProof }) {
  const [view, setView] = useState("card");
  const rows = useMemo(() => clientJobs(client, jobs), [client, jobs]);
  const summary = useMemo(() => clientSummary(client, jobs, contracts, followups), [client, jobs, contracts, followups]);
  const linkedContacts = contacts.filter((row) => String(row.client_id) === String(client.id));
  const linkedAddresses = collectAddresses(client, addresses, jobs);
  const linkedContracts = legalContracts.filter((c) => c.client_id === client.id);
  const linkedAttachments = attachments.filter((row) => String(row.client_id) === String(client.id));
  const linkedLeads = leads.filter((row) => samePhone(row.phone, client.phone) || samePhone(row.lpr_phone, client.phone) || String(row.company_id || "") === String(client.id));
  const leadIds = new Set(linkedLeads.map((row) => String(row.id)));
  const rowIds = new Set(rows.map((row) => String(row.id)));
  const proofRows = jobProofs.filter((row) => rowIds.has(String(row.job_id)));
  const clientCallRows = callsForClient(calls, { clientId: client.id, phone: client.phone, jobIds: rowIds });
  const lastDoneJob = rows.filter((row) => row.status === "done").sort((a, b) => String(b.scheduled_date || "").localeCompare(String(a.scheduled_date || "")))[0];
  const personName = (id) => [...people, ...callPeople].find((p) => String(p.id) === String(id))?.full_name || "";
  const jobStatus = { done: "выполнена", canceled: "отменена", assigned: "назначена", new: "новая" };
  const feed = [
    ...rows.map((row) => ({ id: `job-${row.id}`, at: row.scheduled_date || row.created_at, dateOnly: !!row.scheduled_date, group: "job", icon: "job",
      title: `Заявка: ${row.pest || row.type || "услуга"}`, body: addressPlain(row.address),
      meta: [jobStatus[row.status] || row.status, row.status === "done" && Number(row.report_paid) > 0 ? `${fmt(row.report_paid)} ₸` : ""].filter(Boolean).join(" · "),
      tone: row.status === "canceled" ? "muted" : row.status === "done" ? "positive" : "" })),
    ...events.filter((row) => (row.client_id && String(row.client_id) === String(client.id)) || samePhone(row.client_phone, client.phone)).map((row) => ({
      id: `event-${row.id}`, at: row.created_at, group: row.event_type === "note" ? "touch" : "system", icon: row.event_type === "note" ? "note" : "system",
      title: row.event_type === "note" ? "Комментарий" : row.title, body: row.details, meta: personName(row.created_by) })),
    ...followups.filter((row) => (row.client_id && String(row.client_id) === String(client.id)) || samePhone(row.phone, client.phone)).map((row) => ({
      id: `follow-${row.id}`, at: row.completed_at || row.due_date, group: "touch", icon: "call",
      title: row.status === "done" ? "Контакт с клиентом завершён" : "Запланирован контакт", body: row.result || row.note || "", meta: "" })),
    ...leadActivityItems(leadActivities.filter((row) => leadIds.has(String(row.lead_id))), personName),
    ...clientCallRows.map((row) => ({ id: `call-${row.id}`, at: row.created_at, group: "call", icon: "retention",
      title: `Обзвон: ${outcomeLabel(row.outcome, row.stage)}${row.rating ? ` · ${row.rating}/5` : ""}`,
      body: row.note || "", meta: [personName(row.created_by), row.callback_on ? `перезвонить ${isoToRu(row.callback_on)}` : ""].filter(Boolean).join(" · ") })),
    ...linkedContracts.map((row) => ({ id: `contract-${row.id}`, at: row.created_at, group: "system", icon: "proposal", title: `Договор № ${row.number}`, body: row.organization || "", meta: "" })),
    ...linkedAttachments.map((row) => ({ id: `file-${row.id}`, at: row.created_at, group: "system", icon: "system", title: `Добавлен файл: ${row.name}`, body: row.note || "", meta: "" })),
  ];
  async function addComment({ comment }) {
    const ok = await onAddNote(client, comment);
    return ok ? null : "Не удалось сохранить комментарий";
  }
  const digits = String(client.phone || "").replace(/\D/g, "");
  const tabs = [
    { id: "card", label: "Карточка" },
    { id: "jobs", label: `Заявки · ${rows.length}` },
    { id: "calls", label: `Обзвон · ${clientCallRows.length}` },
    { id: "quality", label: "Контроль и отзывы" },
    { id: "files", label: `Файлы · ${linkedAttachments.length + proofRows.length}` },
  ];
  return <DetailDrawer open size="wide" title={client.name || client.phone || "Клиент"} onClose={onClose}>
    <div className="crm-card">
      <div className="crm-card-head">
        <div className="crm-card-title">
          <div className="crm-sub">
            <span className="kd-badge" style={{ color: client.client_type === "company" ? "#2557B0" : "#6E3FCF", background: client.client_type === "company" ? "#E9F0FC" : "#F0EAFC" }}>{client.client_type === "company" ? "Юрлицо" : "Физлицо"}</span>
            {client.legal_name && <strong>{client.legal_name}</strong>}
            {client.bin_iin && <span>БИН/ИИН {client.bin_iin}</span>}
            {digits && <a href={`tel:+${digits}`}>{client.phone}</a>}
          </div>
          <ClientStatusBadges client={client} jobs={jobs} threshold={regularClientThreshold} />
        </div>
        <div className="crm-card-actions">
          {digits && <a className="kd-btn ghost sm" href={`tel:+${digits}`}><Phone size={14} />Позвонить</a>}
          {digits && <a className="kd-btn wa sm" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>}
          {client.email && <a className="kd-btn ghost sm" href={`mailto:${client.email}`}><Mail size={14} />E-mail</a>}
          {onCall && lastDoneJob && <button className="kd-btn primary sm" onClick={() => onCall(lastDoneJob)}><PhoneCall size={14} />Обзвон</button>}
          {canEdit && <button className="kd-btn ghost sm" onClick={onEdit}><Pencil size={14} />Изменить</button>}
          {canEdit && onBlock && <button className="kd-btn ghost sm" onClick={() => onBlock(client)}>{client.blocked ? "Блокировка" : "Чёрный список"}</button>}
        </div>
      </div>
      <div className="crm-tabs">{tabs.map((item) => <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</div>

      {view === "card" && <div className="crm-columns">
        <div className="crm-left">
          <CrmSection title="Итоги">
            <InfoList rows={[
              ["Заявки", `${summary.jobs} · выполнено ${summary.done}`],
              ["LTV", `${fmt(summary.revenue)} ₸`],
              ["Договоры", `${linkedContracts.filter((c) => c.status === "active").length} активных`],
              ["Ждут действия", summary.openFollowups ? `${summary.openFollowups}` : ""],
            ]} />
          </CrmSection>
          <CrmSection title="Контакты">
            <InfoList rows={[["Основной", digits ? <a href={`tel:+${digits}`}>{client.phone}</a> : ""], ["E-mail", client.email], ...linkedContacts.map((row) => [row.name || row.phone || row.email, [row.role, row.phone, row.email, row.note].filter(Boolean).join(" · ")])]} />
          </CrmSection>
          <CrmSection title="Адреса и объекты">
            {linkedAddresses.length ? <InfoList rows={linkedAddresses.map((row, index) => [row.label || (row.fromHistory ? "Из заявок" : `Адрес ${index + 1}`), row.address])} /> : <span className="kd-muted">Адресов пока нет.</span>}
          </CrmSection>
          <CrmSection title="Договоры">
            {linkedContracts.length ? linkedContracts.map((row) => <button className="kd-client-linkrow" key={row.id} onClick={() => onOpenLegalContract(row)}><span><strong>№ {row.number} · {row.organization}</strong><small>от {isoToRu(row.signed_on)} · {row.status === "closed" ? "Закрыт" : row.status === "draft" ? "Черновик" : "Действует"}</small></span><FolderOpen size={15} /></button>) : <span className="kd-muted">Договоров нет.</span>}
          </CrmSection>
          {linkedLeads.length > 0 && <CrmSection title="Сделки в воронке">
            <InfoList rows={linkedLeads.map((row) => [row.name || row.phone, row.next_action ? `${row.next_action}${row.next_action_at ? ` · ${fmtTs(row.next_action_at)}` : ""}` : "без следующего шага"])} />
          </CrmSection>}
          {client.note && <CrmSection title="Заметка в карточке"><div style={{ whiteSpace: "pre-wrap" }}>{client.note}</div></CrmSection>}
        </div>
        <div className="crm-right">
          {canEdit && <Composer kinds={["note"]} closed notePlaceholder="Итог звонка, договорённость, важный контекст…" onSubmit={addComment} />}
          <Feed items={feed} empty="История клиента пока пустая." />
        </div>
      </div>}

      {view === "jobs" && <div className="crm-pane"><div className="kd-client360-jobs">{rows.length ? rows.map((row) => <button key={row.id} className="kd-histrow" onClick={() => onOpenJob(row)}><div><div className="kd-histmain">{row.pest || row.type || "Заявка"}</div><div className="kd-muted">{isoToRu(row.scheduled_date) || "без даты"} · {addressPlain(row.address)}</div></div><div><strong>{row.status === "done" ? `${fmt(row.report_paid)} ₸` : row.status === "canceled" ? "Отменена" : "В работе"}</strong></div></button>) : <div className="kd-empty">Заявок пока нет.</div>}</div></div>}
      {view === "calls" && <div className="crm-pane"><CallLog calls={clientCallRows} people={callPeople.length ? callPeople : people} jobs={rows} userId={userId} isAdmin={isAdmin} onDelete={onDeleteCall} showJob empty="Клиенту ещё не звонили после выездов." /></div>}
      {view === "quality" && <div className="crm-pane"><QualityHistory checks={qualityHistoryForPhone(client.phone, jobs, qualityChecks)} jobs={jobs} people={people} /></div>}
      {view === "files" && <div className="crm-pane"><div className="kd-client-filebar"><div><strong>Фото, видео и документы</strong><span>До 25 МБ: JPG, PNG, WebP, MP4, MOV или PDF</span></div>{canEdit && <label className="kd-btn primary sm"><Paperclip size={14}/>Прикрепить<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" hidden onChange={(e) => { const file=e.target.files?.[0]; if(file) onUpload(client,file); e.target.value=""; }}/></label>}</div>{linkedAttachments.map((row) => <button className="kd-client-file" key={row.id} onClick={() => onOpenAttachment(row)}>{String(row.mime_type).startsWith("image/") ? <Camera size={18}/> : <FileText size={18}/>}<span><strong>{row.name}</strong><small>{row.size_bytes ? `${Math.ceil(row.size_bytes/1024)} КБ` : "Файл клиента"} · {fmtTs(row.created_at)}</small></span><FolderOpen size={15}/></button>)}{proofRows.map((proof) => { const job=rows.find((row)=>String(row.id)===String(proof.job_id)); return <button className="kd-client-file" key={`proof-${proof.id}`} onClick={()=>onOpenProof(job)}><Camera size={18}/><span><strong>Фотоотчёт по заявке</strong><small>{isoToRu(job?.scheduled_date)} · {(proof.before_paths?.length||0)+(proof.after_paths?.length||0)} фото</small></span><FolderOpen size={15}/></button>;})}{linkedAttachments.length + proofRows.length === 0 && <div className="kd-empty">Файлов пока нет.</div>}</div>}
    </div>
  </DetailDrawer>;
}
