import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import ExcelJS from "exceljs";
import {
  ClipboardList, CheckCircle2, RefreshCw, Wallet, Package, Users, Handshake, FileText, History, Trash2,
  Plus, MessageCircle, Pencil, UserPlus, Download, Search, X, LogOut, Bug, ChevronLeft, ChevronRight, Wrench, Settings, Receipt,
} from "lucide-react";

// ----------------------------- helpers -----------------------------
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ml2l = (ml) => Math.round(((Number(ml) || 0) / 1000) * 100) / 100;
const norm = (s) => (s || "").trim().toLowerCase();
const chemUnit = (kind) => {
  if (kind === "weight") return { big: "кг", small: "г", factor: 1000 };
  if (kind === "piece") return { big: "шт", small: "шт", factor: 1 };
  if (kind === "pack") return { big: "уп.", small: "уп.", factor: 1 };
  return { big: "л", small: "мл", factor: 1000 };
};
function fmtAmount(amount, kind) {
  const u = chemUnit(kind); const a = Number(amount) || 0; const f = u.factor || 1000;
  if (f > 1 && a >= f) return `${Math.round((a / f) * 100) / 100} ${u.big}`;
  return `${Math.round(a)} ${u.small}`;
}
const lineAmount = (l) => Number(l.amount ?? l.ml) || 0;
const pricePerBase = (chem) => (chem ? (Number(chem.price_per_liter) || 0) / (chemUnit(chem.unit_kind).factor || 1000) : 0);
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
const EXPENSE_TYPES = { salary: "Зарплата", travel: "Дорожные", other: "Другое" };
const EQUIP_CATEGORIES = { equipment: "Оборудование", siz: "СИЗ", container: "Тара", other: "Другое" };
const EQUIP_STATUS = { with_tech: { label: "У сотрудника", color: "#0E7C66", bg: "#E4F3EE" }, returned: { label: "Возврат на склад", color: "#6E7871", bg: "#F7F9F6" }, broken: { label: "Сломано", color: "#B3261E", bg: "#FBE7E5" }, lost: { label: "Утеряно", color: "#B3261E", bg: "#FBE7E5" }, transferred: { label: "Передано", color: "#B4650B", bg: "#FBEDD9" } };
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

