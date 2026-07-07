import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import ExcelJS from "exceljs";
import {
  ClipboardList, CheckCircle2, RefreshCw, Wallet, Package, Users, Handshake, FileText, History, Trash2,
  Plus, MessageCircle, Pencil, UserPlus, Download, Search, X, LogOut, Bug, ChevronLeft, ChevronRight, Wrench, Settings, Receipt, Banknote, XCircle, ListTodo, Calendar, Landmark, ArrowRightLeft, ArrowDownCircle, ArrowUpCircle, Gavel, ShieldCheck, FolderOpen, ExternalLink, GraduationCap, Contact, ArrowRight, CalendarClock,
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
const DEPOSIT_STATUS = { pending: { label: "Ожидает", color: "#B4650B", bg: "#FBEDD9" }, confirmed: { label: "Подтверждено", color: "#0E7C66", bg: "#E4F3EE" }, rejected: { label: "Отклонено", color: "#B3261E", bg: "#FBE7E5" } };
const TASK_TYPES = { errand: "Поручение", purchase: "Закупка", docs: "Документы", tender: "Тендер", other: "Прочее" };
const TASK_STATUS = { new: { label: "Новая", color: "#2563EB", bg: "#EAF1FE" }, in_progress: { label: "В работе", color: "#B4650B", bg: "#FBEDD9" }, done: { label: "Сделана", color: "#0E7C66", bg: "#E4F3EE" } };
const TENDER_STATUS = { participating: { label: "Участвуем", color: "#2563EB", bg: "#EAF1FE" }, won: { label: "Выиграли", color: "#0E7C66", bg: "#E4F3EE" }, executing: { label: "Исполняется", color: "#B4650B", bg: "#FBEDD9" }, closed: { label: "Закрыт", color: "#6E7871", bg: "#F0F0EE" }, lost: { label: "Проигран", color: "#B3261E", bg: "#FBE7E5" } };
const GUARANTEE_KINDS = { application: "Обеспечение заявки", dumping: "Демпинговое обеспечение", other: "Другое" };
const DRIVE_LINKS = [
  { key: "drive_tenders", label: "Тендеры", desc: "Документы по тендерам", emoji: "📁", place: "tenders" },
  { key: "drive_contracts", label: "Договоры", desc: "Договоры и приложения", emoji: "📄", place: "docs" },
  { key: "drive_marketing", label: "Маркетинг", desc: "Реклама, баннеры, макеты", emoji: "📣", place: "materials" },
  { key: "drive_safety", label: "Техника безопасности", desc: "Инструкции по ТБ", emoji: "🦺", place: "materials" },
  { key: "drive_training", label: "Обучение", desc: "Скрипты продаж и разговора с клиентами", emoji: "🎓", place: "knowledge" },
  { key: "drive_kp", label: "КП клиентов", desc: "Папка со всеми коммерческими предложениями", emoji: "📑", place: "leads" },
];
const TAB_LABELS = { jobs: "Заявки", schedule: "График", done: "Выполненные", canceled: "Отменённые", leads: "Клиенты", tasks: "Задачи", tenders: "Тендеры", repeats: "Повторы", finance: "Аналитика", opex: "Финансы", cash: "Касса", stock: "Склад", team: "Дезинфекторы", partners: "Партнёры", docs: "Документы", materials: "Материалы", knowledge: "База знаний", journal: "Журнал", trash: "Корзина" };
const ADMIN_TAB_ORDER = ["jobs", "schedule", "done", "canceled", "leads", "tasks", "tenders", "repeats", "finance", "opex", "cash", "stock", "team", "partners", "docs", "materials", "knowledge", "journal", "trash"];
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
const isoOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
// Возвращает {from, to} (ISO-строки включительно) для пресета, или null (=всё время)
function datePresetRange(preset) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const iso = (d) => isoOf(d);
  const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  switch (preset) {
    case "today": return { from: iso(now), to: iso(now) };
    case "tomorrow": { const d = shift(now, 1); return { from: iso(d), to: iso(d) }; }
    case "yesterday": { const d = shift(now, -1); return { from: iso(d), to: iso(d) }; }
    case "week": { const day = (now.getDay() + 6) % 7; const mon = shift(now, -day); const sun = shift(mon, 6); return { from: iso(mon), to: iso(sun) }; }
    case "month": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    case "quarter": { const q = Math.floor(now.getMonth() / 3); const f = new Date(now.getFullYear(), q * 3, 1); const t = new Date(now.getFullYear(), q * 3 + 3, 0); return { from: iso(f), to: iso(t) }; }
    default: return null;
  }
}
// filter = { preset, from, to } — проверяет ISO-дату заявки
function dateInFilter(dateIso, filter) {
  if (!filter || filter.preset === "all") return true;
  if (!dateIso) return false;
  let from, to;
  if (filter.preset === "custom") { from = filter.from || null; to = filter.to || filter.from || null; }
  else { const r = datePresetRange(filter.preset); if (!r) return true; from = r.from; to = r.to; }
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
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
  canceled: { label: "Отменена", color: "#B3261E", bg: "#FBE7E5" },
};

