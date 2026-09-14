export const TASK_COLUMNS = { new: "Новые", in_progress: "В работе", done: "Готово" };
export function taskParticipant(task, userId) {
  return [task.created_by, task.assignee_id, ...(task.assignee_ids || []), ...(task.observer_ids || [])].includes(userId);
}
export function taskCanWork(task, userId, manager = false) {
  return manager || [task.created_by, task.assignee_id, ...(task.assignee_ids || [])].includes(userId);
}
export function taskCanComment(task, userId, manager = false) {
  if (manager || task.created_by === userId) return true;
  if (task.comment_policy === "author") return false;
  if (task.comment_policy === "selected") return (task.commenter_ids || []).includes(userId) && taskParticipant(task, userId);
  return taskParticipant(task, userId);
}
export function taskOverdue(task, now = new Date()) {
  if (task.status === "done" || !task.due_date) return false;
  const deadline = new Date(`${task.due_date}T${task.due_time || "23:59:59"}`);
  return Number.isFinite(+deadline) && deadline < now;
}
