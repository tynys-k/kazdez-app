import React, { useRef, useState } from "react";
import { ModalShell, Field } from "../modals";
import { fmt, fmtTs, isoToRu } from "../shared";
import { supabase } from "../supabaseClient";
export function PayrollCarryoverHistory({ rows, people, onAdd, canEdit }) {
  return <section className="kd-card wf-section"><div className="wf-toolbar"><h3>Перенос переплаты</h3>{canEdit && <button className="kd-btn ghost sm" onClick={onAdd}>Учесть в другом месяце</button>}</div><p className="kd-muted">Уменьшает сумму к выплате в выбранном месяце. Нового расхода или возврата денег не создаёт.</p><div className="wf-table-wrap"><table className="wf-table"><thead><tr><th>Сотрудник</th><th>Переплата за</th><th>Вычесть в</th><th>Сумма</th><th>Основание</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{people.find((p) => p.id === r.tech_id)?.full_name || "Сотрудник"}</td><td>{r.from_month}</td><td>{r.to_month}</td><td>{fmt(r.amount)} ₸</td><td>{r.reason}<small>{fmtTs(r.created_at)}</small></td></tr>)}</tbody></table>{!rows.length && <p className="wf-empty">Переносов ещё нет.</p>}</div></section>;
}
export default function PayrollCarryoverModal({ people, payments, onClose, onSaved }) {
  const [person, setPerson] = useState("");
  const [payment, setPayment] = useState("");
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  const selected = payments.find((p) => p.id === payment);
  const sourceMonth = selected?.expense_date?.slice(0, 7);
  async function save() {
    if (!selected || !month || month <= sourceMonth || !(Number(amount) > 0) || !reason.trim()) { setError("Выберите выплату, более поздний месяц, положительную сумму и основание."); return; }
    setBusy(true); setError("");
    try {
      const result = await supabase.rpc("carry_payroll_overpayment", { p_request_id: request.current, p_payment_id: payment, p_to_month: month, p_amount: Number(amount), p_reason: reason.trim() });
      if (result.error) throw result.error;
      await onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <ModalShell title="Учесть переплату в следующем месяце" onClose={onClose} footer={<><button className="kd-btn ghost" disabled={busy} onClick={onClose}>Отмена</button><button className="kd-btn primary" disabled={busy} onClick={save}>Зафиксировать перенос</button></>}>
    {error && <p role="alert" className="kd-err">{error}</p>}<Field label="Сотрудник"><select value={person} onChange={(e) => { setPerson(e.target.value); setPayment(""); }}><option value="">Выберите</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Выплата, в которой была переплата"><select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">Выберите проведённую выплату</option>{payments.filter((p) => p.tech_id === person && p.status === "paid").map((p) => <option key={p.id} value={p.id}>{isoToRu(p.expense_date)} · {fmt(p.amount)} ₸ · {p.note}</option>)}</select></Field><p className="kd-muted">Месяц переплаты: {sourceMonth || "—"}</p><div className="kd-grid2"><Field label="Учесть в месяце"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field><Field label="Сумма переплаты, ₸"><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div><Field label="Основание переноса"><textarea className="kd-textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} /></Field><p className="kd-notebox">Будет уменьшено к выплате за {month || "выбранный месяц"} на {fmt(amount)} ₸. Сама исходная выплата останется неизменной.</p>
  </ModalShell>;
}
