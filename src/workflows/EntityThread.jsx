import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "../dataLoading";
import { fmtTs } from "../shared";
import ActivityChanges from "./ActivityChanges";

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"];
export function validateAttachment(file) {
  if (!file || !file.size) return "Выберите непустой файл.";
  if (file.size > 25 * 1024 * 1024) return "Максимальный размер файла — 25 МБ.";
  if (!MIME_TYPES.includes(file.type)) return "Поддерживаются фото JPG/PNG/WebP, видео MP4/MOV, PDF, Word, Excel и TXT.";
  return "";
}
export default function EntityThread({ kind, entityId, people = [], canComment, canUpload = canComment, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [documentKind, setDocumentKind] = useState("general");
  const load = useCallback(async () => {
    // The adapter preserves pagination and parent filtering on every page.
    const scoped = { from: (table) => ({ select: () => supabase.from(table).select("*").eq("entity_kind", kind).eq("entity_id", String(entityId)) }) };
    const results = await Promise.all([fetchAllRows(scoped, "entity_activity", { column: "created_at", ascending: true }), fetchAllRows(scoped, "entity_files", { column: "created_at", ascending: true })]);
    if (results.some((r) => r.error)) { setError("История не загружена: " + results.find((r) => r.error).error.message); setLoading(false); return false; }
    setRows(results[0].data); setFiles(results[1].data); setLoading(false); return true;
  }, [kind, entityId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  async function comment() {
    if (busy || !text.trim()) return;
    setBusy(true); setError("");
    try {
      const { error: failure } = await supabase.from("entity_activity").insert({ entity_kind: kind, entity_id: String(entityId), event_type: "comment", body: text.trim() });
      if (failure) throw failure;
      setText(""); await load();
    } catch (e) { setError("Комментарий не сохранён: " + e.message); }
    finally { setBusy(false); }
  }
  async function upload(file) {
    const invalid = validateAttachment(file);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    const path = `${kind}/${entityId}/${crypto.randomUUID()}`;
    try {
      const result = await supabase.storage.from("workflow-files").upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw result.error;
      const metadata = await supabase.from("entity_files").insert({ entity_kind: kind, entity_id: String(entityId), storage_path: path, name: file.name, mime_type: file.type, size_bytes: file.size, document_kind: documentKind });
      if (metadata.error) {
        // Do not remove on an ambiguous response: metadata may have committed.
        throw new Error("Файл загружен, но запись не подтверждена. Обновите историю перед повтором. " + metadata.error.message);
      }
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function open(file) {
    const result = await supabase.storage.from("workflow-files").createSignedUrl(file.storage_path, 60, { download: file.name });
    if (result.error) { setError(result.error.message); return; }
    const link = document.createElement("a"); link.href = result.data.signedUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click();
  }
  const author = (id) => people.find((p) => p.id === id)?.full_name || (id ? "Сотрудник" : "Система");
  return <div aria-busy={busy || loading}>
    {error && <div className="kd-err" role="alert">{error}<button className="kd-btn ghost sm" onClick={() => { setError(""); load(); }}>Обновить</button></div>}
    <section className="wf-section"><h4>Файлы, фото и видео</h4>{canUpload && <><label className="kd-field"><span>Вид документа</span><select value={documentKind} onChange={(e) => setDocumentKind(e.target.value)}><option value="general">Файл / фото / видео</option><option value="contract">Подписанный договор</option><option value="avr">Подписанный АВР</option><option value="invoice">Счёт / накладная</option></select></label><label className="kd-btn ghost sm">Прикрепить · до 25 МБ<input disabled={busy || loading} type="file" aria-label="Прикрепить файл" accept={MIME_TYPES.join(",")} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); }} /></label></>}
      {files.map((file) => <div className="wf-file" key={file.id}><span>{file.name}<small>{({ general: "Файл", contract: "Договор", avr: "Подписанный АВР", invoice: "Счёт / накладная" })[file.document_kind] || "Файл"} · {fmtTs(file.created_at)} · {author(file.created_by)} · {Math.ceil(file.size_bytes / 1024)} КБ</small></span><button className="kd-btn ghost sm" onClick={() => open(file)}>Открыть</button></div>)}{!loading && !files.length && <p className="kd-muted">Файлов пока нет.</p>}
    </section>
    <section className="wf-section"><h4>Обсуждение и хронология</h4>{loading ? <p role="status">Загрузка истории…</p> : !rows.length && <p className="kd-muted">История пока пустая.</p>}
      {rows.map((row) => <article className="wf-event" key={row.id}><small>{fmtTs(row.created_at)} · {author(row.created_by)}{row.event_type !== "comment" ? " · Изменение" : ""}</small><p>{row.body}</p><ActivityChanges details={row.details} people={people} /></article>)}
      {canComment ? <><label className="kd-field"><span>Новый комментарий</span><textarea className="kd-textarea" maxLength={8000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Результат, вопрос, замечание или проблема…" /></label><button className="kd-btn primary sm" disabled={busy || loading || !text.trim()} onClick={comment}>Отправить</button></> : <p className="kd-muted">Вы можете читать историю. Комментирование для вас закрыто.</p>}
    </section>
  </div>;
}