function timeStart(t) { const m = (t || "").match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "00:00"; }
function jobTime(j) { if (!j.scheduled_date) return Infinity; return new Date(`${j.scheduled_date}T${timeStart(j.scheduled_time)}`).getTime(); }
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
    document.documentElement.setAttribute("data-theme", localStorage.getItem("kd-theme") || "light");
  }, []);
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
        <div className="kd-hazard" />
        <div className="kd-logo-big"><span className="kd-logo-mark"><Bug size={19} strokeWidth={2.4} /></span>KazDez</div>
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
  const [allProfiles, setAllProfiles] = useState([]);
  const [handouts, setHandouts] = useState([]);
  const [partners, setPartners] = useState([]);
  const [docs, setDocs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [equipHandouts, setEquipHandouts] = useState([]);
  const [sources, setSources] = useState([]);
  const [pestTypes, setPestTypes] = useState([]);
  const [settings, setSettings] = useState({});
  const [expCats, setExpCats] = useState([]);
  const [opex, setOpex] = useState([]);
  const [audit, setAudit] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jobs");
  const [modal, setModal] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message, onYes) => setConfirmState({ message, onYes });
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [doneSortDir, setDoneSortDir] = useState("desc");
  const [techFilter, setTechFilter] = useState("");
  const [toast, setToast] = useState("");
  const [pMode, setPMode] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [pOff, setPOff] = useState(0);
  const isAdmin = profile?.role === "admin";
  const actorName = profile?.full_name || (isAdmin ? "Админ" : session.user.email);

  function showToast(t) { setToast(t); setTimeout(() => setToast(""), 2200); }

  async function load() {
    setLoading(true);
    const [jr, cr, chr, ar, tr, pr, hr, ptr, dsr, exr, eqr, ehr, scr, ptyr, str, ecr, opr] = await Promise.all([
      supabase.from("jobs").select("*"),
      supabase.from("report_chemicals").select("*"),
      supabase.from("chemicals").select("*"),
      supabase.from("audit_log").select("*").order("ts", { ascending: false }),
      supabase.from("trash").select("*").order("deleted_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, phone, role"),
      supabase.from("handouts").select("*"),
      supabase.from("partners").select("*"),
      supabase.from("doc_services").select("*").order("created_at", { ascending: false }),
      supabase.from("tech_expenses").select("*").order("created_at", { ascending: false }),
      supabase.from("equipment").select("*"),
      supabase.from("equipment_handouts").select("*"),
      supabase.from("client_sources").select("*").order("name"),
      supabase.from("pest_types").select("*").order("name"),
      supabase.from("app_settings").select("*"),
      supabase.from("expense_categories").select("*").order("name"),
      supabase.from("opex").select("*").order("spent_date", { ascending: false }),
    ]);
    const chems = cr.data || [];
    setJobs((jr.data || []).map((j) => ({ ...j, chemicals: chems.filter((c) => c.job_id === j.id) })));
    setChemicals(chr.data || []);
    setAudit(ar.data || []);
    setTrash(tr.data || []);
    setTechs((pr.data || []).filter((p) => p.role === "tech"));
    setAllProfiles(pr.data || []);
    setHandouts(hr.data || []);
    setPartners(ptr.data || []);
    setDocs(dsr.data || []);
    setExpenses(exr.data || []);
    setEquipment(eqr.data || []);
    setEquipHandouts(ehr.data || []);
    setSources(scr.data || []);
    setPestTypes(ptyr.data || []);
    const settingsMap = {};
    (str.data || []).forEach((row) => { settingsMap[row.key] = row.value; });
    setSettings(settingsMap);
    setExpCats(ecr.data || []);
    setOpex(opr.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function logAction(action, summary) {
    await supabase.from("audit_log").insert({ actor: actorName, actor_id: session.user.id, action, summary });
  }
  const chemById = (id) => chemicals.find((x) => x.id === id);
  const lineChem = (l) => (l.chemical_id ? chemById(l.chemical_id) : chemicals.find((x) => norm(x.name) === norm(l.name)));
  const jobChemCost = (job) => (job.chemicals || []).reduce((s, l) => { const c = lineChem(l); return s + lineAmount(l) * pricePerBase(c); }, 0);
  const qrFeeRate = (Number(settings.qr_fee_rate) || 0.95) / 100;
  const defaultGuarantee = Number(settings.default_guarantee_months) || 6;
  function techLedger(techId) {
    const m = {};
    const get = (cid) => (m[cid] = m[cid] || { issued: 0, opening: 0, consumed: 0 });
    handouts.filter((h) => h.tech_id === techId).forEach((h) => { const g = get(h.chemical_id); if (h.kind === "opening") g.opening += Number(h.amount) || 0; else g.issued += Number(h.amount) || 0; });
    jobs.filter((j) => j.assigned_to === techId).forEach((j) => (j.chemicals || []).forEach((l) => { if (l.chemical_id) get(l.chemical_id).consumed += lineAmount(l); }));
    return Object.entries(m).map(([cid, v]) => { const c = chemById(cid); const received = v.issued + v.opening; return c ? { chem: c, ...v, received, balance: received - v.consumed } : null; }).filter(Boolean);
  }

  const techById = (id) => techs.find((t) => t.id === id);
  const profileById = (id) => allProfiles.find((p) => p.id === id);
  const equipById = (id) => equipment.find((e) => e.id === id);
  const techEquipment = (techId) => equipHandouts.filter((h) => h.tech_id === techId && h.status === "with_tech").map((h) => ({ handout: h, equip: equipById(h.equipment_id) })).filter((r) => r.equip);

  async function ensureCatalog(table, list, value) {
    const v = (value || "").trim();
    if (!v) return;
    if (list.some((x) => norm(x.name) === norm(v))) return;
    await supabase.from(table).insert({ name: v });
  }
  async function createJob(payload) {
    const { error } = await supabase.from("jobs").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await ensureCatalog("client_sources", sources, payload.source);
    await ensureCatalog("pest_types", pestTypes, payload.pest);
    await logAction("Создание", `${payload.pest} · ${payload.address}`);
    setModal(null); showToast("Заявка создана"); load();
  }
  async function editJob(job, payload) {
    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await ensureCatalog("client_sources", sources, payload.source);
    await ensureCatalog("pest_types", pestTypes, payload.pest);
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
    setModal({ kind: "reportSuccess" }); load();
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
  const partnerShareAmt = (job) => {
    if (!job.partner_id || job.status !== "done") return 0;
    const paid = Number(job.report_paid) || 0;
    if (!job.joint_work) return Math.round(paid * (Number(job.partner_share) || 0) / 100);
    const cost = jobChemCost(job);
    const net = paid - cost;
    const profitShare = net * (Number(job.partner_share) || 0) / 100;
    const costOwed = job.joint_supplier === "us" ? cost * (Number(job.joint_cost_share) || 0) / 100 : 0;
    return Math.round(profitShare - costOwed);
  };
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
  async function saveExpense(payload, existing) {
    const res = existing ? await supabase.from("tech_expenses").update(payload).eq("id", existing.id) : await supabase.from("tech_expenses").insert({ ...payload, created_by: session.user.id });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    const t = techById(payload.tech_id);
    await logAction("Выплата", `${t?.full_name || "?"} · ${EXPENSE_TYPES[payload.type] || payload.type} · ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function setExpenseStatus(e, status) {
    const { error } = await supabase.from("tech_expenses").update({ status }).eq("id", e.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Выплата", `${techById(e.tech_id)?.full_name || "?"} · ${status === "paid" ? "выплачено" : "отменено"}`);
    showToast("Обновлено"); load();
  }
  async function removeExpense(e) {
    await supabase.from("tech_expenses").delete().eq("id", e.id);
    await logAction("Выплата", `Удалено: ${techById(e.tech_id)?.full_name || "?"} · ${fmt(e.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function editTechProfile(tech, payload) {
    const { error } = await supabase.from("profiles").update(payload).eq("id", tech.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Дезинфектор", `Изменены данные: ${tech.full_name || "?"} → ${payload.full_name || "?"}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function saveAppSetting(key, value) {
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Настройки", `${key} → ${JSON.stringify(value)}`);
    showToast("Сохранено"); load();
  }
  async function addCatalogItem(table, name) {
    const v = (name || "").trim();
    if (!v) return;
    const { error } = await supabase.from(table).insert({ name: v });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Справочник", `Добавлено: ${v}`);
    load();
  }
  async function removeCatalogItem(table, item) {
    const { error } = await supabase.from(table).delete().eq("id", item.id);
    if (error) { showToast("Ошибка: нельзя удалить — значение уже используется в заявках"); return; }
    await logAction("Справочник", `Удалено: ${item.name}`);
    load();
  }
  function setTheme(theme) {
    localStorage.setItem("kd-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }
  async function addExpCat(name, parentId) {
    const v = (name || "").trim();
    if (!v) return;
    const { error } = await supabase.from("expense_categories").insert({ name: v, parent_id: parentId || null });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Категории расходов", `Добавлено: ${v}`);
    load();
  }
  async function removeExpCat(item) {
    const { error } = await supabase.from("expense_categories").delete().eq("id", item.id);
    if (error) { showToast("Ошибка: нельзя удалить — категория уже используется в расходах"); return; }
    await logAction("Категории расходов", `Удалено: ${item.name}`);
    load();
  }
  async function saveOpex(payload, existing) {
    const res = existing ? await supabase.from("opex").update(payload).eq("id", existing.id) : await supabase.from("opex").insert({ ...payload, created_by: session.user.id });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Расходы", `${existing ? "Изменено" : "Добавлено"}: ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeOpex(o) {
    await supabase.from("opex").delete().eq("id", o.id);
    await logAction("Расходы", `Удалено: ${fmt(o.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function saveEquipment(payload, existing) {
    const res = existing ? await supabase.from("equipment").update(payload).eq("id", existing.id) : await supabase.from("equipment").insert(payload);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Оборудование", `${existing ? "Изменено" : "Добавлено на склад"}: ${payload.name}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeEquipment(item) {
    const { error } = await supabase.from("equipment").delete().eq("id", item.id);
    if (error) { showToast("Ошибка: нельзя удалить — есть история выдач этой позиции"); return; }
    await logAction("Оборудование", `Удалено из справочника: ${item.name}`);
    showToast("Удалено"); load();
  }
  async function issueEquipment(payload) {
    const { error } = await supabase.from("equipment_handouts").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    const t = techById(payload.tech_id); const e = equipById(payload.equipment_id);
    await logAction("Оборудование", `Выдано: ${t?.full_name || "?"} · ${e?.name || "?"} — ${payload.qty} ${e?.unit || "шт"}`);
    setModal(null); showToast("Выдано"); load();
  }
  async function setEquipStatus(h, status) {
    const { error } = await supabase.from("equipment_handouts").update({ status }).eq("id", h.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    const t = techById(h.tech_id); const e = equipById(h.equipment_id);
    await logAction("Оборудование", `${t?.full_name || "?"} · ${e?.name || "?"} · ${(EQUIP_STATUS[status] || {}).label || status}`);
    showToast("Обновлено"); load();
  }
  async function reportEquipIssue(h, status, note) {
    const { error } = await supabase.rpc("report_equipment_issue", { p_handout: h.id, p_status: status, p_note: note || null });
    if (error) { showToast("Ошибка: " + error.message); return; }
    setModal(null); showToast("Сообщение отправлено"); load();
  }
  async function transferEquipment(h, newTechId, note) {
    const upd = await supabase.from("equipment_handouts").update({ status: "transferred", note: note || h.note }).eq("id", h.id);
    if (upd.error) { showToast("Ошибка: " + upd.error.message); return; }
    const ins = await supabase.from("equipment_handouts").insert({
      tech_id: newTechId, equipment_id: h.equipment_id, qty: h.qty, handout_date: new Date().toISOString().slice(0, 10),
      status: "with_tech", note: `Передано от ${techById(h.tech_id)?.full_name || "?"}${note ? " — " + note : ""}`, created_by: session.user.id,
    });
    if (ins.error) { showToast("Ошибка: " + ins.error.message); return; }
    const e = equipById(h.equipment_id);
    await logAction("Оборудование", `Передано: ${e?.name || "?"} · ${techById(h.tech_id)?.full_name || "?"} → ${techById(newTechId)?.full_name || "?"}`);
    setModal(null); showToast("Оборудование передано"); load();
  }

  async function exportExcel() {
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "KazDez"; wb.created = new Date();

      async function addSheet(name, columns, rows) {
        const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
        ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16 }));
        rows.forEach((r) => ws.addRow(r));
        const header = ws.getRow(1);
        header.height = 24;
        header.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E7C66" } };
          cell.alignment = { vertical: "middle", horizontal: "left" };
        });
        for (let i = 2; i <= ws.rowCount; i++) {
          const row = ws.getRow(i);
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.alignment = { vertical: "middle" };
            cell.border = { bottom: { style: "hair", color: { argb: "FFE4E8E4" } } };
          });
          if (i % 2 === 0) row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F8F6" } }; });
        }
        columns.forEach((c, idx) => { if (c.money) ws.getColumn(idx + 1).numFmt = '#,##0" ₸"'; });
        if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
        return ws;
      }

      await addSheet("Заявки", [
        { header: "Дата", key: "date", width: 12 }, { header: "Время", key: "time", width: 8 },
        { header: "Бренд", key: "brand", width: 12 }, { header: "Тип", key: "type", width: 12 }, { header: "Вид", key: "pest", width: 16 },
        { header: "Партнёр", key: "partner", width: 14 }, { header: "Доля %", key: "sharePct", width: 9 },
        { header: "Доля ₸", key: "shareAmt", width: 12, money: true }, { header: "Доля выплачена", key: "sharePaid", width: 14 },
        { header: "Адрес", key: "address", width: 32 }, { header: "Этаж", key: "floor", width: 8 }, { header: "Метраж", key: "area", width: 9 },
        { header: "Источник", key: "source", width: 12 }, { header: "Телефон", key: "phone", width: 16 }, { header: "Гарантия (мес)", key: "guarantee", width: 10 },
        { header: "Дезинфектор", key: "tech", width: 16 }, { header: "Статус", key: "status", width: 12 },
        { header: "Цена (варианты)", key: "priceVariants", width: 26 },
        { header: "Оплачено", key: "paid", width: 12, money: true }, { header: "Наличными", key: "cash", width: 12, money: true },
        { header: "QR", key: "qr", width: 12, money: true }, { header: "Способ", key: "method", width: 12 },
        { header: "Себестоимость", key: "cost", width: 14, money: true }, { header: "Комиссия QR", key: "qrfee", width: 12, money: true },
        { header: "Прибыль", key: "profit", width: 14, money: true }, { header: "Препараты", key: "chems", width: 32 },
        { header: "Комментарий", key: "note", width: 26 }, { header: "Примечание оплаты", key: "paynote", width: 22 },
        { header: "Повторный", key: "repeat", width: 24 }, { header: "Документы", key: "docsinfo", width: 24 },
      ], jobs.map((j) => ({
        date: isoToRu(j.scheduled_date), time: j.scheduled_time, brand: j.brand === "partner" ? "Партнёр" : j.brand, type: j.type, pest: j.pest,
        partner: j.partner_id ? (partnerById(j.partner_id)?.name || "") : "", sharePct: j.partner_id ? (j.partner_share ?? "") : "",
        shareAmt: partnerShareAmt(j) || "", sharePaid: j.partner_id && j.status === "done" ? (j.partner_paid ? "да" : "нет") : "",
        address: j.address, floor: j.floor, area: j.area, source: j.source, phone: j.client_phone, guarantee: j.guarantee_months,
        tech: techById(j.assigned_to)?.full_name || "", status: (STATUS[j.status] && STATUS[j.status].label) || j.status,
        priceVariants: (j.price_options || []).map((p) => `${p.amount}${p.label ? " " + p.label : ""}`).join("; "),
        paid: j.report_paid ?? "", cash: j.report_cash ?? "", qr: j.report_qr ?? "", method: j.report_method ?? "",
        cost: j.status === "done" ? Math.round(jobChemCost(j)) : "",
        qrfee: j.status === "done" ? Math.round((Number(j.report_qr) || 0) * qrFeeRate) : "",
        profit: j.status === "done" ? Math.round((Number(j.report_paid) || 0) - jobChemCost(j) - partnerShareAmt(j) - (Number(j.report_qr) || 0) * qrFeeRate) : "",
        chems: (j.chemicals || []).map((l) => { const c = lineChem(l); return `${l.name || (c && c.name) || ""} ${fmtAmount(lineAmount(l), c && c.unit_kind)}`; }).join("; "),
        note: j.note ?? "", paynote: j.report_note ?? "",
        repeat: j.followup_wanted ? `${j.followup_date || "да"}${j.followup_note ? " — " + j.followup_note : ""}` : "",
        docsinfo: j.docs_needed ? `${[j.docs_avr && "АВР", j.docs_dogovor && "Договор"].filter(Boolean).join(", ") || "да"}${j.docs_done ? " (готовы)" : " (ожидают)"}` : "",
      })));

      await addSheet("Склад", [
        { header: "Препарат", key: "name", width: 20 }, { header: "Единица", key: "unit", width: 12 },
        { header: "Куплено", key: "bought", width: 14 }, { header: "Ушло", key: "used", width: 14 }, { header: "Остаток", key: "left", width: 14 },
        { header: "Цена за ед. (₸)", key: "price", width: 14, money: true }, { header: "Стоимость остатка", key: "stockValue", width: 16, money: true },
      ], chemicals.map((c) => {
        const u = chemUnit(c.unit_kind);
        const used = jobs.reduce((s, j) => s + (j.chemicals || []).filter((x) => (x.chemical_id ? x.chemical_id === c.id : norm(x.name) === norm(c.name))).reduce((a, x) => a + lineAmount(x), 0), 0);
        const remaining = (Number(c.purchased_ml) || 0) - used;
        return { name: c.name, unit: u.big + "/" + u.small, bought: fmtAmount(c.purchased_ml, c.unit_kind), used: fmtAmount(used, c.unit_kind), left: fmtAmount(remaining, c.unit_kind), price: c.price_per_liter, stockValue: Math.round(remaining * pricePerBase(c)) };
      }));

      await addSheet("Дезинфекторы", [
        { header: "Имя", key: "name", width: 20 }, { header: "Телефон", key: "phone", width: 16 }, { header: "Заявок", key: "count", width: 10 },
      ], techs.map((t) => ({ name: t.full_name, phone: t.phone, count: jobs.filter((j) => j.assigned_to === t.id).length })));

      const ledgerRows = [];
      techs.forEach((t) => techLedger(t.id).forEach((r) => ledgerRows.push({
        tech: t.full_name, chem: r.chem.name,
        issued: fmtAmount(r.issued, r.chem.unit_kind), opening: fmtAmount(r.opening, r.chem.unit_kind),
        consumed: fmtAmount(r.consumed, r.chem.unit_kind), balance: fmtAmount(r.balance, r.chem.unit_kind),
      })));
      await addSheet("Учёт по сотрудникам", [
        { header: "Сотрудник", key: "tech", width: 18 }, { header: "Препарат", key: "chem", width: 18 },
        { header: "Выдано", key: "issued", width: 14 }, { header: "Стартовый остаток", key: "opening", width: 16 },
        { header: "Расход", key: "consumed", width: 14 }, { header: "На руках", key: "balance", width: 14 },
      ], ledgerRows);

      await addSheet("Журнал", [
        { header: "Когда", key: "when", width: 16 }, { header: "Кто", key: "who", width: 16 },
        { header: "Действие", key: "action", width: 16 }, { header: "Детали", key: "summary", width: 40 },
      ], audit.map((a) => ({ when: fmtTs(a.ts), who: a.actor, action: a.action, summary: a.summary })));

      await addSheet("Корзина", [
        { header: "Удалено", key: "when", width: 16 }, { header: "Кем", key: "who", width: 16 },
        { header: "Вид", key: "pest", width: 16 }, { header: "Адрес", key: "address", width: 28 }, { header: "Было оплачено", key: "paid", width: 14, money: true },
      ], trash.map((t) => ({ when: fmtTs(t.deleted_at), who: t.deleted_by, pest: t.job.pest, address: t.job.address, paid: t.job.report_paid ?? "" })));

      await addSheet("Документы", [
        { header: "Тип", key: "type", width: 24 }, { header: "Партнёр", key: "partner", width: 16 }, { header: "Клиент", key: "client", width: 22 },
        { header: "Расчёт", key: "calc", width: 18 }, { header: "Заработок", key: "amount", width: 14, money: true },
        { header: "Статус", key: "status", width: 12 }, { header: "Заметка", key: "note", width: 24 },
      ], docs.map((d) => ({
        type: d.type, partner: d.partner_id ? (partnerById(d.partner_id)?.name || "") : "", client: d.client || "",
        calc: d.amount_mode === "percent" ? `${d.percent}% от ${d.base_sum}` : "сумма",
        amount: d.amount, status: (DOC_STATUS[d.status] || {}).label || d.status, note: d.note || "",
      })));

      await addSheet("Выплаты сотрудникам", [
        { header: "Сотрудник", key: "tech", width: 18 }, { header: "Тип", key: "type", width: 14 },
        { header: "Сумма", key: "amount", width: 14, money: true }, { header: "Дата", key: "date", width: 12 },
        { header: "Статус", key: "status", width: 12 }, { header: "Заметка", key: "note", width: 24 },
      ], expenses.map((e) => ({
        tech: techById(e.tech_id)?.full_name || "", type: EXPENSE_TYPES[e.type] || e.type,
        amount: e.amount, date: e.expense_date ? isoToRu(e.expense_date) : "", status: e.status === "paid" ? "Выплачено" : "К выплате", note: e.note || "",
      })));

      await addSheet("Оборудование и СИЗ", [
        { header: "Название", key: "name", width: 26 }, { header: "Категория", key: "category", width: 16 },
        { header: "Единица", key: "unit", width: 10 }, { header: "Цена за ед.", key: "price", width: 14, money: true },
        { header: "На руках (кол-во)", key: "issued", width: 16 }, { header: "Стоимость на руках", key: "value", width: 18, money: true },
      ], equipment.map((e) => ({
        name: e.name, category: EQUIP_CATEGORIES[e.category] || e.category, unit: e.unit, price: e.price,
        issued: equipIssuedQty(e.id), value: Math.round(equipIssuedQty(e.id) * (Number(e.price) || 0)),
      })));

      await addSheet("Выдачи оборудования", [
        { header: "Сотрудник", key: "tech", width: 18 }, { header: "Позиция", key: "equip", width: 24 },
        { header: "Кол-во", key: "qty", width: 10 }, { header: "Дата", key: "date", width: 12 },
        { header: "Статус", key: "status", width: 16 }, { header: "Стоимость", key: "value", width: 14, money: true }, { header: "Заметка", key: "note", width: 26 },
      ], equipHandouts.map((h) => {
        const e = equipById(h.equipment_id);
        return {
          tech: techById(h.tech_id)?.full_name || "", equip: e?.name || "", qty: h.qty, date: h.handout_date ? isoToRu(h.handout_date) : "",
          status: (EQUIP_STATUS[h.status] || {}).label || h.status, value: Math.round((Number(h.qty) || 0) * (Number(e?.price) || 0)), note: h.note || "",
        };
      }));

      await addSheet("Операционные расходы", [
        { header: "Категория", key: "category", width: 22 }, { header: "Подкатегория", key: "subcategory", width: 20 },
        { header: "Сумма", key: "amount", width: 14, money: true }, { header: "Дата", key: "date", width: 12 }, { header: "Комментарий", key: "note", width: 30 },
      ], opex.map((o) => ({
        category: catName(o.category_id), subcategory: o.subcategory_id ? catName(o.subcategory_id) : "",
        amount: o.amount, date: o.spent_date ? isoToRu(o.spent_date) : "", note: o.note || "",
      })));

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
    let revenue = 0, cost = 0, cash = 0, qr = 0, partnerShares = 0, qrFees = 0; const bySource = {}; const byTech = {};
    jobs.forEach((j) => {
      const isPartnerJob = j.brand === "partner";
      if (brandFilter === "ours" && isPartnerJob) return;
      if (brandFilter === "partner" && !isPartnerJob) return;
      const dt = parseIso(j.scheduled_date);
      const inR = pMode === "all" || (dt && dt.getTime() >= range.start && dt.getTime() < range.end);
      if (!inR) return;
      const srcRaw = (j.source || "Не указан").trim() || "Не указан";
      const srcKey = norm(srcRaw);
      if (!bySource[srcKey]) bySource[srcKey] = { label: srcRaw, count: 0, revenue: 0 };
      bySource[srcKey].count++;
      if (j.status === "done") {
        const paid = Number(j.report_paid) || 0;
        const jqr = Number(j.report_qr) || 0;
        const jcost = jobChemCost(j);
        revenue += paid; cost += jcost; cash += Number(j.report_cash) || 0; qr += jqr;
        qrFees += jqr * qrFeeRate;
        partnerShares += partnerShareAmt(j);
        bySource[srcKey].revenue += paid;
        if (dt) { const wi = weekIdx[dt.getDay()]; week[wi].count++; week[wi].revenue += paid; }
        if (j.assigned_to) {
          if (!byTech[j.assigned_to]) byTech[j.assigned_to] = { count: 0, revenue: 0, cost: 0 };
          byTech[j.assigned_to].count++; byTech[j.assigned_to].revenue += paid; byTech[j.assigned_to].cost += jcost;
        }
      }
    });
    const weekMax = Math.max(1, ...week.map((w) => w.revenue));
    return { revenue, cost, partnerShares, qrFees, profit: revenue - cost - partnerShares - qrFees, cash, qr, bySource, byTech, week, weekMax };
  })();

  const expensesInRange = expenses.filter((e) => {
    if (pMode === "all") return true;
    if (!e.expense_date) return false;
    const t = new Date(e.expense_date).getTime();
    return t >= range.start && t < range.end;
  }).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const catName = (id) => (expCats.find((c) => c.id === id) || {}).name || "—";
  const opexInRangeList = opex.filter((o) => {
    if (pMode === "all") return true;
    if (!o.spent_date) return false;
    const t = new Date(o.spent_date).getTime();
    return t >= range.start && t < range.end;
  });
  const opexInRange = opexInRangeList.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const netProfit = fin.profit - expensesInRange - opexInRange;

  // ---- склад ----
  const inventory = chemicals.map((c) => {
    const used = jobs.reduce((s, j) => s + (j.chemicals || []).filter((x) => (x.chemical_id ? x.chemical_id === c.id : norm(x.name) === norm(c.name))).reduce((a, x) => a + lineAmount(x), 0), 0);
    const remaining = (Number(c.purchased_ml) || 0) - used;
    return { ...c, used, remaining, low: remaining <= (Number(c.min_ml) || 0), stockValue: remaining * pricePerBase(c) };
  });
  const lowCount = inventory.filter((i) => i.low).length;
  const totalStockValue = inventory.reduce((s, c) => s + c.stockValue, 0);
  const equipIssuedQty = (equipId) => equipHandouts.filter((h) => h.equipment_id === equipId && h.status === "with_tech").reduce((s, h) => s + (Number(h.qty) || 0), 0);
  const totalEquipValue = equipment.reduce((s, e) => s + equipIssuedQty(e.id) * (Number(e.price) || 0), 0);

  const activeJobs = jobs.filter((j) => j.status !== "done");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  function matchSearch(j) {
    if (techFilter && j.assigned_to !== techFilter) return false;
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
  const doneSorted = [...doneFiltered].sort((a, b) => {
    const da = new Date(a.scheduled_date || a.reported_at || 0).getTime();
    const db = new Date(b.scheduled_date || b.reported_at || 0).getTime();
    return doneSortDir === "desc" ? db - da : da - db;
  });
  const doneGroups = groupByDate(doneSorted);
  const tabs = isAdmin ? [
    { id: "jobs", icon: ClipboardList, label: `Заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "done", icon: CheckCircle2, label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
    { id: "repeats", icon: RefreshCw, label: `Повторы${jobs.filter((j) => j.repeat_state === "on_repeat").length ? " · " + jobs.filter((j) => j.repeat_state === "on_repeat").length : ""}` },
    { id: "finance", icon: Wallet, label: "Финансы" },
    { id: "opex", icon: Receipt, label: "Расходы" },
    { id: "stock", icon: Package, label: `Склад${lowCount ? " · " + lowCount + " мало" : ""}` },
    { id: "team", icon: Users, label: "Дезинфекторы" },
    { id: "partners", icon: Handshake, label: "Партнёры" },
    { id: "docs", icon: FileText, label: "Документы" },
    { id: "journal", icon: History, label: "Журнал" },
    { id: "trash", icon: Trash2, label: `Корзина${trash.length ? " · " + trash.length : ""}` },
  ] : [
    { id: "jobs", icon: ClipboardList, label: `Мои заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "done", icon: CheckCircle2, label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
    { id: "myequip", icon: Wrench, label: "Моё оборудование" },
  ];

  return (
    <div className="kd-app">
      <div className="kd-hazard" />
      <header className="kd-top">
        <div className="kd-brand">
          <div className="kd-logo"><Bug size={19} strokeWidth={2.4} /></div>
          <div><div className="kd-brand-name">KazDez</div><div className="kd-brand-sub">{isAdmin ? "Админ" : "Дезинфектор"} · {actorName}</div></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && <button className="kd-btn ghost" onClick={() => setModal({ kind: "settings" })}><Settings size={15} /></button>}
          <button className="kd-btn ghost" onClick={() => supabase.auth.signOut()}><LogOut size={15} />Выйти</button>
        </div>
      </header>

      <main className="kd-main">
        <div className="kd-tabbar">
          <div className="kd-tabs">
            {tabs.map((t) => (<button key={t.id} className={`kd-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.icon ? <t.icon size={15} /> : null}{t.label}</button>))}
          </div>
          <div className="kd-tabactions">
            {tab === "jobs" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "new" })}><Plus size={15} />Новая заявка</button>}
            {tab === "stock" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "addchem" })}><Plus size={15} />Препарат</button>}
            {tab === "partners" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "partner" })}><Plus size={15} />Партнёр</button>}
            {tab === "docs" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "doc" })}><Plus size={15} />Документ</button>}
            {tab === "opex" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "opex" })}><Plus size={15} />Расход</button>}
            {isAdmin && <button className="kd-btn ghost" onClick={exportExcel}><Download size={15} />Выгрузить в Excel</button>}
          </div>
        </div>

        {loading && <div className="kd-empty">Загрузка…</div>}

        {!loading && (tab === "jobs" || tab === "done") && (
          <div className="kd-searchrow">
            <div className="kd-searchbar">
              <Search size={16} className="kd-search-icon" />
              <input className="kd-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по телефону, адресу или виду вредителя…" />
              {search && <button className="kd-x" onClick={() => setSearch("")}><X size={15} /></button>}
            </div>
            {isAdmin && techs.length > 0 && (
              <select className="kd-techselect" value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
                <option value="">Все дезинфекторы</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>)}
              </select>
            )}
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
                      <JobCard key={j.id} job={j} isAdmin={isAdmin} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerById(j.partner_id)?.name} partnerRepeat={j.brand === "partner" ? repeatLabel(partnerById(j.partner_id)?.repeat_policy) : ""} share={partnerShareAmt(j)}
                        onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                        onReport={() => setModal({ kind: "report", job: j })}
                        onAssign={() => setModal({ kind: "assign", job: j })}
                        onView={() => setModal({ kind: "view", job: j })}
                        onEdit={() => setModal({ kind: "edit", job: j })}
                        onRepeat={() => putOnRepeat(j)}
                        onPayPartner={(paid) => markPartnerPaid(j, paid)}
                        onHistory={() => setModal({ kind: "history", job: j })}
                        onOpenDetails={() => setModal({ kind: "details", job: j })}
                        onDelete={() => askConfirm(`Удалить заявку «${j.pest} · ${j.address}»? Она уйдёт в корзину, восстановить можно будет оттуда.`, () => deleteJob(j))} />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {!loading && tab === "done" && (
          <>
            <div className="kd-seg" style={{ marginBottom: 14 }}>
              <button className={`kd-segbtn ${doneSortDir === "desc" ? "on" : ""}`} onClick={() => setDoneSortDir("desc")}>Сначала новые</button>
              <button className={`kd-segbtn ${doneSortDir === "asc" ? "on" : ""}`} onClick={() => setDoneSortDir("asc")}>Сначала старые</button>
            </div>
            {doneFiltered.length === 0 ? <div className="kd-empty">{doneJobs.length === 0 ? "Выполненных заявок пока нет." : "По этому поиску ничего не найдено."}</div> :
              doneGroups.map((g) => (
                <div key={g.key} className="kd-group">
                  <div className="kd-datehead"><span>{g.label}</span><span className="kd-datecount">{g.jobs.length}</span></div>
                  <div className="kd-list">
                    {g.jobs.map((j) => (
                      <JobCard key={j.id} job={j} isAdmin={isAdmin} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerById(j.partner_id)?.name} partnerRepeat={j.brand === "partner" ? repeatLabel(partnerById(j.partner_id)?.repeat_policy) : ""} share={partnerShareAmt(j)}
                      onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                      onReport={() => setModal({ kind: "report", job: j })}
                      onAssign={() => setModal({ kind: "assign", job: j })}
                      onView={() => setModal({ kind: "view", job: j })}
                      onEdit={() => setModal({ kind: "edit", job: j })}
                      onRepeat={() => putOnRepeat(j)}
                      onPayPartner={(paid) => markPartnerPaid(j, paid)}
                      onHistory={() => setModal({ kind: "history", job: j })}
                        onOpenDetails={() => setModal({ kind: "details", job: j })}
                      onDelete={() => askConfirm(`Удалить заявку «${j.pest} · ${j.address}»? Она уйдёт в корзину, восстановить можно будет оттуда.`, () => deleteJob(j))} />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {!loading && tab === "myequip" && (
          <div className="kd-list">
            {techEquipment(session.user.id).length === 0 && <div className="kd-empty">Пока ничего не выдано. Если что-то выдали на объекте — это появится здесь.</div>}
            {techEquipment(session.user.id).map((r) => (
              <div key={r.handout.id} className="kd-card">
                <div className="kd-card-head">
                  <div className="kd-pest">{r.equip.name}</div>
                  <span className="kd-badge" style={{ color: "#7C3AED", background: "#F1ECFE" }}>{EQUIP_CATEGORIES[r.equip.category] || r.equip.category}</span>
                </div>
                <div className="kd-meta"><span>Кол-во: {r.handout.qty} {r.equip.unit}</span><span>·</span><span>Выдано: {isoToRu(r.handout.handout_date) || "—"}</span></div>
                {r.handout.note && <div className="kd-notebox">📝 {r.handout.note}</div>}
                <div className="kd-actions">
                  <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "reportEquip", handout: r.handout, equip: r.equip, status: "broken" })}>Сообщить о поломке</button>
                  <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "reportEquip", handout: r.handout, equip: r.equip, status: "lost" })}>Потерял(а)</button>
                </div>
              </div>
            ))}
          </div>
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
                  <button className="kd-arrow" onClick={() => setPOff(pOff - 1)}><ChevronLeft size={18} /></button>
                  <span className="kd-perlabel">{range.label}</span>
                  <button className="kd-arrow" disabled={pOff >= 0} onClick={() => setPOff(pOff + 1)}><ChevronRight size={18} /></button>
                </div>
              )}
              <div className="kd-seg">
                {[{ id: "all", label: "Все заявки" }, { id: "ours", label: "Наши" }, { id: "partner", label: "Партнёрские" }].map((p) => (
                  <button key={p.id} className={`kd-segbtn ${brandFilter === p.id ? "on" : ""}`} onClick={() => setBrandFilter(p.id)}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="kd-twocol">
              <div className="kd-card">
                <div className="kd-section">Итоги · {range.label}{brandFilter !== "all" ? ` · ${brandFilter === "ours" ? "наши заявки" : "партнёрские"}` : ""}</div>
                <div className="kd-row"><span>Выручка</span><strong>{fmt(fin.revenue)} ₸</strong></div>
                <div className="kd-row"><span>· наличными</span><span className="kd-muted">{fmt(fin.cash)} ₸</span></div>
                <div className="kd-row"><span>· QR / переводом</span><span className="kd-muted">{fmt(fin.qr)} ₸</span></div>
                <div className="kd-row"><span>Себестоимость препаратов</span><strong style={{ color: "#B42318" }}>− {fmt(fin.cost)} ₸</strong></div>
                <div className="kd-row"><span>Доли партнёров</span><strong style={{ color: "#B42318" }}>− {fmt(fin.partnerShares)} ₸</strong></div>
                <div className="kd-row"><span>Комиссия банка по QR (0.95%)</span><strong style={{ color: "#B42318" }}>− {fmt(fin.qrFees)} ₸</strong></div>
                <div className="kd-row"><span>Прибыль по заявкам</span><strong>{fmt(fin.profit)} ₸</strong></div>
                <div className="kd-row"><span>Выплаты сотрудникам (зарплата/дорожные)</span><strong style={{ color: "#B42318" }}>− {fmt(expensesInRange)} ₸</strong></div>
                <div className="kd-row"><span>Операционные расходы</span><strong style={{ color: "#B42318" }}>− {fmt(opexInRange)} ₸</strong></div>
                <div className="kd-row total"><span>Итоговая прибыль</span><strong style={{ color: netProfit >= 0 ? "#0E7C66" : "#B42318" }}>{fmt(netProfit)} ₸</strong></div>
              </div>
              <div className="kd-card">
                <div className="kd-section">Источники клиентов</div>
                {Object.keys(fin.bySource).length === 0 && <div className="kd-muted">За период заявок нет.</div>}
                {Object.entries(fin.bySource).sort((a, b) => b[1].count - a[1].count).map(([key, v]) => (
                  <div className="kd-row" key={key}><span>{v.label}</span><span className="kd-twoval"><em>{v.count} заявок</em><strong>{fmt(v.revenue)} ₸</strong></span></div>
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
            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">По дезинфекторам · {range.label}</div>
              {techs.length === 0 && <div className="kd-muted">Дезинфекторов пока нет.</div>}
              {techs.length > 0 && Object.keys(fin.byTech).length === 0 && <div className="kd-muted">За период выполненных заявок нет.</div>}
              {techs.length > 0 && Object.keys(fin.byTech).length > 0 && (
                <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}><span>Сотрудник</span><span>Заявок</span><span>Выручка</span><span>Прибыль</span></div>
              )}
              {techs.map((t) => {
                const v = fin.byTech[t.id];
                if (!v) return null;
                const techProfit = v.revenue - v.cost;
                return (
                  <div className="kd-ledgerrow" key={t.id} style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}>
                    <span className="kd-ledgername">{t.full_name || "?"}</span>
                    <span>{v.count} зав.</span>
                    <span>{fmt(v.revenue)} ₸</span>
                    <strong style={{ color: "#0E7C66" }}>{fmt(techProfit)} ₸</strong>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && tab === "opex" && (
          <>
            <div className="kd-periodbar">
              <div className="kd-seg">
                {[{ id: "all", label: "Всё время" }, { id: "week", label: "Неделя" }, { id: "month", label: "Месяц" }].map((p) => (
                  <button key={p.id} className={`kd-segbtn ${pMode === p.id ? "on" : ""}`} onClick={() => { setPMode(p.id); setPOff(0); }}>{p.label}</button>
                ))}
              </div>
              {pMode !== "all" && (
                <div className="kd-pernav">
                  <button className="kd-arrow" onClick={() => setPOff(pOff - 1)}><ChevronLeft size={18} /></button>
                  <span className="kd-perlabel">{range.label}</span>
                  <button className="kd-arrow" disabled={pOff >= 0} onClick={() => setPOff(pOff + 1)}><ChevronRight size={18} /></button>
                </div>
              )}
            </div>

            <div className="kd-card" style={{ marginBottom: 14 }}>
              <div className="kd-section">Операционные расходы · {range.label}</div>
              {(() => {
                const byCat = {};
                opexInRangeList.forEach((o) => {
                  const cid = o.category_id || "none";
                  if (!byCat[cid]) byCat[cid] = 0;
                  byCat[cid] += Number(o.amount) || 0;
                });
                const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
                if (rows.length === 0) return <div className="kd-muted">За период расходов нет.</div>;
                return (<>
                  {rows.map(([cid, sum]) => (
                    <div className="kd-row" key={cid}><span>{cid === "none" ? "Без категории" : catName(cid)}</span><strong>{fmt(sum)} ₸</strong></div>
                  ))}
                  <div className="kd-row total"><span>Всего за период</span><strong style={{ color: "#B42318" }}>{fmt(opexInRange)} ₸</strong></div>
                </>);
              })()}
            </div>

            <div className="kd-list">
              {opexInRangeList.length === 0 && <div className="kd-empty">Пока нет расходов за этот период. Добавь через «+ Расход» — аренда, реклама, налоги, зарплаты администрации и т.п.</div>}
              {opexInRangeList.map((o) => (
                <div key={o.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{catName(o.category_id)}{o.subcategory_id ? " · " + catName(o.subcategory_id) : ""}</div>
                    <strong style={{ color: "#B42318", fontSize: 16 }}>− {fmt(o.amount)} ₸</strong>
                  </div>
                  <div className="kd-meta"><span>{isoToRu(o.spent_date) || "без даты"}</span></div>
                  {o.note && <div className="kd-notebox">📝 {o.note}</div>}
                  <div className="kd-actions">
                    <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "opex", opex: o })}><Pencil size={13} />Изменить</button>
                    <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить расход «${catName(o.category_id)} · ${fmt(o.amount)} ₸»?`, () => removeOpex(o))}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && tab === "stock" && (
          <div className="kd-list">
            <div className="kd-card">
              <div className="kd-section">Активы</div>
              <div className="kd-row"><span>Препараты на складе</span><strong>{fmt(totalStockValue)} ₸</strong></div>
              <div className="kd-row total"><span>Оборудование и СИЗ на руках у сотрудников</span><strong>{fmt(totalEquipValue)} ₸</strong></div>
            </div>
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

            <div className="kd-tabbar" style={{ marginTop: 6 }}>
              <div className="kd-title" style={{ fontSize: 17 }}>Оборудование и СИЗ</div>
              {isAdmin && <button className="kd-btn primary sm" onClick={() => setModal({ kind: "equip" })}><Plus size={14} />Позиция</button>}
            </div>
            {equipment.length === 0 && <div className="kd-empty">Пока ничего не заведено — генераторы, опрыскиватели, канистры, комбинезоны, перчатки и т.п.</div>}
            {equipment.map((e) => {
              const issuedQty = equipIssuedQty(e.id);
              return (
                <div key={e.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{e.name}</div>
                    <span className="kd-badge" style={{ color: "#7C3AED", background: "#F1ECFE" }}>{EQUIP_CATEGORIES[e.category] || e.category}</span>
                  </div>
                  <div className="kd-stockgrid">
                    <div><span>Единица</span><strong>{e.unit}</strong></div>
                    <div><span>Цена за ед.</span><strong>{fmt(e.price)} ₸</strong></div>
                    <div><span>Выдано (на руках)</span><strong>{issuedQty} {e.unit}</strong></div>
                    <div><span>Стоимость на руках</span><strong>{fmt(issuedQty * (Number(e.price) || 0))} ₸</strong></div>
                  </div>
                  {isAdmin && (
                    <div className="kd-actions">
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "equip", item: e })}><Pencil size={13} />Изменить</button>
                      <button className="kd-btn ghost danger sm" onClick={() => removeEquipment(e)}>Удалить</button>
                    </div>
                  )}
                </div>
              );
            })}
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
                    <div className="kd-actions" style={{ marginBottom: 0 }}>
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "techedit", tech: t })}><Pencil size={13} />Имя</button>
                      <button className="kd-btn primary sm" onClick={() => setModal({ kind: "handout", tech: t })}>Выдать / остаток</button>
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "expense", tech: t })}><Plus size={13} />Выплата</button>
                    </div>
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
                  {(() => {
                    const techExp = expenses.filter((e) => e.tech_id === t.id);
                    if (techExp.length === 0) return null;
                    const owed = techExp.filter((e) => e.status !== "paid").reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    return (
                      <div className="kd-ledger">
                        <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}><span>Выплата</span><span>Сумма</span><span>Статус</span><span></span></div>
                        {techExp.map((e) => (
                          <div className="kd-ledgerrow" key={e.id} style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}>
                            <span className="kd-ledgername">{EXPENSE_TYPES[e.type] || e.type}{e.note ? " · " + e.note : ""}</span>
                            <span>{fmt(e.amount)} ₸</span>
                            <span style={{ color: e.status === "paid" ? "#0E7C66" : "#B42318", fontWeight: 700 }}>{e.status === "paid" ? "выплачено" : "к выплате"}</span>
                            <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button className="kd-btn ghost sm" onClick={() => setExpenseStatus(e, e.status === "paid" ? "unpaid" : "paid")}>{e.status === "paid" ? "Отменить" : "Выплатить"}</button>
                              <button className="kd-btn ghost danger sm" onClick={() => removeExpense(e)}><Trash2 size={13} /></button>
                            </span>
                          </div>
                        ))}
                        {owed > 0 && <div className="kd-muted" style={{ marginTop: 6, fontWeight: 700, color: "#B42318" }}>К выплате всего: {fmt(owed)} ₸</div>}
                      </div>
                    );
                  })()}
                  <div className="kd-ledger">
                    <div className="kd-tabbar" style={{ marginBottom: 8 }}>
                      <span className="kd-section" style={{ margin: 0 }}>Оборудование</span>
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "issueEquip", tech: t })}><Plus size={13} />Выдать</button>
                    </div>
                    {techEquipment(t.id).length === 0
                      ? <div className="kd-muted">На руках оборудования нет.</div>
                      : (<>
                        <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.4fr .7fr 1fr 1fr 1.2fr" }}><span>Позиция</span><span>Кол-во</span><span>Выдано</span><span>Стоимость</span><span></span></div>
                        {techEquipment(t.id).map((r) => (
                          <div className="kd-ledgerrow" key={r.handout.id} style={{ gridTemplateColumns: "1.4fr .7fr 1fr 1fr 1.2fr" }}>
                            <span className="kd-ledgername">{r.equip.name}{r.handout.note ? " · " + r.handout.note : ""}</span>
                            <span>{r.handout.qty} {r.equip.unit}</span>
                            <span>{isoToRu(r.handout.handout_date) || "—"}</span>
                            <strong>{fmt((Number(r.handout.qty) || 0) * (Number(r.equip.price) || 0))} ₸</strong>
                            <span style={{ display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap" }}>
                              <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "transferEquip", handout: r.handout })}>Передать</button>
                              <button className="kd-btn ghost sm" onClick={() => setEquipStatus(r.handout, "returned")}>Возврат</button>
                              <button className="kd-btn ghost danger sm" onClick={() => setEquipStatus(r.handout, "broken")}>Сломано</button>
                            </span>
                          </div>
                        ))}
                      </>)}
                  </div>
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
                    <button className="kd-partnername" onClick={() => setModal({ kind: "partnerJobs", partner: p })}>{p.name}</button>
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
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "partnerJobs", partner: p })}>Заявки</button>
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

      {modal?.kind === "new" && <JobFormModal title="Новая заявка" submitLabel="Создать" partners={partners} sources={sources} pestTypes={pestTypes} defaultGuarantee={defaultGuarantee} onClose={() => setModal(null)} onSave={createJob} />}
      {modal?.kind === "edit" && <JobFormModal title="Изменить заявку" submitLabel="Сохранить" keepStatus partners={partners} sources={sources} pestTypes={pestTypes} initial={jobToForm(modal.job)} onClose={() => setModal(null)} onSave={(payload) => editJob(modal.job, payload)} />}
      {modal?.kind === "assign" && <AssignModal job={modal.job} techs={techs} onClose={() => setModal(null)} onSave={assignJob} />}
      {modal?.kind === "report" && <ReportModal job={modal.job} chemicals={chemicals} onClose={() => setModal(null)} onSave={submitReport} />}
      {modal?.kind === "reportSuccess" && <ReportSuccessModal onClose={() => setModal(null)} />}
      {modal?.kind === "view" && <ViewModal job={modal.job} chemicals={chemicals} performedBy={profileById(modal.job.reported_by)?.full_name || techById(modal.job.assigned_to)?.full_name} onClose={() => setModal(null)} />}
      {modal?.kind === "details" && <DetailsModal job={modal.job} header={brandHeaderOf(modal.job)} onReport={() => setModal({ kind: "report", job: modal.job })} onClose={() => setModal(null)} />}
      {modal?.kind === "history" && <HistoryModal job={modal.job} jobs={jobs} onClose={() => setModal(null)} onOpen={(j) => setModal(j.status === "done" ? { kind: "view", job: j } : { kind: "edit", job: j })} />}
      {modal?.kind === "addchem" && <AddChemModal onClose={() => setModal(null)} onSave={addChem} />}
      {modal?.kind === "stockin" && <StockInModal chem={modal.chem} onClose={() => setModal(null)} onSave={stockIn} />}
      {modal?.kind === "handout" && <HandoutModal tech={modal.tech} chemicals={chemicals} onClose={() => setModal(null)} onSave={addHandout} />}
      {modal?.kind === "expense" && <ExpenseModal tech={modal.tech} onClose={() => setModal(null)} onSave={saveExpense} />}
      {modal?.kind === "techedit" && <TechEditModal tech={modal.tech} onClose={() => setModal(null)} onSave={(payload) => editTechProfile(modal.tech, payload)} />}
      {modal?.kind === "equip" && <EquipModal item={modal.item} onClose={() => setModal(null)} onSave={saveEquipment} />}
      {modal?.kind === "issueEquip" && <IssueEquipModal tech={modal.tech} equipment={equipment} onClose={() => setModal(null)} onSave={issueEquipment} />}
      {modal?.kind === "transferEquip" && <TransferEquipModal handout={modal.handout} techs={techs.filter((t) => t.id !== modal.handout.tech_id)} onClose={() => setModal(null)} onSave={(newTechId, note) => transferEquipment(modal.handout, newTechId, note)} />}
      {modal?.kind === "reportEquip" && <ReportEquipModal equip={modal.equip} status={modal.status} onClose={() => setModal(null)} onSave={(note) => reportEquipIssue(modal.handout, modal.status, note)} />}
      {modal?.kind === "settings" && (
        <SettingsModal
          settings={settings} sources={sources} pestTypes={pestTypes} expCats={expCats}
          onClose={() => setModal(null)}
          onSaveSetting={saveAppSetting}
          onSetTheme={setTheme}
          onAddSource={(name) => addCatalogItem("client_sources", name)}
          onRemoveSource={(item) => removeCatalogItem("client_sources", item)}
          onAddPest={(name) => addCatalogItem("pest_types", name)}
          onRemovePest={(item) => removeCatalogItem("pest_types", item)}
          onAddExpCat={addExpCat}
          onRemoveExpCat={removeExpCat}
        />
      )}
      {modal?.kind === "opex" && <OpexModal opex={modal.opex} expCats={expCats} onClose={() => setModal(null)} onSave={saveOpex} />}
      {modal?.kind === "partner" && <PartnerModal partner={modal.partner} onClose={() => setModal(null)} onSave={savePartner} />}
      {modal?.kind === "partnerJobs" && <PartnerJobsModal partner={modal.partner} jobs={jobs.filter((j) => j.partner_id === modal.partner.id)} shareOf={partnerShareAmt} onClose={() => setModal(null)}
        onOpenClient={(phone) => { setSearch(phone); setTab("done"); setModal(null); }} />}
      {modal?.kind === "doc" && <DocModal doc={modal.doc} partners={partners} onClose={() => setModal(null)} onSave={saveDoc} />}
      {confirmState && (
        <ConfirmModal message={confirmState.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onYes(); setConfirmState(null); }} />
      )}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

