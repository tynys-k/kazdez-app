import React, { useState } from "react";
import { ModalShell, Field } from "../modals";
import { fmt, fmtTs, isoToRu } from "../shared";
import { supabase } from "../supabaseClient";
import EntityThread from "./EntityThread";
import "./workflows.css";
export const CONTRACT_STATES = { draft: "Черновик", active: "Действует", closed: "Закрыт" };
export function validDriveUrl(value) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && ["drive.google.com", "docs.google.com"].includes(url.hostname) && !url.username && !url.password; } catch { return false; }
}
export function ContractSummary({ contract, onOpen }) {
  return <section className="wf-section"><h4>Договор</h4>{contract ? <><strong>№ {contract.number} от {isoToRu(contract.signed_on)}</strong><p>{contract.organization} · {CONTRACT_STATES[contract.status]}{contract.expires_on ? ` · до ${isoToRu(contract.expires_on)}` : ""}</p><button className="kd-btn ghost sm" onClick={() => onOpen(contract)}>Открыть договор и файлы</button></> : <p className="kd-muted">Юридический договор ещё не привязан. Выберите его при изменении абонента.</p>}</section>;
}
export default function ContractsRegister({ contracts, clients, contacts = [], subscriptions = [], people, canEdit, selectedId, onSelect, onReload, onOpenClient }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(null);
  const current = contracts.find((c) => String(c.id) === String(selectedId));
  const client = clients.find((c) => c.id === current?.client_id);
  const name = (row) => clients.find((c) => c.id === row.client_id);
  const visible = contracts.filter((r) => (!status || r.status === status) && `${r.number} ${r.organization} ${r.title} ${name(r)?.name || ""} ${name(r)?.phone || ""}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  return <section className="wf-workspace"><header className="wf-toolbar"><div><h2>Договоры</h2><p>Юридические документы клиентов. Абонентские выезды остаются в «Абонентах».</p></div>{canEdit && <button className="kd-btn primary" onClick={() => setEditing({})}>+ Договор</button>}</header><div className="wf-filters"><label>Поиск<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Номер, организация, телефон" /></label><label>Состояние<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Все</option>{Object.entries(CONTRACT_STATES).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label></div>
    <div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Номер / дата</th><th>Клиент / организация</th><th>Телефон</th><th>Срок</th><th>Сумма</th><th>Состояние</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td><button className="wf-task-title" onClick={() => onSelect(row.id)}>№ {row.number}</button><small>{isoToRu(row.signed_on)}</small></td><td>{row.organization || name(row)?.legal_name || name(row)?.name}<small>{row.title}</small></td><td>{name(row)?.phone || "—"}</td><td>{isoToRu(row.expires_on) || "Не указан"}</td><td>{fmt(row.amount)} ₸</td><td>{CONTRACT_STATES[row.status]}</td></tr>)}</tbody></table>{!visible.length && <p className="wf-empty">Договоров по этому фильтру нет.</p>}</div>
    {selectedId && !current && <p role="alert" className="kd-err">Договор не найден или недоступен.</p>}
    {current && !editing && <ModalShell title={`Договор № ${current.number}`} wide onClose={() => onSelect(null)} footer={<>{canEdit && <button className="kd-btn ghost" onClick={() => setEditing(current)}>Изменить</button>}<button className="kd-btn primary" onClick={() => onSelect(null)}>Закрыть</button></>}>
      <div className="wf-detail-summary"><div><small>Дата договора</small><strong>{isoToRu(current.signed_on)}</strong></div><div><small>Действует до</small><strong>{isoToRu(current.expires_on) || "Не задано"}</strong></div><div><small>Организация</small><strong>{current.organization || client?.legal_name || client?.name}</strong></div><div><small>Сумма</small><strong>{fmt(current.amount)} ₸</strong></div></div>
      <p>{current.title}</p><p>{current.note}</p><small className="kd-muted">Создан {fmtTs(current.created_at)} · {people.find((p) => p.id === current.created_by)?.full_name || "Сотрудник"}</small>
      <div className="wf-toolbar">{client && <button className="kd-btn ghost sm" onClick={() => onOpenClient(client)}>Клиент 360 · {client.phone}</button>}{current.drive_url && validDriveUrl(current.drive_url) && <a className="kd-btn ghost sm" href={current.drive_url} target="_blank" rel="noreferrer">Договор на Google Диске</a>}</div>
      <section className="wf-section"><h4>Контактные лица</h4>{contacts.filter((p) => p.client_id === current.client_id).map((p) => <p key={p.id}>{p.name} · {p.role} · {p.phone || p.email} {p.note}</p>)}<small>Абонентских объектов: {subscriptions.filter((s) => s.legal_contract_id === current.id).length}</small></section>
      <EntityThread kind="contract" entityId={current.id} people={people} canComment={canEdit} />
    </ModalShell>}
    {editing && <ContractEditor key={editing.id || "new"} contract={editing} clients={clients} onClose={() => setEditing(null)} onSaved={async (id) => { await onReload(); setEditing(null); onSelect(id); }} />}
  </section>;
}

function ContractEditor({ contract, clients, onClose, onSaved }) {
  const [form, setForm] = useState({ client_id: contract.client_id || "", number: contract.number || "", signed_on: contract.signed_on || "", expires_on: contract.expires_on || "", organization: contract.organization || "", title: contract.title || "", amount: contract.amount || "", drive_url: contract.drive_url || "", status: contract.status || "active", note: contract.note || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  async function save() {
    setError("");
    if (!form.client_id || !form.number.trim() || !form.signed_on) { setError("Выберите клиента, укажите номер и дату договора."); return; }
    if (!validDriveUrl(form.drive_url.trim())) { setError("Нужна HTTPS-ссылка на drive.google.com или docs.google.com."); return; }
    if (form.expires_on && form.expires_on < form.signed_on) { setError("Дата окончания раньше даты договора."); return; }
    const amount = Number(form.amount || 0); if (!Number.isFinite(amount) || amount < 0) { setError("Проверьте сумму договора."); return; }
    setBusy(true);
    try {
      const payload = { ...form, number: form.number.trim(), expires_on: form.expires_on || null, drive_url: form.drive_url.trim() || null, amount };
      const result = contract.id ? await supabase.from("legal_contracts").update(payload).eq("id", contract.id).select("id").single() : await supabase.from("legal_contracts").insert(payload).select("id").single();
      if (result.error) throw result.error;
      await onSaved(result.data.id);
    } catch (e) { setError("Договор не сохранён: " + e.message); } finally { setBusy(false); }
  }
  return <ModalShell title={contract.id ? "Изменить договор" : "Новый договор"} wide onClose={onClose} footer={<><button className="kd-btn ghost" disabled={busy} onClick={onClose}>Отмена</button><button className="kd-btn primary" disabled={busy} onClick={save}>Сохранить</button></>}>
    {error && <p role="alert" className="kd-err">{error}</p>}<Field label="Клиент / контрагент"><select value={form.client_id} onChange={(e) => { const client = clients.find((c) => c.id === e.target.value); setForm({ ...form, client_id: e.target.value, organization: client?.legal_name || client?.name || "" }); }}><option value="">Выберите клиента</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.legal_name || c.name || c.phone} · {c.phone}</option>)}</select></Field>
    <div className="kd-grid2"><Field label="Номер договора"><input value={form.number} onChange={set("number")} maxLength={200} /></Field><Field label="Дата договора"><input type="date" value={form.signed_on} onChange={set("signed_on")} /></Field><Field label="Дата окончания"><input type="date" value={form.expires_on} onChange={set("expires_on")} /></Field><Field label="Сумма, ₸"><input type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} /></Field></div>
    <Field label="Название организации в договоре"><input value={form.organization} onChange={set("organization")} /></Field><Field label="Предмет договора"><input value={form.title} onChange={set("title")} /></Field><Field label="Ссылка на Google Диск"><input type="url" value={form.drive_url} onChange={set("drive_url")} /></Field><Field label="Состояние"><select value={form.status} onChange={set("status")}>{Object.entries(CONTRACT_STATES).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field><Field label="Примечание"><textarea className="kd-textarea" value={form.note} onChange={set("note")} /></Field><p className="kd-muted">Файлы и обсуждение доступны после сохранения договора.</p>
  </ModalShell>;
}
