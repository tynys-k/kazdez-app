import { clientJobs } from "../clientDirectory";
export const CLIENT_LABELS = { vip: "VIP", careful: "Особое внимание", government: "Госструктуры", regular: "Постоянный" };
export function regularThreshold(value) { const n = Number(value); return Number.isInteger(n) && n > 0 && n <= 100 ? n : 3; }
export function clientStatuses(client, jobs, threshold = 3) {
  const primary = clientJobs(client, jobs).filter((j) => j.status === "done" && j.type === "Первичная" && (!j.visit_kind || j.visit_kind === "primary") && (!j.visit_no || Number(j.visit_no) === 1));
  const labels = new Set((client.client_labels || []).filter((key) => CLIENT_LABELS[key]));
  if (primary.length >= regularThreshold(threshold)) labels.add("regular");
  return { primaryCount: primary.length, labels: [...(client.blocked ? ["blacklist"] : []), ...labels] };
}
