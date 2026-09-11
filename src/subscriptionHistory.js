const DAY_MS = 86400000;

export function subscriptionIntervalLabel(days) {
  const value = Number(days) || 0;
  const known = {
    14: "Два раза в месяц",
    30: "Ежемесячно",
    60: "Раз в 2 месяца",
    90: "Ежеквартально",
    180: "Раз в полгода",
    365: "Ежегодно",
  };
  return known[value] || (value > 0 ? `Каждые ${value} дн.` : "Период не указан");
}

function phoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function contractJobs(contractOrId, jobs = []) {
  const contract = contractOrId && typeof contractOrId === "object" ? contractOrId : null;
  const contractId = contract?.id ?? contractOrId;
  const contractPhoneKey = phoneKey(contract?.phone);

  return jobs
    .filter((job) => {
      // New plan visits have a durable contract link. Historical jobs created
      // before the contract existed do not, so attach those by the same client
      // phone (normalised to the last 10 digits). A job explicitly linked to a
      // different contract must never leak into this history.
      if (job?.service_contract_id) {
        return String(job.service_contract_id) === String(contractId || "");
      }
      return !!contractPhoneKey && phoneKey(job?.client_phone) === contractPhoneKey;
    })
    .sort((a, b) => String(b.scheduled_date || b.created_at || "").localeCompare(String(a.scheduled_date || a.created_at || "")));
}

export function contractVisitState(job, todayIso = new Date().toISOString().slice(0, 10)) {
  if (job?.status === "done") return { kind: "done", label: "Выполнен" };
  if (job?.status === "canceled") return { kind: "canceled", label: "Отменён" };
  if (job?.scheduled_date && job.scheduled_date < todayIso) return { kind: "overdue", label: "Выезд просрочен" };
  return { kind: "planned", label: "Заявка создана" };
}

export function contractHistorySummary(contract, jobs = [], todayIso = new Date().toISOString().slice(0, 10)) {
  const rows = contractJobs(contract, jobs);
  const done = rows.filter((job) => job.status === "done");
  const active = rows.filter((job) => job.status !== "done" && job.status !== "canceled");
  const canceled = rows.filter((job) => job.status === "canceled");
  const overdue = active.filter((job) => job.scheduled_date && job.scheduled_date < todayIso);
  const nextCreated = [...active].sort((a, b) => String(a.scheduled_date || "9999").localeCompare(String(b.scheduled_date || "9999")))[0] || null;
  const currentCycleCreated = rows.some((job) => job.status !== "canceled" && String(job.contract_cycle_date || "") === String(contract?.next_service_date || ""));
  const dueWithoutJob = contract?.active !== false && !!contract?.next_service_date && contract.next_service_date <= todayIso && !currentCycleCreated;
  const dueDays = dueWithoutJob ? Math.max(0, Math.floor((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${contract.next_service_date}T00:00:00Z`)) / DAY_MS)) : 0;
  return {
    rows,
    total: rows.length,
    done: done.length,
    active: active.length,
    canceled: canceled.length,
    overdue: overdue.length,
    lastDone: done[0] || null,
    nextCreated,
    dueWithoutJob,
    dueDays,
    revenue: done.reduce((sum, job) => sum + (Number(job.report_paid) || 0), 0),
  };
}
