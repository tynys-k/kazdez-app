import React, { useRef, useState } from "react";
import { Field } from "../modals";
import { chemUnit, fmtTs } from "../shared";
import { supabase } from "../supabaseClient";
export default function TenderDeliveries({ tender, deliveries, chemicals, warehouses, canEdit, onReload }) {
  const [chemical, setChemical] = useState(""); const [warehouse, setWarehouse] = useState(""); const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  const item = chemicals.find((c) => c.id === chemical);
  async function save() {
    if (!chemical || !warehouse || !(Number(amount) > 0) || !note.trim()) { setError("Укажите препарат, склад, количество и основание передачи."); return; }
    setBusy(true); setError("");
    try { const r = await supabase.rpc("deliver_tender_chemical", { p_request_id: request.current, p_tender_id: tender.id, p_chemical_id: chemical, p_warehouse_id: warehouse, p_amount: Number(amount), p_note: note.trim() }); if (r.error) throw r.error; await onReload(); request.current = crypto.randomUUID(); setAmount(""); setNote(""); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="wf-section"><h4>Переданные заказчику препараты</h4><div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Когда</th><th>Препарат</th><th>Склад</th><th>Количество</th><th>Основание</th></tr></thead><tbody>{deliveries.filter((d) => d.tender_id === tender.id).map((d) => <tr key={d.id}><td>{fmtTs(d.created_at)}</td><td>{chemicals.find((c) => c.id === d.chemical_id)?.name || d.chemical_name}</td><td>{warehouses.find((w) => w.id === d.warehouse_id)?.name || "Склад"}</td><td>{d.amount} {chemUnit(d.unit_kind).small}</td><td>{d.note}</td></tr>)}</tbody></table></div>{canEdit && <details><summary>Оформить передачу со склада</summary>{error && <p role="alert" className="kd-err">{error}</p>}<Field label="Препарат"><select value={chemical} onChange={(e) => setChemical(e.target.value)}><option value="">Выберите</option>{chemicals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Со склада"><select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}><option value="">Выберите</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field><Field label={`Количество, ${chemUnit(item?.unit_kind).small}`}><input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Получатель / основание"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field><p className="kd-muted">Препарат будет списан с выбранного склада и отражён в хронологии тендера. Прикрепите подписанный документ в файлы проекта.</p><button className="kd-btn primary sm" disabled={busy} onClick={save}>Провести передачу</button></details>}</section>;
}
