import React, { useState } from "react";
import { Plus, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fmt, isoToRu } from "../shared";
import { personalDebtBalance, personalDebtMoveDirection } from "./personalDebtModel";
import "./personalDebts.css";

const today = () => new Date().toLocaleDateString("en-CA");

export default function PersonalDebts({ debts, events, accounts, onReload, blockedByClosedPeriod }) {
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newDebt, setNewDebt] = useState({ requestId: crypto.randomUUID(), direction: "receivable", name: "", phone: "", due: "", note: "" });
  const [entry, setEntry] = useState({ requestId: crypto.randomUUID(), kind: "principal", amount: "", date: today(), accountId: "", actualName: "", actualDetails: "", reference: "", note: "" });
  const selected = debts.find((debt) => debt.id === selectedId);
  const thread = selected ? events.filter((event) => event.debt_id === selected.id).sort((a, b) =>
    (b.occurred_on || "").localeCompare(a.occurred_on || "") || (b.created_at || "").localeCompare(a.created_at || "")) : [];
  const receivable = debts.filter((debt) => debt.direction === "receivable").reduce((sum, debt) => sum + personalDebtBalance(events, debt.id), 0);
  const payable = debts.filter((debt) => debt.direction === "payable").reduce((sum, debt) => sum + personalDebtBalance(events, debt.id), 0);

  async function createDebt(event) {
    event.preventDefault();
    if (saving) return;
    setError(""); setSaving(true);
    const { data, error: requestError } = await supabase.rpc("create_personal_debt", {
      p_request_id: newDebt.requestId, p_direction: newDebt.direction, p_name: newDebt.name.trim(), p_phone: newDebt.phone.trim() || null,
      p_due_on: newDebt.due || null, p_note: newDebt.note.trim() || null,
    });
    setSaving(false);
    if (requestError) { setError(requestError.code === "PGRST202" ? "Сначала выполните SQL 2026-09-15_personal_debts.sql в базе." : requestError.message); return; }
    setCreating(false); setSelectedId(data); setNewDebt({ requestId: crypto.randomUUID(), direction: "receivable", name: "", phone: "", due: "", note: "" });
    onReload();
  }

  async function postEntry(event) {
    event.preventDefault();
    if (saving || !selected) return;
    if (blockedByClosedPeriod(entry.date)) return;
    setError(""); setSaving(true);
    const { error: requestError } = await supabase.rpc("post_personal_debt_event", {
      p_request_id: entry.requestId, p_debt_id: selected.id, p_kind: entry.kind,
      p_amount: Number(entry.amount), p_occurred_on: entry.date, p_account_id: entry.accountId,
      p_actual_name: entry.actualName.trim(), p_actual_details: entry.actualDetails.trim() || null,
      p_bank_reference: entry.reference.trim() || null, p_note: entry.note.trim() || null,
    });
    setSaving(false);
    if (requestError) { setError(requestError.code === "PGRST202" ? "Сначала выполните SQL 2026-09-15_personal_debts.sql в базе." : requestError.message); return; }
    setPosting(false);
    setEntry({ requestId: crypto.randomUUID(), kind: "principal", amount: "", date: today(), accountId: "", actualName: "", actualDetails: "", reference: "", note: "" });
    onReload();
  }

  return <div className="personal-debts">
    <div className="kd-tabbar" style={{ marginBottom: 14 }}>
      <div><div className="kd-title" style={{ fontSize: 18 }}>Долги и займы</div><div className="kd-muted">Каждая выдача и каждый возврат связаны со счётом.</div></div>
      <button className="kd-btn primary" onClick={() => { setCreating(true); setSelectedId(null); setPosting(false); setError(""); }}><Plus size={15} />Контрагент</button>
    </div>
    <div className="kd-card" style={{ marginBottom: 14, padding: "8px 18px" }}>
      <div className="kd-row"><span>Нам должны</span><strong>{fmt(receivable)} ₸</strong></div>
      <div className="kd-row"><span>Мы должны</span><strong>{fmt(payable)} ₸</strong></div>
      <div className="kd-muted" style={{ padding: "8px 0" }}>Это остатки по займам, не выручка и не операционный расход. Деньги отражаются в движениях счетов.</div>
    </div>
    {error && <div className="kd-flag danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
    {creating && <form className="kd-card" onSubmit={createDebt} style={{ marginBottom: 14 }}>
      <div className="kd-section">Новый контрагент</div>
      <div className="kd-formgrid">
        <label>Направление<select value={newDebt.direction} onChange={(e) => setNewDebt({ ...newDebt, direction: e.target.value })}><option value="receivable">Нам должны</option><option value="payable">Мы должны</option></select></label>
        <label>Имя / организация<input required value={newDebt.name} onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })} /></label>
        <label>Телефон<input value={newDebt.phone} onChange={(e) => setNewDebt({ ...newDebt, phone: e.target.value })} /></label>
        <label>Срок возврата<input type="date" value={newDebt.due} onChange={(e) => setNewDebt({ ...newDebt, due: e.target.value })} /></label>
      </div>
      <label>Основание / примечание<input value={newDebt.note} onChange={(e) => setNewDebt({ ...newDebt, note: e.target.value })} /></label>
      <div className="kd-actions"><button className="kd-btn primary" disabled={saving}>Создать</button><button type="button" className="kd-btn ghost" onClick={() => setCreating(false)}>Отмена</button></div>
    </form>}
    <div className="kd-list">
      {debts.length === 0 && !creating && <div className="kd-empty">Долгов пока нет. Добавьте человека или организацию, затем проводите выдачи и возвраты.</div>}
      {debts.map((debt) => {
        const balance = personalDebtBalance(events, debt.id);
        return <button key={debt.id} type="button" className="kd-card" onClick={() => { setSelectedId(debt.id); setCreating(false); setPosting(false); setError(""); }}
          style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", borderColor: selectedId === debt.id ? "var(--primary)" : undefined }}>
          <div className="kd-card-head"><strong>{debt.counterparty_name}</strong><strong style={{ color: balance > 0 ? "var(--rust)" : "var(--primary-d)" }}>{fmt(balance)} ₸</strong></div>
          <div className="kd-meta"><span>{debt.direction === "receivable" ? "Нам должны" : "Мы должны"}</span>{debt.counterparty_phone && <span>· {debt.counterparty_phone}</span>}{debt.due_on && <span>· до {isoToRu(debt.due_on)}</span>}{balance === 0 && <span>· рассчитались</span>}</div>
        </button>;
      })}
    </div>
    {selected && <section className="kd-card" style={{ marginTop: 14 }}>
      <div className="kd-tabbar"><div><div className="kd-title" style={{ fontSize: 18 }}>{selected.counterparty_name}</div><div className="kd-muted">{selected.direction === "receivable" ? "Нам должны" : "Мы должны"} · остаток {fmt(personalDebtBalance(events, selected.id))} ₸</div></div>
        <button className="kd-btn primary sm" onClick={() => { setPosting(true); setError(""); setEntry({ ...entry, actualName: selected.counterparty_name, accountId: entry.accountId || accounts[0]?.id || "" }); }}><Plus size={14} />Операция</button></div>
      {selected.note && <div className="kd-muted" style={{ marginBottom: 10 }}>{selected.note}</div>}
      {posting && <form onSubmit={postEntry} style={{ marginBottom: 16 }}>
        <div className="kd-formgrid">
          <label>Операция<select value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}><option value="principal">Новый долг / ещё взял</option><option value="repayment">Частичный или полный возврат</option></select></label>
          <label>Сумма, ₸<input required type="number" min="0.01" step="0.01" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></label>
          <label>Дата денег<input required type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></label>
          <label>Счёт<select required value={entry.accountId} onChange={(e) => setEntry({ ...entry, accountId: e.target.value })}><option value="">Выберите счёт</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label>Фактически отправили / получили от<input required value={entry.actualName} onChange={(e) => setEntry({ ...entry, actualName: e.target.value })} /></label>
          <label>Телефон / реквизиты фактического адресата<input value={entry.actualDetails} onChange={(e) => setEntry({ ...entry, actualDetails: e.target.value })} placeholder="Например, номер друга Арсена" /></label>
          <label>Номер / текст из банковской выписки<input value={entry.reference} onChange={(e) => setEntry({ ...entry, reference: e.target.value })} /></label>
          <label>Примечание<input value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} /></label>
        </div>
        <div className="kd-muted" style={{ marginTop: 8 }}>Счёт: {personalDebtMoveDirection(selected.direction, entry.kind) === "expense" ? "списание" : "поступление"}. Возврат не может превышать остаток.</div>
        <div className="kd-actions"><button className="kd-btn primary" disabled={saving || !accounts.length}>Провести</button><button type="button" className="kd-btn ghost" onClick={() => setPosting(false)}>Отмена</button></div>
      </form>}
      <div className="kd-section">История</div>
      {!thread.length && <div className="kd-muted">Операций пока нет.</div>}
      {thread.map((event) => <div key={event.id} className="kd-row" style={{ alignItems: "flex-start" }}>
        <span style={{ display: "flex", gap: 8 }}>
          {event.kind === "principal" ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
          <span>{event.kind === "principal" ? "Новый долг" : "Возврат"} · {isoToRu(event.occurred_on)}<small className="kd-muted" style={{ display: "block" }}>
            {accounts.find((account) => account.id === event.account_id)?.name || "Счёт удалён"} · фактически {event.actual_counterparty_name}
            {event.actual_counterparty_details && ` · ${event.actual_counterparty_details}`}
            {event.bank_reference && ` · банк: ${event.bank_reference}`}
            {event.note && ` · ${event.note}`}
          </small></span>
        </span><strong>{event.kind === "principal" ? "+" : "−"}{fmt(event.amount)} ₸</strong>
      </div>)}
    </section>}
  </div>;
}
