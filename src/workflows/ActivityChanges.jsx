import React from "react";
const labels = { title: "Название", description: "Описание", status: "Статус", due_date: "Срок", due_time: "Время", due_at: "Срок подзадачи", assignee_id: "Ответственный", assignee_ids: "Ответственные", observer_ids: "Наблюдатели", commenter_ids: "Кому можно комментировать", comment_policy: "Правило комментариев", number: "Номер договора", signed_on: "Дата договора", expires_on: "Действует до", client_id: "Клиент", organization: "Организация", drive_url: "Ссылка на Диск", amount: "Сумма", note: "Примечание", responsible_ids: "Ответственные", customer_contacts: "Контакты заказчика", partner_id: "Партнёр", done: "Выполнена", priority: "Приоритет", type: "Тип" };
const values = { new: "Новая", in_progress: "В работе", done: "Выполнена", participants: "Участники", author: "Только автор и управляющий", selected: "Выбранные участники" };
export default function ActivityChanges({ details, people = [] }) {
  if (!details?.after) return null;
  const before = details.before || {};
  const changes = [...new Set([...Object.keys(before), ...Object.keys(details.after)])].filter((key) => !["id", "created_at", "created_by", "updated_at", "done_at", "storage_path"].includes(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(details.after[key] ?? null));
  const show = (value) => value == null || value === "" ? "—" : Array.isArray(value) ? value.map(show).join(", ") || "—" : typeof value === "object" ? Object.values(value).filter(Boolean).map(show).join(" · ") : typeof value === "boolean" ? value ? "Да" : "Нет" : people.find((p) => p.id === value)?.full_name || values[value] || String(value);
  return changes.length ? <details><summary>Что изменилось · {changes.length}</summary><dl className="wf-changes">{changes.map((key) => <div key={key}><dt>{labels[key] || key}</dt><dd>{Object.keys(before).length ? `${show(before[key])} → ` : ""}{show(details.after[key])}</dd></div>)}</dl></details> : null;
}