function JobCard({ job, isAdmin, assignedName, partnerName, partnerRepeat, share, onCopy, onReport, onAssign, onView, onEdit, onRepeat, onPayPartner, onHistory, onOpenDetails, onDelete }) {
  const st = STATUS[job.status] || STATUS.new;
  const brandLabel = job.brand === "Sanitex" ? "Sanitex" : job.brand === "partner" ? "Партнёр" : "KazDez";
  const needsFollowup = job.type === "Первичная" && job.status === "done" && !job.repeat_state && daysSince(job.reported_at) >= 5;
  return (
    <div className={`kd-card ${job.status === "done" ? "done" : ""} ${needsFollowup ? "low" : ""}`}>
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
        {needsFollowup && <span className="kd-followuptag">💬 пора связаться · {daysSince(job.reported_at)} дн. после первичной</span>}
      </div>
      <div className="kd-card-foot">
        <button className="kd-clientlink" onClick={onHistory} title="Показать все заявки этого клиента">Клиент: {job.client_phone}</button>
        {isAdmin && job.partner_id && <span className="kd-muted">Партнёр: {partnerName || "?"}{job.joint_work ? ` · совместная работа · доля в прибыли ${job.partner_share ?? 0}%${job.joint_supplier === "us" ? ` · его расходы ${job.joint_cost_share ?? 0}%` : " · препараты партнёра"}` : ` · доля ${job.partner_share ?? 0}%`}</span>}
        {isAdmin && job.brand === "partner" && partnerRepeat && <span className="kd-muted">Повтор: {partnerRepeat}</span>}
        {isAdmin && share > 0 && <span className={job.partner_paid ? "kd-muted paid" : "kd-muted"}>Доля партнёру: {fmt(share)} ₸ · {job.partner_paid ? "выплачено" : "к выплате"}</span>}
        {isAdmin && <span className="kd-muted">{assignedName ? "Дезинфектор: " + assignedName : "Не назначен"}</span>}
        {job.report_paid != null && <span className="kd-muted paid">Оплачено: {fmt(job.report_paid)} ₸</span>}
      </div>
      <div className="kd-actions">
        {isAdmin && <button className="kd-btn wa" onClick={onCopy}><MessageCircle size={15} />Скопировать для WhatsApp</button>}
        {!isAdmin && job.status !== "done" && <button className="kd-btn ghost" onClick={onOpenDetails}>Открыть</button>}
        {job.status !== "done" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
        {isAdmin && <button className="kd-btn ghost" onClick={onAssign}><UserPlus size={14} />{assignedName ? "Переназначить" : "Назначить"}</button>}
        {isAdmin && <button className="kd-btn ghost" onClick={onEdit}><Pencil size={14} />Изменить</button>}
        {job.status === "done" && <button className="kd-btn ghost" onClick={onView}>Отчёт</button>}
        {isAdmin && job.status === "done" && !job.repeat_state && <button className="kd-btn ghost" onClick={onRepeat}>На повтор</button>}
        {isAdmin && share > 0 && <button className="kd-btn ghost" onClick={() => onPayPartner(!job.partner_paid)}>{job.partner_paid ? "Отменить выплату" : "Выплатить долю"}</button>}
        {isAdmin && <button className="kd-btn ghost danger sm" onClick={onDelete} title="Удалить"><Trash2 size={14} /></button>}
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
function ConfirmModal({ message, onCancel, onConfirm }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-body" style={{ paddingTop: 22, textAlign: "center" }}>
          <div className="kd-confirm-icon"><Trash2 size={22} /></div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 12, lineHeight: 1.4 }}>{message}</div>
        </div>
        <div className="kd-modal-foot" style={{ justifyContent: "center" }}>
          <button className="kd-btn ghost" onClick={onCancel}>Отмена</button>
          <button className="kd-btn primary danger" onClick={onConfirm}>Да, удалить</button>
        </div>
      </div>
    </div>
  );
}

