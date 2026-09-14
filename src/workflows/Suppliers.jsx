import React, { useState } from "react";
import { ModalShell, Field } from "../modals";
import { supabase } from "../supabaseClient";
import { fmt, isoToRu, chemUnit } from "../shared";
export function latestOffers(offers, kind, itemId) {
  const sorted = offers.filter((o) => o.item_kind === kind && o.item_id === itemId).sort((a, b) => String(b.quoted_on).localeCompare(String(a.quoted_on)) || String(b.created_at).localeCompare(String(a.created_at)));
  const seen = new Set();
  return sorted.filter((o) => { if (seen.has(o.supplier_id)) return false; seen.add(o.supplier_id); return true; }).sort((a, b) => Number(a.price) - Number(b.price));
}
export function ItemSuppliers({ suppliers, offers, kind, item, canEdit, onAddOffer }) {
  const rows = latestOffers(offers, kind, item.id);
  const unit = kind === "chemical" ? chemUnit(item.unit_kind).big : item.unit || "шт.";
  return <section className="wf-section"><div className="wf-toolbar"><h4>Поставщики · сравнение цен за {unit}</h4>{canEdit && <button className="kd-btn ghost sm" onClick={() => onAddOffer({ item_kind: kind, item_id: item.id })}>Добавить предложение</button>}</div><p className="kd-muted">Последнее предложение каждого поставщика. Уточните цену и наличие перед заказом.</p><div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Поставщик</th><th>Контакт</th><th>Цена за {unit}</th><th>Дата цены</th><th>Доставка</th><th>Условия</th></tr></thead><tbody>{rows.map((o) => { const p = suppliers.find((s) => s.id === o.supplier_id); return <tr key={o.id}><td>{p?.name || "Поставщик"}</td><td>{p?.contact_name}<small>{p?.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : "Телефон не указан"}</small></td><td><strong>{fmt(o.price)} ₸</strong></td><td>{isoToRu(o.quoted_on)}{o.valid_until && <small>до {isoToRu(o.valid_until)}</small>}</td><td>{o.delivery_days == null ? "Уточнить" : `${o.delivery_days} дн.`}</td><td>{o.valid_until && o.valid_until < new Date().toLocaleDateString("sv-SE") ? "Срок цены истёк — уточните" : o.available ? "В наличии по предложению" : "Под заказ / нет"}<small>{o.note}</small></td></tr>; })}</tbody></table>{!rows.length && <p className="wf-empty">Предложений ещё нет. Добавьте цены поставщиков — они появятся рядом для сравнения.</p>}</div></section>;
}
export default function Suppliers({ suppliers, offers, chemicals, equipment, canEdit, onReload, editor, onEditor }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const items = [...chemicals.map((c) => ({ ...c, item_kind: "chemical" })), ...equipment.map((e) => ({ ...e, item_kind: "equipment" }))];
  const current = suppliers.find((s) => s.id === selected);
  return <section className="wf-workspace"><header className="wf-toolbar"><div><h2>Поставщики</h2><p>Контакты, ассортимент и предложения. Цена предложения не меняет себестоимость прошлых закупок.</p></div>{canEdit && <button className="kd-btn primary" onClick={() => onEditor({ kind: "supplier" })}>+ Поставщик</button>}</header><label className="kd-field"><span>Поиск поставщика</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, организация, телефон" /></label><div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Поставщик</th><th>Контактное лицо</th><th>Телефон</th><th>Адрес / условия</th><th /></tr></thead><tbody>{suppliers.filter((s) => `${s.name} ${s.phone} ${s.contact_name}`.toLowerCase().includes(query.toLowerCase())).map((s) => <tr key={s.id}><td><button className="wf-task-title" onClick={() => setSelected(s.id)}>{s.name}</button></td><td>{s.contact_name}</td><td>{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : "—"}</td><td>{s.address}<small>{s.note}</small></td><td>{canEdit && <button className="kd-btn ghost sm" onClick={() => onEditor({ kind: "supplier", row: s })}>Изменить</button>}</td></tr>)}</tbody></table>{!suppliers.length && <p className="wf-empty">Поставщиков пока нет.</p>}</div>
    {current && <section className="kd-card"><div className="wf-toolbar"><h3>{current.name} · ассортимент</h3>{canEdit && <button className="kd-btn ghost sm" onClick={() => onEditor({ kind: "offer", row: { supplier_id: current.id } })}>+ Предложение</button>}</div>{items.filter((i) => offers.some((o) => o.supplier_id === current.id && o.item_kind === i.item_kind && o.item_id === i.id)).map((i) => <div key={`${i.item_kind}:${i.id}`}><h4>{i.name}</h4><ItemSuppliers suppliers={suppliers} offers={offers} kind={i.item_kind} item={i} canEdit={canEdit} onAddOffer={(row) => onEditor({ kind: "offer", row: { ...row, supplier_id: current.id } })} /></div>)}</section>}
    {editor && <SupplyEditor key={`${editor.kind}:${editor.row?.id || "new"}`} editor={editor} suppliers={suppliers} items={items} onClose={() => onEditor(null)} onSaved={async () => { await onReload(); onEditor(null); }} />}
  </section>;
}
export function SupplyEditor({ editor, suppliers, items, onClose, onSaved }) {
  const isOffer = editor.kind === "offer";
  const [form, setForm] = useState(isOffer ? { supplier_id: editor.row?.supplier_id || "", item_kind: editor.row?.item_kind || "chemical", item_id: editor.row?.item_id || "", price: "", quoted_on: "", valid_until: "", delivery_days: "", available: true, note: "" } : { name: editor.row?.name || "", contact_name: editor.row?.contact_name || "", phone: editor.row?.phone || "", address: editor.row?.address || "", note: editor.row?.note || "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const item = items.find((i) => i.item_kind === form.item_kind && i.id === form.item_id);
  async function save() {
    if (isOffer && (!form.supplier_id || !item || !(Number(form.price) > 0) || !form.quoted_on)) { setError("Укажите поставщика, позицию, цену и дату предложения."); return; }
    if (!isOffer && !form.name.trim()) { setError("Укажите имя поставщика."); return; }
    setBusy(true); setError("");
    try {
      const payload = isOffer ? { ...form, price: Number(form.price), valid_until: form.valid_until || null, delivery_days: form.delivery_days === "" ? null : Number(form.delivery_days) } : form;
      const result = isOffer ? await supabase.from("supplier_offers").insert(payload) : editor.row?.id ? await supabase.from("suppliers").update(payload).eq("id", editor.row.id) : await supabase.from("suppliers").insert(payload);
      if (result.error) throw result.error; await onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <ModalShell title={isOffer ? "Предложение поставщика" : "Поставщик"} onClose={onClose} footer={<><button className="kd-btn ghost" disabled={busy} onClick={onClose}>Отмена</button><button className="kd-btn primary" disabled={busy} onClick={save}>Сохранить</button></>}>
    {error && <p role="alert" className="kd-err">{error}</p>}{isOffer ? <><Field label="Поставщик"><select value={form.supplier_id} onChange={set("supplier_id")}><option value="">Выберите</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Позиция"><select value={`${form.item_kind}:${form.item_id}`} onChange={(e) => { const [item_kind, item_id] = e.target.value.split(":"); setForm({ ...form, item_kind, item_id }); }}><option value="chemical:">Выберите</option>{items.map((i) => <option key={`${i.item_kind}:${i.id}`} value={`${i.item_kind}:${i.id}`}>{i.name} · {i.item_kind === "chemical" ? "Препарат" : "Оборудование / СИЗ"}</option>)}</select></Field><Field label={`Цена, ₸ за ${form.item_kind === "chemical" ? chemUnit(item?.unit_kind).big : item?.unit || "шт."}`}><input type="number" min="0.01" step="0.01" value={form.price} onChange={set("price")} /></Field><div className="kd-grid2"><Field label="Дата предложения"><input type="date" value={form.quoted_on} onChange={set("quoted_on")} /></Field><Field label="Цена действует до"><input type="date" value={form.valid_until} onChange={set("valid_until")} /></Field></div><Field label="Доставка, дней"><input type="number" min="0" step="1" value={form.delivery_days} onChange={set("delivery_days")} /></Field><label className="kd-check"><input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />Есть в наличии</label></> : <>{[["name", "Название / имя"], ["contact_name", "Контактное лицо"], ["phone", "Телефон"], ["address", "Адрес"]].map(([key, label]) => <Field key={key} label={label}><input value={form[key]} onChange={set(key)} /></Field>)}</>}
    <Field label="Условия / примечание"><textarea className="kd-textarea" value={form.note} onChange={set("note")} /></Field>
  </ModalShell>;
}
