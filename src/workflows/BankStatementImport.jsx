import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fmt } from "../shared";
import { parseBankFile } from "./bankParser";

export default function BankStatementImport({ accounts, onImported }) {
  const fileRef = useRef(null);
  const [accountId, setAccountId] = useState("");
  const [bankName, setBankName] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [parsed, setParsed] = useState(null);
  const [file, setFile] = useState(null);
  const [approvedWarnings, setApprovedWarnings] = useState(false);
  const [approvedPreview, setApprovedPreview] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bankAccounts = accounts.filter((account) => account.kind === "bank");

  async function chooseFile(event) {
    const chosen = event.target.files?.[0];
    setFile(chosen || null); setParsed(null); setError(""); setApprovedWarnings(false); setApprovedPreview(false);
    setRequestId(crypto.randomUUID());
    if (!chosen) return;
    setBusy(true);
    try { setParsed(await parseBankFile(chosen)); }
    catch (cause) { setError(cause.message || "Не удалось прочитать выписку"); }
    finally { setBusy(false); }
  }

  async function upload(event) {
    event.preventDefault();
    if (busy || !parsed || !file) return;
    setBusy(true); setError("");
    const result = await supabase.rpc("import_bank_statement", {
      p_request_id: requestId, p_account_id: accountId, p_bank_name: bankName.trim(),
      p_filename: file.name, p_file_type: parsed.fileType, p_rows: parsed.rows,
      p_closing_balance: closingBalance === "" ? null : Number(closingBalance),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.code === "PGRST202" ? "Сначала выполните SQL 2026-09-16_bank_reconciliation.sql в Supabase." : result.error.message);
      return;
    }
    const info = result.data;
    setParsed(null); setFile(null); setClosingBalance(""); setRequestId(crypto.randomUUID());
    if (fileRef.current) fileRef.current.value = "";
    onImported(info);
  }

  return <form className="kd-card bank-import" onSubmit={upload}>
    <div className="kd-section">Загрузить выписку</div>
    <div className="kd-muted">PDF/Excel читаются в браузере. Оригинальный файл не хранится в базе — только распознанные строки; после сверки их можно удалить.</div>
    <div className="bank-formgrid">
      <label>Банковский счёт<select required value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Выберите счёт</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>Банк<input required value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Kaspi Pay" /></label>
      <label>Файл .xlsx, .csv или .pdf<input ref={fileRef} type="file" accept=".xlsx,.csv,.pdf" onChange={chooseFile} aria-describedby="bank-import-format" /></label>
      <label>Остаток по выписке на конец (необязательно)<input inputMode="decimal" type="number" step="0.01" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} /></label>
    </div>
    <div id="bank-import-format" className="kd-muted">Сканированный PDF без текстового слоя не распознаётся. Если банк даёт Excel, используйте его.</div>
    {error && <div className="kd-flag danger" role="alert">{error}</div>}
    {busy && <div role="status" className="kd-muted">{parsed ? "Загружаем операции…" : "Читаем выписку…"}</div>}
    {parsed && <div className="bank-preview">
      <div className="kd-section">Перед загрузкой: {parsed.rows.length} операций</div>
      <div className="kd-muted">Списания: {fmt(parsed.rows.filter((row) => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0))} ₸ · поступления: {fmt(parsed.rows.filter((row) => row.direction === "income").reduce((sum, row) => sum + row.amount, 0))} ₸.</div>
      <div className="bank-table-wrap"><table><thead><tr><th>Дата</th><th>Направление</th><th>Сумма</th><th>Назначение</th></tr></thead><tbody>
        {parsed.rows.slice(0, 8).map((row, index) => <tr key={index}><td>{row.booked_on}</td><td>{row.direction === "expense" ? "Расход" : "Приход"}</td><td>{fmt(row.amount)} ₸</td><td>{row.description}</td></tr>)}
      </tbody></table></div>
      {parsed.rows.length > 8 && <div className="kd-muted">Показаны первые 8 строк из {parsed.rows.length}.</div>}
      {!!parsed.warnings.length && <div className="kd-flag danger" role="alert">
        <strong>{parsed.warnings.length} строк не распознаны и не будут загружены.</strong>
        <div>{parsed.warnings.slice(0, 5).join("; ")}</div>
        <label className="bank-confirm"><input type="checkbox" checked={approvedWarnings} onChange={(event) => setApprovedWarnings(event.target.checked)} />Я сравнил количество строк с выпиской и понимаю, что эти строки пропущены</label>
      </div>}
      <label className="bank-confirm"><input type="checkbox" checked={approvedPreview} onChange={(event) => setApprovedPreview(event.target.checked)} />Я сравнил количество операций, направления и суммы с выпиской банка{parsed.fileType === "pdf" ? "; для PDF это обязательно из-за разного расположения колонок" : ""}</label>
    </div>}
    <button className="kd-btn primary" type="submit" disabled={!parsed || !accountId || !bankName.trim() || busy || !approvedPreview || (parsed.warnings.length > 0 && !approvedWarnings)}><Upload size={15} />Загрузить операции</button>
  </form>;
}