function timeStart(t) { const m = (t || "").match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "00:00"; }
function jobTime(j) { if (!j.scheduled_date) return Infinity; return new Date(`${j.scheduled_date}T${timeStart(j.scheduled_time)}`).getTime(); }
// Разбор "14:00–15:30" → { from: 840, to: 930 } (минуты от полуночи); null если времени нет
function timeRangeMin(t) {
  const all = [...String(t || "").matchAll(/(\d{1,2}):(\d{2})/g)];
  if (!all.length) return null;
  const from = Number(all[0][1]) * 60 + Number(all[0][2]);
  const to = all[1] ? Number(all[1][1]) * 60 + Number(all[1][2]) : from + 60; // без конца — час по умолчанию
  return { from, to: Math.max(to, from + 30) };
}
// Адрес без ссылок (для компактных карточек): вырезаем URL, если остался пустой — метка карты
function addressPlain(text) {
  const s = String(text || "").replace(/https?:\/\/[^\s]+/g, "").replace(/\s{2,}/g, " ").trim().replace(/[,;·]+$/, "");
  return s || (text ? "📍 точка на карте" : "");
}
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
function AddressText({ text }) {
  if (!text) return null;
  const urlMatch = String(text).match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return <>{text}</>;
  const url = urlMatch[0];
  const before = text.slice(0, urlMatch.index).trim();
  const after = text.slice(urlMatch.index + url.length).trim();
  return (
    <>
      {before && <span>{before} </span>}
      <a href={url} target="_blank" rel="noopener noreferrer" className="kd-maplink" onClick={(e) => e.stopPropagation()}>📍 Открыть на карте</a>
      {after && <span> {after}</span>}
    </>
  );
}
function DateFilterBar({ filter, onChange }) {
  const [showCustom, setShowCustom] = useState(filter.preset === "custom");
  const presets = [
    { id: "all", label: "Всё" }, { id: "today", label: "Сегодня" }, { id: "tomorrow", label: "Завтра" },
    { id: "yesterday", label: "Вчера" }, { id: "week", label: "Неделя" }, { id: "month", label: "Месяц" }, { id: "quarter", label: "Квартал" },
  ];
  function pick(id) { setShowCustom(false); onChange({ preset: id }); }
  return (
    <div className="kd-datefilter">
      <div className="kd-datechips">
        {presets.map((p) => (
          <button key={p.id} className={`kd-datechip ${filter.preset === p.id ? "on" : ""}`} onClick={() => pick(p.id)}>{p.label}</button>
        ))}
        <button className={`kd-datechip ${filter.preset === "custom" ? "on" : ""}`} onClick={() => { setShowCustom((v) => !v); if (filter.preset !== "custom") onChange({ preset: "custom", from: "", to: "" }); }}>
          <Calendar size={13} style={{ verticalAlign: -2, marginRight: 3 }} />Дата
        </button>
      </div>
      {(showCustom || filter.preset === "custom") && (
        <div className="kd-daterange">
          <input type="date" value={filter.from || ""} onChange={(e) => onChange({ preset: "custom", from: e.target.value, to: filter.to || "" })} />
          <span className="kd-muted">—</span>
          <input type="date" value={filter.to || ""} onChange={(e) => onChange({ preset: "custom", from: filter.from || "", to: e.target.value })} />
          <span className="kd-muted" style={{ fontSize: 12 }}>оставь второе пустым — один день</span>
        </div>
      )}
    </div>
  );
}
function DriveLinkCard({ link, url, isAdmin }) {
  return (
    <a href={url || undefined} target="_blank" rel="noopener noreferrer"
      className={`kd-drivecard ${url ? "" : "disabled"}`}
      onClick={(e) => { if (!url) e.preventDefault(); }}>
      <div className="kd-driveemoji">{link.emoji}</div>
      <div style={{ flex: 1 }}>
        <div className="kd-drivename">{link.label}</div>
        <div className="kd-drivedesc">{url ? link.desc : "Ссылка не задана" + (isAdmin ? " — добавь в Настройках" : "")}</div>
      </div>
      {url && <ExternalLink size={18} className="kd-driveicon" />}
    </a>
  );
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
  const [deposits, setDeposits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [moves, setMoves] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [tenderGuarantees, setTenderGuarantees] = useState([]);
  const [tenderServices, setTenderServices] = useState([]);
  const [guaranteeReturns, setGuaranteeReturns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [leadStages, setLeadStages] = useState([]);
  const [leadStageFilter, setLeadStageFilter] = useState("all");
  const [mktChannels, setMktChannels] = useState([]);
  const [mktTopups, setMktTopups] = useState([]);
  const [opexView, setOpexView] = useState("accounts");
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daysOff, setDaysOff] = useState([]);
  const [taskFilter, setTaskFilter] = useState("open");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [jobsDateFilter, setJobsDateFilter] = useState({ preset: "all" });
  const [doneDateFilter, setDoneDateFilter] = useState({ preset: "all" });
  const [canceledDateFilter, setCanceledDateFilter] = useState({ preset: "all" });
  const [audit, setAudit] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jobs");
  const [modal, setModal] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message, onYes, opts = {}) => setConfirmState({ message, onYes, danger: opts.danger !== false, confirmLabel: opts.confirmLabel });
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [doneSortDir, setDoneSortDir] = useState("desc");
  const [techFilter, setTechFilter] = useState("");
  const [toast, setToast] = useState("");
  const [pMode, setPMode] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [pOff, setPOff] = useState(0);
  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";
  const canManageTasks = isAdmin || isManager;
  const actorName = profile?.full_name || (isAdmin ? "Админ" : session.user.email);

  function showToast(t) { setToast(t); setTimeout(() => setToast(""), 2200); }

  async function load() {
    setLoading(true);
    const [jr, cr, chr, ar, tr, pr, hr, ptr, dsr, exr, eqr, ehr, scr, ptyr, str, ecr, opr, dpr, tkr, accr, mvr, tndr, tgr, tsr, grr, ldr, lsr, mcr, mtr, dofr] = await Promise.all([
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
      supabase.from("cash_deposits").select("*").order("requested_at", { ascending: false }),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("accounts").select("*").order("sort"),
      supabase.from("money_moves").select("*").order("move_date", { ascending: false }),
      supabase.from("tenders").select("*").order("created_at", { ascending: false }),
      supabase.from("tender_guarantees").select("*"),
      supabase.from("tender_services").select("*").order("seq"),
      supabase.from("guarantee_returns").select("*").order("return_date", { ascending: false }),
      supabase.from("leads").select("*").order("updated_at", { ascending: false }),
      supabase.from("lead_stages").select("*").order("sort"),
      supabase.from("mkt_channels").select("*").order("sort"),
      supabase.from("mkt_topups").select("*").order("topup_date", { ascending: false }),
      supabase.from("tech_days_off").select("*"),
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
    setDeposits(dpr.data || []);
    setTasks(tkr.data || []);
    setAccounts(accr.data || []);
    setMoves(mvr.data || []);
    setTenders(tndr.data || []);
    setTenderGuarantees(tgr.data || []);
    setTenderServices(tsr.data || []);
    setGuaranteeReturns(grr.data || []);
    setLeads(ldr.data || []);
    setLeadStages(lsr.data || []);
    setMktChannels(mcr.data || []);
    setMktTopups(mtr.data || []);
    setDaysOff(dofr.data || []);
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
  const personName = (id) => profileById(id)?.full_name || "—";
  const assignableProfiles = allProfiles;
  const equipById = (id) => equipment.find((e) => e.id === id);
  const techEquipment = (techId) => equipHandouts.filter((h) => h.tech_id === techId && h.status === "with_tech").map((h) => ({ handout: h, equip: equipById(h.equipment_id) })).filter((r) => r.equip);
  // Наличные, собранные дезинфектором со всех его выполненных заявок
  const techCashCollected = (techId) => jobs.filter((j) => j.assigned_to === techId && j.status === "done").reduce((s, j) => s + (Number(j.report_cash) || 0), 0);
  // Сумма уже подтверждённых внесений (деньги, которые точно дошли)
  const techDepositedConfirmed = (techId) => deposits.filter((d) => d.tech_id === techId && d.status === "confirmed").reduce((s, d) => s + (Number(d.amount) || 0), 0);
  // Сумма ожидающих подтверждения внесений (деньги «в пути», ещё не подтверждены)
  const techDepositedPending = (techId) => deposits.filter((d) => d.tech_id === techId && d.status === "pending").reduce((s, d) => s + (Number(d.amount) || 0), 0);
  // Наличные, реально лежащие на руках прямо сейчас = собрано − подтверждено − в ожидании
  const techCashOnHand = (techId) => techCashCollected(techId) - techDepositedConfirmed(techId) - techDepositedPending(techId);

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
  async function cancelJob(job, reason) {
    const { error } = await supabase.from("jobs").update({ status: "canceled", cancel_reason: reason || null, canceled_at: new Date().toISOString(), canceled_by: session.user.id }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отмена заявки", `${job.pest} · ${job.address}${reason ? " — " + reason : ""}`);
    setModal(null); showToast("Заявка отменена"); load();
  }
  async function restoreCanceled(job) {
    const { error } = await supabase.from("jobs").update({ status: job.assigned_to ? "assigned" : "new", cancel_reason: null, canceled_at: null, canceled_by: null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отмена заявки", `Восстановлена · ${job.pest} · ${job.address}`);
    showToast("Заявка возвращена в работу"); load();
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
  async function unsetRepeat(job) {
    const { error } = await supabase.from("jobs").update({ repeat_state: null, repeat_since: null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Повтор", `Убрана с повтора · ${job.pest} · ${job.address}`);
    showToast("Заявка возвращена в «Выполненные»"); load();
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
  async function markCompPaid(job, paid) {
    const { error } = await supabase.from("jobs").update({ partner_comp_paid: paid }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Компенсация партнёра", `${partnerById(job.partner_id)?.name || "?"} · ${fmt(job.partner_comp)} ₸ · ${paid ? "получено" : "снята отметка"}`);
    showToast(paid ? "Отмечено как полученное" : "Отметка снята"); load();
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
  async function saveMove(payload, existing) {
    const res = existing ? await supabase.from("money_moves").update(payload).eq("id", existing.id) : await supabase.from("money_moves").insert({ ...payload, created_by: session.user.id, source: "manual" });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    const dirLabel = payload.direction === "income" ? "Доход" : payload.direction === "expense" ? "Расход" : "Перевод";
    await logAction("Финансы", `${dirLabel}: ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeMove(m) {
    if (m.source !== "manual") { showToast("Автоматическое движение — удалить нельзя"); return; }
    await supabase.from("money_moves").delete().eq("id", m.id);
    await logAction("Финансы", `Удалено движение: ${fmt(m.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function saveAccount(payload, existing) {
    const res = existing ? await supabase.from("accounts").update(payload).eq("id", existing.id) : await supabase.from("accounts").insert(payload);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Финансы", `Счёт ${existing ? "изменён" : "добавлен"}: ${payload.name}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeAccount(acc) {
    const { error } = await supabase.from("accounts").delete().eq("id", acc.id);
    if (error) { showToast("Ошибка: по счёту есть движения — сначала перенеси/удали их"); return; }
    await logAction("Финансы", `Счёт удалён: ${acc.name}`);
    showToast("Удалено"); load();
  }
  async function requestDeposit(amount, note) {
    const { error } = await supabase.from("cash_deposits").insert({ tech_id: session.user.id, amount: Number(amount) || 0, status: "pending", note: note || null });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Касса", `Заявка на внесение: ${fmt(amount)} ₸ (ожидает подтверждения)`);
    setModal(null); showToast("Отправлено на подтверждение"); load();
  }
  async function decideDeposit(dep, status, adminNote, accountId) {
    const { error } = await supabase.from("cash_deposits").update({ status, decided_at: new Date().toISOString(), decided_by: session.user.id, admin_note: adminNote || null }).eq("id", dep.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    const who = techById(dep.tech_id)?.full_name || "?";
    if (status === "confirmed" && accountId) {
      const exists = moves.some((m) => m.source === "deposit" && m.ref_id === dep.id);
      if (!exists) {
        await supabase.from("money_moves").insert({
          account_id: accountId, direction: "income", amount: dep.amount, move_date: new Date().toISOString().slice(0, 10),
          note: `Сдача наличных: ${who}`, source: "deposit", ref_id: dep.id, created_by: session.user.id,
        });
      }
    }
    await logAction("Касса", `${status === "confirmed" ? "Подтверждено поступление" : "Отклонено"}: ${who} · ${fmt(dep.amount)} ₸${status === "confirmed" && accountId ? " → " + (accountById(accountId)?.name || "") : ""}`);
    showToast(status === "confirmed" ? "Поступление подтверждено" : "Отклонено"); load();
  }
  async function cancelDeposit(dep) {
    await supabase.from("cash_deposits").delete().eq("id", dep.id);
    await logAction("Касса", `Отменена заявка на внесение: ${fmt(dep.amount)} ₸`);
    showToast("Отменено"); load();
  }
  async function saveTask(payload, existing) {
    const res = existing ? await supabase.from("tasks").update(payload).eq("id", existing.id) : await supabase.from("tasks").insert({ ...payload, created_by: session.user.id });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Задачи", `${existing ? "Изменена" : "Создана"}: ${payload.title}${payload.assignee_id ? " → " + personName(payload.assignee_id) : ""}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function setTaskStatus(task, status) {
    const { error } = await supabase.from("tasks").update({ status, done_at: status === "done" ? new Date().toISOString() : null }).eq("id", task.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Задачи", `${(TASK_STATUS[status] || {}).label || status}: ${task.title}`);
    showToast("Обновлено"); load();
  }
  async function removeTask(task) {
    await supabase.from("tasks").delete().eq("id", task.id);
    await logAction("Задачи", `Удалена: ${task.title}`);
    showToast("Удалено"); load();
  }
  async function saveTender(payload, services, existing) {
    let tenderId = existing?.id;
    if (existing) {
      const { error } = await supabase.from("tenders").update(payload).eq("id", existing.id);
      if (error) { showToast("Ошибка: " + error.message); return; }
    } else {
      const { data, error } = await supabase.from("tenders").insert({ ...payload, created_by: session.user.id }).select().single();
      if (error) { showToast("Ошибка: " + error.message); return; }
      tenderId = data.id;
      // создаём график обработок, если задан
      if (services && services.length) {
        await supabase.from("tender_services").insert(services.map((s, i) => ({ tender_id: tenderId, seq: i + 1, due_date: s.due_date || null })));
      }
    }
    await logAction("Тендеры", `${existing ? "Изменён" : "Создан"}: ${payload.contract_no || payload.title || "тендер"}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeTender(t) {
    await supabase.from("tenders").delete().eq("id", t.id);
    await logAction("Тендеры", `Удалён: ${t.contract_no || t.title || "тендер"}`);
    setModal(null); showToast("Удалено"); load();
  }
  async function saveGuarantee(payload, existing) {
    const res = existing ? await supabase.from("tender_guarantees").update(payload).eq("id", existing.id) : await supabase.from("tender_guarantees").insert(payload);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Тендеры", `Обеспечение ${existing ? "изменено" : "добавлено"}: ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeGuarantee(g) {
    // удаляем связанные движения по счетам (внесение + возвраты этого обеспечения)
    const retIds = guaranteeReturns.filter((r) => r.guarantee_id === g.id).map((r) => r.id);
    await supabase.from("money_moves").delete().eq("source", "tender_pledge").eq("ref_id", g.id);
    if (retIds.length) await supabase.from("money_moves").delete().eq("source", "tender_return").in("ref_id", retIds);
    await supabase.from("tender_guarantees").delete().eq("id", g.id);
    await logAction("Тендеры", `Обеспечение удалено: ${fmt(g.amount)} ₸`);
    showToast("Удалено"); load();
  }
  // Отметить обеспечение внесённым: списание с указанного счёта (замороженные деньги)
  async function markGuaranteePaid(g, accountId, paidDate) {
    await supabase.from("tender_guarantees").update({ paid: true, account_id: accountId || null, paid_date: paidDate || new Date().toISOString().slice(0, 10) }).eq("id", g.id);
    if (accountId) {
      const exists = moves.some((m) => m.source === "tender_pledge" && m.ref_id === g.id);
      if (!exists) {
        await supabase.from("money_moves").insert({
          account_id: accountId, direction: "expense", amount: g.amount, move_date: paidDate || new Date().toISOString().slice(0, 10),
          note: `Обеспечение (залог) по тендеру`, source: "tender_pledge", ref_id: g.id, created_by: session.user.id,
        });
      }
    }
    await logAction("Тендеры", `Внесено обеспечение ${fmt(g.amount)} ₸${accountId ? " со счёта " + (accountById(accountId)?.name || "") : ""}`);
    setModal(null); showToast("Отмечено как внесённое"); load();
  }
  // Добавить частичный возврат: приход на указанный счёт
  async function addGuaranteeReturn(g, amount, retDate, accountId, note) {
    const { data, error } = await supabase.from("guarantee_returns").insert({ guarantee_id: g.id, amount: Number(amount) || 0, return_date: retDate || null, account_id: accountId || null, note: note || null, created_by: session.user.id }).select().single();
    if (error) { showToast("Ошибка: " + error.message); return; }
    if (accountId) {
      await supabase.from("money_moves").insert({
        account_id: accountId, direction: "income", amount: Number(amount) || 0, move_date: retDate || new Date().toISOString().slice(0, 10),
        note: `Возврат обеспечения по тендеру`, source: "tender_return", ref_id: data.id, created_by: session.user.id,
      });
    }
    await logAction("Тендеры", `Возврат обеспечения ${fmt(amount)} ₸${accountId ? " на счёт " + (accountById(accountId)?.name || "") : ""}`);
    setModal(null); showToast("Возврат добавлен"); load();
  }
  async function removeGuaranteeReturn(r) {
    await supabase.from("money_moves").delete().eq("source", "tender_return").eq("ref_id", r.id);
    await supabase.from("guarantee_returns").delete().eq("id", r.id);
    await logAction("Тендеры", `Возврат удалён: ${fmt(r.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function setServiceDone(s, done) {
    await supabase.from("tender_services").update({ done, done_date: done ? new Date().toISOString().slice(0, 10) : null }).eq("id", s.id);
    await logAction("Тендеры", `Обработка №${s.seq} ${done ? "выполнена" : "снята отметка"}`);
    load();
  }
  async function addService(tenderId, seq, dueDate) {
    await supabase.from("tender_services").insert({ tender_id: tenderId, seq, due_date: dueDate || null });
    load();
  }
  async function removeService(s) {
    await supabase.from("tender_services").delete().eq("id", s.id);
    load();
  }
  async function saveLead(payload, existing) {
    const res = existing
      ? await supabase.from("leads").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("leads").insert({ ...payload, created_by: session.user.id });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("CRM", `Лид ${existing ? "изменён" : "создан"}: ${payload.name || payload.phone || "без имени"}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function touchLead(lead) {
    await supabase.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", lead.id);
    await logAction("CRM", `Касание с клиентом: ${lead.name || lead.phone || "?"}`);
    showToast("Отмечено касание"); load();
  }
  async function setLeadStage(lead, stageId) {
    await supabase.from("leads").update({ stage_id: stageId, updated_at: new Date().toISOString() }).eq("id", lead.id);
    const stName = leadStages.find((s) => s.id === stageId)?.name || "";
    await logAction("CRM", `Лид «${lead.name || lead.phone || "?"}» → ${stName}`);
    load();
  }
  async function removeLead(lead) {
    await supabase.from("leads").delete().eq("id", lead.id);
    await logAction("CRM", `Лид удалён: ${lead.name || lead.phone || "?"}`);
    showToast("Удалено"); load();
  }
  async function convertLeadToJob(lead) {
    // создаём заявку из лида: телефон, адрес, источник
    const payload = {
      type: "Первичная", scheduled_date: null, address: lead.address || "", source: lead.source || "",
      client_phone: lead.phone || "+7 ", brand: "KazDez", guarantee_months: defaultGuarantee,
      pest: "", price_options: [], note: lead.name ? `Клиент: ${lead.name}` : null, created_by: session.user.id,
    };
    const { data, error } = await supabase.from("jobs").insert(payload).select().single();
    if (error) { showToast("Ошибка: " + error.message); return; }
    // помечаем лид как сконвертированный + двигаем в финальную стадию, если есть
    const finalStage = leadStages.find((s) => s.is_final && !s.is_lost);
    await supabase.from("leads").update({ converted_job_id: data.id, stage_id: finalStage?.id || lead.stage_id, updated_at: new Date().toISOString() }).eq("id", lead.id);
    await ensureCatalog("client_sources", sources, lead.source);
    await logAction("CRM", `Лид «${lead.name || lead.phone || "?"}» → создана заявка`);
    setModal(null); showToast("Заявка создана из лида"); setTab("jobs"); load();
  }
  async function addLeadStage(name) {
    const v = (name || "").trim();
    if (!v) return;
    const maxSort = Math.max(0, ...leadStages.map((s) => s.sort || 0));
    await supabase.from("lead_stages").insert({ name: v, sort: maxSort + 10 });
    await logAction("CRM", `Стадия добавлена: ${v}`);
    load();
  }
  async function removeLeadStage(stage) {
    const { error } = await supabase.from("lead_stages").delete().eq("id", stage.id);
    if (error) { showToast("Ошибка: на этой стадии есть лиды — сначала перенеси их"); return; }
    await logAction("CRM", `Стадия удалена: ${stage.name}`);
    load();
  }
  async function moveLeadStage(stage, dir) {
    const sorted = [...leadStages].sort((a, b) => a.sort - b.sort);
    const idx = sorted.findIndex((s) => s.id === stage.id);
    const ni = idx + dir;
    if (ni < 0 || ni >= sorted.length) return;
    const a = sorted[idx], b = sorted[ni];
    await supabase.from("lead_stages").update({ sort: b.sort }).eq("id", a.id);
    await supabase.from("lead_stages").update({ sort: a.sort }).eq("id", b.id);
    load();
  }
  async function saveMktChannel(payload, existing) {
    const res = existing ? await supabase.from("mkt_channels").update(payload).eq("id", existing.id) : await supabase.from("mkt_channels").insert(payload);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Маркетинг", `Канал ${existing ? "изменён" : "добавлен"}: ${payload.name}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeMktChannel(ch) {
    await supabase.from("mkt_channels").delete().eq("id", ch.id);
    await logAction("Маркетинг", `Канал удалён: ${ch.name}`);
    showToast("Удалено"); load();
  }
  async function addMktTopup(channelId, amount, date, accountId, note) {
    const { error } = await supabase.from("mkt_topups").insert({ channel_id: channelId, amount: Number(amount) || 0, topup_date: date, account_id: accountId || null, note: note || null, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    // если указан счёт — списываем как расход (реклама уходит с реального счёта)
    if (accountId) {
      await supabase.from("money_moves").insert({
        account_id: accountId, direction: "expense", amount: Number(amount) || 0, move_date: date,
        note: `Реклама: ${(mktChannels.find((c) => c.id === channelId) || {}).name || ""}`, source: "manual", created_by: session.user.id,
      });
    }
    await logAction("Маркетинг", `Пополнение ${fmt(amount)} ₸`);
    setModal(null); showToast("Пополнение записано"); load();
  }
  async function removeMktTopup(t) {
    await supabase.from("mkt_topups").delete().eq("id", t.id);
    await logAction("Маркетинг", `Пополнение удалено: ${fmt(t.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function addDayOff(techId, offDate, note) {
    const { error } = await supabase.from("tech_days_off").insert({ tech_id: techId, off_date: offDate, note: note || null, created_by: session.user.id });
    if (error) { showToast(error.message.includes("duplicate") ? "У этого сотрудника уже отмечен выходной на эту дату" : "Ошибка: " + error.message); return; }
    await logAction("График", `Выходной: ${personName(techId)} · ${isoToRu(offDate)}`);
    setModal(null); showToast("Выходной отмечен"); load();
  }
  async function removeDayOff(row) {
    await supabase.from("tech_days_off").delete().eq("id", row.id);
    await logAction("График", `Выходной снят: ${personName(row.tech_id)} · ${isoToRu(row.off_date)}`);
    showToast("Выходной снят"); load();
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
        { header: "Компенсация нам ₸", key: "comp", width: 16, money: true }, { header: "Компенсация получена", key: "compPaid", width: 16 },
        { header: "Адрес", key: "address", width: 32 }, { header: "Этаж", key: "floor", width: 8 }, { header: "Метраж", key: "area", width: 9 },
        { header: "Источник", key: "source", width: 12 }, { header: "Телефон", key: "phone", width: 16 }, { header: "Гарантия (мес)", key: "guarantee", width: 10 },
        { header: "Дезинфектор", key: "tech", width: 16 }, { header: "Статус", key: "status", width: 12 }, { header: "Причина отмены", key: "cancelReason", width: 24 },
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
        comp: j.partner_comp || "", compPaid: j.partner_comp > 0 ? (j.partner_comp_paid ? "да" : "нет") : "",
        address: j.address, floor: j.floor, area: j.area, source: j.source, phone: j.client_phone, guarantee: j.guarantee_months,
        tech: techById(j.assigned_to)?.full_name || "", status: (STATUS[j.status] && STATUS[j.status].label) || j.status, cancelReason: j.cancel_reason || "",
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

      await addSheet("Касса — внесения", [
        { header: "Дезинфектор", key: "tech", width: 18 }, { header: "Сумма", key: "amount", width: 14, money: true },
        { header: "Статус", key: "status", width: 14 }, { header: "Заявлено", key: "requested", width: 18 },
        { header: "Решение", key: "decided", width: 18 }, { header: "Комментарий", key: "note", width: 24 }, { header: "Прим. админа", key: "adminNote", width: 24 },
      ], deposits.map((d) => ({
        tech: techById(d.tech_id)?.full_name || "", amount: d.amount, status: (DEPOSIT_STATUS[d.status] || {}).label || d.status,
        requested: d.requested_at ? fmtTs(d.requested_at) : "", decided: d.decided_at ? fmtTs(d.decided_at) : "", note: d.note || "", adminNote: d.admin_note || "",
      })));

      await addSheet("Задачи", [
        { header: "Задача", key: "title", width: 30 }, { header: "Тип", key: "type", width: 14 }, { header: "Приоритет", key: "priority", width: 12 },
        { header: "Исполнитель", key: "assignee", width: 18 }, { header: "Срок", key: "due", width: 12 }, { header: "Статус", key: "status", width: 12 }, { header: "Подробности", key: "desc", width: 34 },
      ], tasks.map((t) => ({
        title: t.title, type: TASK_TYPES[t.type] || t.type, priority: t.priority === "urgent" ? "Срочный" : "Обычный",
        assignee: personName(t.assignee_id), due: t.due_date ? isoToRu(t.due_date) : "", status: (TASK_STATUS[t.status] || {}).label || t.status, desc: t.description || "",
      })));

      await addSheet("Тендеры", [
        { header: "Номер договора", key: "no", width: 18 }, { header: "Заказчик", key: "customer", width: 22 }, { header: "Название", key: "title", width: 24 }, { header: "Адрес", key: "address", width: 28 },
        { header: "Сумма договора", key: "amount", width: 16, money: true }, { header: "Наша доля %", key: "pct", width: 12 }, { header: "Наша доля ₸", key: "ourAmt", width: 16, money: true },
        { header: "Партнёр", key: "partner", width: 18 }, { header: "Статус", key: "status", width: 14 },
        { header: "Обработок сделано", key: "svcDone", width: 16 }, { header: "Заморожено в залогах", key: "frozen", width: 18, money: true },
      ], tenders.map((t) => {
        const svcs = tenderServices.filter((s) => s.tender_id === t.id);
        const gtees = tenderGuarantees.filter((g) => g.tender_id === t.id);
        const frozen = gtees.filter((g) => g.paid && !g.returned).reduce((s, g) => s + (Number(g.amount) || 0), 0);
        return {
          no: t.contract_no || "", customer: t.customer || "", title: t.title || "", address: t.address || "", amount: t.amount, pct: t.our_share_pct,
          ourAmt: Math.round((Number(t.amount) || 0) * (Number(t.our_share_pct) || 0) / 100),
          partner: partnerById(t.partner_id)?.name || "", status: (TENDER_STATUS[t.status] || {}).label || t.status,
          svcDone: `${svcs.filter((s) => s.done).length}/${svcs.length}`, frozen,
        };
      }));

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
    let revenue = 0, cost = 0, cash = 0, qr = 0, partnerShares = 0, qrFees = 0, partnerComp = 0; const bySource = {}; const byTech = {};
    jobs.forEach((j) => {
      if (j.status === "canceled") return;
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
      if (j.partner_comp > 0) partnerComp += Number(j.partner_comp) || 0;
    });
    const weekMax = Math.max(1, ...week.map((w) => w.revenue));
    // средний чек по трём срезам (в том же периоде, независимо от фильтра бренда)
    const avg = { ours: { sum: 0, n: 0 }, partner: { sum: 0, n: 0 } };
    jobs.forEach((j) => {
      if (j.status !== "done") return;
      const dt = parseIso(j.scheduled_date);
      const inR = pMode === "all" || (dt && dt.getTime() >= range.start && dt.getTime() < range.end);
      if (!inR) return;
      const paid = Number(j.report_paid) || 0;
      if (paid <= 0) return;
      const k = j.brand === "partner" ? "partner" : "ours";
      avg[k].sum += paid; avg[k].n++;
    });
    const avgCheck = {
      ours: avg.ours.n ? Math.round(avg.ours.sum / avg.ours.n) : 0, oursN: avg.ours.n,
      partner: avg.partner.n ? Math.round(avg.partner.sum / avg.partner.n) : 0, partnerN: avg.partner.n,
      all: (avg.ours.n + avg.partner.n) ? Math.round((avg.ours.sum + avg.partner.sum) / (avg.ours.n + avg.partner.n)) : 0, allN: avg.ours.n + avg.partner.n,
    };
    return { revenue, cost, partnerShares, qrFees, partnerComp, profit: revenue - cost - partnerShares - qrFees + partnerComp, cash, qr, bySource, byTech, week, weekMax, avgCheck };
  })();

  const expensesInRange = expenses.filter((e) => {
    if (pMode === "all") return true;
    if (!e.expense_date) return false;
    const t = new Date(e.expense_date).getTime();
    return t >= range.start && t < range.end;
  }).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const catName = (id) => (expCats.find((c) => c.id === id) || {}).name || "—";
  const accountById = (id) => accounts.find((a) => a.id === id);
  const qrAccountId = settings.qr_account_id || null;
  const cashDepositAccountId = settings.cash_account_id || null;
  // авто-доход QR по выполненным заявкам ПОСЛЕ даты начального остатка QR-счёта (иначе задвоение)
  const qrAcc = qrAccountId ? accountById(qrAccountId) : null;
  const qrOpeningDate = qrAcc?.opening_date || null;
  const qrJobsForAuto = jobs.filter((j) => {
    if (j.status !== "done" || !(Number(j.report_qr) > 0)) return false;
    if (!qrOpeningDate) return true;
    return (j.scheduled_date || "") >= qrOpeningDate;
  });
  const qrAutoIncome = qrJobsForAuto.reduce((s, j) => s + (Number(j.report_qr) || 0), 0);
  const qrAutoFee = qrJobsForAuto.reduce((s, j) => s + (Number(j.report_qr) || 0) * qrFeeRate, 0);
  const accountBalance = (accId) => {
    const acc = accountById(accId);
    const openDate = acc?.opening_date || null;
    // движения считаем начиная с даты начального остатка (или все, если дата не задана)
    const afterOpen = (d) => !openDate || (d || "") >= openDate;
    let bal = Number(acc?.opening_balance) || 0;
    moves.forEach((m) => {
      if (m.direction === "income" && m.account_id === accId && afterOpen(m.move_date)) bal += Number(m.amount) || 0;
      if (m.direction === "expense" && m.account_id === accId && afterOpen(m.move_date)) bal -= Number(m.amount) || 0;
      if (m.direction === "transfer") {
        if (m.account_id === accId && afterOpen(m.move_date)) bal -= Number(m.amount) || 0;
        if (m.to_account_id === accId && afterOpen(m.move_date)) bal += Number(m.amount) || 0;
      }
    });
    if (accId && accId === qrAccountId) bal += qrAutoIncome - qrAutoFee;
    return bal;
  };
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

  const activeJobs = jobs.filter((j) => j.status !== "done" && j.status !== "canceled");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const canceledJobs = jobs.filter((j) => j.status === "canceled");
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
  const filteredActive = statusMatched.filter(matchSearch).filter((j) => dateInFilter(j.scheduled_date, jobsDateFilter));
  const sorted = [...filteredActive].sort((a, b) => jobTime(a) - jobTime(b));
  const groups = groupByDate(sorted);
  const doneFiltered = doneJobs.filter(matchSearch).filter((j) => dateInFilter(j.scheduled_date, doneDateFilter));
  const doneSorted = [...doneFiltered].sort((a, b) => {
    const da = new Date(a.scheduled_date || a.reported_at || 0).getTime();
    const db = new Date(b.scheduled_date || b.reported_at || 0).getTime();
    return doneSortDir === "desc" ? db - da : da - db;
  });
  const doneGroups = groupByDate(doneSorted);
  const canceledFiltered = canceledJobs.filter((j) => dateInFilter(j.scheduled_date, canceledDateFilter));
  const myOpenTasks = tasks.filter((t) => t.assignee_id === session.user.id && t.status !== "done").length;
  const allOpenTasks = tasks.filter((t) => t.status !== "done").length;
  const todayIsoT = new Date().toISOString().slice(0, 10);
  const tenderOverdue = tenderServices.filter((s) => !s.done && s.due_date && s.due_date < todayIsoT).length;
  const activeTenders = tenders.filter((t) => t.status !== "closed" && t.status !== "lost").length;
  const leadStageById = (id) => leadStages.find((s) => s.id === id);
  const activeLeads = leads.filter((l) => { const st = leadStageById(l.stage_id); return !l.converted_job_id && !(st && st.is_lost); }).length;
  const servicesOf = (tid) => tenderServices.filter((s) => s.tender_id === tid).sort((a, b) => a.seq - b.seq);
  const guaranteesOf = (tid) => tenderGuarantees.filter((g) => g.tender_id === tid);
  const visibleTasks = canManageTasks ? tasks : tasks.filter((t) => t.assignee_id === session.user.id);
  const todayIso = new Date().toISOString().slice(0, 10);
  const filteredTasks = visibleTasks.filter((t) => {
    if (taskAssignee && t.assignee_id !== taskAssignee) return false;
    if (taskFilter === "open") return t.status !== "done";
    if (taskFilter === "today") return t.status !== "done" && t.due_date === todayIso;
    if (taskFilter === "overdue") return t.status !== "done" && t.due_date && t.due_date < todayIso;
    if (taskFilter === "done") return t.status === "done";
    return true;
  }).sort((a, b) => {
    const rank = (t) => (t.status === "done" ? 2 : (t.due_date && t.due_date < todayIso ? 0 : 1));
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  });
  const baseTabs = isAdmin ? [
    { id: "jobs", icon: ClipboardList, label: `Заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "schedule", icon: CalendarClock, label: "График" },
    { id: "done", icon: CheckCircle2, label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
    { id: "canceled", icon: XCircle, label: `Отменённые${canceledJobs.length ? " · " + canceledJobs.length : ""}` },
    { id: "tasks", icon: ListTodo, label: `Задачи${allOpenTasks ? " · " + allOpenTasks : ""}` },
    { id: "leads", icon: Contact, label: `Клиенты${activeLeads ? " · " + activeLeads : ""}` },
    { id: "tenders", icon: Gavel, label: `Тендеры${tenderOverdue ? " · ⚠ " + tenderOverdue : (activeTenders ? " · " + activeTenders : "")}` },
    { id: "repeats", icon: RefreshCw, label: `Повторы${jobs.filter((j) => j.repeat_state === "on_repeat").length ? " · " + jobs.filter((j) => j.repeat_state === "on_repeat").length : ""}` },
    { id: "finance", icon: Wallet, label: "Аналитика" },
    { id: "opex", icon: Landmark, label: "Финансы" },
    { id: "cash", icon: Banknote, label: `Касса${deposits.filter((d) => d.status === "pending").length ? " · " + deposits.filter((d) => d.status === "pending").length : ""}` },
    { id: "stock", icon: Package, label: `Склад${lowCount ? " · " + lowCount + " мало" : ""}` },
    { id: "team", icon: Users, label: "Дезинфекторы" },
    { id: "partners", icon: Handshake, label: "Партнёры" },
    { id: "docs", icon: FileText, label: "Документы" },
    { id: "materials", icon: FolderOpen, label: "Материалы" },
    { id: "knowledge", icon: GraduationCap, label: "База знаний" },
    { id: "journal", icon: History, label: "Журнал" },
    { id: "trash", icon: Trash2, label: `Корзина${trash.length ? " · " + trash.length : ""}` },
  ] : [
    { id: "jobs", icon: ClipboardList, label: `Мои заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "done", icon: CheckCircle2, label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
    { id: "tasks", icon: ListTodo, label: `${canManageTasks ? "Задачи" : "Мои задачи"}${(canManageTasks ? allOpenTasks : myOpenTasks) ? " · " + (canManageTasks ? allOpenTasks : myOpenTasks) : ""}` },
    { id: "cash", icon: Banknote, label: "Касса" },
    { id: "materials", icon: FolderOpen, label: "Материалы" },
    { id: "knowledge", icon: GraduationCap, label: "База знаний" },
    { id: "myequip", icon: Wrench, label: "Моё оборудование" },
  ];
  // применяем сохранённый общий порядок (админ задаёт в Настройках). Новые вкладки — в конец.
  const savedOrder = Array.isArray(settings.tab_order) ? settings.tab_order : [];
  const tabs = savedOrder.length
    ? [...baseTabs].sort((a, b) => {
        const ia = savedOrder.indexOf(a.id), ib = savedOrder.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
    : baseTabs;

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
            <DateFilterBar filter={jobsDateFilter} onChange={setJobsDateFilter} />
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
                        onRepeat={() => askConfirm(`Отправить заявку «${j.pest} · ${j.address}» на повтор? Она уйдёт во вкладку «Повторы».`, () => putOnRepeat(j), { danger: false, confirmLabel: "Да, на повтор" })}
                        onPayPartner={(paid) => markPartnerPaid(j, paid)}
                        onCompPaid={(paid) => markCompPaid(j, paid)}
                        onCancel={() => setModal({ kind: "cancelJob", job: j })}
                        onRestore={() => restoreCanceled(j)}
                        onHistory={() => setModal({ kind: "history", job: j })}
                        onOpenDetails={() => setModal({ kind: "details", job: j })}
                        onDelete={() => askConfirm(`Удалить заявку «${j.pest} · ${j.address}»? Она уйдёт в корзину, восстановить можно будет оттуда.`, () => deleteJob(j))} />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {!loading && tab === "schedule" && (() => {
          const DAY_START = 7 * 60, DAY_END = 23 * 60; // 07:00–23:00
          const dayJobs = jobs.filter((j) => j.scheduled_date === scheduleDate && j.status !== "canceled");
          const offToday = daysOff.filter((d) => d.off_date === scheduleDate);
          const offFor = (techId) => offToday.find((d) => d.tech_id === techId);
          const cols = [...techs.map((t) => ({ id: t.id, name: t.full_name || "—" })), { id: null, name: "Не назначено" }];
          const shiftDay = (d) => { const x = parseIso(scheduleDate) || new Date(); x.setDate(x.getDate() + d); setScheduleDate(isoOf(x)); };
          const isToday = scheduleDate === new Date().toISOString().slice(0, 10);
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          const hours = []; for (let h = 7; h <= 23; h++) hours.push(h);
          return (
            <>
              <div className="kd-tabbar" style={{ marginBottom: 10 }}>
                <div className="kd-title" style={{ fontSize: 18 }}>График · {isoToRu(scheduleDate)}{isToday ? " (сегодня)" : ""}</div>
                <div className="kd-tabactions">
                  <button className="kd-arrow" onClick={() => shiftDay(-1)}><ChevronLeft size={18} /></button>
                  <button className="kd-btn ghost sm" onClick={() => setScheduleDate(new Date().toISOString().slice(0, 10))}>Сегодня</button>
                  <button className="kd-arrow" onClick={() => shiftDay(1)}><ChevronRight size={18} /></button>
                  <input type="date" value={scheduleDate} onChange={(e) => e.target.value && setScheduleDate(e.target.value)} className="kd-tldate" />
                  <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "dayOff" })}>🌴 Выходной</button>
                </div>
              </div>
              {offToday.length > 0 && <div className="kd-hint" style={{ marginBottom: 10 }}>🌴 Сегодня отдыхают: {offToday.map((d) => personName(d.tech_id)).join(", ")}. Их колонки затемнены — не назначай туда выезды.</div>}
              <div className="kd-timeline">
                <div className="kd-tlgrid" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(230px, 1fr))` }}>
                  <div className="kd-tlhead kd-tlcorner"></div>
                  {cols.map((c) => {
                    const cnt = dayJobs.filter((j) => (j.assigned_to || null) === c.id).length;
                    const off = c.id ? offFor(c.id) : null;
                    return (
                      <div key={c.id || "none"} className={`kd-tlhead ${off ? "off" : ""}`}>
                        {c.name}{off ? <span className="kd-offtag">🌴 выходной</span> : (cnt ? <span className="kd-tlcnt">{cnt}</span> : null)}
                        {off && <button className="kd-offx" title="Снять выходной" onClick={() => askConfirm(`Снять выходной у ${c.name}?`, () => removeDayOff(off), { danger: false, confirmLabel: "Да, снять" })}><X size={12} /></button>}
                      </div>
                    );
                  })}
                  <div className="kd-tlaxis" style={{ height: DAY_END - DAY_START }}>
                    {hours.map((h) => <div key={h} className="kd-tlhour" style={{ top: h * 60 - DAY_START }}>{String(h).padStart(2, "0")}:00</div>)}
                  </div>
                  {cols.map((c) => {
                    const colJobs = dayJobs.filter((j) => (j.assigned_to || null) === c.id);
                    const timed = colJobs.map((j) => ({ j, r: timeRangeMin(j.scheduled_time) })).filter((x) => x.r);
                    const untimed = colJobs.filter((j) => !timeRangeMin(j.scheduled_time));
                    const off = c.id ? offFor(c.id) : null;
                    return (
                      <div key={c.id || "none"} className={`kd-tlcol ${off ? "off" : ""}`} style={{ height: DAY_END - DAY_START }}>
                        {isToday && nowMin >= DAY_START && nowMin <= DAY_END && <div className="kd-tlnow" style={{ top: nowMin - DAY_START }} />}
                        {untimed.length > 0 && (
                          <div className="kd-tluntimed">
                            {untimed.map((j) => (
                              <button key={j.id} className="kd-tlchip" onClick={() => setModal({ kind: "edit", job: j })}>⏱ {addressPlain(j.address) || j.pest}</button>
                            ))}
                          </div>
                        )}
                        {timed.map(({ j, r }) => {
                          const top = Math.max(0, r.from - DAY_START);
                          const height = Math.max(46, Math.min(r.to, DAY_END) - Math.max(r.from, DAY_START));
                          const st = STATUS[j.status] || STATUS.new;
                          return (
                            <button key={j.id} className="kd-tlcard" style={{ top, height, borderLeftColor: st.color, background: st.bg }}
                              onClick={() => setModal({ kind: "edit", job: j })}>
                              <div className="kd-tladdr">{addressPlain(j.address)}</div>
                              <div className="kd-tlsub">{j.scheduled_time || ""} · {j.pest}</div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}

        {!loading && tab === "done" && (
          <>
            <div className="kd-seg" style={{ marginBottom: 14 }}>
              <button className={`kd-segbtn ${doneSortDir === "desc" ? "on" : ""}`} onClick={() => setDoneSortDir("desc")}>Сначала новые</button>
              <button className={`kd-segbtn ${doneSortDir === "asc" ? "on" : ""}`} onClick={() => setDoneSortDir("asc")}>Сначала старые</button>
            </div>
            <DateFilterBar filter={doneDateFilter} onChange={setDoneDateFilter} />
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
                      onRepeat={() => askConfirm(`Отправить заявку «${j.pest} · ${j.address}» на повтор? Она уйдёт во вкладку «Повторы».`, () => putOnRepeat(j), { danger: false, confirmLabel: "Да, на повтор" })}
                      onPayPartner={(paid) => markPartnerPaid(j, paid)}
                        onCompPaid={(paid) => markCompPaid(j, paid)}
                        onCancel={() => setModal({ kind: "cancelJob", job: j })}
                        onRestore={() => restoreCanceled(j)}
                      onHistory={() => setModal({ kind: "history", job: j })}
                        onOpenDetails={() => setModal({ kind: "details", job: j })}
                      onDelete={() => askConfirm(`Удалить заявку «${j.pest} · ${j.address}»? Она уйдёт в корзину, восстановить можно будет оттуда.`, () => deleteJob(j))} />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {!loading && tab === "cash" && !isAdmin && (
          <div className="kd-list">
            <div className="kd-card">
              <div className="kd-section">Наличные на руках</div>
              <div className="kd-row"><span>Собрано с заявок</span><strong>{fmt(techCashCollected(session.user.id))} ₸</strong></div>
              <div className="kd-row"><span>Уже внесено (подтверждено)</span><strong style={{ color: "var(--primary-d)" }}>{fmt(techDepositedConfirmed(session.user.id))} ₸</strong></div>
              {techDepositedPending(session.user.id) > 0 && <div className="kd-row"><span>Ожидает подтверждения</span><strong style={{ color: "#B4650B" }}>{fmt(techDepositedPending(session.user.id))} ₸</strong></div>}
              <div className="kd-row total"><span>На руках сейчас</span><strong style={{ color: "var(--primary-d)", fontSize: 17 }}>{fmt(techCashOnHand(session.user.id))} ₸</strong></div>
              <button className="kd-btn primary wide" disabled={techCashOnHand(session.user.id) <= 0} onClick={() => setModal({ kind: "deposit", max: techCashOnHand(session.user.id) })} style={{ marginTop: 12 }}><Banknote size={16} />Внести через банкомат</button>
            </div>
            <div className="kd-hint">Внесение через банкомат по ИИН <strong>980515351225 — Тыныс Қ.</strong> После внесения нажми кнопку выше — админ подтвердит поступление.</div>
            <div className="kd-section" style={{ marginTop: 6 }}>История внесений</div>
            {deposits.filter((d) => d.tech_id === session.user.id).length === 0 && <div className="kd-empty">Внесений пока не было.</div>}
            {deposits.filter((d) => d.tech_id === session.user.id).map((d) => {
              const st = DEPOSIT_STATUS[d.status] || DEPOSIT_STATUS.pending;
              return (
                <div key={d.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{fmt(d.amount)} ₸</div>
                    <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div className="kd-meta"><span>{fmtTs(d.requested_at)}</span>{d.note && <><span>·</span><span>{d.note}</span></>}</div>
                  {d.status === "rejected" && d.admin_note && <div className="kd-notebox" style={{ color: "#B42318" }}>Причина: {d.admin_note}</div>}
                  {d.status === "pending" && <div className="kd-actions"><button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Отменить заявку на внесение ${fmt(d.amount)} ₸?`, () => cancelDeposit(d), { confirmLabel: "Да, отменить" })}>Отменить</button></div>}
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "cash" && isAdmin && (
          <div className="kd-list">
            {deposits.filter((d) => d.status === "pending").length > 0 && (
              <>
                <div className="kd-section">Ожидают подтверждения · {deposits.filter((d) => d.status === "pending").length}</div>
                {deposits.filter((d) => d.status === "pending").map((d) => (
                  <div key={d.id} className="kd-card low">
                    <div className="kd-card-head">
                      <div className="kd-pest">{techById(d.tech_id)?.full_name || "?"}</div>
                      <strong style={{ fontSize: 17, color: "var(--primary-d)" }}>{fmt(d.amount)} ₸</strong>
                    </div>
                    <div className="kd-meta"><span>Заявлено: {fmtTs(d.requested_at)}</span>{d.note && <><span>·</span><span>{d.note}</span></>}</div>
                    <div className="kd-actions">
                      <button className="kd-btn primary sm" onClick={() => setModal({ kind: "confirmDeposit", dep: d })}>Подтвердить</button>
                      <button className="kd-btn ghost danger sm" onClick={() => setModal({ kind: "rejectDeposit", dep: d })}>Отклонить</button>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="kd-section" style={{ marginTop: deposits.filter((d) => d.status === "pending").length ? 8 : 0 }}>Наличные у дезинфекторов</div>
            {techs.length === 0 && <div className="kd-muted">Дезинфекторов пока нет.</div>}
            {techs.map((t) => {
              const onHand = techCashOnHand(t.id);
              const pending = techDepositedPending(t.id);
              return (
                <div key={t.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{t.full_name || "(без имени)"}</div>
                    <strong style={{ fontSize: 16, color: onHand > 0 ? "#B4650B" : "var(--muted)" }}>{fmt(onHand)} ₸ на руках</strong>
                  </div>
                  <div className="kd-meta">
                    <span>Собрано: {fmt(techCashCollected(t.id))} ₸</span><span>·</span>
                    <span>Внесено: {fmt(techDepositedConfirmed(t.id))} ₸</span>
                    {pending > 0 && <><span>·</span><span style={{ color: "#B4650B" }}>в ожидании: {fmt(pending)} ₸</span></>}
                  </div>
                </div>
              );
            })}
            <div className="kd-section" style={{ marginTop: 8 }}>История внесений</div>
            {deposits.filter((d) => d.status !== "pending").length === 0 && <div className="kd-muted">Подтверждённых или отклонённых внесений пока нет.</div>}
            {deposits.filter((d) => d.status !== "pending").map((d) => {
              const st = DEPOSIT_STATUS[d.status] || DEPOSIT_STATUS.pending;
              return (
                <div key={d.id} className="kd-histrow" style={{ cursor: "default" }}>
                  <div>
                    <div className="kd-histmain">{techById(d.tech_id)?.full_name || "?"} · {fmt(d.amount)} ₸</div>
                    <div className="kd-muted">{d.decided_at ? fmtTs(d.decided_at) : fmtTs(d.requested_at)}{d.admin_note ? " · " + d.admin_note : ""}</div>
                  </div>
                  <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                </div>
              );
            })}
          </div>
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

        {!loading && tab === "leads" && (
          <div className="kd-list">
            <div className="kd-tabbar" style={{ marginBottom: 4 }}>
              <div className="kd-title" style={{ fontSize: 18 }}>Клиенты · воронка</div>
              <div className="kd-tabactions">
                {settings.drive_kp && <a className="kd-btn ghost" href={settings.drive_kp} target="_blank" rel="noopener noreferrer"><FolderOpen size={15} />Папка КП</a>}
                <button className="kd-btn primary" onClick={() => setModal({ kind: "lead" })}><Plus size={15} />Новый клиент</button>
              </div>
            </div>
            {leadStages.length === 0 && <div className="kd-empty">Стадии воронки не заданы. Добавь их в Настройках → «Стадии воронки».</div>}
            {/* фильтр по стадии */}
            {leadStages.length > 0 && (
              <div className="kd-datechips" style={{ marginBottom: 6 }}>
                <button className={`kd-datechip ${leadStageFilter === "all" ? "on" : ""}`} onClick={() => setLeadStageFilter("all")}>Все стадии</button>
                {[...leadStages].sort((a, b) => a.sort - b.sort).map((st) => {
                  const cnt = leads.filter((l) => l.stage_id === st.id && !l.converted_job_id).length;
                  return <button key={st.id} className={`kd-datechip ${leadStageFilter === st.id ? "on" : ""}`} onClick={() => setLeadStageFilter(st.id)}>{st.name}{cnt ? ` · ${cnt}` : ""}</button>;
                })}
              </div>
            )}
            {[...leadStages].sort((a, b) => a.sort - b.sort).filter((st) => leadStageFilter === "all" || st.id === leadStageFilter).map((st) => {
              const stageLeads = leads.filter((l) => l.stage_id === st.id && !l.converted_job_id)
                .sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
              if (leadStageFilter === "all" && stageLeads.length === 0) return null;
              const sortedStages = [...leadStages].sort((a, b) => a.sort - b.sort);
              const stIdx = sortedStages.findIndex((x) => x.id === st.id);
              const nextStage = sortedStages.slice(stIdx + 1).find((x) => !x.is_lost);
              return (
                <div key={st.id} className="kd-group">
                  <div className="kd-datehead"><span>{st.name}{st.is_lost ? " ✕" : ""}</span><span className="kd-datecount">{stageLeads.length}</span></div>
                  <div className="kd-list">
                    {stageLeads.length === 0 && <div className="kd-muted" style={{ padding: "2px 2px 8px" }}>Пусто</div>}
                    {stageLeads.map((l) => (
                      <div key={l.id} className="kd-card">
                        <div className="kd-card-head">
                          <div className="kd-pest">{l.name || l.phone || "Без имени"}</div>
                          <span className="kd-badge" style={{ color: l.client_type === "company" ? "#2557B0" : "#6E3FCF", background: l.client_type === "company" ? "#E9F0FC" : "#F0EAFC" }}>{l.client_type === "company" ? "Юрлицо" : "Физлицо"}</span>
                        </div>
                        <div className="kd-meta">
                          {l.source && <span>{l.source}</span>}
                          {l.phone && <a href={`tel:${(l.phone || "").replace(/\s/g, "")}`} style={{ color: "var(--primary-d)", fontWeight: 700 }}>{l.phone}</a>}
                        </div>
                        {l.address && <div className="kd-addr" style={{ marginTop: 2 }}><AddressText text={l.address} /></div>}
                        {(() => {
                          const d = daysSince(l.updated_at);
                          const stale = d >= 7;
                          return (
                            <div className="kd-touch" style={stale ? { color: "#B3261E" } : {}}>
                              <Calendar size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                              Последнее касание: {isoToRu((l.updated_at || "").slice(0, 10)) || "—"}
                              <span style={{ marginLeft: 6, fontWeight: 700 }}>· {d === 0 ? "сегодня" : d === 1 ? "вчера" : `${d} дн. назад`}</span>
                              {stale && <span style={{ marginLeft: 6 }}>⚠ давно не связывались</span>}
                            </div>
                          );
                        })()}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 2px" }}>
                          {l.kp_url && <a className="kd-btn ghost sm" href={l.kp_url} target="_blank" rel="noopener noreferrer"><FileText size={13} />КП клиента</a>}
                        </div>
                        {l.note && <div className="kd-notebox">📝 {l.note}</div>}
                        <div className="kd-actions">
                          {nextStage && <button className="kd-btn primary sm" onClick={() => setLeadStage(l, nextStage.id)}>{nextStage.name}<ArrowRight size={13} /></button>}
                          <button className="kd-btn ghost sm" onClick={() => touchLead(l)}>Касание сегодня</button>
                          <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "leadStageSelect", lead: l })}>Стадия</button>
                          <button className="kd-btn ghost sm" onClick={() => askConfirm(`Создать заявку из клиента «${l.name || l.phone || "?"}»? Перенесём телефон, адрес и источник.`, () => convertLeadToJob(l), { danger: false, confirmLabel: "Да, создать" })}><Plus size={13} />Заявка</button>
                          <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "lead", lead: l })}><Pencil size={13} /></button>
                          <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить клиента «${l.name || l.phone || "?"}» из воронки?`, () => removeLead(l))}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "tenders" && (
          <div className="kd-list">
            <div className="kd-tabbar" style={{ marginBottom: 4 }}>
              <div className="kd-title" style={{ fontSize: 18 }}>Тендеры</div>
              <div className="kd-tabactions">
                {settings.drive_tenders && <a className="kd-btn ghost" href={settings.drive_tenders} target="_blank" rel="noopener noreferrer"><FolderOpen size={15} />Папка на Диске</a>}
                <button className="kd-btn primary" onClick={() => setModal({ kind: "tender" })}><Plus size={15} />Новый тендер</button>
              </div>
            </div>
            {tenderOverdue > 0 && <div className="kd-hint" style={{ background: "#FBE7E5", borderColor: "#F1C4BF", color: "#B3261E" }}>⚠ Есть просроченные обработки ({tenderOverdue}). Просрочка грозит штрафом и блокировкой участия — проверь график ниже.</div>}
            {tenders.length === 0 && <div className="kd-empty">Тендеров пока нет. Добавь первый через «Новый тендер».</div>}
            {tenders.map((t) => {
              const st = TENDER_STATUS[t.status] || TENDER_STATUS.participating;
              const ourAmount = Math.round((Number(t.amount) || 0) * (Number(t.our_share_pct) || 0) / 100);
              const svcs = servicesOf(t.id);
              const gtees = guaranteesOf(t.id);
              const doneCount = svcs.filter((s) => s.done).length;
              const returnsOfG = (gid) => guaranteeReturns.filter((r) => r.guarantee_id === gid);
              const returnedSum = (gid) => returnsOfG(gid).reduce((s, r) => s + (Number(r.amount) || 0), 0);
              // заморожено = внесённые обеспечения минус уже возвращённое
              const frozen = gtees.filter((g) => g.paid).reduce((s, g) => s + Math.max(0, (Number(g.amount) || 0) - returnedSum(g.id)), 0);
              return (
                <div key={t.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{t.contract_no ? `№ ${t.contract_no}` : (t.title || "Тендер")}</div>
                    <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div className="kd-meta">
                    {t.customer && <span>🏢 {t.customer}</span>}
                    {t.title && t.contract_no && <span>{t.title}</span>}
                    {t.partner_id && <span>🤝 {partnerById(t.partner_id)?.name || "?"}</span>}
                    {(t.start_date || t.end_date) && <span><Calendar size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{isoToRu(t.start_date) || "?"} — {isoToRu(t.end_date) || "?"}</span>}
                  </div>
                  {t.address && <div className="kd-addr" style={{ marginTop: 4 }}><AddressText text={t.address} /></div>}

                  <div className="kd-tenderfin">
                    <div><span className="kd-muted">Сумма договора</span><strong>{fmt(t.amount)} ₸</strong></div>
                    <div><span className="kd-muted">Наша доля {t.our_share_pct}%</span><strong style={{ color: "var(--primary-d)" }}>{fmt(ourAmount)} ₸</strong></div>
                    {frozen > 0 && <div><span className="kd-muted">Заморожено в залогах</span><strong style={{ color: "#B4650B" }}>{fmt(frozen)} ₸</strong></div>}
                  </div>

                  {/* Обеспечения */}
                  <div className="kd-tsub">
                    <div className="kd-tsubhead"><ShieldCheck size={14} /> Обеспечения (залоги)</div>
                    {gtees.length === 0 && <span className="kd-muted">Не добавлены</span>}
                    {gtees.map((g) => {
                      const rets = returnsOfG(g.id);
                      const retSum = returnedSum(g.id);
                      const remaining = Math.max(0, (Number(g.amount) || 0) - retSum);
                      return (
                        <div key={g.id} className="kd-guaranteebox">
                          <div className="kd-guarantee">
                            <div>
                              <div style={{ fontWeight: 700 }}>{GUARANTEE_KINDS[g.kind] || g.kind} · {fmt(g.amount)} ₸</div>
                              <div className="kd-muted" style={{ fontSize: 12 }}>
                                {g.paid ? `внесено ${isoToRu(g.paid_date) || ""}${g.account_id ? " · " + (accountById(g.account_id)?.name || "") : ""}` : "не внесено"}
                                {g.paid && retSum > 0 && ` · возвращено ${fmt(retSum)} ₸`}
                                {g.paid && remaining > 0 && ` · заморожено ${fmt(remaining)} ₸`}
                                {g.paid && remaining === 0 && retSum > 0 && " · возвращено полностью ✓"}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {!g.paid && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "payGuarantee", g })}>Внести</button>}
                              {g.paid && remaining > 0 && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "returnGuarantee", g, remaining })}>Возврат</button>}
                              <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить обеспечение «${GUARANTEE_KINDS[g.kind] || g.kind}» на ${fmt(g.amount)} ₸? Связанные движения по счетам тоже удалятся.`, () => removeGuarantee(g))}><X size={13} /></button>
                            </div>
                          </div>
                          {rets.length > 0 && (
                            <div className="kd-returns">
                              {rets.map((r) => (
                                <div key={r.id} className="kd-returnrow">
                                  <span>↩ {fmt(r.amount)} ₸ · {isoToRu(r.return_date) || "без даты"}{r.account_id ? " · " + (accountById(r.account_id)?.name || "") : ""}</span>
                                  <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить запись возврата ${fmt(r.amount)} ₸?`, () => removeGuaranteeReturn(r))}><X size={12} /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button className="kd-btn ghost sm" style={{ marginTop: 8 }} onClick={() => setModal({ kind: "guarantee", tenderId: t.id })}><Plus size={13} />Обеспечение</button>
                  </div>

                  {/* График обработок */}
                  <div className="kd-tsub">
                    <div className="kd-tsubhead"><RefreshCw size={14} /> График обработок {svcs.length > 0 && `· ${doneCount}/${svcs.length}`}</div>
                    {svcs.length === 0 && <span className="kd-muted">Не задан</span>}
                    {svcs.map((s) => {
                      const overdue = !s.done && s.due_date && s.due_date < todayIsoT;
                      return (
                        <div key={s.id} className={`kd-svcrow ${overdue ? "overdue" : ""}`}>
                          <div>
                            <span style={{ fontWeight: 700 }}>№{s.seq}</span>
                            <span style={{ marginLeft: 8 }}>{isoToRu(s.due_date) || "без даты"}</span>
                            {overdue && <span className="kd-svcwarn"> · просрочено!</span>}
                            {s.done && <span className="kd-muted" style={{ marginLeft: 8 }}>✓ {isoToRu(s.done_date) || ""}</span>}
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className={`kd-btn sm ${s.done ? "ghost" : "primary"}`} onClick={() => { if (s.done) askConfirm(`Снять отметку выполнения с обработки №${s.seq}?`, () => setServiceDone(s, false), { danger: false, confirmLabel: "Да, снять" }); else setServiceDone(s, true); }}>{s.done ? "Отменить" : "Сделано"}</button>
                            <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить обработку №${s.seq} из графика?`, () => removeService(s))}><X size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                    <button className="kd-btn ghost sm" style={{ marginTop: 8 }} onClick={() => addService(t.id, svcs.length + 1, "")}><Plus size={13} />Обработку</button>
                  </div>

                  {t.note && <div className="kd-notebox" style={{ marginTop: 10 }}>📝 {t.note}</div>}
                  <div className="kd-actions">
                    <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "tender", tender: t })}><Pencil size={13} />Изменить</button>
                    <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить тендер «${t.contract_no || t.title || ""}»? Вместе с обеспечениями и графиком.`, () => removeTender(t))}><Trash2 size={13} />Удалить</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "tasks" && (
          <div className="kd-list">
            {canManageTasks && (
              <div className="kd-tabbar" style={{ marginBottom: 4 }}>
                <div className="kd-title" style={{ fontSize: 18 }}>Задачи</div>
                <button className="kd-btn primary" onClick={() => setModal({ kind: "task" })}><Plus size={15} />Новая задача</button>
              </div>
            )}
            <div className="kd-seg" style={{ width: "100%", overflowX: "auto" }}>
              {[{ id: "open", label: "Активные" }, { id: "today", label: "Сегодня" }, { id: "overdue", label: "Просрочено" }, { id: "done", label: "Сделаны" }, { id: "all", label: "Все" }].map((f) => (
                <button key={f.id} className={`kd-segbtn ${taskFilter === f.id ? "on" : ""}`} onClick={() => setTaskFilter(f.id)}>{f.label}</button>
              ))}
            </div>
            {canManageTasks && assignableProfiles.length > 0 && (
              <select className="kd-techselect" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} style={{ width: "100%" }}>
                <option value="">Все исполнители</option>
                {assignableProfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 6)}</option>)}
              </select>
            )}
            {filteredTasks.length === 0 && <div className="kd-empty">{taskFilter === "done" ? "Выполненных задач нет." : "Задач нет. Всё чисто 👌"}</div>}
            {filteredTasks.map((t) => {
              const st = TASK_STATUS[t.status] || TASK_STATUS.new;
              const overdue = t.status !== "done" && t.due_date && t.due_date < todayIso;
              const canEdit = canManageTasks || t.created_by === session.user.id;
              return (
                <div key={t.id} className={`kd-card ${t.status === "done" ? "done" : ""} ${overdue ? "low" : ""}`}>
                  <div className="kd-card-head">
                    <div className="kd-pest">{t.priority === "urgent" && <span style={{ color: "#B3261E" }}>🔴 </span>}{t.title}</div>
                    <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div className="kd-meta">
                    <span className="kd-brandtag">{TASK_TYPES[t.type] || t.type}</span>
                    {t.assignee_id && <span>👤 {personName(t.assignee_id)}</span>}
                    {t.due_date && <span className="kd-datetimetag" style={overdue ? { color: "#B3261E", background: "#FBE7E5" } : {}}><Calendar size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />{isoToRu(t.due_date)}{overdue ? " · просрочено" : ""}</span>}
                  </div>
                  {t.description && <div className="kd-notebox">{t.description}</div>}
                  <div className="kd-actions">
                    {t.status !== "done" && <button className="kd-btn primary sm" onClick={() => setTaskStatus(t, "done")}>Сделано</button>}
                    {t.status === "new" && <button className="kd-btn ghost sm" onClick={() => setTaskStatus(t, "in_progress")}>В работу</button>}
                    {t.status === "done" && <button className="kd-btn ghost sm" onClick={() => setTaskStatus(t, "new")}>Вернуть</button>}
                    {canEdit && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "task", task: t })}><Pencil size={13} />Изменить</button>}
                    {canEdit && <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить задачу «${t.title}»?`, () => removeTask(t))}><Trash2 size={13} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "canceled" && (
          <div className="kd-list">
            <DateFilterBar filter={canceledDateFilter} onChange={setCanceledDateFilter} />
            {canceledJobs.length === 0 ? <div className="kd-empty">Отменённых заявок нет.</div> :
              canceledFiltered.length === 0 ? <div className="kd-empty">По этому фильтру ничего не найдено.</div> :
              [...canceledFiltered].sort((a, b) => new Date(b.canceled_at || 0) - new Date(a.canceled_at || 0)).map((j) => (
                <JobCard key={j.id} job={j} isAdmin={isAdmin} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerById(j.partner_id)?.name} partnerRepeat="" share={partnerShareAmt(j)}
                  onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                  onReport={() => setModal({ kind: "report", job: j })}
                  onAssign={() => setModal({ kind: "assign", job: j })}
                  onView={() => setModal({ kind: "view", job: j })}
                  onEdit={() => setModal({ kind: "edit", job: j })}
                  onRepeat={() => askConfirm(`Отправить заявку «${j.pest} · ${j.address}» на повтор? Она уйдёт во вкладку «Повторы».`, () => putOnRepeat(j), { danger: false, confirmLabel: "Да, на повтор" })}
                  onPayPartner={(paid) => markPartnerPaid(j, paid)}
                  onCompPaid={(paid) => markCompPaid(j, paid)}
                  onCancel={() => setModal({ kind: "cancelJob", job: j })}
                  onRestore={() => restoreCanceled(j)}
                  onHistory={() => setModal({ kind: "history", job: j })}
                  onOpenDetails={() => setModal({ kind: "details", job: j })}
                  onDelete={() => askConfirm(`Удалить заявку «${j.pest} · ${j.address}»? Она уйдёт в корзину.`, () => deleteJob(j))} />
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
                <RepeatCard key={j.id} job={j} onSaveNote={saveRepeatNote} onCreate={createRepeatJob}
                  onFinish={(job) => askConfirm(`Завершить повтор по заявке «${job.pest} · ${job.address}»? Клиент отказался от повторной обработки. Заявка вернётся в «Выполненные».`, () => finishRepeat(job), { danger: false, confirmLabel: "Да, завершить" })}
                  onUnset={(job) => askConfirm(`Убрать заявку «${job.pest} · ${job.address}» с повтора и вернуть в «Выполненные»?`, () => unsetRepeat(job), { danger: false, confirmLabel: "Да, убрать" })}
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
                {fin.partnerComp > 0 && <div className="kd-row"><span>Компенсации от партнёров (на Kaspi)</span><strong style={{ color: "#0E7C66" }}>+ {fmt(fin.partnerComp)} ₸</strong></div>}
                <div className="kd-row"><span>Прибыль по заявкам</span><strong>{fmt(fin.profit)} ₸</strong></div>
                <div className="kd-row"><span>Выплаты сотрудникам (зарплата/дорожные)</span><strong style={{ color: "#B42318" }}>− {fmt(expensesInRange)} ₸</strong></div>
                <div className="kd-row"><span>Операционные расходы</span><strong style={{ color: "#B42318" }}>− {fmt(opexInRange)} ₸</strong></div>
                <div className="kd-row total"><span>Итоговая прибыль</span><strong style={{ color: netProfit >= 0 ? "#0E7C66" : "#B42318" }}>{fmt(netProfit)} ₸</strong></div>
              </div>
              <div className="kd-card">
                <div className="kd-section">Средний чек · {range.label}</div>
                <div className="kd-row"><span>Наши заявки</span><span className="kd-twoval"><em>{fin.avgCheck.oursN} заявок</em><strong>{fmt(fin.avgCheck.ours)} ₸</strong></span></div>
                <div className="kd-row"><span>Партнёрские</span><span className="kd-twoval"><em>{fin.avgCheck.partnerN} заявок</em><strong>{fmt(fin.avgCheck.partner)} ₸</strong></span></div>
                <div className="kd-row total"><span>Общий (все заявки)</span><span className="kd-twoval"><em>{fin.avgCheck.allN} заявок</em><strong style={{ color: "var(--primary-d)" }}>{fmt(fin.avgCheck.all)} ₸</strong></span></div>
                <div className="kd-muted" style={{ marginTop: 8 }}>Чек = выручка ÷ число выполненных оплаченных заявок за период. Считается по всем заявкам, независимо от фильтра выше.</div>
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
            <div className="kd-seg" style={{ marginBottom: 14 }}>
              <button className={`kd-segbtn ${opexView === "accounts" ? "on" : ""}`} onClick={() => setOpexView("accounts")}>Счета и движения</button>
              <button className={`kd-segbtn ${opexView === "marketing" ? "on" : ""}`} onClick={() => setOpexView("marketing")}>Маркетинг</button>
            </div>

            {opexView === "accounts" && (<>
            <div className="kd-tabbar" style={{ marginBottom: 8 }}>
              <div className="kd-title" style={{ fontSize: 18 }}>Финансы · счета</div>
              <div className="kd-tabactions">
                <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "account" })}><Plus size={14} />Счёт</button>
                <button className="kd-btn primary" onClick={() => setModal({ kind: "move" })}><Plus size={15} />Движение</button>
              </div>
            </div>

            <div className="kd-stockgrid" style={{ gridTemplateColumns: `repeat(${Math.min(accounts.length || 1, 3)}, 1fr)` }}>
              {accounts.length === 0 && <div className="kd-muted">Счетов нет. Добавь через «+ Счёт».</div>}
              {accounts.map((a) => (
                <div key={a.id} className="kd-card" style={{ boxShadow: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span className="kd-muted" style={{ fontWeight: 700 }}>{a.name}</span>
                    <button onClick={() => setModal({ kind: "account", item: a })} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}><Pencil size={13} /></button>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: accountBalance(a.id) < 0 ? "#B3261E" : "var(--ink)" }}>{fmt(accountBalance(a.id))} ₸</div>
                  {(Number(a.opening_balance) > 0 || a.opening_date) && <div className="kd-muted" style={{ fontSize: 12, marginTop: 3 }}>старт: {fmt(Number(a.opening_balance) || 0)} ₸{a.opening_date ? ` с ${isoToRu(a.opening_date)}` : ""}</div>}
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {a.id === qrAccountId && <span className="kd-srctag">сюда падают QR</span>}
                    {a.id === cashDepositAccountId && <span className="kd-brandtag">сдача налички</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="kd-periodbar" style={{ marginTop: 16 }}>
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

            {(() => {
              const inRange = (d) => pMode === "all" || (d && new Date(d).getTime() >= range.start && new Date(d).getTime() < range.end);
              const movesInRange = moves.filter((m) => inRange(m.move_date)).sort((a, b) => new Date(b.move_date || 0) - new Date(a.move_date || 0));
              const income = movesInRange.filter((m) => m.direction === "income").reduce((s, m) => s + (Number(m.amount) || 0), 0);
              const expense = movesInRange.filter((m) => m.direction === "expense").reduce((s, m) => s + (Number(m.amount) || 0), 0);
              return (
                <>
                  <div className="kd-card" style={{ marginBottom: 14 }}>
                    <div className="kd-section">Итоги движений · {range.label}</div>
                    <div className="kd-row"><span>Доходы (ручные + сдача налички)</span><strong style={{ color: "#0E7C66" }}>+ {fmt(income)} ₸</strong></div>
                    <div className="kd-row"><span>Расходы</span><strong style={{ color: "#B42318" }}>− {fmt(expense)} ₸</strong></div>
                    <div className="kd-muted" style={{ marginTop: 8 }}>QR-оплаты по заявкам приходят на счёт «{accountById(qrAccountId)?.name || "не выбран"}» автоматически (минус комиссия банка) и в этот список не входят — их видно в «Аналитике».</div>
                  </div>

                  <div className="kd-list">
                    {movesInRange.length === 0 && <div className="kd-empty">Движений за период нет. Добавь доход, расход или перевод через «+ Движение».</div>}
                    {movesInRange.map((m) => {
                      const isIncome = m.direction === "income", isExpense = m.direction === "expense", isTransfer = m.direction === "transfer";
                      const color = isIncome ? "#0E7C66" : isExpense ? "#B42318" : "#B4650B";
                      const sign = isIncome ? "+ " : isExpense ? "− " : "";
                      const title = isTransfer ? `${accountById(m.account_id)?.name || "?"} → ${accountById(m.to_account_id)?.name || "?"}` : (accountById(m.account_id)?.name || "?");
                      const cat = m.category_id ? catName(m.category_id) + (m.subcategory_id ? " · " + catName(m.subcategory_id) : "") : "";
                      return (
                        <div key={m.id} className="kd-card">
                          <div className="kd-card-head">
                            <div className="kd-pest" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              {isIncome ? <ArrowDownCircle size={17} color={color} /> : isExpense ? <ArrowUpCircle size={17} color={color} /> : <ArrowRightLeft size={17} color={color} />}
                              {title}
                            </div>
                            <strong style={{ color, fontSize: 16 }}>{sign}{fmt(m.amount)} ₸</strong>
                          </div>
                          <div className="kd-meta">
                            <span>{isoToRu(m.move_date) || "без даты"}</span>
                            {cat && <><span>·</span><span className="kd-doctag">{cat}</span></>}
                            {m.source !== "manual" && <><span>·</span><span className="kd-muted">авто</span></>}
                          </div>
                          {m.note && <div className="kd-notebox">📝 {m.note}</div>}
                          {m.source === "manual" && (
                            <div className="kd-actions">
                              <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "move", move: m })}><Pencil size={13} />Изменить</button>
                              <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить движение на ${fmt(m.amount)} ₸?`, () => removeMove(m))}><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            </>)}

            {opexView === "marketing" && (() => {
              const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
              const monthStartIso = isoOf(monthStart);
              const goal = Number(settings.mkt_revenue_goal) || 15000000;
              const adPct = Number(settings.mkt_ad_percent) || 10;
              const budget = Math.round(goal * adPct / 100);
              // выручка этого календарного месяца по источнику (done-заявки)
              const revenueBySource = (srcKey) => {
                if (!srcKey) return 0;
                return jobs.filter((j) => j.status === "done" && j.scheduled_date && j.scheduled_date >= monthStartIso && norm(j.source) === norm(srcKey))
                  .reduce((s, j) => s + (Number(j.report_paid) || 0), 0);
              };
              const topupsThisMonth = (chId) => mktTopups.filter((t) => t.channel_id === chId && t.topup_date >= monthStartIso);
              const spentThisMonth = (chId) => topupsThisMonth(chId).reduce((s, t) => s + (Number(t.amount) || 0), 0);
              const totalPlan = mktChannels.reduce((s, c) => s + (Number(c.monthly_plan) || 0), 0);
              const totalSpent = mktChannels.reduce((s, c) => s + spentThisMonth(c.id), 0);
              const totalRevenue = jobs.filter((j) => j.status === "done" && j.scheduled_date && j.scheduled_date >= monthStartIso).reduce((s, j) => s + (Number(j.report_paid) || 0), 0);
              return (
                <>
                  <div className="kd-tabbar" style={{ marginBottom: 8 }}>
                    <div className="kd-title" style={{ fontSize: 18 }}>Маркетинг · {monthStart.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</div>
                    <button className="kd-btn primary" onClick={() => setModal({ kind: "mktChannel" })}><Plus size={15} />Канал</button>
                  </div>

                  {/* Цель и бюджет */}
                  <div className="kd-card" style={{ marginBottom: 12 }}>
                    <div className="kd-section">Цель месяца</div>
                    <div className="kd-row"><span>Цель по выручке</span><strong>{fmt(goal)} ₸</strong></div>
                    <div className="kd-row"><span>Доля на рекламу</span><strong>{adPct}%</strong></div>
                    <div className="kd-row total"><span>Бюджет на рекламу</span><strong style={{ color: "var(--primary-d)" }}>{fmt(budget)} ₸</strong></div>
                    <div className="kd-muted" style={{ marginTop: 8 }}>Изменить цель и % можно в Настройках → «Маркетинг».</div>
                  </div>

                  {/* Итоги месяца */}
                  <div className="kd-card" style={{ marginBottom: 12 }}>
                    <div className="kd-section">Факт этого месяца</div>
                    <div className="kd-row"><span>План пополнений</span><strong>{fmt(totalPlan)} ₸</strong></div>
                    <div className="kd-row"><span>Уже пополнено</span><strong style={{ color: totalSpent >= totalPlan ? "#0E7C66" : "#B4650B" }}>{fmt(totalSpent)} ₸</strong></div>
                    <div className="kd-row"><span>Осталось пополнить</span><strong>{fmt(Math.max(0, totalPlan - totalSpent))} ₸</strong></div>
                    <div className="kd-row"><span>Выручка (done-заявки)</span><strong>{fmt(totalRevenue)} ₸</strong></div>
                    <div className="kd-row total"><span>Общий ROI</span><strong style={{ color: totalSpent > 0 && totalRevenue / totalSpent >= 10 ? "#0E7C66" : "#B4650B" }}>{totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(1) + "×" : "—"}</strong></div>
                    <div className="kd-muted" style={{ marginTop: 8 }}>Ориентир: каждый 1 ₸ рекламы должен вернуть ≥10 ₸ выручки.</div>
                  </div>

                  {/* Каналы */}
                  <div className="kd-list">
                    {mktChannels.length === 0 && <div className="kd-empty">Каналов нет. Добавь через «+ Канал».</div>}
                    {mktChannels.map((ch) => {
                      const spent = spentThisMonth(ch.id);
                      const plan = Number(ch.monthly_plan) || 0;
                      const rev = revenueBySource(ch.source_key);
                      const roi = spent > 0 ? rev / spent : null;
                      const filled = plan > 0 ? Math.min(100, Math.round(spent / plan * 100)) : 0;
                      const topups = topupsThisMonth(ch.id);
                      return (
                        <div key={ch.id} className="kd-card">
                          <div className="kd-card-head">
                            <div className="kd-pest">{ch.name}{ch.is_fixed && <span className="kd-brandtag" style={{ marginLeft: 8 }}>фикс</span>}</div>
                            <span className="kd-badge" style={{ color: filled >= 100 ? "#0E7C66" : "#B4650B", background: filled >= 100 ? "#E4F3EE" : "#FBEDD9" }}>{filled}% плана</span>
                          </div>
                          <div className="kd-mktbar"><div className="kd-mktbarfill" style={{ width: `${filled}%` }} /></div>
                          <div className="kd-tenderfin">
                            <div><span className="kd-muted">План/мес</span><strong>{fmt(plan)} ₸</strong></div>
                            <div><span className="kd-muted">Пополнено</span><strong>{fmt(spent)} ₸</strong></div>
                            {ch.source_key && <div><span className="kd-muted">Выручка ({ch.source_key})</span><strong>{fmt(rev)} ₸</strong></div>}
                            {ch.source_key && <div><span className="kd-muted">ROI</span><strong style={{ color: roi != null && roi >= 10 ? "#0E7C66" : roi != null ? "#B42318" : "var(--muted)" }}>{roi != null ? roi.toFixed(1) + "×" : "—"}</strong></div>}
                          </div>
                          {topups.length > 0 && (
                            <div className="kd-returns" style={{ marginTop: 8 }}>
                              {topups.map((t) => (
                                <div key={t.id} className="kd-returnrow">
                                  <span>✓ {fmt(t.amount)} ₸ · {isoToRu(t.topup_date)}{t.account_id ? " · " + (accountById(t.account_id)?.name || "") : ""}</span>
                                  <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить пополнение ${fmt(t.amount)} ₸?`, () => removeMktTopup(t))}><X size={12} /></button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="kd-actions">
                            <button className="kd-btn primary sm" onClick={() => setModal({ kind: "mktTopup", channel: ch })}><Plus size={13} />Пополнил</button>
                            <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "mktChannel", item: ch })}><Pencil size={13} />Изменить</button>
                            <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить канал «${ch.name}»? Пополнения тоже удалятся.`, () => removeMktChannel(ch))}><Trash2 size={13} /></button>
                          </div>
                          {!ch.source_key && <div className="kd-muted" style={{ marginTop: 6 }}>ROI не считается — не привязан источник. Укажи его в «Изменить», чтобы видеть отдачу.</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
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

        {!loading && tab === "materials" && (
          <div className="kd-list">
            <div className="kd-title" style={{ fontSize: 18, marginBottom: 4 }}>Материалы компании</div>
            <div className="kd-muted" style={{ marginBottom: 8 }}>Маркетинг и техника безопасности.{isAdmin ? " Ссылки меняются в Настройках → «Ссылки на Google Диск»." : ""}</div>
            {DRIVE_LINKS.filter((l) => l.place === "materials").map((l) => (
              <DriveLinkCard key={l.key} link={l} url={settings[l.key]} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {!loading && tab === "knowledge" && (
          <div className="kd-list">
            <div className="kd-title" style={{ fontSize: 18, marginBottom: 4 }}>База знаний</div>
            <div className="kd-muted" style={{ marginBottom: 8 }}>Обучение: скрипты продаж и разговора с клиентами.{isAdmin ? " Ссылки меняются в Настройках → «Ссылки на Google Диск»." : ""}</div>
            {DRIVE_LINKS.filter((l) => l.place === "knowledge").map((l) => (
              <DriveLinkCard key={l.key} link={l} url={settings[l.key]} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {!loading && tab === "docs" && (() => {
          const total = docs.reduce((s, d) => s + (Number(d.amount) || 0), 0);
          const paid = docs.filter((d) => d.status === "paid").reduce((s, d) => s + (Number(d.amount) || 0), 0);
          const pending = total - paid;
          return (
            <div className="kd-list">
              {DRIVE_LINKS.filter((l) => l.place === "docs").map((l) => (
                <DriveLinkCard key={l.key} link={l} url={settings[l.key]} isAdmin={isAdmin} />
              ))}
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
                <div className="kd-addr"><AddressText text={row.job.address} /></div>
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
          settings={settings} sources={sources} pestTypes={pestTypes} expCats={expCats} accounts={accounts}
          tabOrder={savedOrder.length ? [...ADMIN_TAB_ORDER].sort((a, b) => { const ia = savedOrder.indexOf(a), ib = savedOrder.indexOf(b); return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); }) : ADMIN_TAB_ORDER}
          leadStages={leadStages} onAddLeadStage={addLeadStage} onRemoveLeadStage={removeLeadStage} onMoveLeadStage={moveLeadStage}
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
      {modal?.kind === "move" && <MoveModal move={modal.move} accounts={accounts} expCats={expCats} onClose={() => setModal(null)} onSave={saveMove} />}
      {modal?.kind === "account" && <AccountModal item={modal.item} onClose={() => setModal(null)} onSave={saveAccount} onRemove={removeAccount} />}
      {modal?.kind === "confirmDeposit" && <ConfirmDepositModal dep={modal.dep} techName={techById(modal.dep.tech_id)?.full_name} accounts={accounts} defaultAccountId={cashDepositAccountId} onClose={() => setModal(null)} onConfirm={(accId) => { decideDeposit(modal.dep, "confirmed", null, accId); setModal(null); }} />}
      {modal?.kind === "deposit" && <DepositModal max={modal.max} onClose={() => setModal(null)} onSave={requestDeposit} />}
      {modal?.kind === "cancelJob" && <CancelJobModal job={modal.job} onClose={() => setModal(null)} onSave={(reason) => cancelJob(modal.job, reason)} />}
      {modal?.kind === "task" && <TaskModal task={modal.task} people={assignableProfiles} onClose={() => setModal(null)} onSave={saveTask} />}
      {modal?.kind === "tender" && <TenderModal tender={modal.tender} partners={partners} onClose={() => setModal(null)} onSave={saveTender} />}
      {modal?.kind === "lead" && <LeadModal lead={modal.lead} stages={leadStages} sources={sources} onClose={() => setModal(null)} onSave={saveLead} />}
      {modal?.kind === "mktChannel" && <MktChannelModal item={modal.item} sources={sources} onClose={() => setModal(null)} onSave={saveMktChannel} />}
      {modal?.kind === "mktTopup" && <MktTopupModal channel={modal.channel} accounts={accounts} onClose={() => setModal(null)} onSave={(amount, date, accId, note) => addMktTopup(modal.channel.id, amount, date, accId, note)} />}
      {modal?.kind === "dayOff" && <DayOffModal techs={techs} defaultDate={scheduleDate} daysOff={daysOff} personName={personName} onClose={() => setModal(null)} onAdd={addDayOff} onRemove={removeDayOff} />}
      {modal?.kind === "leadStageSelect" && <LeadStageSelectModal lead={modal.lead} stages={leadStages} onClose={() => setModal(null)} onPick={(sid) => { setLeadStage(modal.lead, sid); setModal(null); }} />}
      {modal?.kind === "guarantee" && <GuaranteeModal tenderId={modal.tenderId} onClose={() => setModal(null)} onSave={saveGuarantee} />}
      {modal?.kind === "payGuarantee" && <PayGuaranteeModal g={modal.g} accounts={accounts} onClose={() => setModal(null)} onConfirm={(accId, date) => markGuaranteePaid(modal.g, accId, date)} />}
      {modal?.kind === "returnGuarantee" && <ReturnGuaranteeModal g={modal.g} remaining={modal.remaining} accounts={accounts} onClose={() => setModal(null)} onConfirm={(amount, date, accId, note) => addGuaranteeReturn(modal.g, amount, date, accId, note)} />}
      {modal?.kind === "rejectDeposit" && <RejectDepositModal dep={modal.dep} techName={techById(modal.dep.tech_id)?.full_name} onClose={() => setModal(null)} onSave={(adminNote) => { decideDeposit(modal.dep, "rejected", adminNote); setModal(null); }} />}
      {modal?.kind === "partner" && <PartnerModal partner={modal.partner} onClose={() => setModal(null)} onSave={savePartner} />}
      {modal?.kind === "partnerJobs" && <PartnerJobsModal partner={modal.partner} jobs={jobs.filter((j) => j.partner_id === modal.partner.id)} shareOf={partnerShareAmt} onClose={() => setModal(null)}
        onOpenClient={(phone) => { setSearch(phone); setTab("done"); setModal(null); }} />}
      {modal?.kind === "doc" && <DocModal doc={modal.doc} partners={partners} onClose={() => setModal(null)} onSave={saveDoc} />}
      {confirmState && (
        <ConfirmModal message={confirmState.message} danger={confirmState.danger} confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onYes(); setConfirmState(null); }} />
      )}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

function JobCard({ job, isAdmin, assignedName, partnerName, partnerRepeat, share, onCopy, onReport, onAssign, onView, onEdit, onRepeat, onPayPartner, onCompPaid, onHistory, onOpenDetails, onCancel, onRestore, onDelete }) {
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
      <div className="kd-addr"><AddressText text={job.address} /></div>
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
        {isAdmin && job.partner_comp > 0 && <span className={job.partner_comp_paid ? "kd-muted paid" : "kd-muted"} style={{ color: job.partner_comp_paid ? undefined : "#B4650B", fontWeight: 700 }}>💳 Компенсация от партнёра нам: {fmt(job.partner_comp)} ₸ · {job.partner_comp_paid ? "получено" : "ожидаем на Kaspi"}</span>}
        {isAdmin && <span className="kd-muted">{assignedName ? "Дезинфектор: " + assignedName : "Не назначен"}</span>}
        {job.report_paid != null && <span className="kd-muted paid">Оплачено: {fmt(job.report_paid)} ₸</span>}
        {job.status === "canceled" && <span className="kd-muted" style={{ color: "#B3261E", fontWeight: 700 }}>Отменена{job.cancel_reason ? ": " + job.cancel_reason : ""}</span>}
      </div>
      <div className="kd-actions">
        {isAdmin && job.status !== "canceled" && <button className="kd-btn wa" onClick={onCopy}><MessageCircle size={15} />Скопировать для WhatsApp</button>}
        {!isAdmin && job.status !== "done" && job.status !== "canceled" && <button className="kd-btn ghost" onClick={onOpenDetails}>Открыть</button>}
        {job.status !== "done" && job.status !== "canceled" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
        {job.status !== "done" && job.status !== "canceled" && <button className="kd-btn ghost danger" onClick={onCancel}>Клиент отказался</button>}
        {isAdmin && job.status !== "canceled" && <button className="kd-btn ghost" onClick={onAssign}><UserPlus size={14} />{assignedName ? "Переназначить" : "Назначить"}</button>}
        {isAdmin && job.status !== "canceled" && <button className="kd-btn ghost" onClick={onEdit}><Pencil size={14} />Изменить</button>}
        {job.status === "done" && <button className="kd-btn ghost" onClick={onView}>Отчёт</button>}
        {isAdmin && job.status === "done" && !job.repeat_state && <button className="kd-btn ghost" onClick={onRepeat}>На повтор</button>}
        {isAdmin && job.status === "canceled" && <button className="kd-btn primary" onClick={() => onRestore()}>Вернуть в работу</button>}
        {isAdmin && share > 0 && <button className="kd-btn ghost" onClick={() => onPayPartner(!job.partner_paid)}>{job.partner_paid ? "Отменить выплату" : "Выплатить долю"}</button>}
        {isAdmin && job.partner_comp > 0 && <button className="kd-btn ghost" onClick={() => onCompPaid(!job.partner_comp_paid)}>{job.partner_comp_paid ? "Компенсация не получена" : "Компенсация получена"}</button>}
        {isAdmin && <button className="kd-btn ghost danger sm" onClick={onDelete} title="Удалить"><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}

function RepeatCard({ job, onSaveNote, onCreate, onFinish, onUnset, repeatHint }) {
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
      <div className="kd-addr"><AddressText text={job.address} /></div>
      <div className="kd-card-foot"><span className="kd-muted">Клиент: {job.client_phone}</span></div>
      {repeatHint && <div className="kd-hint">💡 {repeatHint}</div>}
      <Field label="Как прошёл созвон / заметка">
        <textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: созвонился, согласен на субботу" />
      </Field>
      <div className="kd-actions">
        <button className="kd-btn ghost sm" onClick={() => onSaveNote(job, note)}>Сохранить заметку</button>
        <button className="kd-btn primary sm" onClick={() => onCreate(job)}>Создать повторную заявку</button>
        <button className="kd-btn ghost danger sm" onClick={() => onFinish(job)}>Отказался — завершить</button>
        <button className="kd-btn ghost sm" onClick={() => onUnset(job)}>Убрать с повтора</button>
      </div>
    </div>
  );
}

// ----------------------------- modals -----------------------------
function ConfirmModal({ message, onCancel, onConfirm, danger = true, confirmLabel }) {
  return (
    <div className="kd-overlay">
      <div className="kd-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-body" style={{ paddingTop: 22, textAlign: "center" }}>
          <div className={danger ? "kd-confirm-icon" : "kd-confirm-icon ok"}>{danger ? <Trash2 size={22} /> : <CheckCircle2 size={22} />}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 12, lineHeight: 1.4 }}>{message}</div>
        </div>
        <div className="kd-modal-foot" style={{ justifyContent: "center" }}>
          <button className="kd-btn ghost" onClick={onCancel}>Отмена</button>
          <button className={danger ? "kd-btn primary danger" : "kd-btn primary"} onClick={onConfirm}>{confirmLabel || (danger ? "Да, удалить" : "Подтвердить")}</button>
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
    note: job.note || "", joint_work: !!job.joint_work, joint_supplier: job.joint_supplier || "us", joint_cost_share: job.joint_cost_share ?? "", partner_comp: job.partner_comp ?? "",
  };
}

function JobFormModal({ initial, title, submitLabel, keepStatus, partners = [], sources = [], pestTypes = [], defaultGuarantee = 6, onClose, onSave }) {
  const [f, setF] = useState(initial || { type: "Первичная", scheduled_date: "", time_from: "", time_to: "", address: "", floor: "", area: "", source: "", pest: "", p1label: "С запахом", p1amount: "", p2label: "Без запаха", p2amount: "", client_phone: "+7 ", guarantee_months: defaultGuarantee, brand: "KazDez", partner_id: "", partner_share: "", note: "", joint_work: false, joint_supplier: "us", joint_cost_share: "", partner_comp: "" });
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
    const payload = { type: f.type, scheduled_date: f.scheduled_date || null, scheduled_time, address: f.address, floor: f.floor, area: f.area ? Number(f.area) : null, source: f.source, pest: f.pest, price_options, client_phone: f.client_phone, guarantee_months: Number(f.guarantee_months) || 6, brand: f.brand, partner_id: isPartner ? (f.partner_id || null) : null, partner_share: isPartner ? (Number(f.partner_share) || 0) : null, note: f.note || null, joint_work: isPartner && !!f.joint_work, joint_supplier: isPartner && f.joint_work ? f.joint_supplier : "us", joint_cost_share: isPartner && f.joint_work && f.joint_supplier === "us" ? (Number(f.joint_cost_share) || 0) : null, partner_comp: isPartner && f.partner_comp ? (Number(f.partner_comp) || 0) : null };
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
          <Field label="Компенсация от партнёра нам (₸) — на личный Kaspi, скрыто от дезинфектора">
            <input value={f.partner_comp} onChange={set("partner_comp")} inputMode="numeric" placeholder="напр. 8000 (если партнёр компенсирует нам)" />
          </Field>
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
          <div className="kd-row"><span>Адрес</span><strong style={{ textAlign: "right", overflowWrap: "anywhere" }}><AddressText text={job.address} /></strong></div>
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
  const [role, setRole] = useState(tech.role || "tech");
  const [saving, setSaving] = useState(false);
  const ok = fullName.trim();
  async function save() { setSaving(true); await onSave({ full_name: fullName.trim(), phone: phone.trim() || null, role }); setSaving(false); }
  return (
    <ModalShell title="Данные сотрудника" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Логин и пароль этим не затрагиваются — меняется только отображаемое имя, телефон и роль в приложении.</div>
      <Field label="Имя (как будет видно в приложении)"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Байсеит" /></Field>
      <Field label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 701 ..." /></Field>
      <Field label="Роль">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="tech">Дезинфектор (заявки, своя касса, оборудование)</option>
          <option value="manager">Менеджер (ставит задачи, без доступа к финансам)</option>
        </select>
      </Field>
      <div className="kd-muted">Менеджер — «ключевой человек»: может создавать задачи и назначать их. Роль администратора меняется только напрямую в базе для безопасности.</div>
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

function SettingsSection({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="kd-setsection">
      <button className="kd-sethead" onClick={onToggle}>
        <div>
          <div className="kd-setname">{title}</div>
          {subtitle && <div className="kd-setsub">{subtitle}</div>}
        </div>
        <ChevronRight size={18} className="kd-setchevron" style={{ transform: open ? "rotate(90deg)" : "none" }} />
      </button>
      {open && <div className="kd-setbody">{children}</div>}
    </div>
  );
}

function SettingsModal({ settings, sources, pestTypes, expCats, accounts = [], tabOrder = [], leadStages = [], onAddLeadStage, onRemoveLeadStage, onMoveLeadStage, onClose, onSaveSetting, onSetTheme, onAddSource, onRemoveSource, onAddPest, onRemovePest, onAddExpCat, onRemoveExpCat }) {
  const [newStage, setNewStage] = useState("");
  const [theme, setThemeLocal] = useState(localStorage.getItem("kd-theme") || "light");
  const [qrRate, setQrRate] = useState(settings.qr_fee_rate ?? 0.95);
  const [guarantee, setGuarantee] = useState(settings.default_guarantee_months ?? 6);
  const [newCat, setNewCat] = useState("");
  const [subInputs, setSubInputs] = useState({});
  const [openSection, setOpenSection] = useState("appearance");
  const [order, setOrder] = useState(tabOrder);
  const toggle = (id) => setOpenSection(openSection === id ? "" : id);
  function pickTheme(t) { setThemeLocal(t); onSetTheme(t); }
  function moveTab(idx, dir) {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = [...order];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setOrder(next);
    onSaveSetting("tab_order", next);
  }
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subsOf = (pid) => (expCats || []).filter((c) => c.parent_id === pid);
  const inputStyle = { flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 };
  return (
    <ModalShell title="Настройки" onClose={onClose} footer={<button className="kd-btn primary" onClick={onClose}>Готово</button>}>
      <div className="kd-setlist">
        <SettingsSection title="Оформление" subtitle="Тема приложения" open={openSection === "appearance"} onToggle={() => toggle("appearance")}>
          <div className="kd-seg" style={{ width: "100%", marginBottom: 10 }}>
            <button className={`kd-segbtn ${theme === "light" ? "on" : ""}`} onClick={() => pickTheme("light")}>Светлая</button>
            <button className={`kd-segbtn ${theme === "dark" ? "on" : ""}`} onClick={() => pickTheme("dark")}>Тёмная</button>
          </div>
          <div className="kd-muted">Применяется на этом устройстве сразу, без перезагрузки.</div>
        </SettingsSection>

        <SettingsSection title="Порядок вкладок" subtitle="Общий для всех — двигай вверх/вниз" open={openSection === "taborder"} onToggle={() => toggle("taborder")}>
          <div className="kd-muted" style={{ marginBottom: 10 }}>Порядок верхнего меню. Меняется сразу для всех сотрудников.</div>
          {order.map((id, i) => (
            <div key={id} className="kd-orderrow">
              <span className="kd-ordernum">{i + 1}</span>
              <span className="kd-ordername">{TAB_LABELS[id] || id}</span>
              <div className="kd-orderbtns">
                <button className="kd-btn ghost sm" disabled={i === 0} onClick={() => moveTab(i, -1)} aria-label="Вверх"><ChevronRight size={16} style={{ transform: "rotate(-90deg)" }} /></button>
                <button className="kd-btn ghost sm" disabled={i === order.length - 1} onClick={() => moveTab(i, 1)} aria-label="Вниз"><ChevronRight size={16} style={{ transform: "rotate(90deg)" }} /></button>
              </div>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title="Ссылки на Google Диск" subtitle="Тендеры, договоры, маркетинг, ТБ, обучение, КП" open={openSection === "drivelinks"} onToggle={() => toggle("drivelinks")}>
          <div className="kd-muted" style={{ marginBottom: 12 }}>Вставь ссылку на папку Google Диск для каждого раздела. Пустые не показываются сотрудникам. Тендерная — во вкладке «Тендеры», КП — во вкладке «Клиенты», остальные — в «Материалах» и «Базе знаний».</div>
          {DRIVE_LINKS.map((l) => (
            <div key={l.key} className="kd-field">
              <span>{l.emoji} {l.label}</span>
              <input defaultValue={settings[l.key] || ""} placeholder="https://drive.google.com/..."
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (settings[l.key] || "")) onSaveSetting(l.key, v || null); }} />
            </div>
          ))}
          <div className="kd-muted">Сохраняется при выходе из поля.</div>
        </SettingsSection>

        <SettingsSection title="Стадии воронки" subtitle={`${leadStages.length} стадий · CRM «Клиенты»`} open={openSection === "leadstages"} onToggle={() => toggle("leadstages")}>
          <div className="kd-muted" style={{ marginBottom: 10 }}>Этапы, по которым клиент движется в воронке. Двигай порядок стрелками. Физлица обычно пропускают «КП выдано» и «Договор».</div>
          {[...leadStages].sort((a, b) => a.sort - b.sort).map((st, i, arr) => (
            <div key={st.id} className="kd-orderrow">
              <span className="kd-ordernum">{i + 1}</span>
              <span className="kd-ordername">{st.name}{st.is_lost ? " ✕" : ""}</span>
              <div className="kd-orderbtns">
                <button className="kd-btn ghost sm" disabled={i === 0} onClick={() => onMoveLeadStage(st, -1)}><ChevronRight size={16} style={{ transform: "rotate(-90deg)" }} /></button>
                <button className="kd-btn ghost sm" disabled={i === arr.length - 1} onClick={() => onMoveLeadStage(st, 1)}><ChevronRight size={16} style={{ transform: "rotate(90deg)" }} /></button>
                <button className="kd-btn ghost danger sm" onClick={() => onRemoveLeadStage(st)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Новая стадия" style={{ flex: 1, font: "inherit", fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", minHeight: 44 }} />
            <button className="kd-btn primary sm" disabled={!newStage.trim()} onClick={() => { onAddLeadStage(newStage); setNewStage(""); }}><Plus size={14} />Добавить</button>
          </div>
        </SettingsSection>

        <SettingsSection title="Источники клиентов" subtitle={`${sources.length} шт. · откуда пришёл клиент`} open={openSection === "sources"} onToggle={() => toggle("sources")}>
          <CatalogList items={sources} onAdd={onAddSource} onRemove={onRemoveSource} placeholder="Напр.: Facebook" />
        </SettingsSection>

        <SettingsSection title="Виды вредителей" subtitle={`${pestTypes.length} шт.`} open={openSection === "pests"} onToggle={() => toggle("pests")}>
          <CatalogList items={pestTypes} onAdd={onAddPest} onRemove={onRemovePest} placeholder="Напр.: Муравьи" />
        </SettingsSection>

        <SettingsSection title="Категории расходов" subtitle={`${parents.length} категорий · для учёта в Финансах`} open={openSection === "expcats"} onToggle={() => toggle("expcats")}>
          <div className="kd-muted" style={{ marginBottom: 10 }}>Категория → внутри неё подкатегории. Например: «Реклама» → OLX, Instagram, Google.</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Новая категория (напр.: Аренда)" style={inputStyle} />
            <button className="kd-btn primary sm" disabled={!newCat.trim()} onClick={() => { onAddExpCat(newCat, null); setNewCat(""); }}><Plus size={14} />Добавить</button>
          </div>
          {parents.length === 0 && <div className="kd-muted">Категорий пока нет.</div>}
          {parents.map((cat) => (
            <div key={cat.id} className="kd-catbox">
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
                <input value={subInputs[cat.id] || ""} onChange={(e) => setSubInputs({ ...subInputs, [cat.id]: e.target.value })} placeholder="Добавить подкатегорию" style={{ ...inputStyle, minHeight: 40, padding: "9px 12px" }} />
                <button className="kd-btn ghost sm" disabled={!(subInputs[cat.id] || "").trim()} onClick={() => { onAddExpCat(subInputs[cat.id], cat.id); setSubInputs({ ...subInputs, [cat.id]: "" }); }}><Plus size={13} /></button>
              </div>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title="Финансы" subtitle="Комиссия, гарантия, счета для авто-зачисления" open={openSection === "finance"} onToggle={() => toggle("finance")}>
          <div className="kd-grid2">
            <Field label="Комиссия банка по QR (%)"><input value={qrRate} onChange={(e) => setQrRate(e.target.value)} inputMode="decimal" onBlur={() => onSaveSetting("qr_fee_rate", Number(qrRate) || 0)} /></Field>
            <Field label="Гарантия по умолчанию (мес.)"><input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} inputMode="numeric" onBlur={() => onSaveSetting("default_guarantee_months", Number(guarantee) || 6)} /></Field>
          </div>
          {accounts.length > 0 && (
            <div className="kd-grid2">
              <Field label="Счёт для QR-оплат (Kaspi Pay)"><select value={settings.qr_account_id || ""} onChange={(e) => onSaveSetting("qr_account_id", e.target.value || null)}><option value="">— не выбран —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="Счёт для сдачи налички (Kaspi Gold)"><select value={settings.cash_account_id || ""} onChange={(e) => onSaveSetting("cash_account_id", e.target.value || null)}><option value="">— не выбран —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
          )}
          <div className="kd-muted">QR-оплаты по заявкам автоматически приходят на выбранный счёт (минус комиссия). Сдача налички дезинфектором — на второй счёт, когда ты подтверждаешь поступление.</div>
        </SettingsSection>

        <SettingsSection title="Маркетинг" subtitle="Цель выручки и % на рекламу" open={openSection === "marketing"} onToggle={() => toggle("marketing")}>
          <div className="kd-grid2">
            <Field label="Цель по выручке в месяц (₸)"><input defaultValue={settings.mkt_revenue_goal ?? 15000000} inputMode="numeric" onBlur={(e) => onSaveSetting("mkt_revenue_goal", Number(e.target.value) || 0)} /></Field>
            <Field label="Доля на рекламу (%)"><input defaultValue={settings.mkt_ad_percent ?? 10} inputMode="decimal" onBlur={(e) => onSaveSetting("mkt_ad_percent", Number(e.target.value) || 0)} /></Field>
          </div>
          <div className="kd-muted">Бюджет на рекламу = цель × %. Напр.: 15 000 000 × 10% = 1 500 000 ₸. Сами каналы и пополнения — во вкладке «Финансы» → «Маркетинг». Сохраняется при выходе из поля.</div>
        </SettingsSection>
      </div>
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

function MoveModal({ move, accounts, expCats, onClose, onSave }) {
  const [direction, setDirection] = useState(move?.direction || "expense");
  const [accountId, setAccountId] = useState(move?.account_id || (accounts[0]?.id || ""));
  const [toAccountId, setToAccountId] = useState(move?.to_account_id || "");
  const [amount, setAmount] = useState(move?.amount ?? "");
  const [moveDate, setMoveDate] = useState(move?.move_date || new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(move?.category_id || "");
  const [subcategoryId, setSubcategoryId] = useState(move?.subcategory_id || "");
  const [note, setNote] = useState(move?.note || "");
  const [saving, setSaving] = useState(false);
  const parents = (expCats || []).filter((c) => !c.parent_id);
  const subs = (expCats || []).filter((c) => c.parent_id === categoryId);
  const ok = accountId && Number(amount) > 0 && (direction !== "transfer" || (toAccountId && toAccountId !== accountId));
  async function save() {
    setSaving(true);
    await onSave({
      direction, account_id: accountId, to_account_id: direction === "transfer" ? toAccountId : null,
      amount: Number(amount) || 0, move_date: moveDate || null,
      category_id: direction === "expense" ? (categoryId || null) : null,
      subcategory_id: direction === "expense" ? (subcategoryId || null) : null, note: note || null,
    }, move);
    setSaving(false);
  }
  return (
    <ModalShell title={move ? "Изменить движение" : "Новое движение"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-seg" style={{ width: "100%", marginBottom: 14 }}>
        <button className={`kd-segbtn ${direction === "income" ? "on" : ""}`} onClick={() => setDirection("income")}>Доход</button>
        <button className={`kd-segbtn ${direction === "expense" ? "on" : ""}`} onClick={() => setDirection("expense")}>Расход</button>
        <button className={`kd-segbtn ${direction === "transfer" ? "on" : ""}`} onClick={() => setDirection("transfer")}>Перевод</button>
      </div>
      <Field label={direction === "transfer" ? "Со счёта" : "Счёт"}><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      {direction === "transfer" && <Field label="На счёт"><select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">— выбери —</option>{accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
      <div className="kd-grid2">
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" /></Field>
        <Field label="Дата"><input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} /></Field>
      </div>
      {direction === "expense" && parents.length > 0 && (
        <>
          <Field label="Статья расхода"><select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}><option value="">— без статьи —</option>{parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          {subs.length > 0 && <Field label="Подстатья"><select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}><option value="">— без подстатьи —</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        </>
      )}
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="за что / откуда / комментарий" /></Field>
    </ModalShell>
  );
}

function AccountModal({ item, onClose, onSave, onRemove }) {
  const [name, setName] = useState(item?.name || "");
  const [kind, setKind] = useState(item?.kind || "bank");
  const [openingBalance, setOpeningBalance] = useState(item?.opening_balance ?? "");
  const [openingDate, setOpeningDate] = useState(item?.opening_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() { setSaving(true); await onSave({ name: name.trim(), kind, opening_balance: Number(openingBalance) || 0, opening_date: openingDate || null }, item); setSaving(false); }
  return (
    <ModalShell title={item ? "Счёт" : "Новый счёт"} onClose={onClose} footer={<>
      {item && <button className="kd-btn ghost danger" onClick={() => onRemove(item)} style={{ marginRight: "auto" }}>Удалить</button>}
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Название счёта"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр.: Halyk Bank" /></Field>
      <Field label="Тип"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="bank">Банковский счёт</option><option value="cash">Наличные</option><option value="other">Другое</option></select></Field>
      <div className="kd-hint">Начальный остаток — сколько реально лежит на счёте на указанную дату. С неё система начнёт считать. Так баланс в приложении сойдётся с банком.</div>
      <div className="kd-grid2">
        <Field label="Начальный остаток (₸)"><input value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} inputMode="numeric" placeholder="0" /></Field>
        <Field label="На дату"><input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} /></Field>
      </div>
    </ModalShell>
  );
}

function ConfirmDepositModal({ dep, techName, accounts, defaultAccountId, onClose, onConfirm }) {
  const [accId, setAccId] = useState(defaultAccountId || accounts[0]?.id || "");
  return (
    <ModalShell title="Подтвердить поступление" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!accId} onClick={() => onConfirm(accId)}>Да, подтвердить</button>
    </>}>
      <div className="kd-paytotal"><span>{techName || "Дезинфектор"}</span><strong>{fmt(dep.amount)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Деньги придут на выбранный счёт (сдача налички через банкомат). Это перевод из «на руках» дезинфектора на счёт — без двойного счёта.</div>
      <Field label="На какой счёт поступило"><select value={accId} onChange={(e) => setAccId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </ModalShell>
  );
}

function CancelJobModal({ job, onClose, onSave }) {
  const COMMON = ["Клиент передумал", "Слишком дорого", "Нашёл дешевле", "Не дозвонились", "Перенёс на потом", "Клиент не отвечает"];
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(reason.trim()); setSaving(false); }
  return (
    <ModalShell title="Клиент отказался" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Назад</button>
      <button className="kd-btn primary danger" disabled={saving} onClick={save}>{saving ? "…" : "Отменить заявку"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{job.pest} · {job.address}. Заявка уйдёт в «Отменённые», в выручку не попадёт. Позже можно вернуть в работу.</div>
      <div className="kd-field"><span>Частые причины</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {COMMON.map((c) => (
            <button key={c} type="button" onClick={() => setReason(c)} className="kd-price" style={{ cursor: "pointer", border: reason === c ? "1px solid var(--primary)" : "1px solid var(--line-soft)", color: reason === c ? "var(--primary-d)" : "var(--ink)" }}>{c}</button>
          ))}
        </div>
      </div>
      <Field label="Причина / комментарий"><textarea className="kd-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Что, где, как — своими словами" /></Field>
    </ModalShell>
  );
}

function TaskModal({ task, people, onClose, onSave }) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [type, setType] = useState(task?.type || "errand");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || "");
  const [dueMode, setDueMode] = useState(task?.due_date ? "date" : "none");
  const [dueDate, setDueDate] = useState(task?.due_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const ok = title.trim();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  async function save() {
    setSaving(true);
    const due = dueMode === "today" ? today : dueMode === "tomorrow" ? tomorrow : dueMode === "date" ? (dueDate || null) : null;
    await onSave({ title: title.trim(), description: description.trim() || null, type, priority, assignee_id: assigneeId || null, due_date: due }, task);
    setSaving(false);
  }
  return (
    <ModalShell title={task ? "Изменить задачу" : "Новая задача"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Что нужно сделать"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Забрать документы у FishProDex" /></Field>
      <Field label="Подробности (необязательно)"><textarea className="kd-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Адрес, что именно, детали..." /></Field>
      <div className="kd-grid2">
        <Field label="Тип"><select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TASK_TYPES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <Field label="Приоритет"><select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">Обычный</option><option value="urgent">🔴 Срочный</option></select></Field>
      </div>
      <Field label="Исполнитель"><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">— не назначен —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 6)}</option>)}</select></Field>
      <div className="kd-field"><span>Срок</span>
        <div className="kd-seg" style={{ width: "100%" }}>
          {[{ id: "none", label: "Без срока" }, { id: "today", label: "Сегодня" }, { id: "tomorrow", label: "Завтра" }, { id: "date", label: "Дата" }].map((m) => (
            <button key={m.id} type="button" className={`kd-segbtn ${dueMode === m.id ? "on" : ""}`} onClick={() => setDueMode(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>
      {dueMode === "date" && <Field label="Выбери дату"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
    </ModalShell>
  );
}

function DayOffModal({ techs, defaultDate, daysOff, personName, onClose, onAdd, onRemove }) {
  const [techId, setTechId] = useState(techs[0]?.id || "");
  const [offDate, setOffDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = techId && offDate;
  const upcoming = [...daysOff].filter((d) => d.off_date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.off_date.localeCompare(b.off_date)).slice(0, 12);
  async function save() { setSaving(true); await onAdd(techId, offDate, note.trim() || null); setSaving(false); }
  return (
    <ModalShell title="Выходной сотрудника" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Закрыть</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Отметить выходной"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Сотрудник"><select value={techId} onChange={(e) => setTechId(e.target.value)}>{techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || "—"}</option>)}</select></Field>
        <Field label="Дата"><input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} /></Field>
      </div>
      <Field label="Причина (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="выходной / отпросился / болеет" /></Field>
      {upcoming.length > 0 && (
        <>
          <div className="kd-section" style={{ marginTop: 6 }}>Ближайшие выходные</div>
          {upcoming.map((d) => (
            <div key={d.id} className="kd-returnrow" style={{ fontSize: 13.5 }}>
              <span>🌴 {personName(d.tech_id)} · {isoToRu(d.off_date)}{d.note ? " · " + d.note : ""}</span>
              <button className="kd-btn ghost danger sm" onClick={() => onRemove(d)}><X size={12} /></button>
            </div>
          ))}
        </>
      )}
    </ModalShell>
  );
}

function MktChannelModal({ item, sources, onClose, onSave }) {
  const [name, setName] = useState(item?.name || "");
  const [sourceKey, setSourceKey] = useState(item?.source_key || "");
  const [plan, setPlan] = useState(item?.monthly_plan ?? "");
  const [isFixed, setIsFixed] = useState(item?.is_fixed || false);
  const [saving, setSaving] = useState(false);
  const ok = name.trim();
  async function save() {
    setSaving(true);
    await onSave({ name: name.trim(), source_key: sourceKey.trim() || null, monthly_plan: Number(plan) || 0, is_fixed: isFixed }, item);
    setSaving(false);
  }
  return (
    <ModalShell title={item ? "Канал" : "Новый канал"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <Field label="Название канала"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="2ГИС / OLX / Instagram / TikTok" /></Field>
      <datalist id="kd-mkt-sources">{sources.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <Field label="Источник заявок для ROI (из справочника)"><input list="kd-mkt-sources" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} placeholder="напр.: 2gis / olx / instagram" /></Field>
      <div className="kd-muted" style={{ marginTop: -6, marginBottom: 12 }}>Система посчитает выручку по заявкам с этим источником. Если не указать — ROI не считается (для «Резерв» можно оставить пустым).</div>
      <Field label="Плановый бюджет в месяц (₸)"><input value={plan} onChange={(e) => setPlan(e.target.value)} inputMode="numeric" placeholder="450000" /></Field>
      <label className="kd-check"><input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} /> Фиксированный (сумма не меняется, напр. 2ГИС)</label>
    </ModalShell>
  );
}

function MktTopupModal({ channel, accounts, onClose, onSave }) {
  const [amount, setAmount] = useState(String(channel?.monthly_plan || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accId, setAccId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = Number(amount) > 0 && date;
  async function save() { setSaving(true); await onSave(Number(amount) || 0, date, accId || null, note.trim() || null); setSaving(false); }
  return (
    <ModalShell title={`Пополнение · ${channel.name}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Записать пополнение"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="200000" /></Field>
        <Field label="Дата пополнения"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="С какого счёта (необязательно)"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не списывать со счёта —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <div className="kd-muted" style={{ marginTop: -6, marginBottom: 12 }}>Если выберешь счёт — сумма спишется с него как расход в «Финансах».</div>
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр.: первая половина месяца" /></Field>
    </ModalShell>
  );
}

function LeadModal({ lead, stages, sources, onClose, onSave }) {
  const [name, setName] = useState(lead?.name || "");
  const [clientType, setClientType] = useState(lead?.client_type || "person");
  const [phone, setPhone] = useState(lead?.phone || "+7 ");
  const [address, setAddress] = useState(lead?.address || "");
  const [source, setSource] = useState(lead?.source || "");
  const [stageId, setStageId] = useState(lead?.stage_id || (stages[0]?.id || ""));
  const [kpUrl, setKpUrl] = useState(lead?.kp_url || "");
  const [note, setNote] = useState(lead?.note || "");
  const [saving, setSaving] = useState(false);
  const ok = (name.trim() || (phone.trim() && phone.trim() !== "+7"));
  async function save() {
    setSaving(true);
    await onSave({ name: name.trim() || null, client_type: clientType, phone: phone.trim() || null, address: address.trim() || null, source: source.trim() || null, stage_id: stageId || null, kp_url: kpUrl.trim() || null, note: note.trim() || null }, lead);
    setSaving(false);
  }
  return (
    <ModalShell title={lead ? "Клиент" : "Новый клиент"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-seg" style={{ width: "100%", marginBottom: 14 }}>
        <button className={`kd-segbtn ${clientType === "person" ? "on" : ""}`} onClick={() => setClientType("person")}>Физлицо</button>
        <button className={`kd-segbtn ${clientType === "company" ? "on" : ""}`} onClick={() => setClientType("company")}>Юрлицо</button>
      </div>
      <Field label={clientType === "company" ? "Название организации" : "Имя клиента"}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={clientType === "company" ? "ТОО ..." : "Иван"} /></Field>
      <div className="kd-grid2">
        <Field label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 701 ..." /></Field>
        <Field label="Стадия"><select value={stageId} onChange={(e) => setStageId(e.target.value)}>{[...stages].sort((a, b) => a.sort - b.sort).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      <Field label="Адрес"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Алматы, ..." /></Field>
      <datalist id="kd-lead-sources">{sources.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <Field label="Источник"><input list="kd-lead-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="OLX / Instagram / рекомендация" /></Field>
      <Field label="Ссылка на файл КП (Google Диск)"><input value={kpUrl} onChange={(e) => setKpUrl(e.target.value)} placeholder="https://drive.google.com/... (файл этого клиента)" /></Field>
      <Field label="Заметка"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что обсудили, детали..." /></Field>
    </ModalShell>
  );
}

function LeadStageSelectModal({ lead, stages, onClose, onPick }) {
  return (
    <ModalShell title="Перевести на стадию" onClose={onClose} footer={<button className="kd-btn ghost" onClick={onClose}>Закрыть</button>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{lead.name || lead.phone || "Клиент"} — выбери стадию:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...stages].sort((a, b) => a.sort - b.sort).map((s) => (
          <button key={s.id} className={`kd-btn ${lead.stage_id === s.id ? "primary" : "ghost"}`} style={{ justifyContent: "flex-start" }} onClick={() => onPick(s.id)}>{s.name}{lead.stage_id === s.id ? " ✓" : ""}</button>
        ))}
      </div>
    </ModalShell>
  );
}

function TenderModal({ tender, partners, onClose, onSave }) {
  const [contractNo, setContractNo] = useState(tender?.contract_no || "");
  const [customer, setCustomer] = useState(tender?.customer || "");
  const [title, setTitle] = useState(tender?.title || "");
  const [address, setAddress] = useState(tender?.address || "");
  const [amount, setAmount] = useState(tender?.amount ?? "");
  const [ourShare, setOurShare] = useState(tender?.our_share_pct ?? "");
  const [partnerId, setPartnerId] = useState(tender?.partner_id || "");
  const [status, setStatus] = useState(tender?.status || "participating");
  const [startDate, setStartDate] = useState(tender?.start_date || "");
  const [endDate, setEndDate] = useState(tender?.end_date || "");
  const [note, setNote] = useState(tender?.note || "");
  const [freq, setFreq] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = (contractNo.trim() || title.trim()) && Number(amount) >= 0;
  const ourAmount = Math.round((Number(amount) || 0) * (Number(ourShare) || 0) / 100);

  // равномерные даты обработок по кратности в пределах start..end
  function buildServices() {
    const n = Number(freq) || 0;
    if (!n || n < 1 || !startDate) return [];
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(new Date(startDate).setFullYear(start.getFullYear() + 1));
    const span = end.getTime() - start.getTime();
    const step = span / n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getTime() + step * i + step / 2);
      out.push({ due_date: d.toISOString().slice(0, 10) });
    }
    return out;
  }

  async function save() {
    setSaving(true);
    const payload = { contract_no: contractNo.trim() || null, customer: customer.trim() || null, title: title.trim() || null, address: address.trim() || null, amount: Number(amount) || 0, our_share_pct: Number(ourShare) || 0, partner_id: partnerId || null, status, start_date: startDate || null, end_date: endDate || null, note: note.trim() || null };
    await onSave(payload, tender ? null : buildServices(), tender);
    setSaving(false);
  }
  return (
    <ModalShell title={tender ? "Изменить тендер" : "Новый тендер"} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Сохранить"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Номер договора"><input value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="№ 123-45" /></Field>
        <Field label="Статус"><select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(TENDER_STATUS).map(([code, s]) => <option key={code} value={code}>{s.label}</option>)}</select></Field>
      </div>
      <Field label="Заказчик"><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Напр.: ГУ «Управление ...»" /></Field>
      <Field label="Название / предмет"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Дезинфекция объекта ..." /></Field>
      <Field label="Адрес объекта"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Алматы, ..." /></Field>
      <div className="kd-grid2">
        <Field label="Сумма договора (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="1000000" /></Field>
        <Field label="Наша доля (%)"><input value={ourShare} onChange={(e) => setOurShare(e.target.value)} inputMode="numeric" placeholder="25" /></Field>
      </div>
      {Number(amount) > 0 && Number(ourShare) > 0 && <div className="kd-paytotal"><span>Наша доля составит</span><strong style={{ color: "var(--primary-d)" }}>{fmt(ourAmount)} ₸</strong></div>}
      <Field label="Партнёр (выиграл через нас)"><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">— не выбран —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <div className="kd-grid2">
        <Field label="Начало действия"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Конец действия"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      </div>
      {!tender && (
        <Field label="Кратность обработок (сколько раз за период)">
          <input value={freq} onChange={(e) => setFreq(e.target.value)} inputMode="numeric" placeholder="напр. 4" />
        </Field>
      )}
      {!tender && Number(freq) > 0 && startDate && <div className="kd-muted" style={{ marginTop: -6, marginBottom: 10 }}>Создам {freq} обработок с равномерными датами — потом сможешь поправить каждую в карточке тендера.</div>}
      {!tender && Number(freq) > 0 && !startDate && <div className="kd-err" style={{ marginTop: -6 }}>Укажи «Начало действия», чтобы построить график.</div>}
      <Field label="Примечание"><textarea className="kd-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Условия, детали..." /></Field>
      {tender && <div className="kd-muted">График обработок и обеспечения редактируются прямо в карточке тендера.</div>}
    </ModalShell>
  );
}

function GuaranteeModal({ tenderId, onClose, onSave }) {
  const [kind, setKind] = useState("application");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = Number(amount) > 0;
  async function save() { setSaving(true); await onSave({ tender_id: tenderId, kind, amount: Number(amount) || 0, note: note.trim() || null }); setSaving(false); }
  return (
    <ModalShell title="Обеспечение (залог)" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Добавить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Залог — это временно замороженные деньги, которые потом возвращаются. Не доход и не расход.</div>
      <Field label="Тип обеспечения"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(GUARANTEE_KINDS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
      <Field label="Сумма (₸)"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" /></Field>
      <Field label="Примечание"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="реквизиты / условия возврата" /></Field>
    </ModalShell>
  );
}

function PayGuaranteeModal({ g, accounts, onClose, onConfirm }) {
  const [accId, setAccId] = useState(accounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onConfirm(accId || null, date || null); setSaving(false); }
  return (
    <ModalShell title="Внести обеспечение" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={saving} onClick={save}>{saving ? "…" : "Да, внести"}</button>
    </>}>
      <div className="kd-paytotal"><span>{GUARANTEE_KINDS[g.kind] || g.kind}</span><strong>{fmt(g.amount)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Деньги спишутся с выбранного счёта как замороженный залог (уменьшат его остаток в «Финансах»).</div>
      <Field label="С какого счёта внесено"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не привязывать к счёту —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Дата внесения"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </ModalShell>
  );
}

function ReturnGuaranteeModal({ g, remaining, accounts, onClose, onConfirm }) {
  const [amount, setAmount] = useState(String(remaining || ""));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accId, setAccId] = useState(g.account_id || accounts[0]?.id || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const val = Number(amount) || 0;
  const ok = val > 0 && val <= remaining;
  async function save() { setSaving(true); await onConfirm(val, date || null, accId || null, note.trim() || null); setSaving(false); }
  return (
    <ModalShell title="Возврат обеспечения" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Да, добавить возврат"}</button>
    </>}>
      <div className="kd-paytotal"><span>Осталось вернуть</span><strong style={{ color: "#B4650B" }}>{fmt(remaining)} ₸</strong></div>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Государство возвращает частями — добавляй каждый возврат отдельно. Деньги придут на выбранный счёт (увеличат его остаток).</div>
      <div className="kd-grid2">
        <Field label={`Сумма возврата (макс ${fmt(remaining)})`}><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="25000" /></Field>
        <Field label="Дата возврата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {val > remaining && <div className="kd-err" style={{ marginTop: -6 }}>Нельзя вернуть больше, чем заморожено.</div>}
      <Field label="На какой счёт вернулось"><select value={accId} onChange={(e) => setAccId(e.target.value)}><option value="">— не привязывать к счёту —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Примечание (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр.: после 1-й обработки" /></Field>
    </ModalShell>
  );
}

function DepositModal({ max, onClose, onSave }) {
  const [mode, setMode] = useState("all");
  const [amount, setAmount] = useState(String(max || 0));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const value = mode === "all" ? max : Number(amount) || 0;
  const ok = value > 0 && value <= max;
  async function save() { setSaving(true); await onSave(value, note); setSaving(false); }
  return (
    <ModalShell title="Внести через банкомат" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Отправить на подтверждение"}</button>
    </>}>
      <div className="kd-hint">Перевод по ИИН <strong>980515351225 — Тыныс Қ.</strong></div>
      <div className="kd-paytotal"><span>На руках сейчас</span><strong>{fmt(max)} ₸</strong></div>
      <div className="kd-seg" style={{ width: "100%", marginBottom: 14 }}>
        <button className={`kd-segbtn ${mode === "all" ? "on" : ""}`} onClick={() => setMode("all")}>Всю сумму</button>
        <button className={`kd-segbtn ${mode === "part" ? "on" : ""}`} onClick={() => setMode("part")}>Часть</button>
      </div>
      {mode === "part" && (
        <Field label={`Сумма к внесению (не больше ${fmt(max)} ₸)`}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" />
        </Field>
      )}
      {mode === "part" && value > max && <div className="kd-err" style={{ marginTop: -6 }}>Нельзя внести больше, чем на руках.</div>}
      <Field label="Комментарий (необязательно)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="номер чека / время внесения" /></Field>
      <div className="kd-muted">После отправки заявка появится у админа. Он подтвердит поступление, когда проверит.</div>
    </ModalShell>
  );
}

function RejectDepositModal({ dep, techName, onClose, onSave }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await onSave(reason); setSaving(false); }
  return (
    <ModalShell title="Отклонить внесение" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary danger" disabled={saving} onClick={save}>{saving ? "…" : "Отклонить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>{techName || "Сотрудник"} · {fmt(dep.amount)} ₸. Сумма вернётся в «на руках» у сотрудника.</div>
      <Field label="Причина (увидит сотрудник)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="напр.: не вижу поступления" /></Field>
    </ModalShell>
  );
}
