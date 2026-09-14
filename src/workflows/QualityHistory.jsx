import React from "react";
import { fmtTs, isoToRu, samePhone } from "../shared";
export const QUALITY_LABELS = { positive: "Всё хорошо", repeat: "Нужен повтор", complaint: "Претензия", no_answer: "Не ответил" };
export function qualityHistoryForPhone(phone, jobs, checks) {
  const ids = new Set(jobs.filter((j) => samePhone(j.client_phone, phone)).map((j) => String(j.id)));
  return checks.filter((q) => ids.has(String(q.job_id))).sort((a, b) => String(b.contacted_at || "").localeCompare(String(a.contacted_at || "")));
}
export function qualityPendingJobs(jobs, checks, now = new Date()) {
  const checked = new Set(checks.map((q) => String(q.job_id)));
  return jobs.filter((j) => j.status === "done" && !checked.has(String(j.id)) && +now - +new Date(j.reported_at || j.scheduled_date) >= 86400000);
}
export default function QualityHistory({ checks = [], jobs = [], people = [], currentJobId }) {
  return <section className="wf-section"><h4>История контроля и отзывы · {checks.length}</h4>{checks.length ? checks.map((q) => {
    const job = jobs.find((j) => String(j.id) === String(q.job_id));
    return <article className="wf-event" key={q.id}><small>{fmtTs(q.contacted_at) || "Дата звонка не сохранена"} · {people.find((p) => p.id === q.checked_by)?.full_name || "Сотрудник"}</small><strong>{QUALITY_LABELS[q.result] || q.result}{q.result !== "no_answer" && q.rating ? ` · ${q.rating}/5` : ""}</strong><small>{String(q.job_id) === String(currentJobId) ? "Этот выезд · " : ""}{job?.type || "Выезд"} · {isoToRu(job?.scheduled_date)} · {job?.pest}</small><p>{q.note || "Замечания не указаны."}</p>{q.review_requested && <small>Зафиксирован запрос отзыва</small>}</article>;
  }) : <p className="kd-muted">Предыдущих проверок по этому номеру не найдено.</p>}</section>;
}
