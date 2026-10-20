// Обзвон клиентов после выезда.
//
// Каждая выполненная первичная или вторичная заявка попадает в очередь
// обзвона, когда подходит срок звонка. Из очереди её убирает только итог
// разговора: посадили на повтор, всё хорошо, отказ, претензия или «не
// выходит на связь». «Не дозвонился» оставляет клиента в очереди — его
// наберут ещё раз, а число попыток видно в строке.

export const CALL_OUTCOMES = {
  no_answer: { label: "Не дозвонился", short: "не ответил", tone: "warning", closes: false },
  callback: { label: "Перезвонить позже", short: "перезвонить", tone: "info", closes: false },
  agreed: { label: "Посадил на вторичную", short: "согласился", tone: "positive", closes: true, rating: true },
  all_good: { label: "Всё хорошо, повтор не нужен", short: "всё хорошо", tone: "positive", closes: true, rating: true },
  declined: { label: "Отказался", short: "отказ", tone: "neutral", closes: true, needsNote: true, rating: true },
  complaint: { label: "Претензия", short: "претензия", tone: "danger", closes: true, needsNote: true, rating: true },
  unreachable: { label: "Не выходит на связь — закрыть", short: "недоступен", tone: "neutral", closes: true },
  note: { label: "Комментарий", short: "комментарий", tone: "neutral", closes: false, needsNote: true },
};

// После первичной продаём вторичную обработку, после вторичной проверяем
// результат — у «согласился» разный смысл.
export function outcomeLabel(outcome, stage) {
  if (outcome === "agreed" && stage === "after_secondary") return "Нужна ещё обработка — на повтор";
  return CALL_OUTCOMES[outcome]?.label || outcome;
}

export const CALL_STAGES = {
  after_primary: { label: "После первичной", afterDays: 5 },
  after_secondary: { label: "После вторичной", afterDays: 7 },
};

export const CLIENT_CALLS_MIGRATION = "2026-10-17_client_calls.sql";

export function callStageOf(job) {
  if (job?.type === "Первичная") return "after_primary";
  if (job?.type === "Вторичная" || job?.type === "Гарантийная") return "after_secondary";
  return "other";
}

