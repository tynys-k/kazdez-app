import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";

// ----------------------------- helpers -----------------------------
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ml2l = (ml) => Math.round(((Number(ml) || 0) / 1000) * 100) / 100;
const norm = (s) => (s || "").trim().toLowerCase();
const chemUnit = (kind) => (kind === "weight" ? { big: "кг", small: "г" } : { big: "л", small: "мл" });
function fmtAmount(amount, kind) {
  const u = chemUnit(kind); const a = Number(amount) || 0;
  if (a >= 1000) return `${Math.round((a / 1000) * 100) / 100} ${u.big}`;
  return `${Math.round(a)} ${u.small}`;
}
const lineAmount = (l) => Number(l.amount ?? l.ml) || 0;
const REPEAT_POLICIES = [
  { code: "half", label: "50% (стандарт)" },
  { code: "free", label: "Бесплатно" },
  { code: "full", label: "100% (как первичная)" },
  { code: "disc15", label: "Скидка 15%" },
  { code: "disc20", label: "Скидка 20%" },
];
const repeatLabel = (code) => (REPEAT_POLICIES.find((p) => p.code === code) || {}).label || "";
const DOC_TYPES = ["Договор", "Акт о дезработах", "Провести через фирму (АВР+ЭСФ)", "КП"];
const DOC_STATUS = { todo: { label: "В работе", color: "#2563EB", bg: "#EAF1FE" }, done: { label: "Сделано", color: "#B45309", bg: "#FCF1E2" }, paid: { label: "Оплачено", color: "#0E7C66", bg: "#E4F3EE" } };
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const isoToRu = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const daysSince = (ts) => (ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 0);
function parseIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0); return dt;
}
function periodRange(mode, offset) {
  if (mode === "all") return { start: -Infinity, end: Infinity, label: "Всё время" };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (mode === "week") {
    const diffToMon = (now.getDay() + 6) % 7;
    const start = new Date(now); start.setDate(now.getDate() - diffToMon + offset * 7);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    const last = new Date(start); last.setDate(start.getDate() + 6);
    const label = start.getMonth() === last.getMonth()
      ? `${start.getDate()}–${last.getDate()} ${MONTHS_GEN[start.getMonth()]}`
      : `${start.getDate()} ${MONTHS_GEN[start.getMonth()]} – ${last.getDate()} ${MONTHS_GEN[last.getMonth()]}`;
    return { start: start.getTime(), end: end.getTime(), label };
  }
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.getTime(), end: end.getTime(), label: `${MONTHS_NOM[start.getMonth()]} ${start.getFullYear()}` };
}

const STATUS = {
  new: { label: "Новая", color: "#2563EB", bg: "#EAF1FE" },
  assigned: { label: "Назначена", color: "#B45309", bg: "#FCF1E2" },
  done: { label: "Выполнена", color: "#0E7C66", bg: "#E4F3EE" },
};

function jobTime(j) { if (!j.scheduled_date) return Infinity; return new Date(`${j.scheduled_date}T${j.scheduled_time || "00:00"}`).getTime(); }
function dateGroupLabel(iso) {
  const date = parseIso(iso); if (!date) return "Без даты";
  const diff = Math.round((date.getTime() - todayStart()) / 86400000); const ru = isoToRu(iso);
  if (diff === 0) return `Сегодня · ${ru}`; if (diff === 1) return `Завтра · ${ru}`; if (diff === -1) return `Вчера · ${ru}`;
  return `${WEEKDAYS[date.getDay()]} · ${ru}`;
}
const isPast = (iso) => { const d = parseIso(iso); return d ? d.getTime() < todayStart() : false; };
function groupByDate(jobs) {
  const groups = [], idx = {};
  jobs.forEach((j) => {
    const key = j.scheduled_date || "—";
    if (idx[key] === undefined) { idx[key] = groups.length; groups.push({ key, label: dateGroupLabel(j.scheduled_date), past: isPast(j.scheduled_date), jobs: [] }); }
    groups[idx[key]].jobs.push(j);
  });
  return groups;
}
function buildMsg(job, header) {
  const brand = header || "KazDez";
  const line1 = job.type === "Осмотр" ? "Осмотр объекта" : `${job.type || "Первичная"} обработка`;
  const lines = [brand, line1, `Дата: ${isoToRu(job.scheduled_date)}`, `Время: ${job.scheduled_time || ""}`, `Адрес: ${job.address || ""}`];
  if (job.floor) lines.push(`Этаж: ${job.floor}`);
  if (job.area) lines.push(`Метраж: ${job.area} м²`);
  lines.push(`Вид: ${job.pest || ""}`);
  const prices = (job.price_options || []).filter((p) => p.amount);
  if (prices.length) {
    lines.push("Цена:");
    prices.forEach((p) => lines.push(`${fmt(p.amount)} теңге${p.label ? " - " + p.label : ""}`));
  }
  lines.push(`Номер телефона: ${job.client_phone || ""}`);
  if (job.type !== "Осмотр") lines.push(`Гарантия ${job.guarantee_months || 6} месяцев после вторичной (повторной обработки)`);
  return lines.join("\n");
}
function copyText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(onDone, onDone);
  else onDone && onDone();
}

// ----------------------------- root -----------------------------
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from("profiles").select("role, full_name").eq("id", session.user.id).single().then(({ data }) => setProfile(data));
  }, [session]);
  if (booting) return <div className="kd-center">Загрузка…</div>;
  if (!session) return <Login />;
  return <Dashboard session={session} profile={profile} />;
}

function Login() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault(); setLoading(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error) setErr("Неверная почта или пароль");
    setLoading(false);
  }
  return (
    <div className="kd-login">
      <form className="kd-login-card" onSubmit={submit}>
        <div className="kd-logo-big">KazDez</div>
        <div className="kd-login-sub">Вход в систему</div>
        <label className="kd-field"><span>Почта</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.kz" autoComplete="username" /></label>
        <label className="kd-field"><span>Пароль</span><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
        {err && <div className="kd-err">{err}</div>}
        <button className="kd-btn primary wide" disabled={loading || !email || !pass}>{loading ? "Входим…" : "Войти"}</button>
      </form>
    </div>
  );
}

