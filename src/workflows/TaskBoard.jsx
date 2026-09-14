import React, { useState } from "react";
import { fmtTs, isoToRu } from "../shared";
import { TASK_COLUMNS, taskCanWork, taskOverdue } from "./taskModel";
import TaskWorkspace from "./TaskWorkspace";
import "./workflows.css";

export default function TaskBoard({ tasks, people, userId, canManage, onCreate, onEdit, onStatus, onRemove }) {
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const name = (id) => people.find((p) => p.id === id)?.full_name || "Не назначен";
  const visible = tasks.filter((t) => (!query || `${t.title} ${t.description || ""}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")))
    && (!person || [t.assignee_id, ...(t.assignee_ids || [])].includes(person)) && (!overdue || taskOverdue(t)));
  const active = tasks.find((t) => String(t.id) === String(selected));
  async function move(task, status) {
    if (busy || !taskCanWork(task, userId, canManage) || task.status === status) return;
    setBusy(true); setError("");
    try { if (await onStatus(task, status) === false) setError("Статус не сохранён. Проверьте сообщение об ошибке."); }
    catch { setError("Не удалось изменить статус. Обновите доску перед повтором."); }
    finally { setBusy(false); }
  }
  return <section className="wf-workspace" aria-label="Доска задач" aria-busy={busy}>
    <header className="wf-toolbar"><div><h2>Задачи</h2><p>Откройте карточку: обсуждение, файлы, участники и подзадачи.</p></div>{canManage && <button className="kd-btn primary" onClick={onCreate}>+ Задача</button>}</header>
    <div className="wf-filters"><label>Поиск<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название или описание" /></label><label>Ответственный<select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Все</option>{people.map((p) => <option key={p.id} value={p.id}>{name(p.id)}</option>)}</select></label><label className="wf-checkbox"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />Только просроченные</label></div>
    {error && <p role="alert" className="kd-err">{error}</p>}
    <div className="wf-kanban">{Object.entries(TASK_COLUMNS).map(([status, label]) => {
      const column = visible.filter((t) => (TASK_COLUMNS[t.status] ? t.status : "new") === status);
      return <section className="wf-column" key={status} aria-label={label} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const t = tasks.find((row) => String(row.id) === e.dataTransfer.getData("text/plain")); if (t) move(t, status); }}>
        <h3>{label}<span>{column.length}</span></h3>
        {column.length === 0 && <p className="wf-empty">Нет задач</p>}
        {column.map((task) => <article key={task.id} className={`wf-task ${taskOverdue(task) ? "wf-overdue" : ""}`} draggable={!busy && taskCanWork(task, userId, canManage)} onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}>
          <button className="wf-task-title" onClick={() => setSelected(task.id)}>{task.priority === "urgent" && <small>Срочно · </small>}{task.title}</button>
          {task.description && <p className="wf-excerpt">{task.description}</p>}
          <small>Создана {fmtTs(task.created_at)} · {name(task.created_by)}</small>
          <small>Ответственные: {[...new Set([task.assignee_id, ...(task.assignee_ids || [])].filter(Boolean))].map(name).join(", ") || "Не назначены"}</small>
          <div className="wf-task-bottom"><span>{task.due_date ? `${taskOverdue(task) ? "Просрочено · " : "До "}${isoToRu(task.due_date)} ${task.due_time || ""}` : "Без срока"}</span>{taskCanWork(task, userId, canManage) && <select aria-label={`Статус: ${task.title}`} value={task.status || "new"} disabled={busy} onChange={(e) => move(task, e.target.value)}>{Object.entries(TASK_COLUMNS).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select>}</div>
        </article>)}
      </section>;
    })}</div>
    {active && <TaskWorkspace key={active.id} task={active} people={people} userId={userId} canManage={canManage} onClose={() => setSelected(null)} onEdit={() => { setSelected(null); onEdit(active); }} onRemove={() => { setSelected(null); onRemove(active); }} />}
  </section>;
}
