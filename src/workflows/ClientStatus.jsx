import React, { useState } from "react";
import { CLIENT_LABELS, clientStatuses, regularThreshold } from "./clientStatusModel";
export function ClientStatusBadges({ client, jobs, threshold }) {
  const { labels, primaryCount } = clientStatuses(client, jobs, threshold);
  return <div className="kd-meta" title={`Завершённых первичных заявок: ${primaryCount}. Порог постоянного клиента: ${regularThreshold(threshold)}`}>
    {labels.map((id) => <span className={`kd-badge ${id === "blacklist" ? "wf-overdue" : ""}`} key={id}>{id === "blacklist" ? "Чёрный список" : CLIENT_LABELS[id]}</span>)}
  </div>;
}
export function RegularClientRule({ value, onSave }) {
  const [draft, setDraft] = useState(regularThreshold(value));
  const [busy, setBusy] = useState(false);
  return <div className="wf-filters"><label>Постоянный после первичных заявок<input type="number" min="1" max="100" step="1" value={draft} onChange={(e) => setDraft(e.target.value)} /></label><button className="kd-btn ghost sm" disabled={busy || Number(draft) !== regularThreshold(draft)} onClick={async () => { setBusy(true); try { await onSave(Number(draft)); } finally { setBusy(false); } }}>Сохранить порог</button><small className="kd-muted">Только завершённые первичные. Вторичные и гарантии не учитываются.</small></div>;
}
