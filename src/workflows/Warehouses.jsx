import React, { useRef, useState } from "react";
import { ModalShell, Field } from "../modals";
import { fmtAmount, fmtTs, chemUnit } from "../shared";
import { supabase } from "../supabaseClient";
import { warehouseBalance } from "./warehouseModel";
export const WAREHOUSE_OPERATIONS = { transfer: "Перемещение между складами", issue: "Выдать сотруднику", revision: "Ревизия: фактический остаток", receipt: "Приход оборудования / СИЗ" };
export function ItemLocations({ item, kind, warehouses, moves, canEdit, onOperation }) {
  const unit = kind === "chemical" ? chemUnit(item.unit_kind).small : item.unit || "шт.";
  return <section className="wf-section"><h4>Склады · остатки в {unit}</h4><div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Склад</th><th>Остаток</th><th /></tr></thead><tbody>{warehouses.map((w) => { const balance = warehouseBalance(w, kind, item.id, moves, item.warehouseBalance, warehouses); return <tr key={w.id}><td>{w.name}{w.unallocated && <small>Старые записи не распределены по адресам. Сначала сверка, затем перемещение.</small>}</td><td>{balance} {unit}</td><td>{canEdit && <button className="kd-btn ghost sm" onClick={() => onOperation({ kind, item, warehouse: w, balance })}>Операция / ревизия</button>}</td></tr>; })}</tbody></table></div></section>;
}
export default function Warehouses({ warehouses, moves, chemicals, equipment, canEdit, onReload, onOperation }) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const warehouse = warehouses.find((w) => w.id === selected);
  async function add() {
    setBusy(true); setError("");
    try { const r = await supabase.from("stock_warehouses").insert({ name: name.trim(), address: address.trim() }); if (r.error) throw r.error; await onReload(); setName(""); setAddress(""); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const items = [...chemicals.map((c) => ({ ...c, kind: "chemical" })), ...equipment.map((e) => ({ ...e, kind: "equipment" }))];
  return <section className="wf-workspace"><header className="wf-toolbar"><div><h2>Склады и ревизии</h2><p>Новые адресные остатки и старый нераспределённый учёт показаны отдельно.</p></div></header><Field label="Склад"><select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Выберите склад</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
    {warehouse && <div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Позиция</th><th>Категория</th><th>Остаток</th><th /></tr></thead><tbody>{items.map((item) => { const balance = warehouseBalance(warehouse, item.kind, item.id, moves, item.warehouseBalance, warehouses); return <tr key={`${item.kind}:${item.id}`}><td>{item.name}</td><td>{item.kind === "chemical" ? "Препарат" : "Оборудование / СИЗ"}</td><td>{item.kind === "chemical" ? fmtAmount(balance, item.unit_kind) : `${balance} ${item.unit || "шт."}`}</td><td>{canEdit && <button className="kd-btn ghost sm" onClick={() => onOperation({ kind: item.kind, item, warehouse, balance })}>Операция / ревизия</button>}</td></tr>; })}</tbody></table></div>}
    {canEdit && <details className="kd-card"><summary>Добавить склад</summary>{error && <p role="alert" className="kd-err">{error}</p>}<Field label="Название склада"><input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Адрес"><input value={address} onChange={(e) => setAddress(e.target.value)} /></Field><button className="kd-btn primary sm" disabled={busy || !name.trim()} onClick={add}>Добавить</button></details>}
    <section className="wf-section"><h3>Журнал складских операций</h3><div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Когда</th><th>Операция</th><th>Позиция</th><th>Откуда → куда</th><th>Количество</th><th>Основание</th></tr></thead><tbody>{moves.filter((m) => !selected || m.from_warehouse_id === selected || m.to_warehouse_id === selected).map((m) => { const item = items.find((i) => i.kind === m.item_kind && i.id === m.item_id); return <tr key={m.id}><td>{fmtTs(m.created_at)}</td><td>{WAREHOUSE_OPERATIONS[m.kind] || ({ delivery: "Отгрузка по тендеру", return: "Возврат от сотрудника" })[m.kind] || m.kind}</td><td>{item?.name}</td><td>{warehouses.find((w) => w.id === m.from_warehouse_id)?.name || "—"} → {warehouses.find((w) => w.id === m.to_warehouse_id)?.name || (m.tech_id ? "Сотрудник" : "—")}</td><td>{m.amount} {m.item_kind === "chemical" ? chemUnit(item?.unit_kind).small : item?.unit}</td><td>{m.note}</td></tr>; })}</tbody></table></div></section>
  </section>;
}
export function WarehouseOperationModal({ context, warehouses, moves = [], people, onClose, onSaved }) {
  const [kind, setKind] = useState(context.operationKind || "transfer"); const [source, setSource] = useState(context.warehouse?.id || ""); const [target, setTarget] = useState(""); const [tech, setTech] = useState(context.employeeId || ""); const [amount, setAmount] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const request = useRef(crypto.randomUUID());
  const unit = context.kind === "chemical" ? chemUnit(context.item.unit_kind).small : context.item.unit || "шт.";
  const selectedWarehouse = warehouses.find((w) => w.id === source);
  const balance = selectedWarehouse ? warehouseBalance(selectedWarehouse, context.kind, context.item.id, moves, context.item.warehouseBalance, warehouses) : 0;
  async function save() {
    if (!selectedWarehouse) { setError("Выберите склад."); return; }
    if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) < 0 || (kind !== "revision" && Number(amount) === 0) || !note.trim()) { setError("Укажите корректное количество и основание."); return; }
    if ((kind === "transfer" && !target) || (kind === "issue" && !tech)) { setError("Выберите получателя."); return; }
    setBusy(true); setError("");
    try { const r = await supabase.rpc("post_warehouse_operation", { p_request_id: request.current, p_kind: kind, p_item_kind: context.kind, p_item_id: context.item.id, p_from: ["transfer", "issue"].includes(kind) ? selectedWarehouse.id : null, p_to: kind === "transfer" ? target : ["revision", "receipt"].includes(kind) ? selectedWarehouse.id : null, p_tech: kind === "issue" ? tech : null, p_amount: Number(amount), p_note: note.trim(), p_expected: kind === "revision" ? balance : null }); if (r.error) throw r.error; await onSaved(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <ModalShell title={`${context.item.name} · ${selectedWarehouse?.name || "выберите склад"}`} onClose={onClose} footer={<><button className="kd-btn ghost" disabled={busy} onClick={onClose}>Отмена</button><button className="kd-btn primary" disabled={busy} onClick={save}>Провести</button></>}>
    {error && <p className="kd-err" role="alert">{error}</p>}<Field label="Склад операции"><select value={source} onChange={(e) => { setSource(e.target.value); setTarget(""); }}><option value="">Выберите склад</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field><p>Учётный остаток: {balance} {unit}</p><Field label="Операция"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(WAREHOUSE_OPERATIONS).filter(([key]) => context.kind === "equipment" || key !== "receipt").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>{kind === "transfer" && <Field label="Склад назначения"><select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Выберите</option>{warehouses.filter((w) => w.id !== source).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}{kind === "issue" && <Field label="Сотрудник"><select value={tech} onChange={(e) => setTech(e.target.value)}><option value="">Выберите</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>}<Field label={`${kind === "revision" ? "Фактически пересчитано" : "Количество"}, ${unit}`}><input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Основание / результаты ревизии"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>{kind === "revision" && <p className="kd-notebox">Сохранится акт сверки и разница {amount === "" ? "—" : Number(amount) - balance} {unit}. Исходные закупки и выдачи не переписываются.</p>}
  </ModalShell>;
}
