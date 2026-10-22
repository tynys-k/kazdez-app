// Лента карточки CRM (лид и клиент), как в Bitrix: все события по клиенту
// одним столбцом — касания менеджера, комментарии, смены стадий, заявки,
// звонки обзвона, КП. Здесь только сборка и группировка, без React.
import { leadActivityOutcomeLabel } from "../leadActivities";
import { CALL_STAGES, outcomeLabel } from "./clientCallsModel";

// Группа решает, в какой фильтр попадает событие и как оно выглядит.
export const FEED_FILTERS = [
  { id: "all", label: "Всё" },
  { id: "touch", label: "Касания" },
  { id: "job", label: "Заявки" },
  { id: "call", label: "Обзвон" },
  { id: "system", label: "Система" },
];

const TOUCH_TITLES = { call: "Звонок", whatsapp: "WhatsApp", message: "Сообщение", meeting: "Встреча", note: "Комментарий" };
const JOB_STATUS = { done: "выполнена", canceled: "отменена", assigned: "назначена", new: "новая" };

const amountText = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString("ru-RU").replace(/[\s,]/g, " ")} ₸` : "";
};

// Касания и системные записи лида (lead_activities).
export function leadActivityItems(activities = [], authorName = () => "") {
  return activities.map((row) => {
    const at = row.occurred_at || row.created_at;
    const author = authorName(row.created_by) || (row.kind === "system" ? "Система" : "");
    if (row.kind === "stage_change" || row.kind === "system") {
      return { id: `act-${row.id}`, at, group: "system", icon: row.kind === "stage_change" ? "stage" : "system",
        title: row.kind === "stage_change" ? "Смена стадии" : leadActivityOutcomeLabel(row.outcome), body: row.comment || "", meta: author };
    }
    const isNote = row.kind === "note";
    return {
      id: `act-${row.id}`, at, group: "touch", icon: row.kind,
      title: isNote ? "Комментарий" : `${TOUCH_TITLES[row.kind] || "Касание"} · ${leadActivityOutcomeLabel(row.outcome)}`,
      body: row.comment || "", meta: author,
      tone: row.outcome === "refused" ? "danger" : row.outcome === "agreed" ? "positive" : row.outcome === "no_answer" ? "warning" : "",
    };
  });
}

// Прошлые заявки и звонки обзвона по номеру лида (lead_client_timeline).
export function clientTimelineItems(rows = []) {
  return rows.map((row) => {
    if (row.kind === "call") {
      const stage = CALL_STAGES[row.title]?.label;
      return { id: `call-${row.ref_id}`, at: row.happened_at, group: "call", icon: "retention",
        title: `Обзвон${stage ? ` · ${stage.toLowerCase()}` : ""}: ${outcomeLabel(row.status, row.title)}${row.rating ? ` · ${row.rating}/5` : ""}`,
        body: row.details || "", meta: "" };
    }
    // У заявки есть только дата выезда — время в ленте не показываем.
    return { id: `job-${row.ref_id}`, at: row.happened_at, dateOnly: true, group: "job", icon: "job",
      title: `Заявка: ${row.title}`, body: row.details || "",
      meta: [JOB_STATUS[row.status] || row.status, amountText(row.amount)].filter(Boolean).join(" · "),
      tone: row.status === "canceled" ? "muted" : row.status === "done" ? "positive" : "" };
  });
}

export function proposalItems(proposals = []) {
  const status = { draft: "черновик", sent: "отправлено, ждём ответ", accepted: "согласовано", declined: "отказ" };
  return proposals.map((row) => ({
    id: `kp-${row.id}`, at: row.sent_at || row.created_at || row.issue_date, group: "system", icon: "proposal",
    title: `КП ${row.number || ""}`.trim(), body: row.subject || "",
    meta: [status[row.status] || row.status, amountText(row.total)].filter(Boolean).join(" · "),
  }));
}

const dayKey = (value) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function dayLabel(key, now) {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(new Date(now).getTime() - 86400000));
  if (key === today) return "Сегодня";
  if (key === yesterday) return "Вчера";
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

// Свежие сверху, по дням: «Сегодня», «Вчера», дата.
export function groupFeed(items = [], { filter = "all", now = new Date() } = {}) {
  const rows = items
    .filter((item) => item.at && (filter === "all" || item.group === filter))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const days = [];
  for (const item of rows) {
    const key = dayKey(item.at);
    if (!key) continue;
    if (days[days.length - 1]?.key !== key) days.push({ key, label: dayLabel(key, now), items: [] });
    days[days.length - 1].items.push(item);
  }
  return days;
}

export function feedCounts(items = []) {
  const counts = { all: items.length };
  for (const item of items) counts[item.group] = (counts[item.group] || 0) + 1;
  return counts;
}

// Почему форму касания нельзя сохранить — словами, а не серой кнопкой.
export function composerBlockers({ kind, outcome, comment, nextAction, nextActionAt, closed, now = Date.now() }) {
  const isNote = kind === "note";
  const due = nextActionAt ? new Date(nextActionAt) : null;
  return [
    (isNote || outcome !== "no_answer") && !String(comment || "").trim() && (isNote ? "Напиши комментарий." : "Напиши, что сказал клиент."),
    !isNote && !closed && !String(nextAction || "").trim() && "Укажи следующий шаг.",
    !isNote && !closed && !(due && Number.isFinite(due.getTime()) && due.getTime() > now) && "Срок следующего шага должен быть в будущем.",
  ].filter(Boolean);
}