const DAY = 86400000;
const isoDay = (value) => String(value || "").slice(0, 10);
export function addDaysIso(iso, days) {
  const d = new Date(`${isoDay(iso)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const phoneKey = (phone) => String(phone || "").replace(/\D/g, "").slice(-10);

// Дата выезда — от неё отсчитывается срок звонка.
export const doneDayOf = (job) => isoDay(job?.scheduled_date) || isoDay(job?.reported_at);

export const liveCalls = (calls = []) => calls.filter((c) => !c.deleted_at);
const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

export function callsForJob(calls, jobId) {
  return liveCalls(calls).filter((c) => String(c.job_id) === String(jobId)).sort(newestFirst);
}

export function callsForClient(calls, { clientId, phone, jobIds } = {}) {
  const key = phoneKey(phone);
  const ids = jobIds ? new Set([...jobIds].map(String)) : null;
  return liveCalls(calls)
    .filter((c) => (clientId && String(c.client_id) === String(clientId))
      || (key && phoneKey(c.client_phone) === key)
      || (ids && ids.has(String(c.job_id))))
    .sort(newestFirst);
}

// «У клиента уже есть следующая заявка». Строится один раз на очередь, а не
// перебором всех заявок для каждой строки.
export function buildLaterJobIndex(jobs = []) {
  const byClient = new Map(), byPhone = new Map(), repeats = new Set();
  const push = (map, key, day) => { if (key && day > (map.get(key) || "")) map.set(key, day); };
  for (const j of jobs) {
    if (j.status === "canceled") continue;
    if (j.repeat_of) repeats.add(String(j.repeat_of));
    const day = isoDay(j.scheduled_date || j.created_at);
    push(byClient, j.client_id ? String(j.client_id) : "", day);
    push(byPhone, phoneKey(j.client_phone), day);
  }
  return { byClient, byPhone, repeats };
}
function hasLaterJob(job, index) {
  if (index.repeats.has(String(job.id))) return true;
  const latest = job.client_id ? index.byClient.get(String(job.client_id)) : index.byPhone.get(phoneKey(job.client_phone));
  return !!latest && latest > isoDay(job.scheduled_date);
}

// Состояние обзвона одной заявки: нужно ли ещё звонить и почему.
export function callStateOf(job, { calls = [], ownCalls, legacy, jobs = [], laterIndex } = {}) {
  const stage = callStageOf(job);
  const own = ownCalls || callsForJob(calls, job.id);
  const decisive = own.filter((c) => c.outcome !== "note");
  const last = decisive[0] || null;
  const closingCall = own.find((c) => CALL_OUTCOMES[c.outcome]?.closes) || null;
  const attempts = decisive.filter((c) => c.outcome === "no_answer").length + (legacy?.result === "no_answer" ? 1 : 0);
  const doneDay = doneDayOf(job);
  const dueOn = stage === "other" ? "" : addDaysIso(doneDay, CALL_STAGES[stage].afterDays);

  let closedBy = "";
  if (closingCall) closedBy = "call";
  else if (job.repeat_state) closedBy = "repeat";
  else if (legacy && legacy.result !== "no_answer") closedBy = "quality";
  // Клиент уже записан на следующий выезд — звонить с вопросом «будем
  // делать вторичную?» поздно и неловко.
  else if (hasLaterJob(job, laterIndex || buildLaterJobIndex(jobs))) closedBy = "next_job";

  const callbackOn = last?.outcome === "callback" ? last.callback_on || "" : "";
  return { stage, calls: own, last, attempts, dueOn, doneDay, callbackOn, closed: !!closedBy, closedBy, closingCall, legacy: legacy || null };
}

export const CLOSED_BY_LABELS = {
  call: "обзвон закрыт",
  repeat: "в «Повторных выездах»",
  quality: "закрыт контролем качества",
  next_job: "уже есть следующая заявка",
};

// Очередь обзвона, разделённая по этапам.
//
// windowDays ограничивает давность: заявки, выполненные полгода назад и так
// никем не обзвоненные, превращаются в шум и прячут свежих клиентов.
export function buildCallQueue(jobs, { calls = [], qualityChecks = [], today, windowDays = 60 } = {}) {
  const todayIso = isoDay(today) || isoDay(new Date().toISOString());
  const oldest = windowDays ? addDaysIso(todayIso, -windowDays) : "";
  const result = { after_primary: [], after_secondary: [], later: [], upcoming: 0 };
  const laterIndex = buildLaterJobIndex(jobs);
  const legacyByJob = new Map(qualityChecks.map((q) => [String(q.job_id), q]));
  const callsByJob = new Map();
  for (const c of liveCalls(calls).sort(newestFirst)) {
    const key = String(c.job_id);
    if (!callsByJob.has(key)) callsByJob.set(key, []);
    callsByJob.get(key).push(c);
  }
  for (const job of jobs) {
    if (job.status !== "done") continue;
    const stage = callStageOf(job);
    if (stage === "other") continue;
    const doneDay = doneDayOf(job);
    if (!doneDay || (oldest && doneDay < oldest)) continue;
    const state = callStateOf(job, { ownCalls: callsByJob.get(String(job.id)) || [], legacy: legacyByJob.get(String(job.id)), laterIndex });
    if (state.closed) continue;
    if (state.dueOn > todayIso && !state.calls.length) { result.upcoming += 1; continue; }
    // После «не дозвонился» следующая попытка — не раньше завтрашнего дня,
    // иначе только что набранный клиент снова встаёт первым в списке.
    const retryOn = state.last?.outcome === "no_answer" ? addDaysIso(state.last.created_at, 1) : "";
    const item = { job, ...state, retryOn, nextOn: state.callbackOn || (retryOn > state.dueOn ? retryOn : state.dueOn) };
    if (state.callbackOn && state.callbackOn > todayIso) result.later.push(item);
    else result[stage].push(item);
  }
  const byNext = (a, b) => String(a.nextOn).localeCompare(String(b.nextOn)) || a.attempts - b.attempts;
  result.after_primary.sort(byNext);
  result.after_secondary.sort(byNext);
  result.later.sort(byNext);
  return result;
}

export const daysSinceIso = (iso, today = new Date()) => {
  const d = new Date(`${isoDay(iso)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((+today - +d) / DAY));
};

// Итог по заявке для журнала «Обзвонили»: закрывающий звонок важнее
// последующих комментариев, иначе — последний звонок по существу.
export const RESULT_FILTERS = [
  ["all", "Все"],
  ["agreed", "Посадили / на повтор"],
  ["all_good", "Всё хорошо"],
  ["declined", "Отказ"],
  ["complaint", "Претензия"],
  ["unreachable", "Недоступен"],
  ["pending", "Не дозвонились"],
];

export function resultOf(calls) {
  const closing = calls.find((c) => CALL_OUTCOMES[c.outcome]?.closes);
  if (closing) return closing.outcome;
  const decisive = calls.find((c) => c.outcome !== "note");
  return decisive ? "pending" : "note";
}

// Журнал обзвона, сгруппированный по заявке: кому звонили, что ответили и
// все комментарии. sinceIso отсекает заявки, по которым не звонили с этой даты.
export function buildCallJournal(jobs, calls, { sinceIso = "", stage = "all", result = "all", authorId = "" } = {}) {
  const jobById = new Map(jobs.map((j) => [String(j.id), j]));
  const byJob = new Map();
  for (const c of liveCalls(calls).sort(newestFirst)) {
    const key = String(c.job_id);
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key).push(c);
  }
  const all = [];
  for (const [jobId, own] of byJob) {
    const job = jobById.get(jobId) || null;
    const entryStage = own[0].stage || callStageOf(job);
    const lastAt = String(own[0].created_at || "");
    if (sinceIso && lastAt.slice(0, 10) < sinceIso) continue;
    if (authorId && !own.some((c) => String(c.created_by) === String(authorId))) continue;
    const rating = own.find((c) => c.rating)?.rating || null;
    all.push({ jobId, job, phone: job?.client_phone || own[0].client_phone, stage: entryStage, calls: own, result: resultOf(own), rating, lastAt });
  }
  const counts = { stage: { all: 0, after_primary: 0, after_secondary: 0 }, result: Object.fromEntries(RESULT_FILTERS.map(([id]) => [id, 0])) };
  const items = [];
  for (const e of all) {
    const stageOk = stage === "all" || e.stage === stage;
    const resultOk = result === "all" || e.result === result;
    if (resultOk) { counts.stage.all += 1; if (e.stage in counts.stage) counts.stage[e.stage] += 1; }
    if (stageOk) { counts.result.all += 1; if (e.result in counts.result) counts.result[e.result] += 1; }
    if (stageOk && resultOk) items.push(e);
  }
  items.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return { items, counts };
}