function ReportSuccessModal({ onClose }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-body" style={{ paddingTop: 26, paddingBottom: 6, textAlign: "center" }}>
          <div className="kd-success-icon"><CheckCircle2 size={26} /></div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, marginTop: 14 }}>Изменения сохранены!</div>
          <div className="kd-muted" style={{ marginTop: 6 }}>Красавчик 👏 Отчёт ушёл админу.</div>
        </div>
        <div className="kd-modal-foot" style={{ justifyContent: "center" }}>
          <button className="kd-btn primary" onClick={onClose}>Отлично</button>
        </div>
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-head"><h3>{title}</h3><button className="kd-x" onClick={onClose}><X size={16} /></button></div>
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
  const [timeFrom, timeTo] = (job.scheduled_time || "").split(/[–-]/).map((s) => s.trim());
  return {
    type: job.type || "Первичная", scheduled_date: job.scheduled_date || "", time_from: timeFrom || "", time_to: timeTo || "",
    address: job.address || "", floor: job.floor || "", area: job.area ?? "", source: job.source || "", pest: job.pest || "",
    p1label: po[0]?.label || "С запахом", p1amount: po[0]?.amount ?? "",
    p2label: po[1]?.label || "Без запаха", p2amount: po[1]?.amount ?? "",
    client_phone: job.client_phone || "+7 ", guarantee_months: job.guarantee_months ?? 6,
    brand: job.brand || "KazDez", partner_id: job.partner_id || "", partner_share: job.partner_share ?? "",
    note: job.note || "", joint_work: !!job.joint_work, joint_supplier: job.joint_supplier || "us", joint_cost_share: job.joint_cost_share ?? "",
  };
}

