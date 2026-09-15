import React, { useState } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fmt, isoToRu } from "../shared";
import { suggestBankMatches } from "./bankModel";
import BankStatementImport from "./BankStatementImport";
import BankTransactionAction from "./BankTransactionAction";
import "./bankReconciliation.css";

export default function BankReconciliation({ statements, transactions, evidence, accounts, moves, categories, jobs,
  manualExpenses, qrAccountId, qrFeeRate, accountBalanceAt, onReload }) {
  const [selectedId, setSelectedId] = useState(null);
  const [activeRowId, setActiveRowId] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = statements.find((statement) => statement.id === selectedId) || statements[0];
  const rows = selected ? transactions.filter((row) => row.statement_id === selected.id) : [];
  const evidenceByRow = new Map(evidence.filter((item) => item.transaction_id).map((item) => [item.transaction_id, item]));
  const open = rows.filter((row) => !evidenceByRow.has(row.id));
  const suggestions = suggestBankMatches(open, moves, evidence, manualExpenses);
  const shown = onlyOpen ? open : rows;
  const active = shown.find((row) => row.id === activeRowId);
  const bankBalance = selected?.closing_balance == null ? null : Number(selected.closing_balance);
  const ledgerBalance = selected?.period_to ? accountBalanceAt(selected.account_id, selected.period_to) : null;
  const difference = bankBalance == null || ledgerBalance == null ? null : Math.round((bankBalance - ledgerBalance) * 100) / 100;
  const totalOpen = transactions.filter((row) => !evidenceByRow.has(row.id));
  const unreconciledExpense = totalOpen.filter((row) => row.direction === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const unreconciledIncome = totalOpen.filter((row) => row.direction === "income").reduce((sum, row) => sum + Number(row.amount), 0);

  function imported(info) {
    setSelectedId(info.statement_id); setActiveRowId(null); setError("");
    setMessage(`Загружено ${info.imported} строк; повторов уже загруженных операций: ${info.duplicates}.`);
    onReload();
  }

  async function confirmUnique() {
    if (!suggestions.length || busy) return;
    setBusy(true); setError("");
    let confirmed = 0;
    const failures = [];
    for (const { row, move, opex } of suggestions) {
      const response = move ? await supabase.rpc("link_bank_transaction", { p_transaction_id: row.id, p_move_id: move.id })
        : await supabase.rpc("link_opex_bank_transaction", { p_transaction_id: row.id, p_opex_id: opex.id });
      if (response.error) failures.push(`${row.booked_on} · ${fmt(row.amount)} ₸: ${response.error.message}`);
      else confirmed++;
    }
    setBusy(false);
    setMessage(`Однозначно подтверждено ${confirmed} из ${suggestions.length} операций.`);
    if (failures.length) setError(failures.slice(0, 3).join("; "));
    onReload();
  }

  async function removeStatement(statement) {
    if (busy) return;
    const missing = transactions.filter((row) => row.statement_id === statement.id && !evidenceByRow.has(row.id)).length;
    if (missing) { setError(`Сначала разнесите ${missing} строк этой выписки.`); return; }
    if (!window.confirm(`Удалить распознанные строки «${statement.filename}»? Подтверждения движений останутся в журнале.`)) return;
    setBusy(true); setError("");
    const response = await supabase.rpc("delete_bank_statement", { p_statement_id: statement.id });
    setBusy(false);
    if (response.error) { setError(response.error.message); return; }
    setSelectedId(null); setActiveRowId(null); setMessage("Выписка удалена; подтверждения в финансовом журнале сохранены.");
    onReload();
  }

  return <div className="bank-reconciliation">
    <div className="kd-tabbar"><div><h2 className="kd-title">Сверка по выписке</h2><div className="kd-muted">Банк — источник факта. Совпадения подтверждаем один к одному; неясные суммы остаются открытыми.</div></div></div>
    <div className="bank-metrics">
      <div><span>Не разнесено строк</span><strong>{totalOpen.length}</strong></div>
      <div><span>Списания без объяснения</span><strong>{fmt(unreconciledExpense)} ₸</strong></div>
      <div><span>Поступления без объяснения</span><strong>{fmt(unreconciledIncome)} ₸</strong></div>
      <div><span>Подтверждено</span><strong>{evidence.filter((item) => item.kind !== "excluded").length}</strong></div>
    </div>
    {error && <div className="kd-flag danger" role="alert">{error}</div>}
    {message && <div className="kd-flag" role="status">{message}</div>}
    <BankStatementImport accounts={accounts} onImported={imported} />
    <section className="kd-card bank-register">
      <div className="kd-section">Загруженные выписки</div>
      {!statements.length && <div className="kd-empty">Загрузите выписку банка. Пока нет внешнего подтверждения движениям в приложении.</div>}
      {!!statements.length && <div className="bank-statement-list">
        {statements.map((statement) => {
          const remaining = transactions.filter((row) => row.statement_id === statement.id && !evidenceByRow.has(row.id)).length;
          return <button type="button" key={statement.id} className={`bank-statement ${selected?.id === statement.id ? "selected" : ""}`}
            onClick={() => { setSelectedId(statement.id); setActiveRowId(null); }}>
            <strong>{statement.bank_name} · {accounts.find((item) => item.id === statement.account_id)?.name || "счёт"}</strong>
            <small>{statement.filename} · {statement.period_from ? isoToRu(statement.period_from) : "?"}—{statement.period_to ? isoToRu(statement.period_to) : "?"}</small>
            <span>{remaining ? `${remaining} не разнесено` : "Полностью разнесена"}</span>
          </button>;
        })}
      </div>}
    </section>
    {selected && <section className="kd-card bank-register">
      <div className="bank-section-head"><div><div className="kd-section">{selected.filename}</div><div className="kd-muted">{rows.length} новых строк · {selected.duplicate_count} повторов пропущено</div></div>
        <button className="kd-btn ghost danger sm" disabled={busy || open.length > 0} onClick={() => removeStatement(selected)} title={open.length ? "Сначала разнесите все строки" : "Удалить исходные строки после сверки"}><Trash2 size={14} />Удалить выписку</button></div>
      {difference != null && <div className={`kd-flag ${Math.abs(difference) > 1 ? "danger" : ""}`}>
        Банк на {isoToRu(selected.period_to)}: {fmt(bankBalance)} ₸ · учёт: {fmt(ledgerBalance)} ₸ · разница: {fmt(difference)} ₸.
        <small className="kd-muted">Проверьте дату начального остатка и задержанные QR-платежи; совпадение без этих данных не гарантируется.</small>
      </div>}
      <div className="bank-section-head bank-controls"><label className="bank-confirm"><input type="checkbox" checked={onlyOpen} onChange={(event) => { setOnlyOpen(event.target.checked); setActiveRowId(null); }} />Только неразнесённые</label>
        <button className="kd-btn ghost sm" disabled={!suggestions.length || busy} onClick={confirmUnique}><CheckCircle2 size={15} />Подтвердить {suggestions.length} однозначных</button></div>
      {!shown.length && <div className="kd-empty">{onlyOpen ? "Все строки этой выписки разнесены." : "Строк нет."}</div>}
      {!!shown.length && <div className="bank-table-wrap"><table><thead><tr><th>Дата</th><th>Банк</th><th>Сумма</th><th>Состояние</th><th></th></tr></thead><tbody>
        {shown.slice(0, 200).map((row) => {
          const proof = evidenceByRow.get(row.id);
          const unique = suggestions.some((item) => item.row.id === row.id);
          return <tr key={row.id}><td>{isoToRu(row.booked_on)}</td><td><strong>{row.description}</strong>{row.counterparty && <small>{row.counterparty}</small>}{row.reference && <small>№ {row.reference}</small>}</td>
            <td className="bank-amount">{row.direction === "expense" ? "−" : "+"}{fmt(row.amount)} ₸</td>
            <td>{proof ? proof.kind === "excluded" ? "Исключено" : "Подтверждено" : unique ? "Однозначное совпадение" : "Нужно разнести"}</td>
            <td>{!proof && <button className="kd-btn ghost sm" onClick={() => setActiveRowId(activeRowId === row.id ? null : row.id)}>{activeRowId === row.id ? "Закрыть" : "Разнести"}</button>}</td></tr>;
        })}
      </tbody></table></div>}
      {shown.length > 200 && <div className="kd-muted">Показаны 200 из {shown.length}. Разнесите текущие строки для просмотра следующих.</div>}
      {active && <BankTransactionAction key={active.id} row={active} accounts={accounts} moves={moves} manualExpenses={manualExpenses} evidence={evidence} categories={categories}
        jobs={jobs} qrAccountId={qrAccountId} qrFeeRate={qrFeeRate} onDone={() => { setActiveRowId(null); setMessage("Операция подтверждена."); onReload(); }} />}
    </section>}
  </div>;
}
