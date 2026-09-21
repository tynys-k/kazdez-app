const DAY_MS = 86400000;

export function subscriptionIntervalLabel(days) {
  const value = Number(days) || 0;
  const known = {
    7: "Еженедельно",
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

// Организационно-правовая форма в названии: «ТОО Посиделки», «ИП "GO BAR"».
// Только заглавные аббревиатуры и только отдельным словом, чтобы не ловить
// обычные слова внутри имени частного клиента.
const LEGAL_FORM_RE = /(^|[\s"'«(])(ТОО|ИП|АО|ООО|ТДО|LLP|ГККП|КГП|КГУ|РГП|РГУ)(?=$|[\s"'«».,)№])/;

export function looksLikeLegalName(name) {
  return LEGAL_FORM_RE.test(String(name || ""));
}

// Юрлицо — если так отмечено в общей базе клиентов или это видно по названию.
export function isLegalEntityJob(job, client) {
  if (client?.client_type === "company") return true;
  return [client?.legal_name, client?.name, job?.contact_name].some(looksLikeLegalName);
}

function clientResolver(clients = []) {
  const byId = new Map(clients.map((c) => [String(c.id), c]));
  const byPhone = new Map();
  clients.forEach((c) => { const key = c.phone_key || phoneKey(c.phone); if (key && !byPhone.has(key)) byPhone.set(key, c); });
  return (job) => (job?.client_id && byId.get(String(job.client_id))) || byPhone.get(phoneKey(job?.client_phone)) || null;
}

function contractMatcher(contracts = []) {
  const ids = new Set(contracts.map((c) => String(c.id)));
  const clientIds = new Set(contracts.filter((c) => c.client_id).map((c) => String(c.client_id)));
  const phones = new Set(contracts.map((c) => phoneKey(c.phone)).filter(Boolean));
  return (job, client) => !!((job?.service_contract_id && ids.has(String(job.service_contract_id)))
    || (client?.id && clientIds.has(String(client.id)))
    || (job?.client_id && clientIds.has(String(job.client_id)))
    || phones.has(phoneKey(job?.client_phone)));
}

// Заявка уже относится к абоненту (любому — активному или на паузе)?
export function subscriptionLookup(contracts = [], clients = []) {
  const clientOf = clientResolver(clients);
  const matches = contractMatcher(contracts);
  return (job) => matches(job, clientOf(job));
}

export function clientTypeLookup(clients = []) {
  const clientOf = clientResolver(clients);
  return (job) => (isLegalEntityJob(job, clientOf(job)) ? "company" : "person");
}

// Юрлица, у которых были выполненные заявки, но ещё нет абонентского договора.
// Группируем по клиенту, чтобы один ресторан с десятью выездами был одной строкой.
export function subscriptionCandidates({ jobs = [], clients = [], contracts = [] } = {}) {
  const clientOf = clientResolver(clients);
  const hasContract = contractMatcher(contracts);
  const groups = new Map();
  jobs.forEach((job) => {
    if (job?.status !== "done") return;
    const client = clientOf(job);
    if (!isLegalEntityJob(job, client) || hasContract(job, client)) return;
    const phone = phoneKey(job.client_phone);
    const key = client?.id ? `c:${client.id}` : phone ? `p:${phone}` : `j:${job.id}`;
    if (!groups.has(key)) groups.set(key, { key, client, jobs: [] });
    groups.get(key).jobs.push(job);
  });
  return [...groups.values()].map((group) => {
    const rows = group.jobs.sort((a, b) => String(b.scheduled_date || "").localeCompare(String(a.scheduled_date || "")));
    const last = rows[0];
    return {
      key: group.key,
      client: group.client,
      lastJob: last,
      name: group.client?.legal_name || group.client?.name || last.contact_name || last.client_phone || "Юрлицо",
      phone: last.client_phone || group.client?.phone || "",
      address: last.address || "",
      service: last.pest || "",
      lastDate: last.scheduled_date || "",
      done: rows.length,
      revenue: rows.reduce((sum, job) => sum + (Number(job.report_paid) || 0), 0),
    };
  }).sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)));
}

function addDaysIso(iso, days) {
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) ? new Date(time + days * DAY_MS).toISOString().slice(0, 10) : "";
}

// Черновик абонентского договора из последней выполненной заявки:
// следующий выезд — через месяц после неё, но не в прошлом.
export function contractDraftFromJob(job, client, todayIso = new Date().toISOString().slice(0, 10), intervalDays = 30) {
  const planned = job?.scheduled_date ? addDaysIso(job.scheduled_date, intervalDays) : "";
  return {
    client_id: client?.id || job?.client_id || null,
    client_name: client?.legal_name || client?.name || job?.contact_name || "",
    phone: job?.client_phone || client?.phone || "",
    address: job?.address || "",
    service: job?.pest || "",
    price: Number(job?.report_paid) || "",
    interval_days: intervalDays,
    next_service_date: planned && planned > todayIso ? planned : todayIso,
    note: job?.scheduled_date ? `Переведён в абоненты после выезда ${job.scheduled_date.split("-").reverse().join(".")}` : null,
  };
}