function JobFormModal({ initial, title, submitLabel, keepStatus, partners = [], sources = [], pestTypes = [], defaultGuarantee = 6, onClose, onSave }) {
  const [f, setF] = useState(initial || { type: "Первичная", scheduled_date: "", time_from: "", time_to: "", address: "", floor: "", area: "", source: "", pest: "", p1label: "С запахом", p1amount: "", p2label: "Без запаха", p2amount: "", client_phone: "+7 ", guarantee_months: defaultGuarantee, brand: "KazDez", partner_id: "", partner_share: "", note: "", joint_work: false, joint_supplier: "us", joint_cost_share: "" });
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
    const scheduled_time = f.time_from ? (f.time_to ? `${f.time_from}–${f.time_to}` : f.time_from) : "";
    const isPartner = f.brand === "partner";
    const payload = { type: f.type, scheduled_date: f.scheduled_date || null, scheduled_time, address: f.address, floor: f.floor, area: f.area ? Number(f.area) : null, source: f.source, pest: f.pest, price_options, client_phone: f.client_phone, guarantee_months: Number(f.guarantee_months) || 6, brand: f.brand, partner_id: isPartner ? (f.partner_id || null) : null, partner_share: isPartner ? (Number(f.partner_share) || 0) : null, note: f.note || null, joint_work: isPartner && !!f.joint_work, joint_supplier: isPartner && f.joint_work ? f.joint_supplier : "us", joint_cost_share: isPartner && f.joint_work && f.joint_supplier === "us" ? (Number(f.joint_cost_share) || 0) : null };
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
        <Field label="Тип"><select value={f.type} onChange={set("type")}><option>Первичная</option><option>Вторичная</option><option>Плановая</option><option>Тендерная</option><option>Гарантийная</option><option>Осмотр</option></select></Field>
      </div>
      {f.brand === "partner" && (
        <>
          <div className="kd-grid2">
            <Field label="Партнёр"><select value={f.partner_id} onChange={onPartner}><option value="">— выбери —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label={f.joint_work ? "Доля партнёра в прибыли (%)" : "Доля партнёра (%)"}><input value={f.partner_share} onChange={set("partner_share")} inputMode="numeric" placeholder="50" /></Field>
          </div>
          <label className="kd-check"><input type="checkbox" checked={f.joint_work} onChange={(e) => setF({ ...f, joint_work: e.target.checked })} /><span>Совместная работа — едем на объект вместе, делим расходы и прибыль</span></label>
          {f.joint_work && (
            <div className="kd-grid2">
              <Field label="Кто привозит препараты"><select value={f.joint_supplier} onChange={set("joint_supplier")}><option value="us">Мы (со своего склада)</option><option value="partner">Партнёр (свои)</option></select></Field>
              {f.joint_supplier === "us" && <Field label="Доля партнёра в расходах (%)"><input value={f.joint_cost_share} onChange={set("joint_cost_share")} inputMode="numeric" placeholder="50" /></Field>}
            </div>
          )}
        </>
      )}
      <datalist id="kd-pests-list">{pestTypes.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <datalist id="kd-sources-list">{sources.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <div className="kd-grid2">
        <Field label="Вид (вредитель)"><input list="kd-pests-list" value={f.pest} onChange={set("pest")} placeholder="Тараканы" /></Field>
        <Field label="Источник"><input list="kd-sources-list" value={f.source} onChange={set("source")} placeholder="OLX" /></Field>
      </div>
      <div className="kd-grid3">
        <Field label="Дата"><input type="date" value={f.scheduled_date} onChange={set("scheduled_date")} /></Field>
        <Field label="Время с"><input type="time" value={f.time_from} onChange={set("time_from")} /></Field>
        <Field label="Время до (необязательно)"><input type="time" value={f.time_to} onChange={set("time_to")} /></Field>
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

function PartnerJobsModal({ partner, jobs, shareOf, onClose, onOpenClient }) {
  const share = shareOf;
  const list = [...jobs].sort((a, b) => new Date(b.scheduled_date || b.created_at || 0) - new Date(a.scheduled_date || a.created_at || 0));
  const owed = list.filter((j) => j.status === "done" && !j.partner_paid).reduce((s, j) => s + share(j), 0);
  return (
    <ModalShell title={`Заявки партнёра · ${partner.name}`} onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Всего заявок: {list.length} · к выплате: {fmt(owed)} ₸</div>
      {list.length === 0 && <div className="kd-empty">У этого партнёра пока нет заявок.</div>}
      {list.map((j) => {
        const st = STATUS[j.status] || STATUS.new;
        const sh = share(j);
        return (
          <div key={j.id} className="kd-histrow" style={{ cursor: "default" }}>
            <div>
              <div className="kd-histmain">{j.type} · {j.pest}</div>
              <div className="kd-muted">{isoToRu(j.scheduled_date) || "без даты"} · {j.address}</div>
              <button className="kd-clientlink" onClick={() => onOpenClient(j.client_phone)} style={{ marginTop: 3 }}>Клиент: {j.client_phone}</button>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
              {sh > 0 && <div className="kd-muted" style={{ marginTop: 4, color: j.partner_paid ? "#0E7C66" : "#B42318", fontWeight: 700 }}>{fmt(sh)} ₸ · {j.partner_paid ? "выплачено" : "к выплате"}</div>}
            </div>
          </div>
        );
      })}
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
      const f = chemUnit(ch?.unit_kind).factor || 1000;
      const base = c.unit === "big" ? (Number(c.amount) || 0) * f : (Number(c.amount) || 0);
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
            <select value={c.unit} onChange={setChem(i, "unit")} disabled={u.factor === 1}>
              <option value="small">{u.small}</option>
              {u.factor !== 1 && <option value="big">{u.big}</option>}
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

function DetailsModal({ job, header, onReport, onClose }) {
  const [view, setView] = useState("card");
  const [copied, setCopied] = useState(false);
  const msg = buildMsg(job, header);
  const prices = (job.price_options || []).filter((p) => p.amount);
  function doCopy() { copyText(msg, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }
  return (
    <ModalShell title="Заявка" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Закрыть</button>
      {job.status !== "done" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
    </>}>
      <div className="kd-seg" style={{ marginBottom: 16, width: "100%" }}>
        <button className={`kd-segbtn ${view === "card" ? "on" : ""}`} onClick={() => setView("card")}>Карточка</button>
        <button className={`kd-segbtn ${view === "wa" ? "on" : ""}`} onClick={() => setView("wa")}>Как в WhatsApp</button>
      </div>

      {view === "card" ? (
        <>
          <div className="kd-row"><span>Бренд</span><strong>{header}</strong></div>
          <div className="kd-row"><span>Тип</span><strong>{job.type}</strong></div>
          <div className="kd-row"><span>Вид</span><strong>{job.pest}</strong></div>
          <div className="kd-row"><span>Дата и время</span><strong>{isoToRu(job.scheduled_date) || "—"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</strong></div>
          <div className="kd-row"><span>Адрес</span><strong style={{ textAlign: "right" }}>{job.address}</strong></div>
          {job.floor && <div className="kd-row"><span>Этаж</span><strong>{job.floor}</strong></div>}
          {job.area && <div className="kd-row"><span>Метраж</span><strong>{job.area} м²</strong></div>}
          {prices.length > 0 && (
            <>
              <div className="kd-section" style={{ marginTop: 12 }}>Цена</div>
              {prices.map((p, i) => (<div className="kd-row" key={i}><span>{p.label || "Вариант " + (i + 1)}</span><strong>{fmt(p.amount)} ₸</strong></div>))}
            </>
          )}
          <div className="kd-row"><span>Телефон клиента</span><strong><a href={`tel:${(job.client_phone || "").replace(/\s/g, "")}`} style={{ color: "var(--primary-d)" }}>{job.client_phone}</a></strong></div>
          {job.type !== "Осмотр" && <div className="kd-row"><span>Гарантия</span><strong>{job.guarantee_months || 6} мес.</strong></div>}
          {job.note && <div className="kd-notebox" style={{ marginTop: 12 }}>📝 {job.note}</div>}
        </>
      ) : (
        <>
          <pre className="kd-watext">{msg}</pre>
          <button className="kd-btn wa wide" onClick={doCopy}><MessageCircle size={15} />{copied ? "Скопировано ✓" : "Скопировать текст"}</button>
        </>
      )}
    </ModalShell>
  );
}

function ViewModal({ job, chemicals, performedBy, onClose }) {
  const hasSplit = (job.report_cash || 0) > 0 && (job.report_qr || 0) > 0;
  const chemOf = (l) => (l.chemical_id ? (chemicals || []).find((x) => x.id === l.chemical_id) : (chemicals || []).find((x) => norm(x.name) === norm(l.name)));
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}</div>
      <div className="kd-row"><span>Выполнил</span><strong>{performedBy || "не указано"}</strong></div>
      {job.reported_at && <div className="kd-row"><span>Дата отчёта</span><strong>{fmtTs(job.reported_at)}</strong></div>}
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
    const f = u.factor || 1000;
    await onSave({ name, unit_kind: unitKind, purchased_ml: (Number(qty) || 0) * f, price_per_liter: Number(price) || 0, min_ml: (Number(minQ) || 0) * f });
    setSaving(false);
  }
  return (
    <ModalShell title="Препарат на склад" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Добавить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Культ / контейнеры / ловушки" /></Field>
        <Field label="Измеряется в">
          <select value={unitKind} onChange={(e) => setUnitKind(e.target.value)}>
            <option value="volume">Объём (мл/л)</option>
            <option value="weight">Вес (г/кг)</option>
            <option value="piece">Поштучно (шт)</option>
            <option value="pack">Упаковками (уп.)</option>
          </select>
        </Field>
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
    await onSave(chem, (Number(qty) || 0) * (u.factor || 1000), price ? Number(price) : null);
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
    const base = unit === "big" ? (Number(amount) || 0) * (u.factor || 1000) : (Number(amount) || 0);
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
          <select value={unit} onChange={(e) => setUnit(e.target.value)} disabled={u.factor === 1}>
            <option value="small">{u.small}</option>
            {u.factor !== 1 && <option value="big">{u.big}</option>}
          </select>
        </Field>
      </div>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="выдал на объект ..." /></Field>
    </ModalShell>
  );
}

function ExpenseModal({ tech, onClose, onSave }) {
  const [type, setType] = useState("salary");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("unpaid");
  const [saving, setSaving] = useState(false);
  const ok = Number(amount) > 0;
  async function save() {
    setSaving(true);
    await onSave({ tech_id: tech.id, type, amount: Number(amount) || 0, expense_date: expenseDate || null, note, status });
    setSaving(false);
  }
  return (
    <ModalShell title={`Выплата — ${tech.full_name || "сотрудник"}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Тип"><select value={type} onChange={(e) => setType(e.target.value)}><option value="salary">Зарплата</option><option value="travel">Дорожные</option><option value="other">Другое</option></select></Field>
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="30000" /></Field>
      </div>
      <div className="kd-grid2">
        <Field label="Дата"><input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></Field>
        <Field label="Статус"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="unpaid">К выплате</option><option value="paid">Выплачено</option></select></Field>
      </div>
      <Field label="Заметка"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="за какой период / комментарий" /></Field>
    </ModalShell>
  );
}

function TechEditModal({ tech, onClose, onSave }) {
  const [fullName, setFullName] = useState(tech.full_name || "");
  const [phone, setPhone] = useState(tech.phone || "");
  const [saving, setSaving] = useState(false);
  const ok = fullName.trim();
  async function save() { setSaving(true); await onSave({ full_name: fullName.trim(), phone: phone.trim() || null }); setSaving(false); }
  return (
    <ModalShell title="Данные дезинфектора" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Логин и пароль этим не затрагиваются — меняется только отображаемое имя и телефон в приложении.</div>
      <Field label="Имя (как будет видно в приложении)"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Байсеит" /></Field>
      <Field label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 701 ..." /></Field>
    </ModalShell>
  );
}

function EquipModal({ item, onClose, onSave }) {
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "equipment");
  const [unit, setUnit] = useState(item?.unit || "шт");
  const [price, setPrice] = useState(item?.price ?? "");
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() { setSaving(true); await onSave({ name: name.trim(), category, unit: unit.trim() || "шт", price: Number(price) || 0 }, item); setSaving(false); }
  return (
    <ModalShell title={item ? "Изменить позицию" : "Новая позиция на склад"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Генератор холодного тумана" /></Field>
      <div className="kd-grid2">
        <Field label="Категория"><select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(EQUIP_CATEGORIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <Field label="Единица"><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт / пара / компл." /></Field>
      </div>
      <Field label="Цена за единицу (₸) — видно только админу"><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="450000" /></Field>
    </ModalShell>
  );
}

function IssueEquipModal({ tech, equipment, onClose, onSave }) {
  const [equipId, setEquipId] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = equipId && Number(qty) > 0;
  async function save() { setSaving(true); await onSave({ tech_id: tech.id, equipment_id: equipId, qty: Number(qty) || 1, handout_date: date || null, note, status: "with_tech" }); setSaving(false); }
  return (
    <ModalShell title={`Выдать оборудование — ${tech.full_name || "сотрудник"}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Выдать"}</button>
    </>}>
      {equipment.length === 0 && <div className="kd-muted" style={{ marginBottom: 10 }}>Сначала заведи позицию на складе (вкладка «Склад» → «Оборудование и СИЗ»).</div>}
      <Field label="Позиция"><select value={equipId} onChange={(e) => setEquipId(e.target.value)}><option value="">— выбери —</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      <div className="kd-grid2">
        <Field label="Количество"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="1" /></Field>
        <Field label="Дата выдачи"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="на какой объект / комментарий" /></Field>
    </ModalShell>
  );
}

function TransferEquipModal({ handout, techs, onClose, onSave }) {
  const [newTechId, setNewTechId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(newTechId, note); setSaving(false); }
  return (
    <ModalShell title="Передать другому сотруднику" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!newTechId || saving} onClick={save}>{saving ? "…" : "Передать"}</button>
    </>}>
      {techs.length === 0 && <div className="kd-muted" style={{ marginBottom: 10 }}>Больше некому передать — нет других дезинфекторов.</div>}
      <Field label="Кому передать"><select value={newTechId} onChange={(e) => setNewTechId(e.target.value)}><option value="">— выбери —</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>)}</select></Field>
      <Field label="Заметка (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="причина передачи" /></Field>
    </ModalShell>
  );
}

function ReportEquipModal({ equip, status, onClose, onSave }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(note); setSaving(false); }
  return (
    <ModalShell title={status === "broken" ? "Сообщить о поломке" : "Сообщить о потере"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Отправить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{equip?.name}. Админ увидит это в журнале и решит вопрос с заменой.</div>
      <Field label="Что случилось (по возможности опиши)"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: не заводится, разбит бак и т.п." /></Field>
    </ModalShell>
  );
}

function CatalogList({ items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = useState("");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 }} />
        <button className="kd-btn primary sm" onClick={() => { onAdd(val); setVal(""); }} disabled={!val.trim()}><Plus size={14} /></button>
      </div>
      {items.length === 0 && <div className="kd-muted">Список пуст.</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((it) => (
          <span key={it.id} className="kd-price" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {it.name}
            <button onClick={() => onRemove(it)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}><X size={13} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function SettingsModal({ settings, sources, pestTypes, expCats, onClose, onSaveSetting, onSetTheme, onAddSource, onRemoveSource, onAddPest, onRemovePest, onAddExpCat, onRemoveExpCat }) {
  const [theme, setThemeLocal] = useState(localStorage.getItem("kd-theme") || "light");
  const [qrRate, setQrRate] = useState(settings.qr_fee_rate ?? 0.95);
  const [guarantee, setGuarantee] = useState(settings.default_guarantee_months ?? 6);
  const [newCat, setNewCat] = useState("");
  const [subInputs, setSubInputs] = useState({});
  function pickTheme(t) { setThemeLocal(t); onSetTheme(t); }
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subsOf = (pid) => (expCats || []).filter((c) => c.parent_id === pid);
  return (
    <ModalShell title="Настройки" onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Готово</button>}>
      <div className="kd-section">Оформление</div>
      <div className="kd-seg" style={{ marginBottom: 18 }}>
        <button className={`kd-segbtn ${theme === "light" ? "on" : ""}`} onClick={() => pickTheme("light")}>Светлая</button>
        <button className={`kd-segbtn ${theme === "dark" ? "on" : ""}`} onClick={() => pickTheme("dark")}>Тёмная</button>
      </div>
      <div className="kd-muted" style={{ marginTop: -10, marginBottom: 18 }}>Применяется на этом устройстве сразу, без перезагрузки.</div>

      <div className="kd-section">Источники клиентов</div>
      <div style={{ marginBottom: 18 }}><CatalogList items={sources} onAdd={onAddSource} onRemove={onRemoveSource} placeholder="Напр.: Facebook" /></div>

      <div className="kd-section">Виды вредителей</div>
      <div style={{ marginBottom: 18 }}><CatalogList items={pestTypes} onAdd={onAddPest} onRemove={onRemovePest} placeholder="Напр.: Муравьи" /></div>

      <div className="kd-section">Категории расходов</div>
      <div className="kd-muted" style={{ marginBottom: 10 }}>Категория → внутри неё подкатегории. Например: «Реклама» → OLX, Instagram, Google.</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Новая категория (напр.: Аренда)"
          style={{ flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 }} />
        <button className="kd-btn primary sm" disabled={!newCat.trim()} onClick={() => { onAddExpCat(newCat, null); setNewCat(""); }}><Plus size={14} />Категория</button>
      </div>
      {parents.length === 0 && <div className="kd-muted" style={{ marginBottom: 18 }}>Категорий пока нет.</div>}
      {parents.map((cat) => (
        <div key={cat.id} className="kd-card" style={{ marginBottom: 10, padding: "13px 15px", boxShadow: "none" }}>
          <div className="kd-card-head" style={{ marginBottom: 8 }}>
            <div className="kd-pest" style={{ fontSize: 15 }}>{cat.name}</div>
            <button className="kd-btn ghost danger sm" onClick={() => onRemoveExpCat(cat)}><Trash2 size={13} /></button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
            {subsOf(cat.id).length === 0 && <span className="kd-muted">Без подкатегорий</span>}
            {subsOf(cat.id).map((sub) => (
              <span key={sub.id} className="kd-price" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                {sub.name}
                <button onClick={() => onRemoveExpCat(sub)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}><X size={13} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={subInputs[cat.id] || ""} onChange={(e) => setSubInputs({ ...subInputs, [cat.id]: e.target.value })} placeholder="Добавить подкатегорию"
              style={{ flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "9px 12px", minHeight: 40 }} />
            <button className="kd-btn ghost sm" disabled={!(subInputs[cat.id] || "").trim()} onClick={() => { onAddExpCat(subInputs[cat.id], cat.id); setSubInputs({ ...subInputs, [cat.id]: "" }); }}><Plus size={13} /></button>
          </div>
        </div>
      ))}
      <div style={{ marginBottom: 8 }} />

      <div className="kd-section">Финансы по умолчанию</div>
      <div className="kd-grid2">
        <Field label="Комиссия банка по QR (%)"><input value={qrRate} onChange={(e) => setQrRate(e.target.value)} inputMode="decimal" onBlur={() => onSaveSetting("qr_fee_rate", Number(qrRate) || 0)} /></Field>
        <Field label="Гарантия по умолчанию (мес.)"><input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} inputMode="numeric" onBlur={() => onSaveSetting("default_guarantee_months", Number(guarantee) || 6)} /></Field>
      </div>
      <div className="kd-muted">Сохраняется при выходе из поля. Значения применяются ко всем новым заявкам и расчётам.</div>
    </ModalShell>
  );
}

function OpexModal({ opex, expCats, onClose, onSave }) {
  const [categoryId, setCategoryId] = useState(opex?.category_id || "");
  const [subcategoryId, setSubcategoryId] = useState(opex?.subcategory_id || "");
  const [amount, setAmount] = useState(opex?.amount ?? "");
  const [spentDate, setSpentDate] = useState(opex?.spent_date || new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(opex?.note || "");
  const [saving, setSaving] = useState(false);
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subs = (expCats || []).filter((c) => c.parent_id === categoryId);
  const ok = categoryId && Number(amount) > 0;
  function onCat(e) { setCategoryId(e.target.value); setSubcategoryId(""); }
  async function save() {
    setSaving(true);
    await onSave({ category_id: categoryId || null, subcategory_id: subcategoryId || null, amount: Number(amount) || 0, spent_date: spentDate || null, note: note || null }, opex);
    setSaving(false);
  }
  return (
    <ModalShell title={opex ? "Изменить расход" : "Новый расход"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      {parents.length === 0 && <div className="kd-muted" style={{ marginBottom: 12 }}>Сначала заведи категории в Настройках (шестерёнка вверху) → «Категории расходов».</div>}
      <Field label="Категория"><select value={categoryId} onChange={onCat}><option value="">— выбери —</option>{parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {subs.length > 0 && <Field label="Подкатегория"><select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}><option value="">— без подкатегории —</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <div className="kd-grid2">
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" /></Field>
        <Field label="Дата"><input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} /></Field>
      </div>
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="за что именно / за какой месяц" /></Field>
    </ModalShell>
  );
}
