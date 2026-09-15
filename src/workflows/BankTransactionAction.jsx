import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { fmt } from "../shared";
import { bankSideOfMove } from "./bankModel";

export default function BankTransactionAction({ row, accounts, moves, manualExpenses, evidence, categories, jobs, qrAccountId, qrFeeRate, onDone }) {
  const [mode, setMode] = useState("existing");
  const [moveId, setMoveId] = useState("");
  const [opexId, setOpexId] = useState("");
  const [kind, setKind] = useState(() => accounts.find((item) => item.id === row.account_id)?.scope === "owner"
    ? row.direction === "expense" ? "owner_spend" : "owner_income" : "business");
  const [categoryId, setCategoryId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [note, setNote] = useState("");
  const [jobId, setJobId] = useState("");
  const [incomeChannel, setIncomeChannel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const account = accounts.find((item) => item.id === row.account_id);
  const available = moves.filter((move) =>
    bankSideOfMove(move, row.account_id) === row.direction && Number(move.amount) === Number(row.amount) &&
    Math.abs(new Date(`${move.move_date}T00:00:00`) - new Date(`${row.booked_on}T00:00:00`)) <= 3 * 86400000 &&
    !evidence.some((item) => item.move_id === move.id && item.account_id === row.account_id && item.direction === row.direction));
  const availableOpex = row.direction === "expense" ? manualExpenses.filter((expense) => !expense.money_move_id &&
    (!expense.account_id || expense.account_id === row.account_id) && Number(expense.amount) === Number(row.amount) &&
    Math.abs(new Date(`${expense.spent_date}T00:00:00`) - new Date(`${row.booked_on}T00:00:00`)) <= 3 * 86400000) : [];
  const qrJobs = jobs.filter((job) => job.status === "done" && row.direction === "income" && row.account_id === qrAccountId &&
    !evidence.some((item) => item.kind === "qr_job" && item.job_id === job.id) &&
    (Math.abs(Number(job.report_qr) - Number(row.amount)) <= 1 ||
      Math.abs(Number(job.report_qr) * (1 - qrFeeRate) - Number(row.amount)) <= 1)).slice(0, 20);
  const kinds = account?.scope === "owner"
    ? row.direction === "expense" ? [["owner_spend", "Личный расход владельца"], ["transfer", "Перевод на другой счёт"]]
      : [["owner_income", "Личное поступление"], ["transfer", "Перевод с другого счёта"]]
    : row.direction === "expense" ? [["business", "Расход компании"], ["transfer", "Перевод в наличные / на счёт"], ["owner_draw", "Изъятие владельца"], ["owner_direct_spend", "Личная трата прямо с бизнес-счёта"]]
      : [["business", "Доход компании"], ["transfer", "Перевод с другого счёта"], ...(qrJobs.length ? [["qr_job", "QR-оплата уже в заявке"]] : [])];

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const response = mode === "existing" ? await supabase.rpc("link_bank_transaction", {
      p_transaction_id: row.id, p_move_id: moveId,
    }) : mode === "manual" ? await supabase.rpc("link_opex_bank_transaction", {
      p_transaction_id: row.id, p_opex_id: opexId,
    }) : await supabase.rpc("classify_bank_transaction", {
      p_transaction_id: row.id, p_kind: kind, p_category_id: categoryId || null,
      p_to_account_id: toAccountId || null, p_note: note.trim() || null, p_job_id: jobId || null,
      p_income_channel: incomeChannel || null,
    });
    setBusy(false);
    if (response.error) { setError(response.error.message); return; }
    onDone();
  }

  return <form className="bank-action" onSubmit={submit}>
    <div className="kd-section">Разнести: {fmt(row.amount)} ₸ · {row.booked_on}</div>
    <div className="kd-muted">{row.description}{row.counterparty ? ` · ${row.counterparty}` : ""}{row.reference ? ` · № ${row.reference}` : ""}</div>
    <div className="kd-seg bank-action-tabs">
      <button type="button" className={`kd-segbtn ${mode === "existing" ? "on" : ""}`} onClick={() => setMode("existing")}>Подтвердить записанное</button>
      {row.direction === "expense" && <button type="button" className={`kd-segbtn ${mode === "manual" ? "on" : ""}`} onClick={() => setMode("manual")}>Ручной расход</button>}
      <button type="button" className={`kd-segbtn ${mode === "new" ? "on" : ""}`} onClick={() => setMode("new")}>Разнести новое</button>
    </div>
    {mode === "existing" ? <label>Движение в приложении<select required value={moveId} onChange={(event) => setMoveId(event.target.value)}>
      <option value="">Выберите по назначению</option>{available.map((move) => <option key={move.id} value={move.id}>{move.move_date} · {fmt(move.amount)} ₸ · {move.note || move.source}</option>)}
    </select>{!available.length && <small className="kd-muted">Совпадений по счёту, сумме, направлению и дате ±3 дня нет. Проверьте ручные расходы или создайте новую операцию.</small>}</label> : mode === "manual" ? <label>Расход, записанный вручную<select required value={opexId} onChange={(event) => setOpexId(event.target.value)}><option value="">Выберите расход</option>{availableOpex.map((expense) => <option key={expense.id} value={expense.id}>{expense.spent_date} · {fmt(expense.amount)} ₸ · {expense.note || categories.find((cat) => cat.id === expense.category_id)?.name || "расход"}</option>)}</select>{!availableOpex.length && <small className="kd-muted">Ручных расходов с такой суммой и датой ±3 дня нет.</small>}</label> : <>
      <label>Что это?<select value={kind} onChange={(event) => setKind(event.target.value)}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="excluded">Исключение с объяснением (не меняет баланс)</option></select></label>
      {kind === "business" && row.direction === "expense" && <label>Статья расхода<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Выберите статью</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>}
      {kind === "business" && row.direction === "income" && <label>Канал дохода<select required value={incomeChannel} onChange={(event) => setIncomeChannel(event.target.value)}><option value="">Выберите канал</option><option value="clients">Клиенты / заявки</option><option value="tenders">Тендеры</option><option value="products">Продажа препаратов</option><option value="other">Прочие поступления</option></select></label>}
      {kind === "owner_spend" && <label>Личная статья (необязательно)<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Личные расходы без статьи</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>}
      {(kind === "transfer" || kind === "owner_draw") && <label>{row.direction === "expense" ? "Куда переместили деньги" : "Откуда переместили деньги"}<select required value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}><option value="">Выберите счёт</option>{accounts.filter((item) => item.id !== row.account_id && (kind !== "owner_draw" || item.scope === "owner")).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {kind === "qr_job" && <label>Заявка с QR-оплатой<select required value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Выберите заявку</option>{qrJobs.map((job) => <option key={job.id} value={job.id}>{job.scheduled_date} · {job.client_phone || "клиент"} · {fmt(job.report_qr)} ₸</option>)}</select></label>}
      <label>{kind === "excluded" ? "Причина исключения" : "Назначение / комментарий"}<input value={note} onChange={(event) => setNote(event.target.value)} required={kind === "excluded" || kind === "owner_draw" || kind === "owner_spend" || kind === "owner_direct_spend" || kind === "owner_income" || kind === "transfer" || (kind === "business" && row.direction === "income")} /></label>
      {kind === "excluded" && <div className="kd-flag danger">Исключённая строка не меняет остаток счёта. Используйте только для дубликата или ошибочной операции с объяснением.</div>}
    </>}
    {error && <div className="kd-flag danger" role="alert">{error}</div>}
    <button className="kd-btn primary" disabled={busy || (mode === "existing" && !moveId) || (mode === "manual" && !opexId)}>{busy ? "Проводим…" : "Подтвердить и разнести"}</button>
  </form>;
}
