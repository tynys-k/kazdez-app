export const LEAD_ACTIVITY_KINDS = [
  { id: "call", label: "Звонок" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "message", label: "Сообщение" },
  { id: "meeting", label: "Встреча" },
  { id: "note", label: "Комментарий" },
];

export const LEAD_ACTIVITY_OUTCOMES = [
  { id: "connected", label: "Связались" },
  { id: "no_answer", label: "Не ответил" },
  { id: "interested", label: "Есть интерес" },
  { id: "proposal_sent", label: "Предложение отправлено" },
  { id: "thinking", label: "Думает" },
  { id: "agreed", label: "Договорились" },
  { id: "refused", label: "Отказался" },
];

const KIND_LABELS = Object.fromEntries([
  ...LEAD_ACTIVITY_KINDS.map((item) => [item.id, item.label]),
  ["system", "Система"],
  ["stage_change", "Смена стадии"],
]);

const OUTCOME_LABELS = Object.fromEntries([
  ...LEAD_ACTIVITY_OUTCOMES.map((item) => [item.id, item.label]),
  ["note", "Комментарий"],
  ["created", "Карточка создана"],
  ["stage_changed", "Стадия изменена"],
]);

export const leadActivityKindLabel = (kind) => KIND_LABELS[kind] || kind || "Событие";
export const leadActivityOutcomeLabel = (outcome) => OUTCOME_LABELS[outcome] || outcome || "Без результата";

export function groupLeadActivities(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const key = String(item?.lead_id || "");
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => String(b.occurred_at || b.created_at || "").localeCompare(String(a.occurred_at || a.created_at || "")));
  }
  return grouped;
}

export function leadActivitySummary(activity) {
  if (!activity) return null;
  return {
    title: `${leadActivityKindLabel(activity.kind)} · ${leadActivityOutcomeLabel(activity.outcome)}`,
    comment: String(activity.comment || "").trim(),
    at: activity.occurred_at || activity.created_at || null,
  };
}
