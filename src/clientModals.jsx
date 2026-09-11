import React, { useMemo, useState } from "react";
import { Building2, Camera, FileText, FolderOpen, Mail, MapPin, MessageCircle, Paperclip, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { addressPlain, fmt, fmtTs, isoToRu, samePhone } from "./shared";
import { clientAddresses as collectAddresses, clientContracts, clientJobs, clientSummary } from "./clientDirectory";

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

    <div className="kd-client-form-section"><div className="kd-client-form-head"><div><div className="kd-section">Контактные лица</div><small>Сотрудники, родственники и другие контакты</small></div><button className="kd-btn ghost sm" onClick={() => setPeople((rows) => [...rows, blankContact()])}><Plus size={14} />Контакт</button></div>
      {people.length === 0 && <div className="kd-muted">Дополнительных контактов нет.</div>}{people.map((row, index) => <div className="kd-client-edit-row" key={row.id || index}><div className="kd-grid2"><Field label="Имя"><input value={row.name || ""} onChange={(e) => updateRow(setPeople, index, "name", e.target.value)} /></Field><Field label="Роль / должность"><input value={row.role || ""} onChange={(e) => updateRow(setPeople, index, "role", e.target.value)} placeholder="Управляющий, бухгалтер…" /></Field><Field label="Телефон"><input value={row.phone || ""} onChange={(e) => updateRow(setPeople, index, "phone", e.target.value)} /></Field><Field label="E-mail"><input value={row.email || ""} onChange={(e) => updateRow(setPeople, index, "email", e.target.value)} /></Field></div><button className="kd-iconbtn danger" onClick={() => setPeople((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}
    </div>

    <div className="kd-client-form-section"><div className="kd-client-form-head"><div><div className="kd-section">Адреса клиента</div><small>Объекты, офисы и адреса для документов</small></div><button className="kd-btn ghost sm" onClick={() => setPlaces((rows) => [...rows, blankAddress()])}><Plus size={14} />Адрес</button></div>
      {places.length === 0 && <div className="kd-muted">Сохранённых адресов нет — адреса заявок всё равно будут видны в карточке.</div>}{places.map((row, index) => <div className="kd-client-edit-row" key={row.id || index}><div><div className="kd-grid2"><Field label="Название"><input value={row.label || ""} onChange={(e) => updateRow(setPlaces, index, "label", e.target.value)} placeholder="Основной объект / офис" /></Field><Field label="Адрес"><input value={row.address || ""} onChange={(e) => updateRow(setPlaces, index, "address", e.target.value)} /></Field><Field label="Контакт на объекте"><input value={row.contact_name || ""} onChange={(e) => updateRow(setPlaces, index, "contact_name", e.target.value)} /></Field><Field label="Телефон объекта"><input value={row.contact_phone || ""} onChange={(e) => updateRow(setPlaces, index, "contact_phone", e.target.value)} /></Field></div></div><button className="kd-iconbtn danger" onClick={() => setPlaces((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}
    </div>
  </Shell>;
}

export function ClientDetailsModal({ client, jobs = [], contacts = [], addresses = [], contracts = [], followups = [], events = [], leads = [], leadActivities = [], attachments = [], jobProofs = [], canEdit, onClose, onEdit, onAddNote, onUpload, onOpenAttachment, onOpenJob, onOpenContract, onOpenProof }) {
  const [view, setView] = useState("overview");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const rows = useMemo(() => clientJobs(client, jobs), [client, jobs]);
  const summary = useMemo(() => clientSummary(client, jobs, contracts, followups), [client, jobs, contracts, followups]);
  const linkedContacts = contacts.filter((row) => String(row.client_id) === String(client.id));
  const linkedAddresses = collectAddresses(client, addresses, jobs);
  const linkedContracts = clientContracts(client, contracts);
  const linkedAttachments = attachments.filter((row) => String(row.client_id) === String(client.id));
  const linkedLeads = leads.filter((row) => samePhone(row.phone, client.phone));
  const leadIds = new Set(linkedLeads.map((row) => String(row.id)));
  const rowIds = new Set(rows.map((row) => String(row.id)));
  const proofRows = jobProofs.filter((row) => rowIds.has(String(row.job_id)));
  const timeline = [
    ...rows.map((row) => ({ id: `job-${row.id}`, at: row.scheduled_date || row.created_at, type: row.status, title: `${row.status === "done" ? "Выполнена заявка" : row.status === "canceled" ? "Заявка отменена" : "Создана заявка"}: ${row.pest || row.type || "услуга"}`, details: `${addressPlain(row.address)}${row.status === "done" ? ` · ${fmt(row.report_paid)} ₸` : ""}` })),
    ...events.filter((row) => (row.client_id && String(row.client_id) === String(client.id)) || samePhone(row.client_phone, client.phone)).map((row) => ({ id: `event-${row.id}`, at: row.created_at, type: row.event_type, title: row.title, details: row.details })),
    ...followups.filter((row) => (row.client_id && String(row.client_id) === String(client.id)) || samePhone(row.phone, client.phone)).map((row) => ({ id: `follow-${row.id}`, at: row.completed_at || row.due_date, type: "contact", title: row.status === "done" ? "Контакт с клиентом завершён" : "Запланирован контакт", details: row.result || row.note })),
    ...leadActivities.filter((row) => leadIds.has(String(row.lead_id))).map((row) => ({ id: `lead-${row.id}`, at: row.occurred_at || row.created_at, type: row.kind, title: ({ call: "Телефонный разговор", whatsapp: "Переписка WhatsApp", meeting: "Встреча", message: "Сообщение", note: "Заметка" })[row.kind] || "Обращение", details: row.comment || row.result })),
    ...linkedContracts.map((row) => ({ id: `contract-${row.id}`, at: row.created_at, type: "contract", title: `Абонентский договор · ${row.active === false ? "приостановлен" : "активен"}`, details: row.service })),
    ...linkedAttachments.map((row) => ({ id: `file-${row.id}`, at: row.created_at, type: "file", title: `Добавлен файл: ${row.name}`, details: row.note })),
  ].filter((row) => row.at).sort((a, b) => new Date(b.at) - new Date(a.at));
  async function saveNote() { if (!note.trim()) return; setSavingNote(true); const ok = await onAddNote(client, note); if (ok) setNote(""); setSavingNote(false); }
  const digits = String(client.phone || "").replace(/\D/g, "");
  return <Shell title={`Клиент 360° · ${client.name || client.phone}`} onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
    <div className="kd-client360-head"><div><div className="kd-client360-name">{client.name || "Клиент"}</div><a href={`tel:+${digits}`}>{client.phone}</a><span>{client.legal_name || (client.client_type === "company" ? "Организация" : "Физическое лицо")}{client.bin_iin ? ` · БИН/ИИН ${client.bin_iin}` : ""}</span></div><div className="kd-client360-actions">{digits && <a className="kd-btn ghost sm" href={`tel:+${digits}`}><Phone size={14} />Позвонить</a>}{digits && <a className="kd-btn wa sm" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>}{client.email && <a className="kd-btn ghost sm" href={`mailto:${client.email}`}><Mail size={14} />E-mail</a>}{canEdit && <button className="kd-btn ghost sm" onClick={onEdit}><Pencil size={14} />Изменить</button>}</div></div>
    <div className="kd-client360-kpis"><div><span>Заявки</span><strong>{summary.jobs}</strong><small>{summary.done} выполнено</small></div><div><span>LTV клиента</span><strong>{fmt(summary.revenue)} ₸</strong><small>за всё время</small></div><div><span>Договоры</span><strong>{summary.activeContracts}</strong><small>активных</small></div><div><span>Контакты</span><strong>{linkedContacts.length + 1}</strong><small>{summary.openFollowups} требуют действия</small></div></div>
    <div className="kd-client360-tabs">{[{ id: "overview", label: "Обзор" }, { id: "timeline", label: `Хронология · ${timeline.length}` }, { id: "jobs", label: `Заявки · ${rows.length}` }, { id: "files", label: `Файлы · ${linkedAttachments.length + proofRows.length}` }].map((item) => <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
    {view === "overview" && <div className="kd-client-profile-grid"><section className="kd-client360-panel"><div className="kd-section"><UserRound size={16} />Контакты</div><a href={`tel:+${digits}`}>{client.phone} · основной</a>{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}{linkedContacts.map((row) => <div className="kd-client-contact" key={row.id}><strong>{row.name || row.phone || row.email}</strong><span>{[row.role, row.phone, row.email].filter(Boolean).join(" · ")}</span></div>)}</section><section className="kd-client360-panel"><div className="kd-section"><MapPin size={16} />Адреса и объекты</div>{linkedAddresses.length ? linkedAddresses.map((row, index) => <div className="kd-client-contact" key={row.id || index}><strong>{row.label || (row.fromHistory ? "Из истории заявок" : "Адрес")}</strong><span>{row.address}</span></div>) : <span>Адресов пока нет.</span>}</section><section className="kd-client360-panel"><div className="kd-section"><Building2 size={16} />Договоры</div>{linkedContracts.length ? linkedContracts.map((row) => <button className="kd-client-linkrow" key={row.id} onClick={() => onOpenContract(row)}><span><strong>{row.service || "Абонентский договор"}</strong><small>{row.active === false ? "Приостановлен" : `Следующий выезд ${isoToRu(row.next_service_date)}`}</small></span><FolderOpen size={15} /></button>) : <span>Договоров нет.</span>}</section><section className="kd-client360-note"><div className="kd-section">Внутренняя заметка</div>{client.note && <p>{client.note}</p>}{canEdit && <><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Итог звонка, договорённость, важный контекст…"/><button className="kd-btn primary sm" disabled={!note.trim() || savingNote} onClick={saveNote}>{savingNote ? "Сохраняем…" : "Добавить в хронологию"}</button></>}</section></div>}
    {view === "timeline" && <div className="kd-client-timeline">{timeline.length ? timeline.map((row) => <div className={`kd-client-event ${row.type}`} key={row.id}><span className="kd-client-event-dot"/><div><time>{fmtTs(row.at)}</time><strong>{row.title}</strong>{row.details && <p>{row.details}</p>}</div></div>) : <div className="kd-empty">История клиента пока пустая.</div>}</div>}
    {view === "jobs" && <div className="kd-client360-jobs">{rows.map((row) => <button key={row.id} className="kd-histrow" onClick={() => onOpenJob(row)}><div><div className="kd-histmain">{row.pest || row.type || "Заявка"}</div><div className="kd-muted">{isoToRu(row.scheduled_date) || "без даты"} · {addressPlain(row.address)}</div></div><div><strong>{row.status === "done" ? `${fmt(row.report_paid)} ₸` : row.status === "canceled" ? "Отменена" : "В работе"}</strong></div></button>)}</div>}
    {view === "files" && <div><div className="kd-client-filebar"><div><strong>Фото, видео и документы</strong><span>До 25 МБ: JPG, PNG, WebP, MP4, MOV или PDF</span></div>{canEdit && <label className="kd-btn primary sm"><Paperclip size={14}/>Прикрепить<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" hidden onChange={(e) => { const file=e.target.files?.[0]; if(file) onUpload(client,file); e.target.value=""; }}/></label>}</div>{linkedAttachments.map((row) => <button className="kd-client-file" key={row.id} onClick={() => onOpenAttachment(row)}>{String(row.mime_type).startsWith("image/") ? <Camera size={18}/> : <FileText size={18}/>}<span><strong>{row.name}</strong><small>{row.size_bytes ? `${Math.ceil(row.size_bytes/1024)} КБ` : "Файл клиента"} · {fmtTs(row.created_at)}</small></span><FolderOpen size={15}/></button>)}{proofRows.map((proof) => { const job=rows.find((row)=>String(row.id)===String(proof.job_id)); return <button className="kd-client-file" key={`proof-${proof.id}`} onClick={()=>onOpenProof(job)}><Camera size={18}/><span><strong>Фотоотчёт по заявке</strong><small>{isoToRu(job?.scheduled_date)} · {(proof.before_paths?.length||0)+(proof.after_paths?.length||0)} фото</small></span><FolderOpen size={15}/></button>;})}{linkedAttachments.length + proofRows.length === 0 && <div className="kd-empty">Файлов пока нет.</div>}</div>}
  </Shell>;
}