// ----------------------------- dashboard -----------------------------
function Dashboard({ session, profile }) {
  const [jobs, setJobs] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [techs, setTechs] = useState([]);
  const [handouts, setHandouts] = useState([]);
  const [partners, setPartners] = useState([]);
  const [docs, setDocs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jobs");
  const [modal, setModal] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [pMode, setPMode] = useState("all");
  const [pOff, setPOff] = useState(0);
  const isAdmin = profile?.role === "admin";
  const actorName = profile?.full_name || (isAdmin ? "Админ" : session.user.email);

  function showToast(t) { setToast(t); setTimeout(() => setToast(""), 2200); }

  async function load() {
    setLoading(true);
    const [jr, cr, chr, ar, tr, pr, hr, ptr, dsr] = await Promise.all([
      supabase.from("jobs").select("*"),
      supabase.from("report_chemicals").select("*"),
      supabase.from("chemicals").select("*"),
      supabase.from("audit_log").select("*").order("ts", { ascending: false }),
      supabase.from("trash").select("*").order("deleted_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, phone, role"),
      supabase.from("handouts").select("*"),
      supabase.from("partners").select("*"),
      supabase.from("doc_services").select("*").order("created_at", { ascending: false }),
    ]);
    const chems = cr.data || [];
    setJobs((jr.data || []).map((j) => ({ ...j, chemicals: chems.filter((c) => c.job_id === j.id) })));
    setChemicals(chr.data || []);
    setAudit(ar.data || []);
    setTrash(tr.data || []);
    setTechs((pr.data || []).filter((p) => p.role === "tech"));
    setHandouts(hr.data || []);
    setPartners(ptr.data || []);
    setDocs(dsr.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function logAction(action, summary) {
    await supabase.from("audit_log").insert({ actor: actorName, actor_id: session.user.id, action, summary });
  }
  const chemById = (id) => chemicals.find((x) => x.id === id);
  const lineChem = (l) => (l.chemical_id ? chemById(l.chemical_id) : chemicals.find((x) => norm(x.name) === norm(l.name)));
  const jobChemCost = (job) => (job.chemicals || []).reduce((s, l) => { const c = lineChem(l); return s + lineAmount(l) * (c ? (Number(c.price_per_liter) || 0) / 1000 : 0); }, 0);
  function techLedger(techId) {
    const m = {};
    const get = (cid) => (m[cid] = m[cid] || { issued: 0, opening: 0, consumed: 0 });
    handouts.filter((h) => h.tech_id === techId).forEach((h) => { const g = get(h.chemical_id); if (h.kind === "opening") g.opening += Number(h.amount) || 0; else g.issued += Number(h.amount) || 0; });
    jobs.filter((j) => j.assigned_to === techId).forEach((j) => (j.chemicals || []).forEach((l) => { if (l.chemical_id) get(l.chemical_id).consumed += lineAmount(l); }));
    return Object.entries(m).map(([cid, v]) => { const c = chemById(cid); const received = v.issued + v.opening; return c ? { chem: c, ...v, received, balance: received - v.consumed } : null; }).filter(Boolean);
  }

  const techById = (id) => techs.find((t) => t.id === id);

  async function createJob(payload) {
    const { error } = await supabase.from("jobs").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Создание", `${payload.pest} · ${payload.address}`);
    setModal(null); showToast("Заявка создана"); load();
  }
  async function editJob(job, payload) {
    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Редактирование", `${payload.pest || job.pest} · ${payload.address || job.address}`);
    setModal(null); showToast("Заявка обновлена"); load();
  }
  async function putOnRepeat(job) {
    const { error } = await supabase.from("jobs").update({ repeat_state: "on_repeat", repeat_since: new Date().toISOString() }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Повтор", `На повтор · ${job.pest} · ${job.address}`);
    showToast("Заявка на повторе"); load();
  }
  async function saveRepeatNote(job, note) {
    const { error } = await supabase.from("jobs").update({ repeat_note: note }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    showToast("Заметка сохранена"); load();
  }
  async function finishRepeat(job) {
    const { error } = await supabase.from("jobs").update({ repeat_state: "finished" }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Повтор", `Завершена (отказ от повтора) · ${job.pest} · ${job.address}`);
    showToast("Заявка завершена"); load();
  }
  async function createRepeatJob(job) {
    const ins = await supabase.from("jobs").insert({
      type: "Вторичная", scheduled_date: null, scheduled_time: "", address: job.address, floor: job.floor,
      area: job.area, source: job.source, pest: job.pest, price_options: job.price_options,
      client_phone: job.client_phone, guarantee_months: job.guarantee_months, status: "new", created_by: session.user.id,
    });
    if (ins.error) { showToast("Ошибка: " + ins.error.message); return; }
    await supabase.from("jobs").update({ repeat_state: "finished" }).eq("id", job.id);
    await logAction("Повтор", `Создана повторная заявка · ${job.pest} · ${job.address}`);
    showToast("Повторная заявка создана"); load();
  }
  async function assignJob(job, techId) {
    const newStatus = job.status === "done" ? "done" : (techId ? "assigned" : "new");
    const { error } = await supabase.from("jobs").update({ assigned_to: techId, status: newStatus }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    const from = job.assigned_to ? (techById(job.assigned_to)?.full_name || "—") : "—";
    const to = techId ? (techById(techId)?.full_name || "—") : "не назначен";
    await logAction("Назначение", `${job.pest} · ${from} → ${to}`);
    setModal(null); showToast("Дезинфектор назначен"); load();
  }
  async function submitReport(job, report, chems, docs) {
    const { error } = await supabase.rpc("submit_report", {
      p_job: job.id, p_cash: report.cash, p_qr: report.qr, p_note: report.note,
      p_chems: chems,
      p_fu_wanted: report.followUp.wanted, p_fu_date: report.followUp.date, p_fu_note: report.followUp.note,
      p_docs_needed: docs.needed, p_docs_avr: docs.avr, p_docs_dogovor: docs.dogovor, p_docs_note: docs.note,
    });
    if (error) { showToast("Ошибка: " + error.message); return; }
    setModal(null); showToast("Отчёт сохранён"); load();
  }
  async function deleteJob(job) {
    await supabase.from("trash").insert({ deleted_by: actorName, deleted_by_id: session.user.id, job: { ...job } });
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Удаление", `${job.pest} · ${job.address}`);
    showToast("Заявка в корзине"); load();
  }
  async function restore(row) {
    const j = row.job; const chems = j.chemicals || []; const { chemicals: _c, ...jobRow } = j;
    const { error } = await supabase.from("jobs").insert(jobRow);
    if (error) { showToast("Ошибка: " + error.message); return; }
    if (chems.length) await supabase.from("report_chemicals").insert(chems.map((c) => ({ job_id: j.id, chemical_id: c.chemical_id || null, name: c.name, amount: c.amount ?? c.ml, ml: c.ml ?? c.amount })));
    await supabase.from("trash").delete().eq("id", row.id);
    await logAction("Восстановление", `${j.pest} · ${j.address}`);
    showToast("Заявка восстановлена"); load();
  }
  async function purge(row) {
    await supabase.from("trash").delete().eq("id", row.id);
    await logAction("Удалено навсегда", `${row.job.pest} · ${row.job.address}`);
    showToast("Удалено навсегда"); load();
  }
  async function addChem(c) {
    const { error } = await supabase.from("chemicals").insert(c);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Склад", `Новый препарат: ${c.name} (${fmtAmount(c.purchased_ml, c.unit_kind)})`);
    setModal(null); showToast("Препарат добавлен"); load();
  }
  async function stockIn(chem, addMl, newPrice) {
    const patch = { purchased_ml: (Number(chem.purchased_ml) || 0) + addMl };
    if (newPrice != null) patch.price_per_liter = newPrice;
    const { error } = await supabase.from("chemicals").update(patch).eq("id", chem.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Склад", `Приход: ${chem.name} +${fmtAmount(addMl, chem.unit_kind)}`);
    setModal(null); showToast("Приход оформлен"); load();
  }
  async function removeChem(chem) {
    await supabase.from("chemicals").delete().eq("id", chem.id);
    await logAction("Склад", `Удалён препарат: ${chem.name}`);
    showToast("Препарат удалён"); load();
  }
  async function addHandout(payload) {
    const { error } = await supabase.from("handouts").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    const t = techById(payload.tech_id); const c = chemById(payload.chemical_id);
    const kindLabel = payload.kind === "opening" ? "стартовый остаток" : "выдача";
    await logAction("Выдача", `${t?.full_name || "?"} · ${c?.name || "?"} +${fmtAmount(payload.amount, c?.unit_kind)} (${kindLabel})`);
    setModal(null); showToast("Записано"); load();
  }
  const partnerById = (id) => partners.find((p) => p.id === id);
  function brandHeaderOf(job) {
    if (job.brand === "Sanitex") return "Sanitex";
    if (job.brand === "partner") return partnerById(job.partner_id)?.name || "KazDez";
    return "KazDez";
  }
  const partnerShareAmt = (job) => (job.partner_id && job.status === "done" ? Math.round((Number(job.report_paid) || 0) * (Number(job.partner_share) || 0) / 100) : 0);
  async function savePartner(payload, existing) {
    const res = existing
      ? await supabase.from("partners").update(payload).eq("id", existing.id)
      : await supabase.from("partners").insert(payload);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Партнёр", `${existing ? "Изменён" : "Добавлен"}: ${payload.name} (${payload.default_share}%)`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removePartner(p) {
    await supabase.from("partners").delete().eq("id", p.id);
    await logAction("Партнёр", `Удалён: ${p.name}`);
    showToast("Партнёр удалён"); load();
  }
  async function markPartnerPaid(job, paid) {
    const { error } = await supabase.from("jobs").update({ partner_paid: paid, partner_paid_at: paid ? new Date().toISOString() : null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Выплата партнёру", `${partnerById(job.partner_id)?.name || "?"} · ${fmt(partnerShareAmt(job))} ₸ · ${paid ? "выплачено" : "отменено"}`);
    showToast(paid ? "Отмечено как выплачено" : "Отметка снята"); load();
  }
  async function saveDoc(payload, existing) {
    const res = existing ? await supabase.from("doc_services").update(payload).eq("id", existing.id) : await supabase.from("doc_services").insert({ ...payload, created_by: session.user.id });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Документы", `${existing ? "Изменено" : "Добавлено"}: ${payload.type} · ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function setDocStatus(d, status) {
    const { error } = await supabase.from("doc_services").update({ status }).eq("id", d.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Документы", `${d.type} · ${DOC_STATUS[status]?.label || status}`);
    showToast("Статус обновлён"); load();
  }
  async function removeDoc(d) {
    await supabase.from("doc_services").delete().eq("id", d.id);
    await logAction("Документы", `Удалено: ${d.type} · ${fmt(d.amount)} ₸`);
    showToast("Удалено"); load();
  }

  function exportExcel() {
    try {
      const wb = XLSX.utils.book_new();
      const jobsRows = jobs.map((j) => ({
        "Дата": isoToRu(j.scheduled_date), "Время": j.scheduled_time, "Бренд": j.brand === "partner" ? "Партнёр" : j.brand, "Тип": j.type, "Вид": j.pest,
        "Партнёр": j.partner_id ? (partnerById(j.partner_id)?.name || "") : "", "Доля %": j.partner_id ? (j.partner_share ?? "") : "",
        "Доля ₸": partnerShareAmt(j) || "", "Доля выплачена": j.partner_id && j.status === "done" ? (j.partner_paid ? "да" : "нет") : "",
        "Адрес": j.address, "Этаж": j.floor, "Метраж (м²)": j.area, "Источник": j.source,
        "Телефон": j.client_phone, "Гарантия (мес)": j.guarantee_months,
        "Дезинфектор": techById(j.assigned_to)?.full_name || "",
        "Статус": (STATUS[j.status] && STATUS[j.status].label) || j.status,
        "Цена (варианты)": (j.price_options || []).map((p) => `${p.amount}${p.label ? " " + p.label : ""}`).join("; "),
        "Оплачено": j.report_paid ?? "", "Наличными": j.report_cash ?? "", "QR": j.report_qr ?? "", "Способ": j.report_method ?? "",
        "Себестоимость преп.": j.status === "done" ? Math.round(jobChemCost(j)) : "",
        "Прибыль (за вычетом доли)": j.status === "done" ? Math.round((Number(j.report_paid) || 0) - jobChemCost(j) - partnerShareAmt(j)) : "",
        "Препараты": (j.chemicals || []).map((l) => { const c = lineChem(l); return `${l.name || (c && c.name) || ""} ${fmtAmount(lineAmount(l), c && c.unit_kind)}`; }).join("; "),
        "Комментарий к заявке": j.note ?? "",
        "Примечание оплаты": j.report_note ?? "",
        "Повторный": j.followup_wanted ? `${j.followup_date || "да"}${j.followup_note ? " — " + j.followup_note : ""}` : "",
        "Документы": j.docs_needed ? `${[j.docs_avr && "АВР", j.docs_dogovor && "Договор"].filter(Boolean).join(", ") || "да"}${j.docs_done ? " (готовы)" : " (ожидают)"}` : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobsRows.length ? jobsRows : [{}]), "Заявки");

      const stockRows = chemicals.map((c) => {
        const u = chemUnit(c.unit_kind);
        const used = jobs.reduce((s, j) => s + (j.chemicals || []).filter((x) => (x.chemical_id ? x.chemical_id === c.id : norm(x.name) === norm(c.name))).reduce((a, x) => a + lineAmount(x), 0), 0);
        const remaining = (Number(c.purchased_ml) || 0) - used;
        return { "Препарат": c.name, "Единица": u.big + "/" + u.small, "Куплено": fmtAmount(c.purchased_ml, c.unit_kind), "Ушло": fmtAmount(used, c.unit_kind), "Остаток": fmtAmount(remaining, c.unit_kind), ["Цена (₸/" + u.big + ")"]: c.price_per_liter, "Стоимость остатка (₸)": Math.round(remaining * ((Number(c.price_per_liter) || 0) / 1000)) };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows.length ? stockRows : [{}]), "Склад");

      const techRows = techs.map((t) => ({ "Имя": t.full_name, "Телефон": t.phone, "Заявок": jobs.filter((j) => j.assigned_to === t.id).length }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(techRows.length ? techRows : [{}]), "Дезинфекторы");

      const ledgerRows = [];
      techs.forEach((t) => techLedger(t.id).forEach((r) => ledgerRows.push({
        "Сотрудник": t.full_name, "Препарат": r.chem.name,
        "Выдано": fmtAmount(r.issued, r.chem.unit_kind), "Стартовый остаток": fmtAmount(r.opening, r.chem.unit_kind),
        "Расход": fmtAmount(r.consumed, r.chem.unit_kind), "На руках": fmtAmount(r.balance, r.chem.unit_kind),
      })));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledgerRows.length ? ledgerRows : [{}]), "Учёт по сотрудникам");

      const logRows = audit.map((a) => ({ "Когда": fmtTs(a.ts), "Кто": a.actor, "Действие": a.action, "Детали": a.summary }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows.length ? logRows : [{}]), "Журнал");

      const trashRows = trash.map((t) => ({ "Удалено": fmtTs(t.deleted_at), "Кем": t.deleted_by, "Вид": t.job.pest, "Адрес": t.job.address, "Было оплачено": t.job.report_paid ?? "" }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trashRows.length ? trashRows : [{}]), "Корзина");

      const docRows = docs.map((d) => ({
        "Тип": d.type, "Партнёр": d.partner_id ? (partnerById(d.partner_id)?.name || "") : "", "Клиент": d.client || "",
        "Расчёт": d.amount_mode === "percent" ? `${d.percent}% от ${d.base_sum}` : "сумма",
        "Заработок ₸": d.amount, "Статус": (DOC_STATUS[d.status] || {}).label || d.status, "Заметка": d.note || "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docRows.length ? docRows : [{}]), "Документы");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `KazDez_база_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      showToast("Файл Excel выгружен");
    } catch (e) { showToast("Ошибка выгрузки"); }
  }

  // ---- финансы за период ----
  const range = periodRange(pMode, pOff);
  const fin = (() => {
    const weekIdx = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const week = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: WEEKDAYS[dow].slice(0, 2), count: 0, revenue: 0 }));
    let revenue = 0, cost = 0, cash = 0, qr = 0, partnerShares = 0; const bySource = {};
    jobs.forEach((j) => {
      const dt = parseIso(j.scheduled_date);
      const inR = pMode === "all" || (dt && dt.getTime() >= range.start && dt.getTime() < range.end);
      if (!inR) return;
      const src = j.source || "Не указан";
      if (!bySource[src]) bySource[src] = { count: 0, revenue: 0 };
      bySource[src].count++;
      if (j.status === "done") {
        const paid = Number(j.report_paid) || 0;
        revenue += paid; cost += jobChemCost(j); cash += Number(j.report_cash) || 0; qr += Number(j.report_qr) || 0;
        partnerShares += partnerShareAmt(j);
        bySource[src].revenue += paid;
        if (dt) { const wi = weekIdx[dt.getDay()]; week[wi].count++; week[wi].revenue += paid; }
      }
    });
    const weekMax = Math.max(1, ...week.map((w) => w.revenue));
    return { revenue, cost, partnerShares, profit: revenue - cost - partnerShares, cash, qr, bySource, week, weekMax };
  })();

  // ---- склад ----
  const inventory = chemicals.map((c) => {
    const used = jobs.reduce((s, j) => s + (j.chemicals || []).filter((x) => (x.chemical_id ? x.chemical_id === c.id : norm(x.name) === norm(c.name))).reduce((a, x) => a + lineAmount(x), 0), 0);
    const remaining = (Number(c.purchased_ml) || 0) - used;
    return { ...c, used, remaining, low: remaining <= (Number(c.min_ml) || 0), stockValue: remaining * ((Number(c.price_per_liter) || 0) / 1000) };
  });
  const lowCount = inventory.filter((i) => i.low).length;

  const activeJobs = jobs.filter((j) => j.status !== "done");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  function matchSearch(j) {
    if (!q) return true;
    const phoneDigits = (j.client_phone || "").replace(/\D/g, "");
    if (qDigits && phoneDigits.includes(qDigits)) return true;
    return norm(j.address).includes(q) || norm(j.pest).includes(q) || norm(j.client_phone).includes(q);
  }
  const statusMatched = statusFilter === "all" ? activeJobs : activeJobs.filter((j) => j.status === statusFilter);
  const filteredActive = statusMatched.filter(matchSearch);
  const sorted = [...filteredActive].sort((a, b) => jobTime(a) - jobTime(b));
  const groups = groupByDate(sorted);
  const doneFiltered = doneJobs.filter(matchSearch);
  const doneSorted = [...doneFiltered].sort((a, b) => new Date(b.reported_at || b.scheduled_date || 0) - new Date(a.reported_at || a.scheduled_date || 0));
  const doneGroups = groupByDate(doneSorted);
  const tabs = isAdmin ? [
    { id: "jobs", label: `Заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "done", label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
    { id: "repeats", label: `Повторы${jobs.filter((j) => j.repeat_state === "on_repeat").length ? " · " + jobs.filter((j) => j.repeat_state === "on_repeat").length : ""}` },
    { id: "finance", label: "Финансы" },
    { id: "stock", label: `Склад${lowCount ? " · " + lowCount + " мало" : ""}` },
    { id: "team", label: "Дезинфекторы" },
    { id: "partners", label: "Партнёры" },
    { id: "docs", label: "Документы" },
    { id: "journal", label: "Журнал" },
    { id: "trash", label: `Корзина${trash.length ? " · " + trash.length : ""}` },
  ] : [
    { id: "jobs", label: `Мои заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "done", label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
  ];

  return (
    <div className="kd-app">
      <header className="kd-top">
        <div className="kd-brand">
          <div className="kd-logo">KD</div>
          <div><div className="kd-brand-name">KazDez</div><div className="kd-brand-sub">{isAdmin ? "Админ" : "Дезинфектор"} · {actorName}</div></div>
        </div>
        <button className="kd-btn ghost" onClick={() => supabase.auth.signOut()}>Выйти</button>
      </header>

      <main className="kd-main">
        <div className="kd-tabbar">
          <div className="kd-tabs">
            {tabs.map((t) => (<button key={t.id} className={`kd-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>))}
          </div>
          <div className="kd-tabactions">
            {tab === "jobs" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "new" })}>+ Новая заявка</button>}
            {tab === "stock" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "addchem" })}>+ Препарат</button>}
            {tab === "partners" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "partner" })}>+ Партнёр</button>}
            {tab === "docs" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "doc" })}>+ Документ</button>}
            {isAdmin && <button className="kd-btn ghost" onClick={exportExcel}>Выгрузить в Excel</button>}
          </div>
        </div>

        {loading && <div className="kd-empty">Загрузка…</div>}

        {!loading && (tab === "jobs" || tab === "done") && (
          <div className="kd-searchbar">
            <input className="kd-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по телефону, адресу или виду вредителя…" />
            {search && <button className="kd-x" onClick={() => setSearch("")}>✕</button>}
          </div>
        )}

        {!loading && tab === "jobs" && (
          <>
            {isAdmin && (
              <div className="kd-seg" style={{ marginBottom: 14 }}>
                {[{ id: "all", label: "Все" }, { id: "new", label: "Новые" }, { id: "assigned", label: "Назначены" }].map((s) => (
                  <button key={s.id} className={`kd-segbtn ${statusFilter === s.id ? "on" : ""}`} onClick={() => setStatusFilter(s.id)}>{s.label}</button>
                ))}
              </div>
            )}
            {filteredActive.length === 0 ? <div className="kd-empty">{activeJobs.length === 0 ? "Активных заявок нет — все выполнены. Загляни во вкладку «Выполненные»." : "По этому фильтру ничего не найдено."}</div> :
              groups.map((g) => (
                <div key={g.key} className="kd-group">
                  <div className={`kd-datehead ${g.past ? "past" : ""}`}><span>{g.label}</span><span className="kd-datecount">{g.jobs.length}</span></div>
                  <div className="kd-list">
                    {g.jobs.map((j) => (
                      <JobCard key={j.id} job={j} isAdmin={isAdmin} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerById(j.partner_id)?.name} partnerRepeat={j.brand === "partner" ? repeatLabel(partnerById(j.partner_id)?.repeat_policy) : ""}
                        onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                        onReport={() => setModal({ kind: "report", job: j })}
                        onAssign={() => setModal({ kind: "assign", job: j })}
                        onView={() => setModal({ kind: "view", job: j })}
                        onEdit={() => setModal({ kind: "edit", job: j })}
                        onRepeat={() => putOnRepeat(j)}
                        onPayPartner={(paid) => markPartnerPaid(j, paid)}
                        onHistory={() => setModal({ kind: "history", job: j })}
                        onDelete={() => deleteJob(j)} />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {!loading && tab === "done" && (
          doneFiltered.length === 0 ? <div className="kd-empty">{doneJobs.length === 0 ? "Выполненных заявок пока нет." : "По этому поиску ничего не найдено."}</div> :
            doneGroups.map((g) => (
              <div key={g.key} className="kd-group">
                <div className="kd-datehead"><span>{g.label}</span><span className="kd-datecount">{g.jobs.length}</span></div>
                <div className="kd-list">
                  {g.jobs.map((j) => (
                    <JobCard key={j.id} job={j} isAdmin={isAdmin} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerById(j.partner_id)?.name} partnerRepeat={j.brand === "partner" ? repeatLabel(partnerById(j.partner_id)?.repeat_policy) : ""}
                      onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                      onReport={() => setModal({ kind: "report", job: j })}
                      onAssign={() => setModal({ kind: "assign", job: j })}
                      onView={() => setModal({ kind: "view", job: j })}
                      onEdit={() => setModal({ kind: "edit", job: j })}
                      onRepeat={() => putOnRepeat(j)}
                      onPayPartner={(paid) => markPartnerPaid(j, paid)}
                      onHistory={() => setModal({ kind: "history", job: j })}
                      onDelete={() => deleteJob(j)} />
                  ))}
                </div>
              </div>
            ))
        )}

        {!loading && tab === "repeats" && (
          <div className="kd-list">
            {jobs.filter((j) => j.repeat_state === "on_repeat").length === 0 &&
              <div className="kd-empty">На повторе пока никого нет. Выполненную заявку можно отправить сюда кнопкой «На повтор».</div>}
            {jobs.filter((j) => j.repeat_state === "on_repeat")
              .sort((a, b) => new Date(a.repeat_since || 0) - new Date(b.repeat_since || 0))
              .map((j) => (
                <RepeatCard key={j.id} job={j} onSaveNote={saveRepeatNote} onCreate={createRepeatJob} onFinish={finishRepeat}
                  repeatHint={j.brand === "partner" && partnerById(j.partner_id) ? `Повтор у партнёра ${partnerById(j.partner_id).name}: ${repeatLabel(partnerById(j.partner_id).repeat_policy)}` : "Повтор: 50% от первичной (стандарт)"} />
              ))}
          </div>
        )}

        {!loading && tab === "finance" && (
          <>
            <div className="kd-periodbar">
              <div className="kd-seg">
                {[{ id: "all", label: "Всё время" }, { id: "week", label: "Неделя" }, { id: "month", label: "Месяц" }].map((p) => (
                  <button key={p.id} className={`kd-segbtn ${pMode === p.id ? "on" : ""}`} onClick={() => { setPMode(p.id); setPOff(0); }}>{p.label}</button>
                ))}
              </div>
              {pMode !== "all" && (
                <div className="kd-pernav">
                  <button className="kd-arrow" onClick={() => setPOff(pOff - 1)}>‹</button>
                  <span className="kd-perlabel">{range.label}</span>
                  <button className="kd-arrow" disabled={pOff >= 0} onClick={() => setPOff(pOff + 1)}>›</button>
                </div>
              )}
            </div>
            <div className="kd-twocol">
              <div className="kd-card">
                <div className="kd-section">Итоги · {range.label}</div>
                <div className="kd-row"><span>Выручка</span><strong>{fmt(fin.revenue)} ₸</strong></div>
                <div className="kd-row"><span>· наличными</span><span className="kd-muted">{fmt(fin.cash)} ₸</span></div>
                <div className="kd-row"><span>· QR / переводом</span><span className="kd-muted">{fmt(fin.qr)} ₸</span></div>
                <div className="kd-row"><span>Себестоимость препаратов</span><strong style={{ color: "#B42318" }}>− {fmt(fin.cost)} ₸</strong></div>
                <div className="kd-row"><span>Доли партнёров</span><strong style={{ color: "#B42318" }}>− {fmt(fin.partnerShares)} ₸</strong></div>
                <div className="kd-row total"><span>Прибыль</span><strong style={{ color: "#0E7C66" }}>{fmt(fin.profit)} ₸</strong></div>
              </div>
              <div className="kd-card">
                <div className="kd-section">Источники клиентов</div>
                {Object.keys(fin.bySource).length === 0 && <div className="kd-muted">За период заявок нет.</div>}
                {Object.entries(fin.bySource).sort((a, b) => b[1].count - a[1].count).map(([src, v]) => (
                  <div className="kd-row" key={src}><span>{src}</span><span className="kd-twoval"><em>{v.count} заявок</em><strong>{fmt(v.revenue)} ₸</strong></span></div>
                ))}
              </div>
            </div>
            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">По дням недели · {range.label}</div>
              {fin.week.map((w) => (
                <div className="kd-weekrow" key={w.dow}>
                  <span className="kd-weekday">{w.label}</span>
                  <div className="kd-weekbar"><div className="kd-weekfill" style={{ width: `${Math.round((w.revenue / fin.weekMax) * 100)}%` }} /></div>
                  <span className="kd-weekcount">{w.count} зав.</span>
                  <strong className="kd-weeksum">{fmt(w.revenue)} ₸</strong>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && tab === "stock" && (
          <div className="kd-list">
            {inventory.length === 0 && <div className="kd-empty">Склад пуст. Добавь препарат через «+ Препарат».</div>}
            {inventory.map((c) => (
              <div key={c.id} className={`kd-card ${c.low ? "low" : ""}`}>
                <div className="kd-card-head">
                  <div className="kd-pest">{c.name}{c.low && <span className="kd-lowtag">мало</span>}</div>
                  <span className="kd-muted">{fmt(c.price_per_liter)} ₸/{chemUnit(c.unit_kind).big}</span>
                </div>
                <div className="kd-stockgrid">
                  <div><span>Куплено</span><strong>{fmtAmount(c.purchased_ml, c.unit_kind)}</strong></div>
                  <div><span>Ушло</span><strong>{fmtAmount(c.used, c.unit_kind)}</strong></div>
                  <div><span>Остаток</span><strong style={{ color: c.low ? "#B42318" : "var(--primary)" }}>{fmtAmount(c.remaining, c.unit_kind)}</strong></div>
                  <div><span>Стоимость остатка</span><strong>{fmt(c.stockValue)} ₸</strong></div>
                </div>
                {isAdmin && (
                  <div className="kd-actions">
                    <button className="kd-btn primary sm" onClick={() => setModal({ kind: "stockin", chem: c })}>+ Приход</button>
                    <button className="kd-btn ghost danger sm" onClick={() => removeChem(c)}>Удалить</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "team" && (
          <div className="kd-list">
            <div className="kd-empty" style={{ textAlign: "left" }}>
              Чтобы добавить дезинфектора: в Supabase → Authentication → Add user (как создавал свой аккаунт, с галочкой Auto Confirm).
              Новый пользователь сам появится здесь как дезинфектор.
            </div>
            {techs.map((t) => {
              const cnt = jobs.filter((j) => j.assigned_to === t.id).length;
              const ledger = techLedger(t.id);
              return (
                <div key={t.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-tech-row">
                      <div className="kd-tech-avatar">{(t.full_name || "?").slice(0, 1)}</div>
                      <div>
                        <div className="kd-tech-name">{t.full_name || "(без имени)"}</div>
                        <div className="kd-muted">{t.phone || "—"} · заявок: {cnt}</div>
                      </div>
                    </div>
                    <button className="kd-btn primary sm" onClick={() => setModal({ kind: "handout", tech: t })}>Выдать / остаток</button>
                  </div>
                  {ledger.length === 0
                    ? <div className="kd-muted" style={{ marginTop: 8 }}>Препараты этому сотруднику ещё не выдавались.</div>
                    : (
                      <div className="kd-ledger">
                        <div className="kd-ledgerhead"><span>Препарат</span><span>Выдано</span><span>Расход</span><span>На руках</span></div>
                        {ledger.map((r) => (
                          <div className="kd-ledgerrow" key={r.chem.id}>
                            <span className="kd-ledgername">{r.chem.name}</span>
                            <span>{fmtAmount(r.received, r.chem.unit_kind)}</span>
                            <span>{fmtAmount(r.consumed, r.chem.unit_kind)}</span>
                            <strong style={{ color: r.balance < 0 ? "#B42318" : "var(--primary)" }}>{fmtAmount(r.balance, r.chem.unit_kind)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "partners" && (
          <div className="kd-list">
            {partners.length === 0 && <div className="kd-empty">Партнёров пока нет. Добавь через «+ Партнёр» — имя, долю в % и правило цены повтора.</div>}
            {partners.map((p) => {
              const pj = jobs.filter((j) => j.partner_id === p.id);
              const cnt = pj.length;
              const owed = pj.filter((j) => j.status === "done" && !j.partner_paid).reduce((s, j) => s + partnerShareAmt(j), 0);
              const paidOut = pj.filter((j) => j.status === "done" && j.partner_paid).reduce((s, j) => s + partnerShareAmt(j), 0);
              return (
                <div key={p.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{p.name}</div>
                    <span className="kd-badge" style={{ color: "#7C3AED", background: "#F1ECFE" }}>доля {p.default_share}%</span>
                  </div>
                  <div className="kd-meta">
                    <span>Повтор: {repeatLabel(p.repeat_policy) || "не задан"}</span>
                    <span>·</span><span>заявок: {cnt}</span>
                  </div>
                  <div className="kd-card-foot">
                    <span className="kd-muted" style={{ color: owed > 0 ? "#B42318" : undefined, fontWeight: owed > 0 ? 700 : 400 }}>К выплате: {fmt(owed)} ₸</span>
                    <span className="kd-muted paid">Выплачено: {fmt(paidOut)} ₸</span>
                  </div>
                  {isAdmin && (
                    <div className="kd-actions">
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "partner", partner: p })}>Изменить</button>
                      <button className="kd-btn ghost danger sm" onClick={() => removePartner(p)}>Удалить</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "docs" && (() => {
          const total = docs.reduce((s, d) => s + (Number(d.amount) || 0), 0);
          const paid = docs.filter((d) => d.status === "paid").reduce((s, d) => s + (Number(d.amount) || 0), 0);
          const pending = total - paid;
          return (
            <div className="kd-list">
              <div className="kd-card">
                <div className="kd-section">Отдельный отчёт по документам (не входит в заработок команды)</div>
                <div className="kd-row"><span>Всего начислено</span><strong>{fmt(total)} ₸</strong></div>
                <div className="kd-row"><span>Оплачено</span><strong style={{ color: "#0E7C66" }}>{fmt(paid)} ₸</strong></div>
                <div className="kd-row total"><span>Ожидает оплаты</span><strong style={{ color: pending > 0 ? "#B42318" : undefined }}>{fmt(pending)} ₸</strong></div>
              </div>
              {docs.length === 0 && <div className="kd-empty">Записей пока нет. Добавь через «+ Документ»: тип, клиент, сумму или % от суммы клиента.</div>}
              {docs.map((d) => {
                const stt = DOC_STATUS[d.status] || DOC_STATUS.todo;
                return (
                  <div key={d.id} className="kd-card">
                    <div className="kd-card-head">
                      <div className="kd-pest">{d.type}</div>
                      <span className="kd-badge" style={{ color: stt.color, background: stt.bg }}>{stt.label}</span>
                    </div>
                    <div className="kd-meta">
                      {d.partner_id && <span>{partnerById(d.partner_id)?.name || "партнёр"}</span>}
                      {d.partner_id && <span>·</span>}
                      <span>{d.client || "без описания"}</span>
                      {d.amount_mode === "percent" && <><span>·</span><span>{d.percent}% от {fmt(d.base_sum)} ₸</span></>}
                    </div>
                    <div className="kd-card-foot"><strong>{fmt(d.amount)} ₸</strong>{d.note && <span className="kd-muted">{d.note}</span>}</div>
                    <div className="kd-actions">
                      {d.status !== "done" && <button className="kd-btn ghost sm" onClick={() => setDocStatus(d, "done")}>Сделано</button>}
                      {d.status !== "paid" && <button className="kd-btn primary sm" onClick={() => setDocStatus(d, "paid")}>Оплачено</button>}
                      {d.status === "paid" && <button className="kd-btn ghost sm" onClick={() => setDocStatus(d, "done")}>Снять оплату</button>}
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "doc", doc: d })}>Изменить</button>
                      <button className="kd-btn ghost danger sm" onClick={() => removeDoc(d)}>Удалить</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {!loading && tab === "journal" && (
          <div className="kd-card">
            {audit.length === 0 && <div className="kd-muted">Пока нет записей.</div>}
            {audit.map((a) => (
              <div key={a.id} className="kd-logrow">
                <span className="kd-logwhen">{fmtTs(a.ts)}</span>
                <span className={`kd-actor ${a.actor === "Админ" ? "admin" : ""}`}>{a.actor}</span>
                <span className="kd-logaction">{a.action}</span>
                <span className="kd-logsum">{a.summary}</span>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "trash" && (
          <div className="kd-list">
            {trash.length === 0 && <div className="kd-empty">Корзина пуста. Удалённые заявки можно восстановить отсюда.</div>}
            {trash.map((row) => (
              <div key={row.id} className="kd-card">
                <div className="kd-card-head"><div className="kd-pest">{row.job.pest}</div><span className="kd-muted">удалено {fmtTs(row.deleted_at)}</span></div>
                <div className="kd-addr">{row.job.address}</div>
                <div className="kd-card-foot"><span className="kd-muted">Удалил: {row.deleted_by}</span>
                  {row.job.report_paid != null && <span className="kd-muted">Было оплачено: {fmt(row.job.report_paid)} ₸</span>}</div>
                <div className="kd-actions">
                  <button className="kd-btn primary sm" onClick={() => restore(row)}>Восстановить</button>
                  <button className="kd-btn ghost danger sm" onClick={() => purge(row)}>Удалить навсегда</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal?.kind === "new" && <JobFormModal title="Новая заявка" submitLabel="Создать" partners={partners} onClose={() => setModal(null)} onSave={createJob} />}
      {modal?.kind === "edit" && <JobFormModal title="Изменить заявку" submitLabel="Сохранить" keepStatus partners={partners} initial={jobToForm(modal.job)} onClose={() => setModal(null)} onSave={(payload) => editJob(modal.job, payload)} />}
      {modal?.kind === "assign" && <AssignModal job={modal.job} techs={techs} onClose={() => setModal(null)} onSave={assignJob} />}
      {modal?.kind === "report" && <ReportModal job={modal.job} chemicals={chemicals} onClose={() => setModal(null)} onSave={submitReport} />}
      {modal?.kind === "view" && <ViewModal job={modal.job} chemicals={chemicals} onClose={() => setModal(null)} />}
      {modal?.kind === "history" && <HistoryModal job={modal.job} jobs={jobs} onClose={() => setModal(null)} onOpen={(j) => setModal(j.status === "done" ? { kind: "view", job: j } : { kind: "edit", job: j })} />}
      {modal?.kind === "addchem" && <AddChemModal onClose={() => setModal(null)} onSave={addChem} />}
      {modal?.kind === "stockin" && <StockInModal chem={modal.chem} onClose={() => setModal(null)} onSave={stockIn} />}
      {modal?.kind === "handout" && <HandoutModal tech={modal.tech} chemicals={chemicals} onClose={() => setModal(null)} onSave={addHandout} />}
      {modal?.kind === "partner" && <PartnerModal partner={modal.partner} onClose={() => setModal(null)} onSave={savePartner} />}
      {modal?.kind === "doc" && <DocModal doc={modal.doc} partners={partners} onClose={() => setModal(null)} onSave={saveDoc} />}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

function JobCard({ job, isAdmin, assignedName, partnerName, partnerRepeat, onCopy, onReport, onAssign, onView, onEdit, onRepeat, onPayPartner, onHistory, onDelete }) {
  const st = STATUS[job.status] || STATUS.new;
  const brandLabel = job.brand === "Sanitex" ? "Sanitex" : job.brand === "partner" ? "Партнёр" : "KazDez";
  const share = job.partner_id && job.status === "done" ? Math.round((Number(job.report_paid) || 0) * (Number(job.partner_share) || 0) / 100) : 0;
  return (
    <div className="kd-card">
      <div className="kd-card-head"><div className="kd-pest">{job.pest}</div><span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span></div>
      <div className="kd-meta">
        <span className="kd-brandtag">{brandLabel}</span>
        <span>{job.type}</span><span>·</span><span className="kd-datetimetag">{isoToRu(job.scheduled_date) || "без даты"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</span>
        {job.floor && (<><span>·</span><span>{job.floor} этаж</span></>)}
        {job.area && (<><span>·</span><span>{job.area} м²</span></>)}
      </div>
      <div className="kd-addr">{job.address}</div>
      {job.note && <div className="kd-notebox">📝 {job.note}</div>}
      <div className="kd-prices">
        {(job.price_options || []).map((p, i) => (<span className="kd-price" key={i}>{fmt(p.amount)} ₸{p.label ? <em> · {p.label}</em> : null}</span>))}
        {job.source && <span className="kd-srctag">{job.source}</span>}
        {job.docs_needed && <span className="kd-doctag">{job.docs_done ? "Документы готовы" : "Нужны документы"}</span>}
        {job.repeat_state === "on_repeat" && <span className="kd-repeattag">на повторе</span>}
        {job.repeat_state === "finished" && <span className="kd-muted">завершена</span>}
      </div>
      <div className="kd-card-foot">
        <button className="kd-clientlink" onClick={onHistory} title="Показать все заявки этого клиента">Клиент: {job.client_phone}</button>
        {isAdmin && job.partner_id && <span className="kd-muted">Партнёр: {partnerName || "?"} · доля {job.partner_share ?? 0}%</span>}
        {isAdmin && job.brand === "partner" && partnerRepeat && <span className="kd-muted">Повтор: {partnerRepeat}</span>}
        {isAdmin && share > 0 && <span className={job.partner_paid ? "kd-muted paid" : "kd-muted"}>Доля партнёру: {fmt(share)} ₸ · {job.partner_paid ? "выплачено" : "к выплате"}</span>}
        {isAdmin && <span className="kd-muted">{assignedName ? "Дезинфектор: " + assignedName : "Не назначен"}</span>}
        {job.report_paid != null && <span className="kd-muted paid">Оплачено: {fmt(job.report_paid)} ₸</span>}
      </div>
      <div className="kd-actions">
        {isAdmin && <button className="kd-btn wa" onClick={onCopy}>Скопировать для WhatsApp</button>}
        {job.status !== "done" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
        {isAdmin && job.status !== "done" && <button className="kd-btn ghost" onClick={onAssign}>{assignedName ? "Переназначить" : "Назначить"}</button>}
        {isAdmin && <button className="kd-btn ghost" onClick={onEdit}>Изменить</button>}
        {job.status === "done" && <button className="kd-btn ghost" onClick={onView}>Отчёт</button>}
        {isAdmin && job.status === "done" && !job.repeat_state && <button className="kd-btn ghost" onClick={onRepeat}>На повтор</button>}
        {isAdmin && share > 0 && <button className="kd-btn ghost" onClick={() => onPayPartner(!job.partner_paid)}>{job.partner_paid ? "Отменить выплату" : "Выплатить долю"}</button>}
        {isAdmin && <button className="kd-btn ghost danger sm" onClick={onDelete} title="Удалить">✕</button>}
      </div>
    </div>
  );
}

function RepeatCard({ job, onSaveNote, onCreate, onFinish, repeatHint }) {
  const [note, setNote] = useState(job.repeat_note || "");
  const days = daysSince(job.repeat_since);
  const due = days >= 5;
  return (
    <div className={`kd-card ${due ? "low" : ""}`}>
      <div className="kd-card-head">
        <div className="kd-pest">{job.pest}</div>
        <span className="kd-badge" style={due ? { color: "#B42318", background: "#FCE6E4" } : { color: "#B45309", background: "#FCF1E2" }}>
          {due ? "пора связаться" : `${days} дн. назад`}
        </span>
      </div>
      <div className="kd-addr">{job.address}</div>
      <div className="kd-card-foot"><span className="kd-muted">Клиент: {job.client_phone}</span></div>
      {repeatHint && <div className="kd-hint">💡 {repeatHint}</div>}
      <Field label="Как прошёл созвон / заметка">
        <textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: созвонился, согласен на субботу" />
      </Field>
      <div className="kd-actions">
        <button className="kd-btn ghost sm" onClick={() => onSaveNote(job, note)}>Сохранить заметку</button>
        <button className="kd-btn primary sm" onClick={() => onCreate(job)}>Создать повторную заявку</button>
        <button className="kd-btn ghost danger sm" onClick={() => onFinish(job)}>Отказался — завершить</button>
      </div>
    </div>
  );
}

// ----------------------------- modals -----------------------------
function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-head"><h3>{title}</h3><button className="kd-x" onClick={onClose}>✕</button></div>
        <div className="kd-modal-body">{children}</div>
        {footer && <div className="kd-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => <label className="kd-field"><span>{label}</span>{children}</label>;

function AssignModal({ job, techs, onClose, onSave }) {
  const [techId, setTechId] = useState(job.assigned_to || "");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(job, techId || null); setSaving(false); }
  return (
    <ModalShell title="Назначить дезинфектора" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}</div>
      {techs.length === 0 && <div className="kd-muted" style={{ marginBottom: 12 }}>Дезинфекторов пока нет — добавь их в Supabase (Authentication → Add user).</div>}
      <Field label="Дезинфектор">
        <select value={techId} onChange={(e) => setTechId(e.target.value)}>
          <option value="">— не назначен —</option>
          {techs.map((t) => (<option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>))}
        </select>
      </Field>
    </ModalShell>
  );
}

function jobToForm(job) {
  const po = job.price_options || [];
  return {
    type: job.type || "Первичная", scheduled_date: job.scheduled_date || "", scheduled_time: job.scheduled_time || "",
    address: job.address || "", floor: job.floor || "", area: job.area ?? "", source: job.source || "", pest: job.pest || "",
    p1label: po[0]?.label || "С запахом", p1amount: po[0]?.amount ?? "",
    p2label: po[1]?.label || "Без запаха", p2amount: po[1]?.amount ?? "",
    client_phone: job.client_phone || "+7 ", guarantee_months: job.guarantee_months ?? 6,
    brand: job.brand || "KazDez", partner_id: job.partner_id || "", partner_share: job.partner_share ?? "",
    note: job.note || "",
  };
}

function JobFormModal({ initial, title, submitLabel, keepStatus, partners = [], onClose, onSave }) {
  const [f, setF] = useState(initial || { type: "Первичная", scheduled_date: "", scheduled_time: "", address: "", floor: "", area: "", source: "", pest: "", p1label: "С запахом", p1amount: "", p2label: "Без запаха", p2amount: "", client_phone: "+7 ", guarantee_months: 6, brand: "KazDez", partner_id: "", partner_share: "", note: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const onBrand = (e) => { const brand = e.target.value; setF({ ...f, brand, partner_id: brand === "partner" ? f.partner_id : "", partner_share: brand === "partner" ? f.partner_share : "" }); };
  const onPartner = (e) => { const partner_id = e.target.value; const p = partners.find((x) => x.id === partner_id); setF({ ...f, partner_id, partner_share: p ? p.default_share : f.partner_share }); };
  const ok = f.address && f.pest && (f.p1amount || f.p2amount || f.type === "Осмотр");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const price_options = [];
    if (f.p1amount) price_options.push({ label: f.p1label, amount: Number(f.p1amount) });
    if (f.p2amount) price_options.push({ label: f.p2label, amount: Number(f.p2amount) });
    const payload = { type: f.type, scheduled_date: f.scheduled_date || null, scheduled_time: f.scheduled_time, address: f.address, floor: f.floor, area: f.area ? Number(f.area) : null, source: f.source, pest: f.pest, price_options, client_phone: f.client_phone, guarantee_months: Number(f.guarantee_months) || 6, brand: f.brand, partner_id: f.brand === "partner" ? (f.partner_id || null) : null, partner_share: f.brand === "partner" ? (Number(f.partner_share) || 0) : null, note: f.note || null };
    if (!keepStatus) payload.status = "new";
    await onSave(payload);
    setSaving(false);
  }
  return (
    <ModalShell title={title} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "Сохраняем…" : submitLabel}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Бренд"><select value={f.brand} onChange={onBrand}><option value="KazDez">KazDez</option><option value="Sanitex">Sanitex</option><option value="partner">Партнёрская</option></select></Field>
        <Field label="Тип"><select value={f.type} onChange={set("type")}><option>Первичная</option><option>Вторичная</option><option>Плановая</option><option>Гарантийная</option><option>Осмотр</option></select></Field>
      </div>
      {f.brand === "partner" && (
        <div className="kd-grid2">
          <Field label="Партнёр"><select value={f.partner_id} onChange={onPartner}><option value="">— выбери —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Доля партнёра (%)"><input value={f.partner_share} onChange={set("partner_share")} inputMode="numeric" placeholder="50" /></Field>
        </div>
      )}
      <div className="kd-grid2">
        <Field label="Вид (вредитель)"><input value={f.pest} onChange={set("pest")} placeholder="Тараканы" /></Field>
        <Field label="Источник"><input value={f.source} onChange={set("source")} placeholder="OLX" /></Field>
      </div>
      <div className="kd-grid2">
        <Field label="Дата"><input type="date" value={f.scheduled_date} onChange={set("scheduled_date")} /></Field>
        <Field label="Время"><input value={f.scheduled_time} onChange={set("scheduled_time")} placeholder="12:00" /></Field>
      </div>
      <Field label="Адрес"><input value={f.address} onChange={set("address")} placeholder="ул. ..., кв. ..." /></Field>
      <div className="kd-grid2">
        <Field label="Этаж"><input value={f.floor} onChange={set("floor")} inputMode="numeric" placeholder="5" /></Field>
        <Field label="Метраж (м²)"><input value={f.area} onChange={set("area")} inputMode="numeric" placeholder="45" /></Field>
      </div>
      {f.type === "Осмотр" && <div className="kd-muted" style={{ marginBottom: 10 }}>Для осмотра цену можно не заполнять.</div>}
      <div className="kd-grid2">
        <Field label="Цена 1 — подпись"><input value={f.p1label} onChange={set("p1label")} /></Field>
        <Field label="Цена 1 — сумма (₸)"><input value={f.p1amount} onChange={set("p1amount")} inputMode="numeric" placeholder="15000" /></Field>
        <Field label="Цена 2 — подпись"><input value={f.p2label} onChange={set("p2label")} /></Field>
        <Field label="Цена 2 — сумма (₸)"><input value={f.p2amount} onChange={set("p2amount")} inputMode="numeric" placeholder="20000" /></Field>
      </div>
      <div className="kd-grid2">
        <Field label="Телефон клиента"><input value={f.client_phone} onChange={set("client_phone")} placeholder="+7 701 ..." /></Field>
        <Field label="Гарантия (мес.)"><input value={f.guarantee_months} onChange={set("guarantee_months")} inputMode="numeric" /></Field>
      </div>
      <Field label="Примечание / комментарий (видно только команде, клиенту не идёт)">
        <textarea className="kd-textarea" value={f.note} onChange={set("note")} placeholder="Напр.: домофон не работает, звонить за 30 мин, есть собака" />
      </Field>
    </ModalShell>
  );
}

function PartnerModal({ partner, onClose, onSave }) {
  const [name, setName] = useState(partner?.name || "");
  const [share, setShare] = useState(partner?.default_share ?? "");
  const [policy, setPolicy] = useState(partner?.repeat_policy || "half");
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() { setSaving(true); await onSave({ name: name.trim(), default_share: Number(share) || 0, repeat_policy: policy }, partner); setSaving(false); }
  return (
    <ModalShell title={partner ? "Изменить партнёра" : "Новый партнёр"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Имя партнёра"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Айдын" /></Field>
      <div className="kd-grid2">
        <Field label="Доля партнёра (%)"><input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" placeholder="50" /></Field>
        <Field label="Цена повтора"><select value={policy} onChange={(e) => setPolicy(e.target.value)}>{REPEAT_POLICIES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select></Field>
      </div>
      <div className="kd-muted">Правило повтора — подсказка при работе с заявками этого партнёра.</div>
    </ModalShell>
  );
}

function DocModal({ doc, partners, onClose, onSave }) {
  const [type, setType] = useState(doc?.type || DOC_TYPES[0]);
  const [partnerId, setPartnerId] = useState(doc?.partner_id || "");
  const [client, setClient] = useState(doc?.client || "");
  const [mode, setMode] = useState(doc?.amount_mode || "fixed");
  const [baseSum, setBaseSum] = useState(doc?.base_sum ?? "");
  const [percent, setPercent] = useState(doc?.percent ?? "");
  const [fixedAmount, setFixedAmount] = useState(doc && doc.amount_mode === "fixed" ? (doc.amount ?? "") : "");
  const [status, setStatus] = useState(doc?.status || "todo");
  const [note, setNote] = useState(doc?.note || "");
  const [saving, setSaving] = useState(false);
  const computed = mode === "percent" ? Math.round((Number(baseSum) || 0) * (Number(percent) || 0) / 100) : (Number(fixedAmount) || 0);
  const ok = computed > 0;
  async function save() {
    setSaving(true);
    await onSave({ type, partner_id: partnerId || null, client, amount_mode: mode, base_sum: mode === "percent" ? (Number(baseSum) || 0) : null, percent: mode === "percent" ? (Number(percent) || 0) : null, amount: computed, status, note }, doc);
    setSaving(false);
  }
  return (
    <ModalShell title={doc ? "Изменить запись" : "Документ / услуга"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Что делаем"><select value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Партнёр (если есть)"><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">— без партнёра —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      </div>
      <Field label="Клиент / описание"><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="ТОО «...», за что" /></Field>
      <Field label="Как считаем сумму">
        <select value={mode} onChange={(e) => setMode(e.target.value)}><option value="fixed">Фиксированная сумма</option><option value="percent">% от суммы клиента</option></select>
      </Field>
      {mode === "fixed" ? (
        <Field label="Сумма (₸)"><input value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} inputMode="numeric" placeholder="30000" /></Field>
      ) : (
        <div className="kd-grid2">
          <Field label="Сумма клиента (₸)"><input value={baseSum} onChange={(e) => setBaseSum(e.target.value)} inputMode="numeric" placeholder="300000" /></Field>
          <Field label="Процент (%)"><input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" placeholder="10" /></Field>
        </div>
      )}
      <div className="kd-paytotal"><span>Твой заработок</span><strong>{fmt(computed)} ₸</strong></div>
      <div className="kd-grid2">
        <Field label="Статус"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="todo">В работе</option><option value="done">Сделано</option><option value="paid">Оплачено</option></select></Field>
        <Field label="Заметка"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" /></Field>
      </div>
    </ModalShell>
  );
}

function ReportModal({ job, chemicals, onClose, onSave }) {
  const [cash, setCash] = useState(""); const [qr, setQr] = useState(""); const [note, setNote] = useState("");
  const [chems, setChems] = useState([{ chemical_id: "", amount: "", unit: "small" }, { chemical_id: "", amount: "", unit: "small" }]);
  const [fuWanted, setFuWanted] = useState(false); const [fuDate, setFuDate] = useState(""); const [fuNote, setFuNote] = useState("");
  const [docNeeded, setDocNeeded] = useState(false); const [avr, setAvr] = useState(false); const [dogovor, setDogovor] = useState(false); const [docNote, setDocNote] = useState("");
  const [saving, setSaving] = useState(false);
  const total = (Number(cash) || 0) + (Number(qr) || 0);
  const setChem = (i, k) => (e) => { const n = chems.slice(); n[i] = { ...n[i], [k]: e.target.value }; setChems(n); };
  function methodLabel() { const c = Number(cash) || 0, q = Number(qr) || 0; if (c > 0 && q > 0) return "Наличные + QR"; if (q > 0) return "QR"; return "Наличные"; }
  async function save() {
    setSaving(true);
    const lines = chems.filter((c) => c.chemical_id && Number(c.amount) > 0).map((c) => {
      const ch = chemicals.find((x) => x.id === c.chemical_id);
      const base = c.unit === "big" ? (Number(c.amount) || 0) * 1000 : (Number(c.amount) || 0);
      return { chemical_id: c.chemical_id, name: ch ? ch.name : "", amount: base };
    });
    await onSave(job, { paid: total, cash: Number(cash) || 0, qr: Number(qr) || 0, method: methodLabel(), note, followUp: { wanted: fuWanted, date: fuDate, note: fuNote } }, lines, { needed: docNeeded, avr, dogovor, note: docNote, done: false });
    setSaving(false);
  }
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "Сохраняем…" : "Сохранить отчёт"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}</div>
      <div className="kd-section">Оплата</div>
      <div className="kd-grid2">
        <Field label="Наличными (₸)"><input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="numeric" placeholder="15000" /></Field>
        <Field label="QR / переводом (₸)"><input value={qr} onChange={(e) => setQr(e.target.value)} inputMode="numeric" placeholder="10000" /></Field>
      </div>
      <div className="kd-paytotal"><span>Итого получено</span><strong>{fmt(total)} ₸</strong></div>
      <Field label="Примечание"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Было поднятие" /></Field>
      <div className="kd-section">Расход препаратов</div>
      {chemicals.length === 0 && <div className="kd-muted" style={{ marginBottom: 8 }}>Сначала добавь препараты на склад — тогда их можно будет выбирать здесь.</div>}
      {chems.map((c, i) => {
        const ch = chemicals.find((x) => x.id === c.chemical_id); const u = chemUnit(ch?.unit_kind);
        return (
          <div className="kd-chemrow3" key={i}>
            <select value={c.chemical_id} onChange={setChem(i, "chemical_id")}>
              <option value="">— препарат —</option>
              {chemicals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input placeholder="кол-во" inputMode="decimal" value={c.amount} onChange={setChem(i, "amount")} />
            <select value={c.unit} onChange={setChem(i, "unit")}>
              <option value="small">{u.small}</option>
              <option value="big">{u.big}</option>
            </select>
          </div>
        );
      })}
      <button className="kd-btn ghost sm" onClick={() => setChems([...chems, { chemical_id: "", amount: "", unit: "small" }])}>+ ещё препарат</button>
      <label className="kd-check"><input type="checkbox" checked={fuWanted} onChange={(e) => setFuWanted(e.target.checked)} /><span>Клиент просит повторный выезд</span></label>
      {fuWanted && (<div className="kd-grid2">
        <Field label="Когда"><input value={fuDate} onChange={(e) => setFuDate(e.target.value)} placeholder="27.06.2026" /></Field>
        <Field label="Что именно"><input value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="2-я квартира" /></Field>
      </div>)}
      <label className="kd-check"><input type="checkbox" checked={docNeeded} onChange={(e) => setDocNeeded(e.target.checked)} /><span>Клиент просит документы (АВР / Договор)</span></label>
      {docNeeded && (<>
        <div className="kd-doctypes">
          <label className="kd-minichk"><input type="checkbox" checked={avr} onChange={(e) => setAvr(e.target.checked)} /><span>АВР</span></label>
          <label className="kd-minichk"><input type="checkbox" checked={dogovor} onChange={(e) => setDogovor(e.target.checked)} /><span>Договор</span></label>
        </div>
        <Field label="Кому / реквизиты"><input value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder="ТОО «...», БИН ..." /></Field>
      </>)}
    </ModalShell>
  );
}

function ViewModal({ job, chemicals, onClose }) {
  const hasSplit = (job.report_cash || 0) > 0 && (job.report_qr || 0) > 0;
  const chemOf = (l) => (l.chemical_id ? (chemicals || []).find((x) => x.id === l.chemical_id) : (chemicals || []).find((x) => norm(x.name) === norm(l.name)));
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}</div>
      {hasSplit ? (<>
        <div className="kd-row"><span>Наличными</span><strong>{fmt(job.report_cash)} ₸</strong></div>
        <div className="kd-row"><span>QR / переводом</span><strong>{fmt(job.report_qr)} ₸</strong></div>
        <div className="kd-row total"><span>Итого</span><strong>{fmt(job.report_paid)} ₸</strong></div>
      </>) : (<>
        <div className="kd-row"><span>Оплата</span><strong>{fmt(job.report_paid)} ₸</strong></div>
        <div className="kd-row"><span>Способ</span><strong>{job.report_method}</strong></div>
      </>)}
      {job.report_note && <div className="kd-row"><span>Примечание</span><strong>{job.report_note}</strong></div>}
      <div className="kd-section" style={{ marginTop: 10 }}>Расход</div>
      {(job.chemicals || []).length === 0 && <div className="kd-muted">Не указан.</div>}
      {(job.chemicals || []).map((l) => { const c = chemOf(l); return (<div className="kd-row" key={l.id}><span>{l.name || (c && c.name)}</span><strong>{fmtAmount(lineAmount(l), c && c.unit_kind)}</strong></div>); })}
      {job.followup_wanted && <div className="kd-followbox"><strong>Повторный выезд:</strong> {job.followup_note || "по просьбе клиента"}{job.followup_date ? ` — ${job.followup_date}` : ""}</div>}
      {job.docs_needed && <div className="kd-docbox"><strong>Документы:</strong> {[job.docs_avr && "АВР", job.docs_dogovor && "Договор"].filter(Boolean).join(", ") || "да"}{job.docs_note ? ` — ${job.docs_note}` : ""}{job.docs_done ? " · готовы" : " · ожидают"}</div>}
    </ModalShell>
  );
}

function HistoryModal({ job, jobs, onClose, onOpen }) {
  const digits = (job.client_phone || "").replace(/\D/g, "");
  const list = jobs
    .filter((j) => (j.client_phone || "").replace(/\D/g, "") === digits && digits)
    .sort((a, b) => new Date(b.scheduled_date || b.created_at || 0) - new Date(a.scheduled_date || a.created_at || 0));
  const doneCount = list.filter((j) => j.status === "done").length;
  return (
    <ModalShell title={`История клиента · ${job.client_phone}`} onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Всего заявок: {list.length}{doneCount ? ` · выполнено: ${doneCount}` : ""}</div>
      {list.length <= 1 && <div className="kd-empty">Других заявок этого клиента не найдено — похоже, это новый клиент.</div>}
      {list.length > 1 && list.map((j) => {
        const st = STATUS[j.status] || STATUS.new;
        return (
          <div key={j.id} className="kd-histrow" onClick={() => onOpen(j)}>
            <div>
              <div className="kd-histmain">{j.type} · {j.pest}</div>
              <div className="kd-muted">{isoToRu(j.scheduled_date) || "без даты"} · {j.address}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
              {j.report_paid != null && <div className="kd-muted" style={{ marginTop: 4 }}>{fmt(j.report_paid)} ₸</div>}
            </div>
          </div>
        );
      })}
    </ModalShell>
  );
}

function AddChemModal({ onClose, onSave }) {
  const [name, setName] = useState(""); const [unitKind, setUnitKind] = useState("volume");
  const [qty, setQty] = useState(""); const [price, setPrice] = useState(""); const [minQ, setMinQ] = useState("1");
  const [saving, setSaving] = useState(false);
  const u = chemUnit(unitKind);
  const ok = name && qty && price;
  async function save() {
    setSaving(true);
    await onSave({ name, unit_kind: unitKind, purchased_ml: (Number(qty) || 0) * 1000, price_per_liter: Number(price) || 0, min_ml: (Number(minQ) || 0) * 1000 });
    setSaving(false);
  }
  return (
    <ModalShell title="Препарат на склад" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Добавить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Культ / Крысогон" /></Field>
        <Field label="Измеряется в"><select value={unitKind} onChange={(e) => setUnitKind(e.target.value)}><option value="volume">Объём (мл/л)</option><option value="weight">Вес (г/кг)</option></select></Field>
      </div>
      <div className="kd-grid2">
        <Field label={`Куплено (${u.big})`}><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="5" /></Field>
        <Field label={`Цена (₸ за ${u.big})`}><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="18000" /></Field>
      </div>
      <Field label={`Сигнал «мало» при остатке (${u.big})`}><input value={minQ} onChange={(e) => setMinQ(e.target.value)} inputMode="decimal" placeholder="1" /></Field>
    </ModalShell>
  );
}

function StockInModal({ chem, onClose, onSave }) {
  const [qty, setQty] = useState(""); const [price, setPrice] = useState(""); const [saving, setSaving] = useState(false);
  const u = chemUnit(chem.unit_kind);
  async function save() {
    setSaving(true);
    await onSave(chem, (Number(qty) || 0) * 1000, price ? Number(price) : null);
    setSaving(false);
  }
  return (
    <ModalShell title={`Приход: ${chem.name}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!qty || saving} onClick={save}>{saving ? "…" : "Оформить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Текущая цена: {fmt(chem.price_per_liter)} ₸/{u.big}</div>
      <Field label={`Докуплено (${u.big})`}><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="5" /></Field>
      <Field label={`Новая цена за ${u.big} (если изменилась)`}><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="оставь пустым, если та же" /></Field>
    </ModalShell>
  );
}

function HandoutModal({ tech, chemicals, onClose, onSave }) {
  const [chemId, setChemId] = useState(""); const [amount, setAmount] = useState(""); const [unit, setUnit] = useState("small");
  const [kind, setKind] = useState("issue"); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false);
  const ch = chemicals.find((x) => x.id === chemId); const u = chemUnit(ch?.unit_kind);
  const ok = chemId && Number(amount) > 0;
  async function save() {
    setSaving(true);
    const base = unit === "big" ? (Number(amount) || 0) * 1000 : (Number(amount) || 0);
    await onSave({ tech_id: tech.id, chemical_id: chemId, amount: base, kind, note });
    setSaving(false);
  }
  return (
    <ModalShell title={`Выдать препарат — ${tech.full_name || "сотрудник"}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Записать"}</button>
    </>}>
      {chemicals.length === 0 && <div className="kd-muted" style={{ marginBottom: 10 }}>Сначала добавь препараты на склад.</div>}
      <Field label="Тип записи">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="issue">Выдача на руки</option>
          <option value="opening">Стартовый остаток (что уже было у сотрудника)</option>
        </select>
      </Field>
      <Field label="Препарат">
        <select value={chemId} onChange={(e) => { setChemId(e.target.value); setUnit("small"); }}>
          <option value="">— выбери —</option>
          {chemicals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <div className="kd-grid2">
        <Field label="Количество"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="4" /></Field>
        <Field label="Единица">
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="small">{u.small}</option>
            <option value="big">{u.big}</option>
          </select>
        </Field>
      </div>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="выдал на объект ..." /></Field>
    </ModalShell>
  );
}
