import React, { useEffect, useState } from "react";
import { ModalShell, Field } from "../modals";
import { supabase } from "../supabaseClient";
import { fmtTs, isoToRu } from "../shared";
import EntityThread from "./EntityThread";
import { taskCanComment, taskCanWork } from "./taskModel";

export function PeoplePicker({ label, value = [], people, onChange }) {
  return <fieldset className="wf-section"><legend>{label}</legend><div className="wf-members">{people.map((p) => <label key={p.id}><input type="checkbox" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((id) => id !== p.id))} />{p.full_name || "Сотрудник"}</label>)}</div></fieldset>;
}

export default function TaskWorkspace({ task, people, userId, canManage, onClose, onEdit, onRemove }) {
  const [subtasks, setSubtasks] = useState([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const work = taskCanWork(task, userId, canManage);
  const edit = canManage || task.created_by === userId;
  const name = (id) => people.find((p) => p.id === id)?.full_name || "Не назначен";
  async function load() {
    const result = await supabase.from("task_subtasks").select("*").eq("task_id", task.id).order("created_at");
    if (result.error) setError("Подзадачи не загружены: " + result.error.message); else setSubtasks(result.data);
  }
  useEffect(() => { load(); }, [task.id]);
  async function change(row) {
    if (busy) return; setBusy(true); setError("");
    try {
      const result = row ? await supabase.from("task_subtasks").update({ done: !row.done }).eq("id", row.id)
        : await supabase.from("task_subtasks").insert({ task_id: task.id, title: title.trim(), due_at: due ? new Date(due).toISOString() : null, assignee_id: assignee || null });
      if (result.error) throw result.error;
      if (!row) { setTitle(""); setDue(""); setAssignee(""); } await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <ModalShell title={task.title} wide onClose={onClose} footer={<>{edit && <><button className="kd-btn ghost" onClick={onRemove}>Удалить</button><button className="kd-btn ghost" onClick={onEdit}>Изменить задачу</button></>}<button className="kd-btn primary" onClick={onClose}>Закрыть</button></>}>
    <div className="wf-detail-summary"><div><small>Создал</small><strong>{name(task.created_by)}</strong><span>{fmtTs(task.created_at)}</span></div><div><small>Срок</small><strong>{task.due_date ? `${isoToRu(task.due_date)} ${task.due_time || ""}` : "Не задан"}</strong></div><div><small>Ответственные</small><strong>{[...new Set([task.assignee_id, ...(task.assignee_ids || [])].filter(Boolean))].map(name).join(", ") || "Не назначены"}</strong></div><div><small>Наблюдатели</small><strong>{(task.observer_ids || []).map(name).join(", ") || "Нет"}</strong></div></div>
    <section className="wf-section"><h4>Описание задачи</h4><p>{task.description || "Описание не добавлено."}</p></section>
    <section className="wf-section"><h4>Подзадачи · {subtasks.filter((s) => s.done).length}/{subtasks.length}</h4>{error && <p className="kd-err" role="alert">{error}</p>}
      {subtasks.map((row) => <label className="wf-subtask" key={row.id}><input type="checkbox" checked={row.done} disabled={!work || busy} onChange={() => change(row)} /><span>{row.title}<small className="kd-muted"> · {name(row.assignee_id)} · создал {name(row.created_by)} · {fmtTs(row.created_at)}{row.due_at ? ` · до ${fmtTs(row.due_at)}` : " · без срока"}</small></span></label>)}
      {work && <><Field label="Новая подзадача"><input maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} /></Field><div className="kd-grid2"><Field label="Срок подзадачи"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field><Field label="Ответственный"><select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Не назначен</option>{people.filter((p) => [task.created_by, task.assignee_id, ...(task.assignee_ids || [])].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{name(p.id)}</option>)}</select></Field></div><button className="kd-btn ghost sm" disabled={busy || !title.trim()} onClick={() => change()}>Добавить подзадачу</button></>}
    </section>
    <EntityThread refreshKey={JSON.stringify(subtasks)} kind="task" entityId={task.id} people={people} canComment={taskCanComment(task, userId, canManage)} />
  </ModalShell>;
}
