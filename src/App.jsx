// KAZDEZ-USABILITY-YANDEX-2026-07-18
// Этап 3: единое окно, SLA, клиент 360, жизненный цикл и публичная страница заявки.
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { generateCertificate, generateAct } from "./pdfDocs";
import ExcelJS from "exceljs";
import {
  ClipboardList, CheckCircle2, RefreshCw, Wallet, Package, Users, Handshake, FileText, History, Trash2,
  Plus, MessageCircle, Pencil, UserPlus, Download, Search, X, LogOut, Bug, ChevronLeft, ChevronRight, ChevronDown, Wrench, Settings, Receipt, Banknote, XCircle, ListTodo, Calendar, Landmark, ArrowRightLeft, ArrowDownCircle, ArrowUpCircle, Gavel, ShieldCheck, FolderOpen, ExternalLink, GraduationCap, Contact, ArrowRight, CalendarClock, LayoutDashboard, AlertTriangle, Phone, MapPin, TrendingUp, ClipboardCheck, Repeat2, Route, Star, Sparkles, UserRoundX, Navigation, Menu, Wifi, WifiOff, Bell, BellRing, Smartphone, CloudUpload, Camera,
} from "lucide-react";

// ----------------------------- helpers -----------------------------
import { COMPANY_IMAGE_KEYS, EMPLOYEE_EVENTS, monthLabel, TRAINING_TOPICS, reviewRequestMsg, winbackMsg, waLink, TECH_DOC_KINDS, clientMemoFor, ADMIN_TAB_ORDER, AddressText, DEPOSIT_STATUS, DOC_STATUS, DRIVE_LINKS, DateFilterBar, DriveLinkCard, EQUIP_CATEGORIES, EQUIP_STATUS, EXPENSE_TYPES, GUARANTEE_KINDS, ROLE_DEFINITIONS, STATUS, TAB_LABELS, TAB_LABELS_SHORT, TASK_STATUS, TASK_TYPES, TENDER_STATUS, WEEKDAYS, addressPlain, buildMsg, chemUnit, copyText, dateInFilter, daysSince, effectivePermissions, fmt, fmtAmount, fmtTs, groupByDate, isoOf, isoToRu, jobTime, lineAmount, norm, parseIso, periodRange, phoneKey, pricePerBase, repeatLabel, timeRangeMin } from "./shared";
import * as calc from "./calc";
import { ErrorsPanel, KnowledgeTab, MaterialsTab, TrashTab } from "./tabs";
import { installGlobalErrorLogging, logClientError, setErrorActor } from "./errorLog";
import { PeopleEventModal, PlanModal, TrainingModal, TechDocModal, AccountModal, AddChemModal, AssignModal, CancelJobModal, CashRevisionModal, ConfirmDepositModal, ConfirmModal, ContractModal, DayOffModal, DepositModal, DetailsModal, DocModal, EquipModal, ExecutorDoneModal, FollowupModal, GuaranteeModal, HandoutModal, HistoryModal, InventoryMovementModal, IssueEquipModal, JobCard, JobEconomicsModal, JobFormModal, LeadModal, LeadStageSelectModal, MktChannelModal, MktTopupModal, MoveModal, OffCalendarModal, OpexModal, PartnerJobsModal, PartnerModal, PayrollPayModal, PayGuaranteeModal, ProofModal, QualityModal, RejectDepositModal, RepeatCard, ReportEquipModal, ReportModal, ReportSuccessModal, RequestEditModal, ReturnGuaranteeModal, SettingsModal, StockInModal, TaskModal, TechEditModal, TechExtrasModal, TenderModal, TransferEquipModal, TransferPayModal, UserAccessModal, ViewModal, jobToForm } from "./modals";

// Локальное описание этапов: совместимо с shared.jsx из предыдущей версии.
const WORK_STAGE = {
  new: { label: "Новая", short: "Новая", color: "#2563EB", bg: "#EAF1FE", step: 0 },
  confirmed: { label: "Подтверждена", short: "Подтверждена", color: "#7C3AED", bg: "#F0EAFE", step: 1 },
  assigned: { label: "Исполнитель назначен", short: "Назначена", color: "#B45309", bg: "#FCF1E2", step: 2 },
  en_route: { label: "Исполнитель в пути", short: "В пути", color: "#0369A1", bg: "#E0F2FE", step: 3 },
  on_site: { label: "Исполнитель на объекте", short: "На объекте", color: "#0F766E", bg: "#CCFBF1", step: 4 },
  done: { label: "Работа выполнена", short: "Выполнена", color: "#0E7C66", bg: "#E4F3EE", step: 5 },
  canceled: { label: "Заявка отменена", short: "Отменена", color: "#B3261E", bg: "#FBE7E5", step: -1 },
};
function jobWorkStage(job) {
  if (job?.status === "done") return "done";
  if (job?.status === "canceled") return "canceled";
  if (WORK_STAGE[job?.work_stage]) return job.work_stage;
  return job?.assigned_to ? "assigned" : "new";
}

function roleWhatsappUrl(job, isAdmin) {
  const phone = String(job?.client_phone || "").replace(/\D/g, "");
  if (!phone) return "";
  if (isAdmin) return `https://wa.me/${phone}`;
  const time = (String(job?.scheduled_time || "").match(/(?:[01]?\d|2[0-3]):[0-5]\d/) || [])[0];
  const message = time
    ? `Сәлеметсіз бе! Мен дезинфектормын, сізге дезинфекция бойынша жазып отырмын. Сіздерде сағат ${time}-де боламын.\n\nЗдравствуйте! Пишу по поводу дезинфекции. Я дезинфектор, приеду к вам к ${time}.`
    : "Сәлеметсіз бе! Мен дезинфектормын, сізге дезинфекция бойынша жазып отырмын. Сіздерде келісілген уақытта боламын.\n\nЗдравствуйте! Пишу по поводу дезинфекции. Я дезинфектор, приеду к вам в согласованное время.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function yandexMapUrl(text) {
  const raw = String(text || "").trim();
  const existingYandex = (raw.match(/https?:\/\/(?:[^/\s]+\.)?yandex\.(?:ru|com|kz)\/maps[^\s]*/i) || [])[0];
  if (existingYandex) return existingYandex;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* оставляем исходную строку */ }
  const coords = decoded.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
    || decoded.match(/[?&](?:q|query|destination)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i);
  if (coords) return `https://yandex.com/maps/?rtext=~${coords[1]},${coords[2]}&rtt=auto`;
  const clean = addressPlain(raw);
  return clean && clean !== "📍 точка на карте" ? `https://yandex.com/maps/?text=${encodeURIComponent(clean)}` : "https://yandex.com/maps/";
}

function yandexRouteUrl(addresses) {
  const points = addresses.filter(Boolean).slice(0, 8);
  if (!points.length) return "https://yandex.com/maps/routes/";
  const rtext = points.length === 1 ? `~${points[0]}` : points.join("~");
  return `https://yandex.com/maps/?rtext=${encodeURIComponent(rtext)}&rtt=auto`;
}

const NL = String.fromCharCode(10);
class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    console.error("KazDez UI error", error);
    logClientError({ kind: "crash", place: "падение интерфейса", message: error?.message || String(error), stack: [error?.stack, info?.componentStack].filter(Boolean).join(NL) });
  }
  render() {
    if (this.state.failed) return <div className="kd-crash"><div><Bug size={30} /><h1>Интерфейс временно не загрузился</h1><p>Данные не потеряны. Обнови страницу; если ошибка повторится, проверь последнюю сборку Vercel.</p><button className="kd-btn primary" onClick={() => window.location.reload()}>Обновить страницу</button></div></div>;
    return this.props.children;
  }
}

function AppContent() {
  installGlobalErrorLogging();
  const publicToken = new URLSearchParams(window.location.search).get("track");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    // Умолчание — тёмная: она и так у всех сейчас. Светлая включается сознательно
    // в Настройках, иначе после появления темы вся команда получила бы новый вид
    // приложения без предупреждения.
    document.documentElement.setAttribute("data-theme", localStorage.getItem("kd-theme") || "dark");
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from("profiles").select("id, role, full_name, phone, is_active, access_overrides").eq("id", session.user.id).single().then(({ data }) => setProfile(data));
  }, [session]);
  if (publicToken) return <PublicJobPage token={publicToken} />;
  if (booting) return <div className="kd-center">Загрузка…</div>;
  if (!session) return <Login />;
  if (profile?.is_active === false) return <div className="kd-center"><div className="kd-card" style={{ maxWidth: 460 }}><h2>Доступ отключён</h2><p className="kd-muted">Администратор временно отключил эту учётную запись.</p><button className="kd-btn ghost" onClick={() => supabase.auth.signOut()}>Выйти</button></div></div>;
  return <Dashboard session={session} profile={profile} />;
}

export default function App() {
  return <AppErrorBoundary><AppContent /></AppErrorBoundary>;
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

function PublicJobPage({ token }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.rpc("get_public_job", { p_token: token }).then(({ data, error: rpcError }) => {
      if (!active) return;
      const item = Array.isArray(data) ? data[0] : data;
      if (rpcError) setError("Страница заявки пока недоступна. Попросите менеджера проверить ссылку.");
      else if (!item) setError("Ссылка недействительна или доступ к заявке закрыт.");
      else setJob(item);
      setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  async function sendFeedback() {
    if (!rating || sending) return;
    setSending(true); setError("");
    const { error: rpcError } = await supabase.rpc("submit_public_feedback", { p_token: token, p_rating: rating, p_comment: comment.trim() || null });
    if (rpcError) setError("Не удалось отправить оценку. Попробуйте ещё раз.");
    else setSent(true);
    setSending(false);
  }

  if (loading) return <div className="kd-public"><div className="kd-public-card kd-public-state">Загрузка заявки…</div></div>;
  if (!job) return <div className="kd-public"><div className="kd-public-card kd-public-state"><AlertTriangle size={28} /><h1>Заявка не найдена</h1><p>{error}</p></div></div>;
  const stageKey = job.job_status === "done" ? "done" : job.job_status === "canceled" ? "canceled" : (WORK_STAGE[job.work_stage] ? job.work_stage : "new");
  const stage = WORK_STAGE[stageKey];
  // Памятка подбирается по виду вредителя: общая часть плюс уточнения.
  const memo = clientMemoFor(job.pest);
  const steps = ["confirmed", "assigned", "en_route", "on_site", "done"];
  const stageStep = stage.step;
  return (
    <div className="kd-public">
      <main className="kd-public-card">
        <header className="kd-public-head">
          <div className="kd-logo-big"><span className="kd-logo-mark"><Bug size={18} /></span>KazDez</div>
          <span className="kd-public-id">Заявка #{String(job.job_id || "").slice(-6)}</span>
        </header>
        <section className="kd-public-hero">
          <div>
            <div className="kd-public-kicker">Статус работы</div>
            <h1>{stage.label}</h1>
            <p>{job.contact_name}, здесь всегда виден актуальный статус вашей заявки.</p>
          </div>
          <span className="kd-public-status" style={{ color: stage.color, background: stage.bg }}>{stage.short}</span>
        </section>

        {stageKey !== "canceled" && <div className="kd-public-progress" aria-label="Этапы выполнения">
          {steps.map((key, index) => {
            const item = WORK_STAGE[key]; const active = stageStep >= item.step;
            return <div key={key} className={active ? "done" : ""}><span>{active ? <CheckCircle2 size={16} /> : index + 1}</span><small>{item.short}</small></div>;
          })}
        </div>}

        <section className="kd-public-details">
          <div><Calendar size={18} /><span>Дата и время</span><strong>{isoToRu(job.scheduled_date) || "Уточняется"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</strong></div>
          <div><ClipboardList size={18} /><span>Услуга</span><strong>{job.service_type}{job.pest ? ` · ${job.pest}` : ""}</strong></div>
          <div><MapPin size={18} /><span>Адрес</span><strong>{addressPlain(job.address) || "Уточняется"}</strong></div>
          {job.technician_name && <div><Users size={18} /><span>Исполнитель</span><strong>{job.technician_name}</strong></div>}
          {job.guarantee_months && <div><ShieldCheck size={18} /><span>Гарантия</span><strong>{job.guarantee_months} мес.</strong></div>}
        </section>

        {job.address && <a className="kd-btn primary wide kd-public-map" href={yandexMapUrl(job.address)} target="_blank" rel="noreferrer"><Navigation size={17} />Открыть маршрут в Яндекс Картах</a>}

        <section className="kd-public-memo">
          <h2>Памятка</h2>
          <p>От этого напрямую зависит результат — и то, придётся ли вызывать нас повторно.</p>
          <div className="kd-public-memo-cols">
            <div>
              <h3>До обработки</h3>
              <ul>{memo.before.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div>
              <h3>После обработки</h3>
              <ul>{memo.after.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          </div>
          <p className="kd-public-memo-note">Если через две недели насекомые остались — позвоните нам: пока действует гарантия, выезд бесплатный.</p>
        </section>

        {stageKey === "done" && <section className="kd-public-feedback">
          <div className="kd-title">Как прошла работа?</div>
          {sent ? <div className="kd-public-thanks"><CheckCircle2 size={22} />Спасибо! Ваша оценка отправлена.</div> : <>
            <div className="kd-public-stars" aria-label="Оценка от 1 до 5">
              {[1, 2, 3, 4, 5].map((value) => <button key={value} className={value <= rating ? "on" : ""} onClick={() => setRating(value)} aria-label={`${value} из 5`}><Star size={27} /></button>)}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий (необязательно)" rows={3} />
            <button className="kd-btn primary" disabled={!rating || sending} onClick={sendFeedback}>{sending ? "Отправляем…" : "Отправить оценку"}</button>
          </>}
        </section>}
        {error && <div className="kd-err">{error}</div>}
        <footer className="kd-public-footer">Эта страница содержит только информацию по вашей заявке.</footer>
      </main>
    </div>
  );
}

// ----------------------------- dashboard -----------------------------
function SortBar({ value, onChange, options }) {
  return (
    <div className="kd-seg kd-sortbar">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={`kd-segbtn ${value === id ? "on" : ""}`} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

function Dashboard({ session, profile }) {
  const [jobs, setJobs] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [techs, setTechs] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [authUsers, setAuthUsers] = useState([]);
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
  const [partnerSearch, setPartnerSearch] = useState("");
  const [teamRepFilter, setTeamRepFilter] = useState({ preset: "month" });
  const [mktChannels, setMktChannels] = useState([]);
  const [mktTopups, setMktTopups] = useState([]);
  const [opexView, setOpexView] = useState("accounts");
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daysOff, setDaysOff] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [qualityChecks, setQualityChecks] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [clientEvents, setClientEvents] = useState([]);
  const [publicFeedback, setPublicFeedback] = useState([]);
  const [jobProofs, setJobProofs] = useState([]);
  const [cashAdjustments, setCashAdjustments] = useState([]);
  const [inventoryAdjustments, setInventoryAdjustments] = useState([]);
  const [clientErrors, setClientErrors] = useState([]);
  const [jobHelpers, setJobHelpers] = useState([]);
  const [priceList, setPriceList] = useState([]);
  const [chemPurchases, setChemPurchases] = useState([]);
  const [techDocs, setTechDocs] = useState([]);
  const [training, setTraining] = useState([]);
  const [safetyAcks, setSafetyAcks] = useState([]);
  const [peopleEvents, setPeopleEvents] = useState([]);
  const [proofMedia, setProofMedia] = useState({ before: [], after: [], signatureUrl: "" });
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [routeTech, setRouteTech] = useState("all");
  const [taskFilter, setTaskFilter] = useState("open");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [jobsDateFilter, setJobsDateFilter] = useState({ preset: "all" });
  const [doneDateFilter, setDoneDateFilter] = useState({ preset: "all" });
  const [canceledDateFilter, setCanceledDateFilter] = useState({ preset: "all" });
  const [audit, setAudit] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [modal, setModal] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message, onYes, opts = {}) => setConfirmState({ message, onYes, danger: opts.danger !== false, confirmLabel: opts.confirmLabel });
  const [statusFilter, setStatusFilter] = useState("all");
  const [sideOpen, setSideOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [doneSortDir, setDoneSortDir] = useState("desc");
  const [techFilter, setTechFilter] = useState("");
  const [toast, setToast] = useState("");
  const [pMode, setPMode] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [pOff, setPOff] = useState(0);
  const [daySort, setDaySort] = useState("order");     // order | revenue | count
  const [dormantMonths, setDormantMonths] = useState(12);
  const [techSort, setTechSort] = useState("revenue"); // revenue | count | avg | markup
  const [pestSort, setPestSort] = useState("revenue"); // revenue | count | avg
  const [openWeeks, setOpenWeeks] = useState({});      // { [weekIdx]: true }
  const [moreNavOpen, setMoreNavOpen] = useState(() => localStorage.getItem("kd-more-nav") === "1");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dataWarnings, setDataWarnings] = useState([]);
  // report_chemicals не загрузилась — расход по заявкам будет пустым у всех.
  // Держим отдельно, чтобы отличать «препараты не вносили» от «нет доступа к таблице».
  const [reportChemsFailed, setReportChemsFailed] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [offlineQueued, setOfflineQueued] = useState(() => { try { return JSON.parse(localStorage.getItem("kd-offline-actions-v4") || "[]").length; } catch { return 0; } });
  const [syncingOffline, setSyncingOffline] = useState(false);
  const isAdmin = profile?.role === "admin";
  const permissions = effectivePermissions(profile);
  const canAccess = (key) => isAdmin || permissions.has(key);
  const canManageTasks = canAccess("action.tasks_manage");
  const canEditJobs = canAccess("action.jobs_edit");
  const isFieldTech = profile?.role === "tech";
  const canManageCash = canAccess("action.finance_edit");
  const canEditPartners = canAccess("action.partners_edit");
  const canEditDocs = canAccess("action.docs_edit");
  const canEditTenders = canAccess("action.tenders_edit");
  const actorName = profile?.full_name || (isAdmin ? "Админ" : session.user.email);
  // чтобы в журнале было видно, у кого именно упало
  setErrorActor(session?.user?.id, actorName);

  useEffect(() => {
    const setOn = () => { setOnline(true); syncOfflineQueue(); }; const setOff = () => setOnline(false);
    window.addEventListener("online", setOn); window.addEventListener("offline", setOff);
    return () => { window.removeEventListener("online", setOn); window.removeEventListener("offline", setOff); };
  }, []);

  useEffect(() => {
    const capture = (event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  useEffect(() => { if (isAdmin) refreshAuthUsers(); }, [isAdmin]);

  // Сообщения, начинающиеся с «Ошибка», записываем в журнал. Это покрывает все
  // места сразу: раньше ошибка мелькала тостом и исчезала бесследно.
  function showToast(t) {
    setToast(t); setTimeout(() => setToast(""), 2200);
    if (typeof t === "string" && t.startsWith("Ошибка")) {
      logClientError({ kind: "handled", place: `раздел «${TAB_LABELS[tab] || tab}»`, message: t });
    }
  }

  async function refreshAuthUsers() {
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "list" } });
    if (error) { setDataWarnings((items) => [...items.filter((x) => !x.startsWith("Пользователи:")), `Пользователи: ${error.message}`]); return; }
    setAuthUsers(data?.users || []);
  }

  async function saveAdminUser(payload) {
    const action = payload.id ? "update" : "create";
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, user: payload } });
    if (error || data?.error) { showToast("Ошибка: " + (data?.error || error?.message || "не удалось сохранить")); return; }
    await logAction("Доступы", `${action === "create" ? "Создан" : "Изменён"} сотрудник: ${payload.full_name} · ${ROLE_DEFINITIONS[payload.role]?.label || payload.role}`);
    setModal(null); showToast(action === "create" ? "Сотрудник добавлен" : "Права сохранены"); await load(); await refreshAuthUsers();
  }

  async function deleteAdminUser(user) {
    if (!user?.id || user.id === session.user.id) { showToast("Нельзя удалить свою учётную запись"); return; }
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "delete", user: { id: user.id } } });
    if (error || data?.error) { showToast("Ошибка: " + (data?.error || error?.message || "не удалось удалить")); return; }
    await logAction("Доступы", `Удалён пользователь: ${user.full_name || user.email || user.id}`);
    showToast("Учётная запись удалена"); await load(); await refreshAuthUsers();
  }

  // PostgREST отдаёт ограниченное число строк на запрос, а таблицы вроде
  // report_chemicals растут вместе с историей (715 выполненных заявок × 1-3 препарата).
  // Обрезка происходит МОЛЧА, без ошибки: у админа просто пропадал расход по свежим
  // заявкам, а дезинфектор видел свои, потому что его выборка меньше порога.
  // Тянем страницами, пока страница приходит полной.
  async function fetchAllRows(table, order = null, pageSize = 1000) {
    let from = 0; const all = [];
    for (;;) {
      let q = supabase.from(table).select("*");
      if (order) q = q.order(order.column, { ascending: !!order.ascending });
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) return { data: all.length ? all : null, error };
      const rows = data || [];
      all.push(...rows);
      // Сдвигаемся на СКОЛЬКО ПРИШЛО, а не на размер страницы: у сервера свой
      // потолок строк в ответе, и если он меньше pageSize, проверка
      // «пришло меньше запрошенного — значит конец» останавливает нас на первой
      // же странице и молча теряет остальные данные.
      if (rows.length === 0) return { data: all, error: null };
      from += rows.length;
      if (from > 100000) return { data: all, error: null }; // защита от бесконечного цикла
    }
  }
  // Журнал действий, корзина и журнал сбоев — самые длинные таблицы в базе и
  // при этом нужны только в двух разделах. Раньше они тянулись при каждом
  // открытии приложения вместе со всем остальным.
  const [journalLoaded, setJournalLoaded] = useState(false);
  // Печать и подпись компании хранятся в настройках картинками в base64 и
  // весят больше, чем все остальные данные вместе. Раньше они уезжали к
  // каждому пользователю при каждой загрузке — на них уходила треть всего
  // трафика. Теперь их забираем только когда они действительно нужны:
  // перед печатью документа и на экране настроек.
  const [companyImagesLoaded, setCompanyImagesLoaded] = useState(false);
  async function loadCompanyImages() {
    if (companyImagesLoaded) return;
    const { data, error } = await supabase.from("app_settings").select("*").in("key", COMPANY_IMAGE_KEYS);
    if (error) { showToast("Ошибка: " + error.message); return; }
    setCompanyImagesLoaded(true);
    setSettings((prev) => ({ ...prev, ...Object.fromEntries((data || []).map((r) => [r.key, r.value])) }));
  }

  // История клиента открывается редко, а событий уже тысячи. Грузим их при
  // открытии окна, а не всем и всегда.
  const [clientEventsLoaded, setClientEventsLoaded] = useState(false);
  async function loadClientEvents() {
    if (clientEventsLoaded) return;
    setClientEventsLoaded(true);
    const { data } = await supabase.from("client_events").select("*").order("created_at", { ascending: false }).limit(1000);
    if (data) setClientEvents(data);
  }

  async function loadJournalData(force = false) {
    if (journalLoaded && !force) return;
    setJournalLoaded(true);
    const [a, t, e] = await Promise.all([
      supabase.from("audit_log").select("*").order("ts", { ascending: false }).limit(500),
      supabase.from("trash").select("*").order("deleted_at", { ascending: false }).limit(300),
      supabase.from("client_errors").select("*").order("occurred_at", { ascending: false }).limit(200),
    ]);
    if (a.data) setAudit(a.data);
    if (t.data) setTrash(t.data);
    if (e.data) setClientErrors(e.data);
  }
  async function load() {
    setLoading(true);
    try {
    const responses = await Promise.all([
      fetchAllRows("jobs"),
      fetchAllRows("report_chemicals"),
      supabase.from("chemicals").select("*"),
      // Журнал, корзина и сбои нужны только в своих разделах. Позицию в массиве
      // сохраняем заглушкой, чтобы не сдвигать разбор остальных сорока ответов,
      // а данные подтягиваем при открытии раздела — см. loadJournalData.
      Promise.resolve({ data: null, error: null }),
      Promise.resolve({ data: null, error: null }),
      // cash_opening_balance / cash_opening_date — база ревизии кассы: от них считается «на руках»
      // (см. techOpening ниже). salary_monthly — оклад для вкладки «Зарплата».
      // Поле, забытое в этом select, читается как undefined и молча ломает расчёт — так уже было с ревизией.
      supabase.from("profiles").select("id, full_name, phone, role, is_active, access_overrides, created_at, cash_opening_balance, cash_opening_date, salary_monthly, work_schedule"),
      supabase.from("handouts").select("*"),
      supabase.from("partners").select("*"),
      supabase.from("doc_services").select("*").order("created_at", { ascending: false }),
      supabase.from("tech_expenses").select("*").order("created_at", { ascending: false }),
      supabase.from("equipment").select("*"),
      supabase.from("equipment_handouts").select("*"),
      supabase.from("client_sources").select("*").order("name"),
      supabase.from("pest_types").select("*").order("name"),
      // без печати и подписи: они тяжёлые и нужны редко, см. loadCompanyImages
      supabase.from("app_settings").select("*").not("key", "in", `(${COMPANY_IMAGE_KEYS.join(",")})`),
      supabase.from("expense_categories").select("*").order("name"),
      supabase.from("opex").select("*").order("spent_date", { ascending: false }),
      supabase.from("cash_deposits").select("*").order("requested_at", { ascending: false }),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("accounts").select("*").order("sort"),
      fetchAllRows("money_moves", { column: "move_date", ascending: false }),
      supabase.from("tenders").select("*").order("created_at", { ascending: false }),
      supabase.from("tender_guarantees").select("*"),
      supabase.from("tender_services").select("*").order("seq"),
      supabase.from("guarantee_returns").select("*").order("return_date", { ascending: false }),
      supabase.from("leads").select("*").order("updated_at", { ascending: false }),
      supabase.from("lead_stages").select("*").order("sort"),
      supabase.from("mkt_channels").select("*").order("sort"),
      supabase.from("mkt_topups").select("*").order("topup_date", { ascending: false }),
      supabase.from("tech_days_off").select("*"),
      supabase.from("client_followups").select("*").order("due_date", { ascending: true }),
      supabase.from("quality_checks").select("*").order("contacted_at", { ascending: false }),
      supabase.from("service_contracts").select("*").order("next_service_date", { ascending: true }),
      Promise.resolve({ data: null, error: null }),
      supabase.from("client_public_feedback").select("*").order("created_at", { ascending: false }),
      supabase.from("job_proofs").select("*").order("updated_at", { ascending: false }),
      // Ревизии кассы и ручные корректировки остатков. Последняя запись kind="revision"
      // задаёт новую точку отсчёта для «на руках» (см. techCashOnHand).
      supabase.from("cash_adjustments").select("*").order("created_at", { ascending: false }),
      // Ревизии и движения препаратов у сотрудников. Последняя запись kind="revision"
      // по паре сотрудник+препарат задаёт точку отсчёта (см. techLedger).
      supabase.from("inventory_adjustments").select("*").order("created_at", { ascending: false }),
      Promise.resolve({ data: null, error: null }),
      // Порядок этих запросов обязан совпадать с порядком имён в разборе ниже:
      // помощники (jhr), затем прайс (plr). Из-за перестановки доплаты помощникам
      // читались как строки прайса и пропадали из зарплаты.
      supabase.from("job_helpers").select("*"),
      supabase.from("price_list").select("*").order("pest").order("area_from"),
      supabase.from("chemical_purchases").select("*").order("purchase_date", { ascending: false }),
      supabase.from("tech_documents").select("*").order("expires_on", { ascending: true }),
      supabase.from("training_records").select("*").order("passed_on", { ascending: false }),
      supabase.from("safety_acknowledgements").select("*").order("acknowledged_at", { ascending: false }),
      supabase.from("employee_events").select("*").order("happened_on", { ascending: false }),
    ]);
    const [jr, cr, chr, ar, tr, pr, hr, ptr, dsr, exr, eqr, ehr, scr, ptyr, str, ecr, opr, dpr, tkr, accr, mvr, tndr, tgr, tsr, grr, ldr, lsr, mcr, mtr, dofr, fur, qcr, cor, cer, pfr, jpr, car, iar, errr, jhr, plr, cpr, tdr, trr, sar, evr] = responses;
    const tableNames = ["Заявки", "Препараты в отчётах", "Склад", "Журнал", "Корзина", "Сотрудники", "Выдача препаратов", "Партнёры", "Документы", "Расходы сотрудников", "Оборудование", "Выдача оборудования", "Источники", "Виды работ", "Настройки", "Категории расходов", "Операционные расходы", "Сдача наличных", "Задачи", "Счета", "Движение денег", "Тендеры", "Обеспечения", "Работы по тендерам", "Возвраты", "Клиенты", "Этапы CRM", "Рекламные каналы", "Расходы рекламы", "Выходные", "Касания", "Контроль качества", "Абоненты", "Хронология клиентов", "Оценки клиентов", "Подтверждения работ", "Ревизии кассы", "Ревизии препаратов", "Журнал ошибок", "Помощники на заявках", "Прайс", "Закуп препаратов", "Допуски сотрудников", "Обучение", "Инструктаж", "История сотрудников"];
    setDataWarnings(responses.map((response, index) => response.error ? `${tableNames[index]}: ${response.error.message}` : null).filter(Boolean));
    setReportChemsFailed(!!cr.error);
    let offlineSnapshot = null; try { offlineSnapshot = JSON.parse(localStorage.getItem("kd-offline-snapshot-v4") || "null"); } catch { offlineSnapshot = null; }
    const useOfflineSnapshot = !navigator.onLine && !!jr.error && !!offlineSnapshot?.jobs;
    const chems = cr.data || [];
    const mappedJobs = (jr.data || []).map((j) => ({ ...j, chemicals: chems.filter((c) => c.job_id === j.id) }));
    const currentJobs = useOfflineSnapshot ? offlineSnapshot.jobs : mappedJobs;
    const currentChemicals = useOfflineSnapshot ? (offlineSnapshot.chemicals || []) : (chr.data || []);
    const currentProfiles = useOfflineSnapshot ? (offlineSnapshot.profiles || []) : (pr.data || []);
    setJobs(currentJobs);
    setChemicals(currentChemicals);
    setTechs(currentProfiles.filter((p) => p.role === "tech"));
    setAllProfiles(currentProfiles);
    setHandouts(hr.data || []);
    setPartners(ptr.data || []);
    setDocs(dsr.data || []);
    setExpenses(exr.data || []);
    setEquipment(eqr.data || []);
    setEquipHandouts(ehr.data || []);
    setSources(scr.data || []);
    setPestTypes(ptyr.data || []);
    const settingsMap = useOfflineSnapshot ? (offlineSnapshot.settings || {}) : {};
    if (!useOfflineSnapshot) (str.data || []).forEach((row) => { settingsMap[row.key] = row.value; });
    // Печать и подпись в этот запрос не входят: если их уже подтянули,
    // сохраняем — иначе фоновое обновление вымывало бы их из памяти, и
    // документ печатался бы без печати.
    setSettings((prev) => {
      const kept = Object.fromEntries(COMPANY_IMAGE_KEYS.filter((k) => prev[k] != null).map((k) => [k, prev[k]]));
      return { ...settingsMap, ...kept };
    });
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
    setFollowups(fur.data || []);
    setQualityChecks(qcr.data || []);
    setContracts(cor.data || []);
    if (cer.data) setClientEvents(cer.data);
    setPublicFeedback(pfr.data || []);
    setJobProofs(jpr.data || []);
    setCashAdjustments(car.data || []);
    setInventoryAdjustments(iar.data || []);
    setJobHelpers(jhr.data || []);
    setPriceList(plr.data || []);
    setChemPurchases(cpr.data || []);
    setTechDocs(tdr.data || []);
    setTraining(trr.data || []);
    setSafetyAcks(sar.data || []);
    setPeopleEvents(evr.data || []);
    if (!useOfflineSnapshot && !jr.error) {
      try {
        const cacheJobs = mappedJobs.filter((job) => isAdmin || job.assigned_to === session.user.id || job.status !== "done").slice(0, 400);
        localStorage.setItem("kd-offline-snapshot-v4", JSON.stringify({ jobs: cacheJobs, chemicals: chr.data || [], profiles: pr.data || [], settings: settingsMap, savedAt: new Date().toISOString() }));
      } catch { /* локальное хранилище может быть заполнено — онлайн-работе это не мешает */ }
    }
    if (useOfflineSnapshot) setDataWarnings([`Офлайн-режим: показаны данные на ${fmtTs(offlineSnapshot.savedAt)}`]);
    setLastLoadedAt(useOfflineSnapshot && offlineSnapshot.savedAt ? new Date(offlineSnapshot.savedAt) : new Date());
    setLoading(false);
    } catch (error) {
      let snapshot = null; try { snapshot = JSON.parse(localStorage.getItem("kd-offline-snapshot-v4") || "null"); } catch { snapshot = null; }
      if (snapshot?.jobs) {
        setJobs(snapshot.jobs); setChemicals(snapshot.chemicals || []); setAllProfiles(snapshot.profiles || []); setTechs((snapshot.profiles || []).filter((p) => p.role === "tech")); setSettings(snapshot.settings || {}); setLastLoadedAt(snapshot.savedAt ? new Date(snapshot.savedAt) : null);
        setDataWarnings([`Нет связи с базой. Показана сохранённая копия на ${fmtTs(snapshot.savedAt)}`]);
      } else setDataWarnings([`Не удалось связаться с базой: ${error?.message || "неизвестная ошибка"}`]);
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  // Журнал и корзина подтягиваются при первом заходе в раздел, а не при
  // каждом открытии приложения.
  useEffect(() => { if (tab === "journal" || tab === "trash") loadJournalData(); }, [tab]);
  // Автообновление данных.
  //
  // Раньше здесь стоял безусловный интервал в пять минут. Вкладка, забытая
  // открытой на весь день, качала все данные двенадцать раз в час — и именно
  // это, а не работа людей, съедало почти весь трафик проекта.
  //
  // Теперь три условия: вкладка на экране, человек что-то делал в последние
  // пятнадцать минут, и с прошлого обновления прошло не меньше десяти минут.
  // Плюс обновление при возврате на вкладку — так данные свежие ровно тогда,
  // когда на них смотрят.
  const lastActivityRef = useRef(Date.now());
  const lastLoadRef = useRef(Date.now());
  useEffect(() => {
    const touch = () => { lastActivityRef.current = Date.now(); };
    const events = ["pointerdown", "keydown", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const REFRESH_MS = 10 * 60 * 1000;
    const IDLE_MS = 15 * 60 * 1000;
    const maybeLoad = (force = false) => {
      if (!navigator.onLine) return;
      if (document.visibilityState !== "visible") return;
      if (!force && Date.now() - lastActivityRef.current > IDLE_MS) return;
      if (Date.now() - lastLoadRef.current < REFRESH_MS) return;
      lastLoadRef.current = Date.now();
      load();
    };
    // Вернулись на вкладку — данные могли устареть, пока её не смотрели.
    const onVisible = () => { if (document.visibilityState === "visible") maybeLoad(true); };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => maybeLoad(false), 60 * 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [session.user.id]);

  async function logAction(action, summary) {
    await supabase.from("audit_log").insert({ actor: actorName, actor_id: session.user.id, action, summary });
  }
  const OFFLINE_QUEUE_KEY = "kd-offline-actions-v4";
  function readOfflineQueue() { try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); } catch { return []; } }
  function writeOfflineQueue(items) { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items)); setOfflineQueued(items.length); }
  function queueOfflineAction(action) { const items = readOfflineQueue(); items.push({ ...action, queuedAt: new Date().toISOString() }); writeOfflineQueue(items); }
  async function syncOfflineQueue() {
    if (!navigator.onLine || syncingOffline) return;
    const items = readOfflineQueue(); if (!items.length) return;
    setSyncingOffline(true); const failed = [];
    for (const item of items) {
      if (item.kind === "stage") {
        const { error } = await supabase.from("jobs").update(item.payload).eq("id", item.jobId);
        if (error) failed.push(item);
      } else failed.push(item);
    }
    writeOfflineQueue(failed); setSyncingOffline(false);
    if (!failed.length) { showToast("Офлайн-изменения синхронизированы"); load(); }
  }
  async function installApplication() {
    if (!installPrompt) return;
    await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null);
  }
  function clientReminderWhatsappUrl(job) {
    const phone = String(job?.client_phone || "").replace(/\D/g, ""); if (!phone) return "";
    const message = `Сәлеметсіз бе! KazDez компаниясынан еске саламыз: дезинфекция ${isoToRu(job.scheduled_date)} күні${job.scheduled_time ? `, сағат ${job.scheduled_time}` : ""} жоспарланған.\n\nЗдравствуйте! Напоминаем: дезинфекция запланирована на ${isoToRu(job.scheduled_date)}${job.scheduled_time ? `, время ${job.scheduled_time}` : ""}.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }
  const proofByJob = (jobId) => jobProofs.find((proof) => String(proof.job_id) === String(jobId));
  const proofIsComplete = (jobId) => { const proof = proofByJob(jobId); return !!(proof?.before_paths?.length && proof?.after_paths?.length && proof?.signature_path); };
  async function openJobProof(job) {
    const proof = proofByJob(job.id); setProofMedia({ before: [], after: [], signatureUrl: "" }); setModal({ kind: "proof", job });
    if (!proof) return;
    const paths = [...(proof.before_paths || []), ...(proof.after_paths || []), ...(proof.signature_path ? [proof.signature_path] : [])];
    if (!paths.length) return;
    const { data } = await supabase.storage.from("job-proofs").createSignedUrls(paths, 3600);
    const byPath = new Map((data || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
    setProofMedia({
      before: (proof.before_paths || []).filter((path) => byPath.has(path)).map((path) => ({ path, url: byPath.get(path) })),
      after: (proof.after_paths || []).filter((path) => byPath.has(path)).map((path) => ({ path, url: byPath.get(path) })),
      signatureUrl: proof.signature_path ? byPath.get(proof.signature_path) || "" : "",
    });
  }
  // Сжимаем фото прямо на телефоне: снимок с камеры весит ~800 КБ, после
  // приведения к 1280px и JPEG 72% — около 150 КБ. Качества «до/после» хватает,
  // расход хранилища падает впятеро, а выгрузка по слабой связи идёт быстрее.
  // Любая ошибка — молча грузим оригинал: потерять фото хуже, чем место.
  async function shrinkImage(file, maxSide = 1280, quality = 0.72) {
    try {
      if (!file || !file.type || !file.type.startsWith("image/")) return null;
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      return out && out.size < file.size ? out : null;
    } catch { return null; }
  }
  async function uploadProofBlob(job, blob, kind, index, extension = "jpg") {
    let payload = blob, safeExt = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
    if (kind !== "signature") {
      const shrunk = await shrinkImage(blob);
      if (shrunk) { payload = shrunk; safeExt = "jpg"; }
    }
    const path = `${job.id}/${kind}-${Date.now()}-${index}.${safeExt}`;
    const { error } = await supabase.storage.from("job-proofs").upload(path, payload, { cacheControl: "3600", upsert: false, contentType: payload.type || `image/${safeExt}` });
    if (error) throw error; return path;
  }
  async function saveJobProof(job, payload) {
    if (!navigator.onLine) { showToast("Для загрузки фото нужен интернет. Данные формы не закрыты."); return false; }
    const existing = proofByJob(job.id);
    try {
      const beforeNew = await Promise.all(payload.beforeFiles.map((file, index) => uploadProofBlob(job, file, "before", index, (file.name.split(".").pop() || "jpg").toLowerCase())));
      const afterNew = await Promise.all(payload.afterFiles.map((file, index) => uploadProofBlob(job, file, "after", index, (file.name.split(".").pop() || "jpg").toLowerCase())));
      let signaturePath = existing?.signature_path || null;
      if (payload.signatureDataUrl) { const blob = await fetch(payload.signatureDataUrl).then((response) => response.blob()); signaturePath = await uploadProofBlob(job, blob, "signature", 0, "png"); }
      const now = new Date().toISOString();
      const row = {
        job_id: String(job.id), before_paths: [...(existing?.before_paths || []), ...beforeNew], after_paths: [...(existing?.after_paths || []), ...afterNew],
        signature_path: signaturePath, signed_name: payload.signedName || existing?.signed_name || null,
        arrival_lat: payload.arrival?.lat ?? existing?.arrival_lat ?? null, arrival_lng: payload.arrival?.lng ?? existing?.arrival_lng ?? null, arrival_accuracy: payload.arrival?.accuracy ?? existing?.arrival_accuracy ?? null, arrived_at: payload.arrival && (existing?.arrival_lat == null || Number(existing.arrival_lat) !== Number(payload.arrival.lat) || Number(existing.arrival_lng) !== Number(payload.arrival.lng)) ? now : existing?.arrived_at || null,
        completion_lat: payload.completion?.lat ?? existing?.completion_lat ?? null, completion_lng: payload.completion?.lng ?? existing?.completion_lng ?? null, completion_accuracy: payload.completion?.accuracy ?? existing?.completion_accuracy ?? null, completed_at: payload.completion && (existing?.completion_lat == null || Number(existing.completion_lat) !== Number(payload.completion.lat) || Number(existing.completion_lng) !== Number(payload.completion.lng)) ? now : existing?.completed_at || null,
        created_by: existing?.created_by || session.user.id, updated_at: now,
      };
      const { data, error } = await supabase.from("job_proofs").upsert(row, { onConflict: "job_id" }).select("*").single();
      if (error) throw error;
      setJobProofs((rows) => [data, ...rows.filter((item) => item.id !== data.id)]);
      await recordClientEvent(job, "proof", "Подтверждение работы обновлено", [row.before_paths.length && `до: ${row.before_paths.length}`, row.after_paths.length && `после: ${row.after_paths.length}`, signaturePath && "подпись клиента"].filter(Boolean).join(" · "));
      showToast("Подтверждение работы сохранено"); return true;
    } catch (error) { showToast("Не удалось сохранить подтверждение: " + (error?.message || "ошибка загрузки")); return false; }
  }
  async function recordClientEvent(job, eventType, title, details = "") {
    if (!job?.client_phone || !title) return;
    const { data, error } = await supabase.from("client_events").insert({
      client_phone: job.client_phone,
      job_id: job.id ? String(job.id) : null,
      event_type: eventType || "note",
      title,
      details: details || null,
      created_by: session.user.id,
    }).select("*").single();
    if (!error && data) setClientEvents((items) => [data, ...items]);
  }
  async function addClientNote(job, note) {
    const text = String(note || "").trim();
    if (!text) return false;
    const { data, error } = await supabase.from("client_events").insert({
      client_phone: job.client_phone,
      job_id: String(job.id),
      event_type: "note",
      title: "Внутренняя заметка",
      details: text,
      created_by: session.user.id,
    }).select("*").single();
    if (error) { showToast("Не удалось сохранить заметку: " + error.message); return false; }
    setClientEvents((items) => [data, ...items]); showToast("Заметка добавлена"); return true;
  }
  function publicJobUrl(job) {
    if (!job?.public_token) return "";
    const url = new URL(window.location.href);
    url.search = ""; url.hash = ""; url.searchParams.set("track", job.public_token);
    return url.toString();
  }
  function copyPublicJobLink(job) {
    const url = publicJobUrl(job);
    if (!url) { showToast("Сначала выполни SQL этапа 3 в Supabase"); return; }
    copyText(url, () => showToast("Ссылка для клиента скопирована"));
  }
  async function setJobWorkStage(job, stageKey) {
    if (!WORK_STAGE[stageKey]) return;
    const now = new Date().toISOString();
    const payload = { work_stage: stageKey, stage_updated_at: now };
    if (stageKey === "en_route") payload.en_route_at = now;
    if (stageKey === "on_site") payload.arrived_at = now;
    if (!navigator.onLine) {
      queueOfflineAction({ kind: "stage", jobId: job.id, payload });
      setJobs((rows) => rows.map((row) => row.id === job.id ? { ...row, ...payload } : row));
      showToast(`Сохранено офлайн: ${WORK_STAGE[stageKey].short}`); return;
    }
    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) { showToast("Не удалось изменить этап: " + error.message); return; }
    await recordClientEvent(job, "stage", WORK_STAGE[stageKey].label, actorName);
    showToast(`Статус: ${WORK_STAGE[stageKey].short}`); load();
  }
  const chemById = (id) => chemicals.find((x) => x.id === id);
  const lineChem = (l) => calc.lineChem(l, chemicals);
  const jobChemCost = (job) => calc.jobChemCost(job, chemicals, chemPurchases);
  // Закрытие периода. Пока месяц открыт, цифры в нём можно править — и отчёт,
  // который смотрели вчера, сегодня покажет другое. Дата в настройках делает
  // прошлое неизменяемым: чтобы что-то исправить, придётся сознательно сдвинуть
  // границу, и это будет видно в журнале. Закрыто — значит закрыто для всех,
  // включая админа: исключение «только админу» на практике означает «всем».
  const booksClosedUntil = settings.books_closed_until || "";
  const isClosedDate = (iso) => calc.isClosedDate(iso, booksClosedUntil);
  // true = операцию нужно остановить
  function blockedByClosedPeriod(dateIso) {
    if (!isClosedDate(dateIso)) return false;
    showToast(`Период закрыт до ${isoToRu(booksClosedUntil)}. Чтобы исправить, сдвиньте дату закрытия в Настройках.`);
    return true;
  }
  const qrFeeRate = (Number(settings.qr_fee_rate) || 0.95) / 100;
  const defaultGuarantee = Number(settings.default_guarantee_months) || 6;
  const techLedger = (techId) => calc.techLedger(techId, { handouts, jobs, inventoryAdjustments, chemicals });
  const techById = (id) => techs.find((t) => t.id === id);
  const pestGuideObj = (() => { try { return JSON.parse(settings.pest_guide || "{}"); } catch { return {}; } })();
  // сделать гарантийный сертификат по заявке (реальные данные)
  async function certifyJob(job) {
    await loadCompanyImages();
    const yr = new Date().getFullYear();
    const num = `ГС-${yr}-${(String(job.id).replace(/\D/g, "").slice(-6) || "000001")}`;
    generateCertificate({
      address: addressPlain(job.address),
      type: job.type,
      pest: job.pest,
      area: job.area,
      scheduled_date: job.scheduled_date,
      scheduled_time: job.scheduled_time,
      guarantee_months: job.guarantee_months,
      tech: techById(job.assigned_to)?.full_name,
      client_phone: job.client_phone,
      contact_name: job.contact_name,
      doc_number: num,
    }, settings);
  }
  // сделать акт о проведении дезработ (для первичной обработки — гарантия после второй)
  async function certifyAct(job) {
    await loadCompanyImages();
    const yr = new Date().getFullYear();
    const num = `АКТ-${yr}-${(String(job.id).replace(/\D/g, "").slice(-6) || "000001")}`;
    const chems = (job.chemicals || []).map((l) => {
      const c = lineChem(l);
      return `${l.name || (c && c.name) || "препарат"} — ${fmtAmount(lineAmount(l), c && c.unit_kind)}`;
    });
    generateAct({
      address: addressPlain(job.address),
      type: job.type,
      pest: job.pest,
      area: job.area,
      scheduled_date: job.scheduled_date,
      scheduled_time: job.scheduled_time,
      tech: techById(job.assigned_to)?.full_name,
      client_phone: job.client_phone,
      contact_name: job.contact_name,
      chemicals: chems,
      doc_number: num,
    }, settings);
  }
  const techExtrasTotal = (techId) => jobs.filter((j) => j.assigned_to === techId).reduce((s, j) => s + (Number(j.tech_bonus) || 0) + (Number(j.tech_travel) || 0), 0);
  const techBonusTotal = (techId) => jobs.filter((j) => j.assigned_to === techId).reduce((s, j) => s + (Number(j.tech_bonus) || 0), 0);
  const techTravelTotal = (techId) => jobs.filter((j) => j.assigned_to === techId).reduce((s, j) => s + (Number(j.tech_travel) || 0), 0);
  const profileById = (id) => allProfiles.find((p) => p.id === id);
  const personName = (id) => profileById(id)?.full_name || "—";
  const assignableProfiles = allProfiles;
  const equipById = (id) => equipment.find((e) => e.id === id);
  const techEquipment = (techId) => equipHandouts.filter((h) => h.tech_id === techId && h.status === "with_tech").map((h) => ({ handout: h, equip: equipById(h.equipment_id) })).filter((r) => r.equip);
  // Наличные, собранные дезинфектором со всех его выполненных заявок
  // П.8: собранное считается только С даты начального остатка (заявки задним числом до неё не влияют на «на руках»)
  // Денежная математика живёт в src/calc.js и покрыта тестами (src/calc.test.js).
  // Здесь только подставляем текущее состояние — сами формулы не дублируем,
  // иначе копия в компоненте разойдётся с проверенной и всё начнётся заново.
  const cashCtx = (techId) => ({ jobs, deposits, cashAdjustments, profile: profileById(techId) });
  const techOpening = (techId) => calc.techOpening(profileById(techId));
  const techCashCollected = (techId) => calc.techCashCollected(techId, cashCtx(techId));
  const techDepositedConfirmed = (techId) => calc.techDepositedConfirmed(techId, cashCtx(techId));
  const techDepositedPending = (techId) => calc.techDepositedPending(techId, cashCtx(techId));
  const techCashRevisions = (techId) => calc.techCashRevisions(techId, cashAdjustments);
  const techCashOnHand = (techId) => calc.techCashOnHand(techId, cashCtx(techId));
  // Ревизия / списание / передача препаратов между сотрудниками.
  // Передача пишется двумя связанными строками (out + in) с общим transfer_group.
  async function saveInventoryMovement(tech, payload) {
    if (blockedByClosedPeriod(payload.event_date)) return false;
    const current = Number(payload.current_balance) || 0;
    const quantity = Number(payload.amount) || 0;
    const common = {
      chemical_id: String(payload.chemical_id), event_date: payload.event_date,
      reason: payload.reason, note: payload.note || null, created_by: session.user.id,
    };
    let rows;
    if (payload.kind === "transfer") {
      const targetBefore = techLedger(payload.to_tech_id).find((r) => String(r.chem.id) === String(payload.chemical_id))?.balance || 0;
      const transferGroup = crypto.randomUUID();
      rows = [
        { ...common, tech_id: String(tech.id), kind: "transfer_out", amount_delta: -quantity, balance_before: current, balance_after: current - quantity, counterparty_tech_id: String(payload.to_tech_id), transfer_group: transferGroup },
        { ...common, tech_id: String(payload.to_tech_id), kind: "transfer_in", amount_delta: quantity, balance_before: targetBefore, balance_after: targetBefore + quantity, counterparty_tech_id: String(tech.id), transfer_group: transferGroup },
      ];
    } else {
      const delta = payload.kind === "revision" ? quantity - current : payload.kind === "correction_in" ? quantity : -quantity;
      rows = [{ ...common, tech_id: String(tech.id), kind: payload.kind, amount_delta: delta, balance_before: current, balance_after: current + delta }];
    }
    const { error } = await supabase.from("inventory_adjustments").insert(rows);
    if (error) { showToast("Ошибка: " + error.message); return false; }
    const chem = chemById(payload.chemical_id);
    const after = rows[0].balance_after;
    await logAction("Остатки препаратов", `${tech.full_name || "?"} · ${chem?.name || "?"}: ${fmtAmount(current, chem?.unit_kind)} → ${fmtAmount(after, chem?.unit_kind)} · ${payload.reason}`);
    setModal(null); showToast("Движение сохранено"); load(); return true;
  }
  // Запись ревизии / «забрали в офис» / ручной корректировки. Суммы приходят уже
  // посчитанными из CashRevisionModal, здесь только фиксируем автора и пишем в базу.
  async function saveCashRevision(tech, payload) {
    if (blockedByClosedPeriod(payload.event_date)) return false;
    const { error } = await supabase.from("cash_adjustments").insert({
      tech_id: String(tech.id), kind: payload.kind || "revision",
      amount_delta: Number(payload.amount_delta) || 0,
      balance_before: Number(payload.balance_before) || 0,
      balance_after: Number(payload.balance_after) || 0,
      event_date: payload.event_date, reason: payload.reason, note: payload.note || null,
      created_by: session.user.id,
    });
    if (error) { showToast("Ошибка: " + error.message); return false; }
    const label = payload.kind === "office_take" ? "Забрали в офис" : payload.kind === "correction" ? "Корректировка наличных" : "Ревизия наличных";
    await logAction(label, `${tech.full_name || "?"}: ${fmt(payload.balance_before)} ₸ → ${fmt(payload.balance_after)} ₸ · ${payload.reason}`);
    setModal(null); showToast("Сохранено"); load(); return true;
  }

  async function ensureCatalog(table, list, value) {
    const v = (value || "").trim();
    if (!v) return;
    if (list.some((x) => norm(x.name) === norm(v))) return;
    await supabase.from(table).insert({ name: v });
  }
  async function createJob(payload) {
    const { data: created, error } = await supabase.from("jobs").insert({ ...payload, created_by: session.user.id, work_stage: payload.assigned_to ? "assigned" : "new" }).select("id, client_phone").single();
    if (error) { showToast("Ошибка: " + error.message); return false; }
    await ensureCatalog("client_sources", sources, payload.source);
    await ensureCatalog("pest_types", pestTypes, payload.pest);
    await logAction("Создание", `${payload.pest} · ${payload.address}`);
    await recordClientEvent({ ...payload, id: created?.id, client_phone: created?.client_phone || payload.client_phone }, "created", "Заявка создана", `${payload.pest || "Услуга"} · ${isoToRu(payload.scheduled_date) || "дата уточняется"}`);
    setModal(null); showToast("Заявка создана"); load();
    return true;
  }
  async function editJob(job, payload) {
    if (blockedByClosedPeriod(payload.scheduled_date || job.scheduled_date)) return;
    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return false; }
    await ensureCatalog("client_sources", sources, payload.source);
    await ensureCatalog("pest_types", pestTypes, payload.pest);
    await logAction("Редактирование", `${payload.pest || job.pest} · ${payload.address || job.address}`);
    await recordClientEvent({ ...job, ...payload }, "updated", "Данные заявки обновлены", actorName);
    setModal(null); showToast("Заявка обновлена"); load();
    return true;
  }
  async function putOnRepeat(job) {
    const { error } = await supabase.from("jobs").update({ repeat_state: "on_repeat", repeat_since: new Date().toISOString() }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return false; }
    await logAction("Повтор", `На повтор · ${job.pest} · ${job.address}`);
    showToast("Заявка на повторе"); load();
  }
  async function cancelJob(job, reason) {
    if (blockedByClosedPeriod(job.scheduled_date)) return;
    const { error } = await supabase.from("jobs").update({ status: "canceled", work_stage: "canceled", cancel_reason: reason || null, canceled_at: new Date().toISOString(), canceled_by: session.user.id }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отмена заявки", `${job.pest} · ${job.address}${reason ? " — " + reason : ""}`);
    await recordClientEvent(job, "canceled", "Заявка отменена", reason || actorName);
    setModal(null); showToast("Заявка отменена"); load();
  }
  async function restoreCanceled(job) {
    const { error } = await supabase.from("jobs").update({ status: job.assigned_to ? "assigned" : "new", work_stage: job.assigned_to ? "assigned" : "new", cancel_reason: null, canceled_at: null, canceled_by: null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отмена заявки", `Восстановлена · ${job.pest} · ${job.address}`);
    await recordClientEvent(job, "restored", "Заявка возвращена в работу", actorName);
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
      client_phone: job.client_phone, guarantee_months: job.guarantee_months, status: "new", repeat_of: job.id, created_by: session.user.id,
    });
    if (ins.error) { showToast("Ошибка: " + ins.error.message); return; }
    await supabase.from("jobs").update({ repeat_state: "finished" }).eq("id", job.id);
    await logAction("Повтор", `Создана повторная заявка · ${job.pest} · ${job.address}`);
    showToast("Повторная заявка создана"); load();
  }
  async function assignJob(job, techId) {
    const newStatus = job.status === "done" ? "done" : (techId ? "assigned" : "new");
    const nextStage = job.status === "done" ? "done" : (techId ? "assigned" : "new");
    const { error } = await supabase.from("jobs").update({ assigned_to: techId || null, status: newStatus, work_stage: nextStage, stage_updated_at: new Date().toISOString() }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    const from = job.assigned_to ? (techById(job.assigned_to)?.full_name || "—") : "—";
    const to = techId ? (techById(techId)?.full_name || "—") : "не назначен";
    await logAction("Назначение", `${job.pest} · ${from} → ${to}`);
    await recordClientEvent(job, "assignment", techId ? "Назначен исполнитель" : "Исполнитель снят", techId ? to : actorName);
    setModal(null); showToast("Дезинфектор назначен"); load();
  }
  async function submitReport(job, report, chems, docs) {
    if (blockedByClosedPeriod(job.scheduled_date)) return false;
    const { error } = await supabase.rpc("submit_report", {
      p_job: job.id, p_cash: report.cash, p_qr: report.qr, p_note: report.note,
      p_chems: chems,
      p_fu_wanted: report.followUp.wanted, p_fu_date: report.followUp.date, p_fu_note: report.followUp.note,
      p_docs_needed: docs.needed, p_docs_avr: docs.avr, p_docs_dogovor: docs.dogovor, p_docs_note: docs.note,
    });
    if (error) { showToast("Ошибка: " + error.message); return false; }
    // перечисление + пересчёт report_paid — через защищённую функцию (RLS блокировал прямой update)
    const upd = await supabase.rpc("save_report_extras", {
      p_job: job.id, p_cash: Number(report.cash) || 0, p_qr: Number(report.qr) || 0,
      p_transfer: Number(report.transfer) || 0, p_method: report.method,
    });
    if (upd.error) { showToast("Отчёт сохранён, но детали оплаты не записались: " + upd.error.message + ". Проверь, выполнен ли kazdez-report-rpc.sql."); load(); return false; }
    await recordClientEvent(job, "done", "Работа выполнена", `Оплата: ${fmt((Number(report.cash) || 0) + (Number(report.qr) || 0) + (Number(report.transfer) || 0))} ₸`);
    setModal({ kind: "reportSuccess" }); load(); return true;
  }
  async function markTransferPaid(job, accountId, paidDate) {
    const { error } = await supabase.from("jobs").update({ transfer_paid: true, transfer_account_id: accountId || null, transfer_paid_date: paidDate || new Date().toISOString().slice(0, 10) }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    if (accountId) {
      const exists = moves.some((m) => m.source === "job_transfer" && m.ref_id === job.id);
      if (!exists) {
        await supabase.from("money_moves").insert({
          account_id: accountId, direction: "income", amount: Number(job.report_transfer) || 0, move_date: paidDate || new Date().toISOString().slice(0, 10),
          note: `Оплата перечислением: ${job.pest} · ${job.address}`, source: "job_transfer", ref_id: job.id, created_by: session.user.id,
        });
      }
    }
    await logAction("Оплата", `Перечисление оплачено ${fmt(job.report_transfer)} ₸${accountId ? " → " + (accountById(accountId)?.name || "") : ""}`);
    setModal(null); showToast("Оплата зачтена"); load();
  }
  async function saveTechExtras(job, bonus, travel, helpers = []) {
    if (blockedByClosedPeriod(job.scheduled_date)) return;
    const { error } = await supabase.from("jobs").update({ tech_bonus: Number(bonus) || null, tech_travel: Number(travel) || null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    // Помощников переписываем целиком: так убранная строка действительно
    // исчезает, а не остаётся висеть в базе вместе с чужой доплатой.
    await supabase.from("job_helpers").delete().eq("job_id", job.id);
    if (helpers.length) {
      const { error: hError } = await supabase.from("job_helpers").insert(helpers.map((h) => ({
        job_id: job.id, tech_id: h.tech_id, amount: Number(h.amount) || 0,
        note: h.note || null, created_by: session.user.id,
      })));
      if (hError) { showToast("Ошибка: доплаты помощникам не сохранились — " + hError.message); return; }
    }
    const names = helpers.map((h) => `${techById(h.tech_id)?.full_name || "?"} ${fmt(h.amount)} ₸`).join(", ");
    await logAction("Бонусы", `${job.pest} · ${techById(job.assigned_to)?.full_name || "?"}: бонус ${fmt(bonus)} ₸, дорожные ${fmt(travel)} ₸${names ? " · помощь: " + names : ""}`);
    setModal(null); showToast("Сохранено"); load();
  }
  // П.3: мы отдали заявку партнёру; он выполнил — админ фиксирует сумму и как прошла оплата
  async function markExecutorDone(job, fullAmount, settlement, accountId, payDate) {
    const amount = Number(fullAmount) || 0;
    const sharePct = Number(job.executor_share_pct) || 0;
    const ourPart = Math.round(amount * (100 - sharePct) / 100);
    const patch = {
      status: "done", reported_at: new Date().toISOString(),
      executor_settlement: settlement,
      report_method: settlement === "qr_full" ? "QR (за партнёра)" : "Перевод нашей доли",
      // qr_full: клиент оплатил нам ВСЮ сумму по QR → report_qr = вся сумма (авто-зачисление на Kaspi Pay), должны партнёру его долю
      // net_to_us: партнёр перевёл нам НАШУ долю → выручка = наша доля, долей не должны
      report_paid: settlement === "qr_full" ? amount : ourPart,
      report_qr: settlement === "qr_full" ? amount : 0,
      report_cash: 0,
      executor_paid: settlement === "qr_full" ? false : true,
    };
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    if (settlement === "net_to_us" && accountId) {
      const exists = moves.some((m) => m.source === "executor_net" && m.ref_id === job.id);
      if (!exists) {
        await supabase.from("money_moves").insert({
          account_id: accountId, direction: "income", amount: ourPart, move_date: payDate || new Date().toISOString().slice(0, 10),
          note: `Наша доля от партнёра-исполнителя: ${job.pest} · ${job.address}`, source: "executor_net", ref_id: job.id, created_by: session.user.id,
        });
      }
    }
    await logAction("Заявка", `Партнёр выполнил: ${job.pest} · ${fmt(amount)} ₸ · ${settlement === "qr_full" ? "QR нам, должны долю" : "получили нашу долю"}`);
    setModal(null); showToast("Заявка закрыта"); load();
  }
  async function toggleExecutorPaid(job, paid) {
    const { error } = await supabase.from("jobs").update({ executor_paid: paid }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Заявка", `Доля исполнителю ${paid ? "выплачена" : "помечена невыплаченной"}: ${job.pest}`);
    load();
  }
  async function requestReportEdit(job, reason) {
    const { error } = await supabase.rpc("request_report_edit", { p_job: job.id, p_reason: reason || null });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отчёт", `Запрос на изменение: ${job.pest} · ${job.address}${reason ? " — " + reason : ""}`);
    setModal(null); showToast("Запрос отправлен админу"); load();
  }
  async function approveReportEdit(job) {
    const { error } = await supabase.from("jobs").update({ edit_request_status: "approved" }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отчёт", `Разрешено изменение: ${job.pest} · ${job.address}`);
    showToast("Изменение разрешено — дезинфектор может переоткрыть отчёт"); load();
  }
  async function rejectReportEdit(job) {
    const { error } = await supabase.from("jobs").update({ edit_request_status: null, edit_request_reason: null, edit_request_at: null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Отчёт", `Отклонён запрос на изменение: ${job.pest} · ${job.address}`);
    showToast("Запрос отклонён"); load();
  }
  async function deleteJob(job) {
    if (blockedByClosedPeriod(job.scheduled_date)) return;
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
  async function stockIn(chem, addMl, newPrice, extra = {}) {
    const patch = { purchased_ml: (Number(chem.purchased_ml) || 0) + addMl };
    if (newPrice != null) patch.price_per_liter = newPrice;
    const { error } = await supabase.from("chemicals").update(patch).eq("id", chem.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    // Карточка препарата хранит только текущую цену, и каждый приход её
    // затирает. Поэтому приход записываем отдельной строкой: себестоимость
    // старых заявок должна считаться по цене того дня, а не сегодняшней.
    const price = newPrice != null ? newPrice : (Number(chem.price_per_liter) || null);
    const { error: pError } = await supabase.from("chemical_purchases").insert({
      chemical_id: chem.id,
      purchase_date: extra.purchase_date || new Date().toISOString().slice(0, 10),
      amount: addMl, price_per_liter: price,
      supplier: extra.supplier || null, created_by: session.user.id,
    });
    if (pError) showToast("Приход оформлен, но в историю закупа не попал: " + pError.message);
    const supplierNote = extra.supplier ? ` · ${extra.supplier}` : "";
    await logAction("Склад", `Приход: ${chem.name} +${fmtAmount(addMl, chem.unit_kind)}${price != null ? ` по ${fmt(price)} ₸` : ""}${supplierNote}`);
    setModal(null); showToast("Приход оформлен"); load();
  }
  async function removeChem(chem) {
    await supabase.from("chemicals").delete().eq("id", chem.id);
    await logAction("Склад", `Удалён препарат: ${chem.name}`);
    showToast("Препарат удалён"); load();
  }
  // Отметка об ознакомлении ставится только за себя — в этом весь смысл
  // подтверждения, и база это же требует политикой.
  async function acknowledgeDoc(docKey) {
    const { error } = await supabase.from("safety_acknowledgements").insert({ person_id: session.user.id, doc_key: docKey });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Инструктаж", `Ознакомлен: ${DRIVE_LINKS.find((l) => l.key === docKey)?.label || docKey}`);
    showToast("Отмечено"); load();
  }

  async function savePeopleEvent(payload) {
    const row = { ...payload, created_by: session.user.id };
    const { error } = payload.id
      ? await supabase.from("employee_events").update({ kind: row.kind, happened_on: row.happened_on, amount: row.amount, note: row.note }).eq("id", payload.id)
      : await supabase.from("employee_events").insert(row);
    if (error) { showToast("Ошибка: " + error.message); return error.message; }
    await logAction("Кадры", `${personName(payload.person_id)} · ${EMPLOYEE_EVENTS[payload.kind] || payload.kind}${payload.amount != null ? ` · ${fmt(payload.amount)} ₸` : ""}`);
    setModal(null); showToast("Сохранено"); load(); return null;
  }

  async function saveTraining(payload) {
    const row = { ...payload, created_by: session.user.id };
    const { error } = payload.id
      ? await supabase.from("training_records").update({ topic: row.topic, passed_on: row.passed_on, score: row.score, next_check_on: row.next_check_on, note: row.note }).eq("id", payload.id)
      : await supabase.from("training_records").insert(row);
    if (error) { showToast("Ошибка: " + error.message); return error.message; }
    await logAction("Обучение", `${personName(payload.person_id)} · ${payload.topic}${payload.score != null ? ` · ${payload.score} баллов` : ""}`);
    setModal(null); showToast("Сохранено"); load(); return null;
  }

  async function saveTechDoc(payload) {
    const row = { ...payload, created_by: session.user.id };
    const { error } = payload.id
      ? await supabase.from("tech_documents").update({ kind: row.kind, number: row.number, issued_on: row.issued_on, expires_on: row.expires_on, note: row.note }).eq("id", payload.id)
      : await supabase.from("tech_documents").insert(row);
    if (error) { showToast("Ошибка: " + error.message); return error.message; }
    await logAction("Допуски", `${techById(payload.tech_id)?.full_name || personName(payload.tech_id)} · ${TECH_DOC_KINDS[payload.kind] || payload.kind}${payload.expires_on ? ` до ${isoToRu(payload.expires_on)}` : ""}`);
    setModal(null); showToast("Сохранено"); load(); return null;
  }

  async function removeTechDoc(doc) {
    const { error } = await supabase.from("tech_documents").delete().eq("id", doc.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Допуски", `Удалён документ: ${personName(doc.tech_id)} · ${TECH_DOC_KINDS[doc.kind] || doc.kind}`);
    showToast("Удалено"); load();
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
  function partnerNameOf(job) {
    if (!job || (job.brand !== "partner" && !job.partner_id && !job.partner_name)) return "";
    return job.partner_name || partnerById(job.partner_id)?.name || "Партнёр не указан";
  }
  function brandHeaderOf(job) {
    if (job.brand === "Sanitex") return "Sanitex";
    if (job.brand === "partner" || job.partner_id || job.partner_name) return `Партнёр · ${partnerNameOf(job)}`;
    return "KazDez";
  }
  const partnerShareAmt = (job) => calc.partnerShareAmt(job, chemicals, chemPurchases);
  const executorShareAmt = (job) => calc.executorShareAmt(job);
  // Затраты повторных выездов относим на исходную заявку: гарантийный выезд —
  // это бесплатная работа, которой в её прибыли раньше не было.
  const guaranteeCostOf = (job) => calc.guaranteeCostOf(job.id, { jobs, chemicals, purchases: chemPurchases, jobHelpers });
  const jobEconomics = (job) => calc.jobEconomics(job, { chemicals, purchases: chemPurchases, qrFeeRate, helpers: calc.helpersTotal(job.id, jobHelpers), guaranteeCost: guaranteeCostOf(job) });
  function upsellFor(job) {
    const text = norm(`${job.pest || ""} ${job.address || ""} ${job.note || ""}`);
    if (/склад|цех|производ|общепит|кафе|ресторан/.test(text)) return "регулярное абонентское обслуживание и мониторинг объекта";
    if (/клещ|комар|участ|территор|мурав/.test(text)) return "комплексную сезонную обработку от клещей, комаров и муравьёв";
    if (/таракан/.test(text)) return "профилактическую барьерную обработку и контроль через 30 дней";
    if (/клоп/.test(text)) return "контрольный осмотр и профилактику повторного заноса";
    if (/мыш|крыс|дератиз/.test(text)) return "установку и обслуживание мониторинговых контейнеров";
    return "плановую профилактическую обработку со скидкой для постоянного клиента";
  }
  function upsellWhatsappUrl(job) {
    const phone = String(job.client_phone || "").replace(/\D/g, "");
    const message = `Здравствуйте! Это KazDez. После выполненной обработки можем дополнительно предложить ${upsellFor(job)}. Если актуально — подберём удобную дату и рассчитаем стоимость.`;
    return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "";
  }
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
  // Единственное место, где выплата попадает в кассу. Раньше дорог было две:
  // «Зарплата» проводила движение по счёту, а кнопка в «Сотрудниках» только
  // меняла статус — деньги уходили, а остаток счёта этого не знал.
  async function postPayoutToCash(expenseRow, tech) {
    if (!expenseRow?.account_id) return;
    // не задваиваем движение, если запись проводят повторно
    if (moves.some((m) => m.source === "payroll" && m.ref_id === expenseRow.id)) return;
    const { error } = await supabase.from("money_moves").insert({
      account_id: expenseRow.account_id, direction: "expense", amount: expenseRow.amount,
      move_date: expenseRow.expense_date,
      note: `Зарплата: ${tech?.full_name || "сотрудник"}${expenseRow.note ? " · " + expenseRow.note : ""}`,
      source: "payroll", ref_id: expenseRow.id, created_by: session.user.id,
    });
    if (error) showToast("Выплата записана, но по кассе не провелась: " + error.message);
  }
  // Новая выплата из раздела «Зарплата».
  // Запрос, который не отвечает, для человека выглядит как мёртвая кнопка:
  // ни ошибки, ни результата. Поэтому ждём ответ ограниченное время и
  // возвращаем внятный текст вместо бесконечного ожидания.
  async function withTimeout(promise, label, ms = 20000) {
    let timer;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: база не ответила за ${Math.round(ms / 1000)} секунд`)), ms);
    });
    try { return await Promise.race([promise, guard]); } finally { clearTimeout(timer); }
  }

  // Ошибка базы в лицо пользователю мало что говорит. Самый частый случай —
  // не выполнена миграция, и тогда надо назвать файл, а не код PostgREST.
  function payoutProblem(error) {
    const msg = error?.message || "неизвестная ошибка";
    if (/account_id|paid_at|salary_monthly|schema cache/i.test(msg)) {
      return `В базе нет колонок для выплат. Выполни supabase/2026-09-01_payroll_columns.sql в Supabase → SQL Editor. Ответ базы: ${msg}`;
    }
    if (/permission|row-level security|policy/i.test(msg)) {
      return `Недостаточно прав на запись выплаты. Ответ базы: ${msg}`;
    }
    return msg;
  }

  // Сбой на любом шаге записывается в «Сбои приложения» — иначе он исчезает
  // вместе с окном, и разбираться потом не по чему.
  function payoutCrash(e, place) {
    const msg = e?.message || String(e);
    logClientError({ kind: "handled", place, message: msg });
    return `Выплата не записалась: ${msg}. Проверь список выплат перед повторной попыткой — запись могла всё же пройти.`;
  }

  async function saveMonthlyPlan(monthKey, values) {
    const next = { ...calc.parseTargets(settings.monthly_targets) };
    // Пустой план убираем целиком, иначе месяц остаётся с нулевыми целями и
    // раздел показывает «0% выполнения» вместо «плана нет».
    if (!values) delete next[monthKey]; else next[monthKey] = values;
    await saveAppSetting("monthly_targets", JSON.stringify(next));
    await logAction("План", values ? `${monthKey}: выручка ${fmt(values.revenue)} ₸, заявок ${values.jobs}` : `${monthKey}: план снят`);
    setModal(null); showToast("План сохранён");
  }

  async function savePayrollPayment(tech, payload) {
    if (blockedByClosedPeriod(payload.expense_date)) return "Период закрыт — выплату этой датой провести нельзя. Дату закрытия можно сдвинуть в Настройках.";
    try {
      const { data: created, error } = await withTimeout(supabase.from("tech_expenses").insert({
        tech_id: payload.tech_id, type: payload.type, amount: payload.amount,
        expense_date: payload.expense_date, account_id: payload.account_id || null,
        paid_at: payload.expense_date, status: "paid", note: payload.note,
        created_by: session.user.id,
      }).select().single(), "Запись выплаты");
      if (error) { showToast("Ошибка: " + error.message); return payoutProblem(error); }
      // Дальше выплата уже записана. Что бы ни случилось на следующих шагах,
      // окно обязано закрыться и список — обновиться: иначе человек решит,
      // что выплаты нет, и проведёт её второй раз.
      try { await postPayoutToCash(created, tech); } catch (e) { showToast("Выплата записана, но по кассе не провелась: " + (e?.message || e)); }
      try {
        await logAction("Выплата", `${tech.full_name || "?"} · ${EXPENSE_TYPES[payload.type] || payload.type} · ${fmt(payload.amount)} ₸${payload.account_id ? " → " + (accountById(payload.account_id)?.name || "") : ""}`);
      } catch { /* журнал не должен мешать выплате */ }
      setModal(null); showToast("Выплата проведена"); load(); return null;
    } catch (e) {
      return payoutCrash(e, "Зарплата · выплата");
    }
  }
  // Старое начисление, заведённое до того, как выплаты стали проводиться по кассе.
  // Проводим ту же запись, а не создаём новую — иначе сумма задвоится в отчётах.
  async function payExistingExpense(tech, expense, payload) {
    if (blockedByClosedPeriod(payload.expense_date) || blockedByClosedPeriod(expense.expense_date)) return "Период закрыт — выплату этой датой провести нельзя. Дату закрытия можно сдвинуть в Настройках.";
    try {
      const { data: updated, error } = await withTimeout(supabase.from("tech_expenses").update({
        status: "paid", account_id: payload.account_id || null,
        expense_date: payload.expense_date, paid_at: payload.expense_date,
        amount: payload.amount, type: payload.type, note: payload.note,
      }).eq("id", expense.id).select().single(), "Проведение выплаты");
      if (error) { showToast("Ошибка: " + error.message); return payoutProblem(error); }
      try { await postPayoutToCash(updated, tech); } catch (e) { showToast("Выплата записана, но по кассе не провелась: " + (e?.message || e)); }
      try {
        await logAction("Выплата", `${tech?.full_name || "?"} · проведено по кассе · ${fmt(payload.amount)} ₸${payload.account_id ? " → " + (accountById(payload.account_id)?.name || "") : ""}`);
      } catch { /* журнал не должен мешать выплате */ }
      setModal(null); showToast("Выплата проведена"); load(); return null;
    } catch (e) {
      return payoutCrash(e, "Зарплата · проведение выплаты");
    }
  }
  async function removeExpense(e) {
    if (blockedByClosedPeriod(e.expense_date)) return;
    // сначала снимаем движение по кассе, иначе останется расход без основания
    await supabase.from("money_moves").delete().eq("source", "payroll").eq("ref_id", e.id);
    await supabase.from("tech_expenses").delete().eq("id", e.id);
    await logAction("Выплата", `Удалено: ${techById(e.tech_id)?.full_name || "?"} · ${fmt(e.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function editTechProfile(tech, payload) {
    const { error } = await supabase.from("profiles").update(payload).eq("id", tech.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    // Изменение оклада записываем в историю само: вручную это забывают, а
    // через год вопрос «сколько он получал весной» остаётся без ответа.
    const wasSalary = Number(tech.salary_monthly) || 0;
    const nowSalary = Number(payload.salary_monthly) || 0;
    if (nowSalary !== wasSalary) {
      const { error: evError } = await supabase.from("employee_events").insert({
        person_id: tech.id, kind: "salary", happened_on: new Date().toISOString().slice(0, 10),
        amount: nowSalary, note: `Было ${fmt(wasSalary)} ₸`, created_by: session.user.id,
      });
      if (evError) showToast("Данные сохранены, но в историю запись не попала: " + evError.message);
    }
    await logAction("Дезинфектор", `Изменены данные: ${tech.full_name || "?"} → ${payload.full_name || "?"}`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function savePriceRow(row, existing) {
    const payload = { pest: row.pest, area_from: Number(row.area_from) || 0, area_to: row.area_to === "" || row.area_to === null ? null : Number(row.area_to), price: Number(row.price) || 0, updated_at: new Date().toISOString() };
    const res = existing ? await supabase.from("price_list").update(payload).eq("id", existing.id) : await supabase.from("price_list").insert(payload);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Прайс", `${payload.pest} ${payload.area_from}–${payload.area_to ?? "∞"} м² → ${fmt(payload.price)} ₸`);
    showToast("Прайс обновлён"); load();
  }
  async function removePriceRow(row) {
    await supabase.from("price_list").delete().eq("id", row.id);
    await logAction("Прайс", `Удалено: ${row.pest} ${row.area_from}–${row.area_to ?? "∞"} м²`);
    showToast("Удалено"); load();
  }
  async function saveAppSetting(key, value) {
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) { showToast("Ошибка: " + error.message); return; }
    // Пишем в память сразу: следующая загрузка сохраняет то, что здесь лежит,
    // и без этой строки удалённая печать вернулась бы из старого состояния.
    setSettings((prev) => ({ ...prev, [key]: value }));
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
    if (blockedByClosedPeriod(payload.spent_date) || (existing && blockedByClosedPeriod(existing.spent_date))) return;
    const res = existing ? await supabase.from("opex").update(payload).eq("id", existing.id) : await supabase.from("opex").insert({ ...payload, created_by: session.user.id });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Расходы", `${existing ? "Изменено" : "Добавлено"}: ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeOpex(o) {
    if (blockedByClosedPeriod(o.spent_date)) return;
    await supabase.from("opex").delete().eq("id", o.id);
    await logAction("Расходы", `Удалено: ${fmt(o.amount)} ₸`);
    showToast("Удалено"); load();
  }
  async function saveMove(payload, existing) {
    if (blockedByClosedPeriod(payload.move_date) || (existing && blockedByClosedPeriod(existing.move_date))) return;
    const res = existing ? await supabase.from("money_moves").update(payload).eq("id", existing.id) : await supabase.from("money_moves").insert({ ...payload, created_by: session.user.id, source: "manual" });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    const dirLabel = payload.direction === "income" ? "Доход" : payload.direction === "expense" ? "Расход" : "Перевод";
    await logAction("Финансы", `${dirLabel}: ${fmt(payload.amount)} ₸`);
    setModal(null); showToast("Сохранено"); load();
  }
  async function removeMove(m) {
    if (blockedByClosedPeriod(m.move_date)) return;
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
  async function saveJobEconomics(job, payload) {
    if (blockedByClosedPeriod(job.scheduled_date)) return;
    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Юнит-экономика", `${job.pest} · транспорт ${fmt(payload.transport_cost)} ₸ · прочее ${fmt(payload.other_cost)} ₸`);
    setModal(null); showToast("Расходы заявки сохранены"); load();
  }
  async function saveFollowup(payload, existing) {
    const data = { ...payload, created_by: existing?.created_by || session.user.id, updated_at: new Date().toISOString() };
    const res = existing ? await supabase.from("client_followups").update(data).eq("id", existing.id) : await supabase.from("client_followups").insert(data);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Касание", `${payload.phone} · ${payload.kind} · ${isoToRu(payload.due_date)}`);
    setModal(null); showToast("Касание запланировано"); load();
  }
  async function setFollowupDone(item, result = "Связались") {
    const { error } = await supabase.from("client_followups").update({ status: "done", result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Касание", `Завершено: ${item.phone} · ${result}`); showToast("Касание завершено"); load();
  }
  async function saveQualityCheck(job, payload, existing) {
    const data = { ...payload, checked_by: session.user.id, updated_at: new Date().toISOString() };
    const res = existing ? await supabase.from("quality_checks").update(data).eq("id", existing.id) : await supabase.from("quality_checks").upsert(data, { onConflict: "job_id" });
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    if (payload.result === "repeat" && !job.repeat_state) await supabase.from("jobs").update({ repeat_state: "on_repeat", repeat_since: new Date().toISOString() }).eq("id", job.id);
    await logAction("Контроль качества", `${job.client_phone} · оценка ${payload.rating || "—"} · ${payload.result}`);
    setModal(null); showToast(payload.result === "repeat" ? "Сохранено и отправлено в «Повторы»" : "Контроль качества сохранён"); load();
  }
  async function saveContract(payload, existing) {
    const data = { ...payload, created_by: existing?.created_by || session.user.id, updated_at: new Date().toISOString() };
    const res = existing ? await supabase.from("service_contracts").update(data).eq("id", existing.id) : await supabase.from("service_contracts").insert(data);
    if (res.error) { showToast("Ошибка: " + res.error.message); return; }
    await logAction("Абонент", `${existing ? "Изменён" : "Добавлен"}: ${payload.client_name} · каждые ${payload.interval_days} дн.`);
    setModal(null); showToast("Абонент сохранён"); load();
  }
  async function removeContract(contract) {
    const { error } = await supabase.from("service_contracts").delete().eq("id", contract.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Абонент", `Удалён: ${contract.client_name}`); showToast("Удалено"); load();
  }
  async function createContractJob(contract) {
    const payload = {
      type: "Плановая", scheduled_date: contract.next_service_date, scheduled_time: "", address: contract.address, source: "Абонентский договор",
      pest: contract.service, price_options: [{ label: "Абонентское обслуживание", amount: Number(contract.price) || 0 }], client_phone: contract.phone,
      contact_name: contract.client_name, guarantee_months: 0, status: "new", service_contract_id: contract.id, created_by: session.user.id,
    };
    const ins = await supabase.from("jobs").insert(payload);
    if (ins.error) { showToast("Ошибка: " + ins.error.message); return; }
    const next = parseIso(contract.next_service_date) || new Date(); next.setDate(next.getDate() + (Number(contract.interval_days) || 30));
    await supabase.from("service_contracts").update({ last_generated_date: contract.next_service_date, next_service_date: isoOf(next), updated_at: new Date().toISOString() }).eq("id", contract.id);
    await logAction("Абонент", `Создана плановая заявка: ${contract.client_name} · ${isoToRu(contract.next_service_date)}`);
    showToast("Плановая заявка создана"); setTab("jobs"); load();
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
    // В выгрузке есть листы «Журнал» и «Корзина»: если раздел не открывали,
    // данных ещё нет и листы уехали бы пустыми.
    await loadJournalData();
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
  // Возвращаемость и ценность клиента. Считается по ключу телефона, поэтому
  // «+7 701 …» и «8 701 …» больше не идут за двух разных людей.
  // Попадает ли дата в выбранный период. Объявлено здесь, ДО первого
  // использования: раньше объявление стояло на сотню строк ниже, и обращение
  // к нему сверху роняло весь интерфейс при каждой отрисовке.
  const inPeriodIso = (iso) => {
    if (pMode === "all") return true;
    const dt = parseIso(iso);
    return !!dt && dt.getTime() >= range.start && dt.getTime() < range.end;
  };
  // Оборот для отчётности: что фактически получено и каким способом.
  const turnover = calc.turnoverReport(jobs, {
    inPeriod: inPeriodIso,
    brandOf: (j) => (j.brand === "partner" ? `Партнёр · ${partnerNameOf(j) || "не указан"}` : (j.brand || "KazDez")),
  });
  const retention = calc.clientStats(jobs, {
    from: pMode === "all" ? null : isoOf(new Date(range.start)),
    to: pMode === "all" ? null : isoOf(new Date(range.end - 86400000)),
    phoneKeyOf: phoneKey,
  });
  const fin = (() => {
    const weekIdx = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const week = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: WEEKDAYS[dow].slice(0, 2), count: 0, revenue: 0 }));
    const maxPriceOption = (j) => Math.max(0, ...(j.price_options || []).map((p) => Number(p.amount) || 0));
    const monthMode = pMode === "month";
    let revenue = 0, cost = 0, cash = 0, qr = 0, partnerShares = 0, executorShares = 0, qrFees = 0, partnerComp = 0; const bySource = {}; const byTech = {}; const byPest = {}; const monthWeeksMap = {};
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
        // доля партнёра-исполнителя (мы отдали заявку): вычитается только когда вся сумма пришла к нам (qr_full)
        if (j.executor_partner_id && j.executor_settlement === "qr_full") executorShares += Math.round(paid * (Number(j.executor_share_pct) || 0) / 100);
        bySource[srcKey].revenue += paid;
        if (dt) { const wi = weekIdx[dt.getDay()]; week[wi].count++; week[wi].revenue += paid; }
        const pestKey = (j.pest || "—").trim() || "—";
        if (!byPest[pestKey]) byPest[pestKey] = { pest: pestKey, count: 0, revenue: 0, cost: 0 };
        byPest[pestKey].count++; byPest[pestKey].revenue += paid; byPest[pestKey].cost += jcost;
        if (j.assigned_to) {
          if (!byTech[j.assigned_to]) byTech[j.assigned_to] = { count: 0, revenue: 0, cost: 0, quoteSum: 0, paidOnQuote: 0, quoteN: 0 };
          const bt = byTech[j.assigned_to];
          bt.count++; bt.revenue += paid; bt.cost += jcost;
          const quote = maxPriceOption(j);
          if (quote > 0) { bt.quoteSum += quote; bt.paidOnQuote += paid; bt.quoteN++; }
        }
        if (monthMode && dt) {
          const dom = dt.getDate();
          const wkIdx = Math.min(4, Math.floor((dom - 1) / 7));
          if (!monthWeeksMap[wkIdx]) monthWeeksMap[wkIdx] = { idx: wkIdx, label: `Неделя ${wkIdx + 1}`, count: 0, revenue: 0, days: {} };
          const mw = monthWeeksMap[wkIdx];
          mw.count++; mw.revenue += paid;
          const iso = j.scheduled_date;
          if (!mw.days[iso]) mw.days[iso] = { date: iso, dom, dow: dt.getDay(), count: 0, revenue: 0 };
          mw.days[iso].count++; mw.days[iso].revenue += paid;
        }
      }
      if (j.partner_comp > 0) partnerComp += Number(j.partner_comp) || 0;
    });
    const weekMax = Math.max(1, ...week.map((w) => w.revenue));
    const monthWeeks = Object.values(monthWeeksMap).sort((a, b) => a.idx - b.idx).map((mw) => ({
      idx: mw.idx, label: mw.label, count: mw.count, revenue: mw.revenue,
      days: Object.values(mw.days).sort((a, b) => a.date.localeCompare(b.date)),
      dayMax: Math.max(1, ...Object.values(mw.days).map((d) => d.revenue)),
    }));
    const monthWeekMax = Math.max(1, ...monthWeeks.map((w) => w.revenue));
    // средний чек по срезам (в том же периоде, независимо от фильтра бренда)
    const avg = { ours: { sum: 0, n: 0 }, partner: { sum: 0, n: 0 } };
    const avgType = { "Первичная": { sum: 0, n: 0 }, "Вторичная": { sum: 0, n: 0 }, "Осмотр": { sum: 0, n: 0 } };
    jobs.forEach((j) => {
      if (j.status !== "done") return;
      const dt = parseIso(j.scheduled_date);
      const inR = pMode === "all" || (dt && dt.getTime() >= range.start && dt.getTime() < range.end);
      if (!inR) return;
      const paid = Number(j.report_paid) || 0;
      if (paid <= 0) return;
      const k = j.brand === "partner" ? "partner" : "ours";
      avg[k].sum += paid; avg[k].n++;
      if (avgType[j.type]) { avgType[j.type].sum += paid; avgType[j.type].n++; }
    });
    const avgCheck = {
      ours: avg.ours.n ? Math.round(avg.ours.sum / avg.ours.n) : 0, oursN: avg.ours.n,
      partner: avg.partner.n ? Math.round(avg.partner.sum / avg.partner.n) : 0, partnerN: avg.partner.n,
      all: (avg.ours.n + avg.partner.n) ? Math.round((avg.ours.sum + avg.partner.sum) / (avg.ours.n + avg.partner.n)) : 0, allN: avg.ours.n + avg.partner.n,
    };
    const avgByType = Object.entries(avgType).map(([type, v]) => ({ type, n: v.n, avg: v.n ? Math.round(v.sum / v.n) : 0 }));
    return { revenue, cost, partnerShares, executorShares, qrFees, partnerComp, profit: revenue - cost - partnerShares - executorShares - qrFees + partnerComp, cash, qr, bySource, byTech, byPest, week, weekMax, monthWeeks, monthWeekMax, avgCheck, avgByType };
  })();

  // ---- зарплата за период ----
  // Начислено = оклад (только в месячном режиме) + бонусы и дорожные по выполненным
  // заявкам периода. Выплачено = проведённые tech_expenses периода. Разница — долг.
  // Оклад намеренно не делим на недели: это месячная величина, дробить её некорректно.
  const payrollSalaryCounts = pMode === "month";
  const payrollRows = techs.map((t) => {
    const jobsOf = jobs.filter((j) => j.assigned_to === t.id && j.status === "done" && inPeriodIso(j.scheduled_date));
    const ownBonus = jobsOf.reduce((s, j) => s + (Number(j.tech_bonus) || 0), 0);
    // Доплаты за помощь на чужих заявках — такой же заработок сотрудника.
    const helperBonus = calc.helperEarnings(t.id, { jobs, jobHelpers, inPeriod: inPeriodIso });
    const bonus = ownBonus + helperBonus;
    const travel = jobsOf.reduce((s, j) => s + (Number(j.tech_travel) || 0), 0);
    // Оклад режется за пропуски сверх положенных выходных: дни берём из
    // раздела «Выходные», норму — из графика в карточке сотрудника.
    const monthKey = payrollSalaryCounts ? isoOf(new Date(range.start)).slice(0, 7) : "";
    const absenceDays = payrollSalaryCounts ? calc.absenceDaysInMonth(t.id, daysOff, monthKey) : 0;
    const salaryCalc = calc.salaryForMonth({ salary: t.salary_monthly, schedule: t.work_schedule, absenceDays });
    const salary = payrollSalaryCounts ? salaryCalc.payable : 0;
    const payments = expenses.filter((e) => e.tech_id === t.id && e.status === "paid" && inPeriodIso(e.expense_date));
    const paid = payments.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    // Выплаты, не дошедшие до кассы. Ищем по факту отсутствия движения, а не по
    // пустому счёту: так ловятся и старые записи без счёта, и те, где проводка
    // сорвалась. Пока они есть, остаток на счетах завышен ровно на их сумму.
    const unposted = expenses.filter((e) => e.tech_id === t.id
      && !moves.some((m) => m.source === "payroll" && m.ref_id === e.id));
    const accrued = salary + bonus + travel;
    return { tech: t, salary, salaryCalc, bonus, helperBonus, travel, accrued, paid, owed: accrued - paid, payments, unposted, jobsCount: jobsOf.length };
  });
  const payrollTotals = payrollRows.reduce((a, r) => ({
    accrued: a.accrued + r.accrued, paid: a.paid + r.paid, owed: a.owed + r.owed,
  }), { accrued: 0, paid: 0, owed: 0 });
  const payrollOwedCount = payrollRows.filter((r) => r.owed > 0).length;

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

  // --- производные для вкладки «Аналитика» ---
  const sortByMetric = (arr) => {
    const a = arr.slice();
    if (daySort === "revenue") a.sort((x, y) => y.revenue - x.revenue);
    else if (daySort === "count") a.sort((x, y) => y.count - x.count);
    return a;
  };
  const finWeekSorted = sortByMetric(fin.week);
  const finMonthWeeksSorted = daySort === "order" ? fin.monthWeeks : sortByMetric(fin.monthWeeks);
  const pestRows = Object.values(fin.byPest)
    .map((p) => ({ ...p, avg: p.count ? Math.round(p.revenue / p.count) : 0 }))
    .sort((a, b) => (pestSort === "count" ? b.count - a.count : pestSort === "avg" ? b.avg - a.avg : b.revenue - a.revenue));
  const techRows = techs
    .filter((t) => fin.byTech[t.id])
    .map((t) => {
      const v = fin.byTech[t.id];
      const avg = v.count ? Math.round(v.revenue / v.count) : 0;
      const markup = v.quoteN && v.quoteSum > 0 ? Math.round((v.paidOnQuote - v.quoteSum) / v.quoteSum * 100) : null;
      return { t, v, avg, markup, profit: v.revenue - v.cost };
    })
    .sort((a, b) => {
      if (techSort === "count") return b.v.count - a.v.count;
      if (techSort === "avg") return b.avg - a.avg;
      if (techSort === "markup") return (b.markup ?? -Infinity) - (a.markup ?? -Infinity);
      return b.v.revenue - a.v.revenue;
    });
  const upliftRows = techRows.filter((r) => r.markup !== null).sort((a, b) => b.markup - a.markup);
  const upliftTotals = techRows.reduce((s, r) => ({ quote: s.quote + r.v.quoteSum, paid: s.paid + r.v.paidOnQuote }), { quote: 0, paid: 0 });
  // Доля возвратов по гарантии — оценка качества работы, а не скорости.
  const guaranteeRows = calc.guaranteeStats(jobs, { inPeriod: inPeriodIso })
    .filter((r) => r.done > 0 || r.returns > 0);
  const guaranteeTotals = guaranteeRows.reduce((a, r) => ({ done: a.done + r.done, returns: a.returns + r.returns }), { done: 0, returns: 0 });

  // Сравнение с прошлым периодом. Считается отдельной чистой функцией по тем
  // же правилам, что и свод: так дельта остаётся согласованной сама с собой,
  // даже если правила отбора когда-нибудь поменяются.
  const prevRange = pMode === "all" ? null : periodRange(pMode, pOff - 1);
  const inRangeOf = (r) => (iso) => {
    if (!r) return true;
    const dt = parseIso(iso);
    return !!dt && dt.getTime() >= r.start && dt.getTime() < r.end;
  };
  const totalsNow = calc.periodTotals(jobs, { inRange: inRangeOf(pMode === "all" ? null : range), brandFilter });
  const totalsPrev = prevRange ? calc.periodTotals(jobs, { inRange: inRangeOf(prevRange), brandFilter }) : null;
  const periodDelta = totalsPrev ? calc.comparePeriods(totalsNow, totalsPrev) : null;
  // «Хуже» не всегда красное: падение среднего чека и падение выручки читаются
  // одинаково, а вот рост числа заявок при падении чека — это разговор.
  const deltaNote = (value, prevValue) => {
    if (!periodDelta) return null;
    // ноль в прошлом периоде — сравнивать не с чем, и это надо сказать словами
    if (value == null) return `в ${prevRange.label} не с чем сравнивать`;
    const sign = value > 0 ? "+" : "";
    return `${sign}${value}% к ${prevRange.label} (${fmt(prevValue)})`;
  };

  // Оценки клиентов: кто и на чём получает низкие. Период — по дате заявки.
  const feedbackRating = calc.feedbackStats(publicFeedback, jobs, { inPeriod: inPeriodIso });
  const happy = calc.happyClients(publicFeedback, jobs, { days: 7 });

  // План на месяц: цель по выручке, заявкам и чеку. Хранится в настройках
  // одной записью — планов несколько штук в год, отдельная таблица тут
  // ничего не добавляет.
  const targets = calc.parseTargets(settings.monthly_targets);
  const planMonthKey = pMode === "month" ? isoOf(new Date(range.start)).slice(0, 7) : null;
  const planTarget = planMonthKey ? targets[planMonthKey] || null : null;
  const planRows = planMonthKey ? [
    { key: "revenue", label: "Выручка", money: true, target: planTarget?.revenue, actual: totalsNow.revenue },
    { key: "jobs", label: "Выполненных заявок", money: false, target: planTarget?.jobs, actual: totalsNow.done },
    { key: "avg", label: "Средний чек", money: true, target: planTarget?.avg, actual: totalsNow.avg },
  ].map((r) => ({ ...r, progress: calc.planProgress(r.target, r.actual, { monthKey: planMonthKey }) })) : [];

  // Сезонность: 24 месяца назад, с оглядкой на тот же месяц год назад.
  const season = calc.seasonality(jobs, { monthsBack: 24, brandFilter });
  const seasonMax = Math.max(1, ...season.map((r) => r.revenue));
  // Абоненты против разовых за выбранный период.
  const subsVsOne = calc.subscriptionComparison(jobs, { inPeriod: inPeriodIso, phoneKeyOf: phoneKey });

  const upliftPct = upliftTotals.quote > 0 ? Math.round((upliftTotals.paid - upliftTotals.quote) / upliftTotals.quote * 100) : 0;

  // ---- склад ----
  // Нормы расхода лежат в справочнике по вредителям, рядом с описанием
  // препаратов: там их и заполняют.
  const chemNorms = (() => {
    const guide = calc.parseTargets(settings.pest_guide);
    const out = {};
    for (const [pest, val] of Object.entries(guide)) {
      const n = Number(val?.norm) || 0;
      if (n > 0) out[pest] = n;
    }
    return out;
  })();

  const inventory = chemicals.map((c) => {
    const used = jobs.reduce((s, j) => s + (j.chemicals || []).filter((x) => (x.chemical_id ? x.chemical_id === c.id : norm(x.name) === norm(c.name))).reduce((a, x) => a + lineAmount(x), 0), 0);
    const remaining = (Number(c.purchased_ml) || 0) - used;
    // Прогноз считается по расходу за последние три месяца, а не за всю
    // историю: иначе препарат, полгода пролежавший без дела, выглядит
    // расходуемым по капле ровно перед сезоном.
    const forecast = calc.chemForecast(c, { jobs, remaining });
    const suppliers = calc.supplierPrices(c.id, chemPurchases);
    const batches = calc.batchesWithRemaining(c.id, chemPurchases, used);
    return {
      ...c, used, remaining, forecast, suppliers, batches,
      low: remaining <= (Number(c.min_ml) || 0),
      orderSoon: forecast?.daysLeft != null && forecast.daysLeft <= 14,
      stockValue: remaining * pricePerBase(c),
    };
  });
  // Ушедшие клиенты: обработались и не появлялись дольше выбранного срока.
  // Считается по ключу телефона, поэтому «+7 701 …» и «8 701 …» — один человек.
  const dormant = calc.dormantClients(jobs, { months: dormantMonths, phoneKeyOf: phoneKey });
  const lowCount = inventory.filter((i) => i.low).length;
  // Допуски: считаем только по работающим сотрудникам — отключённые учётные
  // записи не должны висеть в предупреждениях вечно.
  const activeProfileIds = new Set(allProfiles.filter((p) => p.is_active !== false).map((p) => String(p.id)));
  const docAlerts = calc.docsNeedingAttention(techDocs, { activeTechIds: activeProfileIds });
  const docsExpired = docAlerts.filter((d) => d.state === "expired").length;
  const docsSoon = docAlerts.filter((d) => d.state === "soon").length;
  const trainingAlerts = calc.trainingDue(training, { activeIds: activeProfileIds });
  const orderSoonCount = inventory.filter((i) => i.orderSoon).length;
  const usedByChem = Object.fromEntries(inventory.map((c) => [c.id, c.used]));
  const badBatches = calc.expiringBatches(chemicals, chemPurchases, usedByChem);
  const expiredBatches = badBatches.filter((b) => b.state === "expired").length;
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
  const tomorrow = parseIso(todayIso); tomorrow.setDate(tomorrow.getDate() + 1); const tomorrowIso = isoOf(tomorrow);
  const visibleForToday = (j) => canEditJobs || j.assigned_to === session.user.id;
  const todayJobs = jobs.filter((j) => j.scheduled_date === todayIso && j.status !== "canceled" && visibleForToday(j)).sort((a, b) => jobTime(a) - jobTime(b));
  const todayDone = todayJobs.filter((j) => j.status === "done");
  const todayActive = todayJobs.filter((j) => j.status !== "done");
  const todayRevenue = todayDone.reduce((s, j) => s + (Number(j.report_paid) || 0), 0);
  const todayProfit = todayDone.reduce((s, j) => s + jobEconomics(j).profit, 0);
  const todayPlan = todayJobs.reduce((s, j) => s + Math.max(0, ...(j.price_options || []).map((p) => Number(p.amount) || 0)), 0);
  // Хватит ли денег. Сводим то, что уже известно: остатки счетов, наличные
  // у бригад, ожидаемые поступления и долг по зарплате.
  const totalOnAccounts = accounts.reduce((s, a) => s + accountBalance(a.id), 0);
  const totalInHands = techs.reduce((s, t) => s + techCashOnHand(t.id), 0);
  const forecast = calc.cashForecast({
    onAccounts: totalOnAccounts,
    inHands: totalInHands,
    expected: doneJobs.filter((j) => Number(j.report_transfer) > 0 && !j.transfer_paid).reduce((s, j) => s + (Number(j.report_transfer) || 0), 0),
    payrollOwed: Math.max(0, payrollTotals.owed),
    monthlyOpex: calc.monthlyOpexAverage(opex),
  });
  const totalReceivables = doneJobs.filter((j) => Number(j.report_transfer) > 0 && !j.transfer_paid).reduce((s, j) => s + (Number(j.report_transfer) || 0), 0);
  const enRouteNow = activeJobs.filter((j) => jobWorkStage(j) === "en_route").length;
  const onSiteNow = activeJobs.filter((j) => jobWorkStage(j) === "on_site").length;
  const proofMissingToday = todayDone.filter((j) => !proofIsComplete(j.id)).length;
  const overdueJobs = activeJobs.filter((j) => j.scheduled_date && j.scheduled_date < todayIso && visibleForToday(j));
  const unassignedSoon = isAdmin ? activeJobs.filter((j) => !j.assigned_to && !j.executor_partner_id && j.scheduled_date && j.scheduled_date <= tomorrowIso) : [];
  const overdueTaskList = visibleTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayIso);
  const pendingDeposits = isAdmin ? deposits.filter((d) => d.status === "pending") : [];
  // Разнесение оклада и постоянных расходов на заявку. Прямая прибыль
  // (jobEconomics) остаётся прежней: по ней видно, окупает ли заявка сама себя.
  // Полная показывает, зарабатывает ли на ней компания после оклада и аренды.
  const allocFor = calc.allocationPerJob(jobs, { profiles: allProfiles, opex });
  const completedEconomics = doneJobs.map((job) => {
    const { labor, overhead } = allocFor(job);
    return { job, econ: calc.jobFullEconomics(job, { chemicals, purchases: chemPurchases, guaranteeCost: guaranteeCostOf(job), qrFeeRate, labor, overhead, helpers: calc.helpersTotal(job.id, jobHelpers) }) };
  });
  const totalJobProfit = completedEconomics.reduce((s, r) => s + r.econ.profit, 0);
  const totalFullProfit = completedEconomics.reduce((s, r) => s + r.econ.fullProfit, 0);
  const totalLabor = completedEconomics.reduce((s, r) => s + r.econ.labor, 0);
  const totalOverhead = completedEconomics.reduce((s, r) => s + r.econ.overhead, 0);
  const trueLossJobs = completedEconomics.filter((r) => r.econ.fullProfit < 0);
  // Длительность выездов. Отметки этапов писались давно, но их никто не смотрел.
  const durations = calc.durationStats(doneJobs);
  const fmtMin = (m) => (m === null ? "—" : m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);
  const totalJobRevenue = completedEconomics.reduce((s, r) => s + r.econ.revenue, 0);
  const averageJobMargin = totalJobRevenue > 0 ? Math.round(totalJobProfit / totalJobRevenue * 100) : 0;
  const lossJobs = completedEconomics.filter((r) => r.econ.profit < 0);
  const lostRevenue = canceledJobs.reduce((s, j) => s + Math.max(0, ...(j.price_options || []).map((p) => Number(p.amount) || 0)), 0);
  const openFollowups = followups.filter((f) => f.status !== "done");
  const dueFollowups = openFollowups.filter((f) => f.due_date && f.due_date <= todayIso);
  const qualityByJob = (jobId) => qualityChecks.find((q) => q.job_id === jobId);
  const qualityPending = doneJobs.filter((j) => !qualityByJob(j.id) && daysSince(j.reported_at || j.scheduled_date) >= 1);
  const qualityProblems = qualityChecks.filter((q) => q.status === "problem" || q.result === "complaint");
  const overdueTransfers = doneJobs.filter((j) => Number(j.report_transfer) > 0 && !j.transfer_paid && daysSince(j.reported_at || j.scheduled_date) >= 3);
  const recentLowFeedback = publicFeedback.filter((f) => Number(f.rating) <= 3 && daysSince(f.created_at) <= 14);
  const activeContracts = contracts.filter((c) => c.active !== false);
  const dueContracts = activeContracts.filter((c) => c.next_service_date && c.next_service_date <= todayIso);
  const upsellCandidates = doneJobs.filter((j) => daysSince(j.reported_at || j.scheduled_date) <= 120 && !followups.some((f) => f.job_id === j.id && f.kind === "upsell")).slice(0, 20);
  const ratingMonthStart = new Date(); ratingMonthStart.setDate(1); ratingMonthStart.setHours(0, 0, 0, 0); const ratingStartIso = isoOf(ratingMonthStart);
  const ratingJobs = jobs.filter((j) => (j.scheduled_date || "") >= ratingStartIso);
  const sourceRatingMap = {};
  ratingJobs.forEach((j) => {
    const label = (j.source || "Не указан").trim() || "Не указан"; const key = norm(label);
    if (!sourceRatingMap[key]) sourceRatingMap[key] = { key, label, total: 0, done: 0, canceled: 0, revenue: 0, profit: 0, spent: 0 };
    const row = sourceRatingMap[key]; row.total++; if (j.status === "canceled") row.canceled++;
    if (j.status === "done") { row.done++; row.revenue += Number(j.report_paid) || 0; row.profit += jobEconomics(j).profit; }
  });
  mktChannels.forEach((ch) => { const key = norm(ch.source_key); if (!key || !sourceRatingMap[key]) return; sourceRatingMap[key].spent += mktTopups.filter((t) => t.channel_id === ch.id && t.topup_date >= ratingStartIso).reduce((s, t) => s + (Number(t.amount) || 0), 0); });
  const sourceRatings = Object.values(sourceRatingMap).map((r) => ({ ...r, conversion: r.total ? Math.round(r.done / r.total * 100) : 0, avgCheck: r.done ? Math.round(r.revenue / r.done) : 0, roi: r.spent > 0 ? r.revenue / r.spent : null })).sort((a, b) => b.profit - a.profit);
  const managerRatingMap = {};
  ratingJobs.forEach((j) => {
    const id = j.created_by || "unknown"; const label = profileById(id)?.full_name || "Не указан";
    if (!managerRatingMap[id]) managerRatingMap[id] = { id, label, total: 0, done: 0, canceled: 0, revenue: 0, profit: 0 };
    const row = managerRatingMap[id]; row.total++; if (j.status === "canceled") row.canceled++;
    if (j.status === "done") { row.done++; row.revenue += Number(j.report_paid) || 0; row.profit += jobEconomics(j).profit; }
  });
  const managerRatings = Object.values(managerRatingMap).map((r) => ({ ...r, conversion: r.total ? Math.round(r.done / r.total * 100) : 0, avgCheck: r.done ? Math.round(r.revenue / r.done) : 0 })).sort((a, b) => b.profit - a.profit);
  // Сколько лидов ждут ответа. Первая стадия воронки = «ещё никто не взял».
  const leadSla = calc.leadSlaStats(leads, { firstStageId: leadStages[0]?.id || null });
  const dashboardAlerts = [
    overdueJobs.length ? { id: "overdue-jobs", label: "Просроченные заявки", value: overdueJobs.length, tab: "jobs", tone: "danger" } : null,
    unassignedSoon.length ? { id: "unassigned", label: "Не назначены на сегодня/завтра", value: unassignedSoon.length, tab: "jobs", tone: "warning" } : null,
    overdueTaskList.length ? { id: "tasks", label: "Просроченные задачи", value: overdueTaskList.length, tab: "tasks", tone: "danger" } : null,
    leadSla.lateReaction ? { id: "lead-sla", label: `Лиды без ответа дольше ${leadSla.reactionHours} ч`, value: leadSla.lateReaction, tab: "leads", tone: "danger" } : null,
    pendingDeposits.length ? { id: "cash", label: "Наличка ждёт подтверждения", value: pendingDeposits.length, tab: "cash", tone: "warning" } : null,
    isAdmin && lowCount ? { id: "stock", label: "Заканчиваются препараты", value: lowCount, tab: "stock", tone: "danger" } : null,
    // Предупреждение до того, как остаток стал критическим: по расходу видно,
    // что заказывать надо уже сейчас, иначе закупка пойдёт впопыхах.
    isAdmin && orderSoonCount ? { id: "stockorder", label: "Пора заказывать препараты", value: orderSoonCount, tab: "stock", tone: "warning" } : null,
    isAdmin && expiredBatches ? { id: "expiredchem", label: "Просроченные партии на складе", value: expiredBatches, tab: "stock", tone: "danger" } : null,
    isAdmin && badBatches.length - expiredBatches > 0 ? { id: "expiringchem", label: "Партии истекают в этом месяце", value: badBatches.length - expiredBatches, tab: "stock", tone: "warning" } : null,
    // Просроченный допуск — надзорный риск: штраф и остановка работ, а не
    // внутренний беспорядок. Поэтому красным и выше складских предупреждений.
    docsExpired ? { id: "docsexpired", label: "Просрочены допуски сотрудников", value: docsExpired, tab: "team", tone: "danger" } : null,
    docsSoon ? { id: "docssoon", label: "Допуски истекают в этом месяце", value: docsSoon, tab: "team", tone: "warning" } : null,
    trainingAlerts.length ? { id: "training", label: "Пора перепроверить обучение", value: trainingAlerts.length, tab: "team", tone: "warning" } : null,
    isAdmin && tenderOverdue ? { id: "tenders", label: "Просрочены работы по тендерам", value: tenderOverdue, tab: "tenders", tone: "danger" } : null,
    isAdmin && dueFollowups.length ? { id: "client-followups", label: "Пора связаться с клиентами", value: dueFollowups.length, tab: "retention", tone: "warning" } : null,
    isAdmin && qualityPending.length ? { id: "quality", label: "Ждут контроля качества", value: qualityPending.length, tab: "retention", tone: "warning" } : null,
    isAdmin && dueContracts.length ? { id: "contracts", label: "Пора создать плановые выезды", value: dueContracts.length, tab: "subscriptions", tone: "danger" } : null,
    isAdmin && overdueTransfers.length ? { id: "transfers", label: "Оплата просрочена более 3 дней", value: overdueTransfers.length, tab: "done", tone: "danger" } : null,
    isAdmin && qualityProblems.length ? { id: "complaints", label: "Есть проблемы по качеству", value: qualityProblems.length, tab: "retention", tone: "danger" } : null,
    isAdmin && recentLowFeedback.length ? { id: "low-feedback", label: "Низкие оценки клиентов за 14 дней", value: recentLowFeedback.length, tab: "retention", tone: "danger" } : null,
  ].filter(Boolean);
  const ownerSummaryText = [
    `KazDez · ${isoToRu(todayIso)}`,
    `Заявки: ${todayJobs.length}, выполнено ${todayDone.length}`,
    `Выручка: ${fmt(todayRevenue)} ₸`,
    `Прибыль: ${fmt(todayProfit)} ₸`,
    `Ожидаем оплату: ${fmt(totalReceivables)} ₸`,
    `В пути: ${enRouteNow}, на объектах: ${onSiteNow}`,
    `Требуют внимания: ${dashboardAlerts.length}`,
    proofMissingToday ? `Без полного подтверждения: ${proofMissingToday}` : "Все выполненные работы подтверждены",
  ].join("\n");
  const globalQ = globalSearch.trim().toLowerCase();
  const globalDigits = globalQ.replace(/\D/g, "");
  const includesGlobal = (...parts) => {
    const text = norm(parts.filter(Boolean).join(" "));
    const digits = parts.join(" ").replace(/\D/g, "");
    return !!globalQ && (text.includes(globalQ) || (globalDigits.length >= 3 && digits.includes(globalDigits)));
  };
  const globalResults = globalQ ? [
    ...jobs.filter((j) => includesGlobal(j.id, j.client_phone, j.contact_name, j.address, j.pest)).slice(0, 6).map((j) => ({ kind: "job", id: j.id, label: `${j.pest || "Заявка"} · ${j.client_phone || "без телефона"}`, meta: `${addressPlain(j.address)} · ${isoToRu(j.scheduled_date) || "без даты"}`, item: j })),
    ...(isAdmin ? leads.filter((l) => includesGlobal(l.name, l.phone, l.address)).slice(0, 4).map((l) => ({ kind: "lead", id: l.id, label: l.name || l.phone || "Клиент", meta: `Клиент · ${l.phone || l.address || ""}`, item: l })) : []),
    ...(isAdmin ? tenders.filter((t) => includesGlobal(t.contract_no, t.customer, t.title, t.address)).slice(0, 3).map((t) => ({ kind: "tender", id: t.id, label: t.customer || t.title || "Тендер", meta: `Тендер · ${t.contract_no || t.address || ""}`, item: t })) : []),
    ...(isAdmin ? partners.filter((p) => includesGlobal(p.name)).slice(0, 3).map((p) => ({ kind: "partner", id: p.id, label: p.name, meta: "Партнёр", item: p })) : []),
    ...(isAdmin ? chemicals.filter((c) => includesGlobal(c.name)).slice(0, 3).map((c) => ({ kind: "chemical", id: c.id, label: c.name, meta: "Склад · препарат", item: c })) : []),
    ...(isAdmin ? allProfiles.filter((p) => includesGlobal(p.full_name, p.phone)).slice(0, 3).map((p) => ({ kind: "profile", id: p.id, label: p.full_name || p.phone || "Сотрудник", meta: "Сотрудник", item: p })) : []),
  ].slice(0, 12) : [];
  function openGlobalResult(result) {
    setGlobalSearch(""); setGlobalSearchOpen(false);
    if (result.kind === "job") { setTab(result.item.status === "done" ? "done" : result.item.status === "canceled" ? "canceled" : "jobs"); setModal(result.item.status === "done" ? { kind: "view", job: result.item } : { kind: "edit", job: result.item }); }
    if (result.kind === "lead") setModal({ kind: "lead", lead: result.item });
    if (result.kind === "tender") setModal({ kind: "tender", tender: result.item });
    if (result.kind === "partner") setModal({ kind: "partnerJobs", partner: result.item });
    if (result.kind === "chemical") setTab("stock");
    if (result.kind === "profile") setTab("team");
  }
  // Счётчики: там, где число требует действия (просрочки, ожидание подтверждения),
  // и там, где владелец следит за объёмом — «Выполненные»/«Отменённые» нужны как
  // ежедневный показатель работы. Без счётчика оставлены только справочные разделы.
  const baseTabs = [
    { id: "today", icon: LayoutDashboard, label: `Сегодня${dashboardAlerts.length ? " · " + dashboardAlerts.length : ""}` },
    { id: "jobs", icon: ClipboardList, label: `Заявки${activeJobs.length ? " · " + activeJobs.length : ""}` },
    { id: "schedule", icon: CalendarClock, label: "График" },
    { id: "done", icon: CheckCircle2, label: `Выполненные${doneJobs.length ? " · " + doneJobs.length : ""}` },
    { id: "canceled", icon: XCircle, label: `Отменённые${canceledJobs.length ? " · " + canceledJobs.length : ""}` },
    { id: "tasks", icon: ListTodo, label: `Задачи${allOpenTasks ? " · " + allOpenTasks : ""}` },
    { id: "leads", icon: Contact, label: `Лиды${activeLeads ? " · " + activeLeads : ""}` },
    { id: "tenders", icon: Gavel, label: `Тендеры${tenderOverdue ? " · ⚠ " + tenderOverdue : ""}` },
    { id: "repeats", icon: RefreshCw, label: `Повторные выезды${jobs.filter((j) => j.repeat_state === "on_repeat").length ? " · " + jobs.filter((j) => j.repeat_state === "on_repeat").length : ""}` },
    { id: "retention", icon: ClipboardCheck, label: `Обзвон и качество${dueFollowups.length || qualityPending.length ? " · " + (dueFollowups.length + qualityPending.length) : ""}` },
    { id: "subscriptions", icon: Repeat2, label: `Абоненты${dueContracts.length ? " · " + dueContracts.length : ""}` },
    { id: "routes", icon: Route, label: "Маршруты" },
    { id: "growth", icon: TrendingUp, label: `Прибыль по заявкам${lossJobs.length ? " · ⚠ " + lossJobs.length : ""}` },
    { id: "finance", icon: Wallet, label: "Выручка и чек" },
    { id: "opex", icon: Landmark, label: "Счета и расходы" },
    { id: "cash", icon: Banknote, label: `Наличные от бригад${deposits.filter((d) => d.status === "pending").length ? " · " + deposits.filter((d) => d.status === "pending").length : ""}` },
    { id: "stock", icon: Package, label: `Склад${lowCount ? " · " + lowCount + " мало" : ""}` },
    { id: "team", icon: Users, label: "Сотрудники и доступы" },
    { id: "payroll", icon: Wallet, label: `Зарплата${payrollOwedCount ? " · " + payrollOwedCount : ""}` },
    { id: "partners", icon: Handshake, label: "Партнёры" },
    { id: "docs", icon: FileText, label: "Документы" },
    { id: "materials", icon: FolderOpen, label: "Материалы" },
    { id: "knowledge", icon: GraduationCap, label: "База знаний" },
    { id: "journal", icon: History, label: "Журнал" },
    { id: "trash", icon: Trash2, label: "Корзина" },
    { id: "myequip", icon: Wrench, label: "Моё оборудование" },
  ].filter((item) => isAdmin ? item.id !== "myequip" : canAccess(`tab.${item.id}`));
  // применяем сохранённый общий порядок (админ задаёт в Настройках). Новые вкладки — в конец.
  const savedOrder = Array.isArray(settings.tab_order) ? settings.tab_order : [];
  const tabs = savedOrder.length
    ? [...baseTabs].sort((a, b) => {
        const ia = savedOrder.indexOf(a.id), ib = savedOrder.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
    : baseTabs;
  // Группы названы по вопросу, на который отвечают, а не по внутренней терминологии.
  // Все четыре «денежных» раздела собраны в одну группу — раньше они были раскиданы
  // между «Результатами» и «Учётом», и приходилось вспоминать, в каком из них что лежит.
  const navGroups = [
    { label: "Ежедневная работа", ids: ["today", "jobs", "schedule", "routes", "tasks"] },
    { label: "Клиенты и возвраты", ids: ["leads", "retention", "subscriptions", "repeats"] },
    { label: "Деньги", ids: ["finance", "growth", "opex", "cash"] },
    { label: "Архив заявок", ids: ["done", "canceled"] },
    { label: "Команда и склад", ids: ["team", "payroll", "partners", "stock", "myequip"] },
  ];
  const moreNavGroup = { label: "Ещё разделы", ids: ["tenders", "docs", "materials", "knowledge", "journal", "trash"] };
  const mobileTabIds = (isAdmin ? ["today", "jobs", "leads", "routes"] : ["today", "jobs", "tasks", "cash", "tenders", "finance"]).filter((id) => tabs.some((item) => item.id === id)).slice(0, 4);
  const mobileTabs = mobileTabIds.map((id) => tabs.find((item) => item.id === id)).filter(Boolean);

  return (
    <div className={`kd-app ${sideOpen ? "side-open" : ""}`}>
      <div className="kd-scrim" onClick={() => setSideOpen(false)} />
      <aside className="kd-side">
        <div className="kd-hazard" />
        <div className="kd-brand">
          <div className="kd-logo"><Bug size={19} strokeWidth={2.4} /></div>
          <div><div className="kd-brand-name">KazDez</div><div className="kd-brand-sub">{ROLE_DEFINITIONS[profile?.role]?.label || "Сотрудник"} · {actorName}</div></div>
        </div>
        <nav className="kd-tabs">
          {navGroups.map((group) => {
            const groupTabs = tabs.filter((item) => group.ids.includes(item.id));
            if (!groupTabs.length) return null;
            return <div className="kd-navgroup" key={group.label}>
              <div className="kd-navlabel">{group.label}</div>
              {groupTabs.map((t) => (<button key={t.id} className={`kd-tab ${tab === t.id ? "on" : ""}`} onClick={() => { setTab(t.id); setSideOpen(false); }}>{t.icon ? <t.icon size={17} /> : null}<span className="kd-tab-lbl">{t.label}</span></button>))}
            </div>;
          })}
          {tabs.some((item) => moreNavGroup.ids.includes(item.id)) && <div className="kd-navgroup kd-navgroup-more">
            <button className={`kd-navmore ${moreNavOpen ? "on" : ""}`} onClick={() => { const next = !moreNavOpen; setMoreNavOpen(next); localStorage.setItem("kd-more-nav", next ? "1" : "0"); }}>
              <Menu size={16} /><span>Ещё разделы</span><ChevronRight size={15} />
            </button>
            {moreNavOpen && <div className="kd-navmore-list">{tabs.filter((item) => moreNavGroup.ids.includes(item.id)).map((t) => (
              <button key={t.id} className={`kd-tab ${tab === t.id ? "on" : ""}`} onClick={() => { setTab(t.id); setSideOpen(false); }}>{t.icon ? <t.icon size={17} /> : null}<span className="kd-tab-lbl">{t.label}</span></button>
            ))}</div>}
          </div>}
        </nav>
        <div className="kd-navfoot">
          <div className={`kd-connection ${online ? "online" : "offline"}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{online ? `На связи${lastLoadedAt ? ` · ${lastLoadedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Нет подключения"}</span></div>
          {canAccess("action.settings") && <button className="kd-tab" onClick={() => { loadCompanyImages(); setModal({ kind: "settings" }); setSideOpen(false); }}><Settings size={17} /><span className="kd-tab-lbl">Настройки</span></button>}
          <button className="kd-tab" onClick={() => supabase.auth.signOut()}><LogOut size={17} /><span className="kd-tab-lbl">Выйти</span></button>
        </div>
      </aside>

      <div className="kd-mainwrap">
        <header className="kd-topbar">
          <div className="kd-topleft">
            <button className="kd-burger" onClick={() => setSideOpen((v) => !v)} aria-label="Меню"><ClipboardList size={18} /></button>
            {/* Заголовок — чистое имя раздела без счётчика: цифра уже стоит в меню, дублировать её в h1 незачем. */}
            <h1 className="kd-pagetitle">{tab === "today" ? (isAdmin ? "Сегодня" : "Мой день") : TAB_LABELS[tab] || (tabs.find((t) => t.id === tab) || {}).label || ""}</h1>
          </div>
          <div className="kd-globalsearch" onBlur={() => setTimeout(() => setGlobalSearchOpen(false), 120)}>
            <Search size={16} />
            <input value={globalSearch} onFocus={() => setGlobalSearchOpen(true)} onChange={(e) => { setGlobalSearch(e.target.value); setGlobalSearchOpen(true); }} onKeyDown={(e) => e.key === "Escape" && setGlobalSearchOpen(false)} placeholder="Найти клиента, заявку, тендер…" />
            {globalSearch && <button onClick={() => setGlobalSearch("")} aria-label="Очистить"><X size={14} /></button>}
            {globalSearchOpen && globalQ && <div className="kd-globalresults">
              {globalResults.length === 0 && <div className="kd-globalempty">Ничего не найдено</div>}
              {globalResults.map((r) => <button key={`${r.kind}-${r.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => openGlobalResult(r)}>
                <span>{r.label}</span><small>{r.meta}</small>
              </button>)}
            </div>}
          </div>
          <div className="kd-tabactions">
            {installPrompt && <button className="kd-btn ghost kd-installbtn" onClick={installApplication}><Smartphone size={15} />Установить</button>}
            {offlineQueued > 0 && <button className="kd-btn ghost kd-syncbtn" disabled={!online || syncingOffline} onClick={syncOfflineQueue}><CloudUpload size={15} />{syncingOffline ? "Синхронизация…" : `Офлайн · ${offlineQueued}`}</button>}
            {/* Колокольчик показывает живые тревоги, а не хранимую ленту.
                «Просрочено 3 заявки» устаревает в тот момент, когда их закрыли,
                поэтому статус «прочитано» здесь только мешал бы: список должен
                отражать положение дел сейчас, а не то, что когда-то случилось. */}
            <div className="kd-notifications" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setNotificationOpen(false); }}>
              <button className={`kd-iconbtn kd-bell ${dashboardAlerts.length ? "has-new" : ""}`} onClick={() => setNotificationOpen((v) => !v)} title="Требуют внимания" aria-label="Требуют внимания">
                {dashboardAlerts.length ? <BellRing size={17} /> : <Bell size={17} />}
                {dashboardAlerts.length > 0 && <span>{dashboardAlerts.length}</span>}
              </button>
              {notificationOpen && <div className="kd-notification-panel">
                <div className="kd-notification-head"><div><strong>Требуют внимания</strong><span>{dashboardAlerts.length ? "сейчас, по данным приложения" : "всё под контролем"}</span></div></div>
                <div className="kd-notification-list">
                  {dashboardAlerts.length === 0
                    ? <div className="kd-globalempty">Ничего не горит</div>
                    : dashboardAlerts.map((a) => (
                        <button key={a.id} className={a.tone === "danger" ? "urgent" : "warning"} onClick={() => { setTab(a.tab); setNotificationOpen(false); }}>
                          <span className="kd-notification-dot" />
                          <span><strong>{a.label}</strong><small>{a.value} — открыть раздел</small></span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                </div>
              </div>}
            </div>
            {(tab === "jobs" || tab === "today") && canEditJobs && <button className="kd-btn primary" onClick={() => setModal({ kind: "new" })}><Plus size={15} />Новая заявка</button>}
            {tab === "subscriptions" && canEditJobs && <button className="kd-btn primary" onClick={() => setModal({ kind: "contract" })}><Plus size={15} />Абонент</button>}
            {tab === "retention" && canEditJobs && <button className="kd-btn primary" onClick={() => setModal({ kind: "followup" })}><Plus size={15} />Касание</button>}
            {tab === "stock" && canAccess("action.stock_edit") && <button className="kd-btn primary" onClick={() => setModal({ kind: "addchem" })}><Plus size={15} />Препарат</button>}
            {tab === "partners" && canEditPartners && <button className="kd-btn primary" onClick={() => setModal({ kind: "partner" })}><Plus size={15} />Партнёр</button>}
            {tab === "docs" && canEditDocs && <button className="kd-btn primary" onClick={() => setModal({ kind: "doc" })}><Plus size={15} />Документ</button>}
            {tab === "opex" && canManageCash && <button className="kd-btn primary" onClick={() => setModal({ kind: "opex" })}><Plus size={15} />Расход</button>}
            {canAccess(`tab.${tab}`) && ["growth", "finance", "journal"].includes(tab) && <button className="kd-btn ghost" onClick={exportExcel}><Download size={15} />Excel</button>}
            <button className="kd-iconbtn" disabled={loading} onClick={load} title="Обновить данные" aria-label="Обновить данные"><RefreshCw size={16} /></button>
          </div>
        </header>

        <nav className="kd-mobile-nav" aria-label="Основная навигация">
          {mobileTabs.map((item) => <button key={item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>{item.icon ? <item.icon size={19} /> : null}<span>{item.id === "today" && !isAdmin ? "Мой день" : TAB_LABELS_SHORT[item.id] || TAB_LABELS[item.id] || item.id}</span></button>)}
          <button onClick={() => setSideOpen(true)}><Menu size={19} /><span>Ещё</span></button>
        </nav>

      <main className="kd-main">

        {loading && <div className="kd-empty">Загрузка…</div>}
        {!loading && isAdmin && dataWarnings.length > 0 && <details className="kd-systemwarning"><summary><AlertTriangle size={17} />Не все данные загрузились · {dataWarnings.length}</summary><div>{dataWarnings.map((warning) => <span key={warning}>{warning}</span>)}<button className="kd-btn ghost sm" onClick={load}>Повторить загрузку</button></div></details>}

        {!loading && tab === "today" && (
          <div className="kd-today">
            <section className="kd-todayhero">
              <div>
                <div className="kd-eyebrow">{WEEKDAYS[new Date().getDay()]} · {isoToRu(todayIso)}</div>
                <h2>{isAdmin ? (dashboardAlerts.length ? `${dashboardAlerts.length} решений требуют внимания` : "Компания работает по плану") : (todayActive.length ? `Сегодня ${todayActive.length} выезд.` : "На сегодня активных выездов нет")}</h2>
                <p>{todayJobs.length ? `Всего ${todayJobs.length}, выполнено ${todayDone.length}. ${isAdmin ? `План дня — ${fmt(todayPlan)} ₸.` : "Следующий шаг виден в каждой заявке."}` : "Можно заняться задачами и подготовкой следующих выездов."}</p>
              </div>
              <div className="kd-todayhero-actions">
                {canEditJobs && <button className="kd-btn primary" onClick={() => setModal({ kind: "new" })}><Plus size={15} />Новая заявка</button>}
                {canAccess("tab.schedule") && <button className="kd-btn ghost" onClick={() => setTab("schedule")}><CalendarClock size={15} />Открыть график</button>}
                {canAccess("tab.routes") && todayJobs.length > 0 && <button className="kd-btn ghost" onClick={() => setTab("routes")}><Route size={15} />Маршруты дня</button>}
              </div>
            </section>

            <section className="kd-kpigrid">
              <button onClick={() => setTab("jobs")}><span>Заявок сегодня</span><strong>{todayJobs.length}</strong><small>{todayActive.length} ещё в работе</small></button>
              <button onClick={() => setTab("done")}><span>Выполнено</span><strong>{todayDone.length}</strong><small>{todayJobs.length ? Math.round(todayDone.length / todayJobs.length * 100) : 0}% плана по количеству</small></button>
              {isAdmin ? <button onClick={() => setTab("finance")}><span>Выручка сегодня</span><strong>{fmt(todayRevenue)} ₸</strong><small>план по заявкам {fmt(todayPlan)} ₸</small></button> : <button onClick={() => setTab("tasks")}><span>Мои задачи</span><strong>{myOpenTasks}</strong><small>{overdueTaskList.length} просрочено</small></button>}
              <button onClick={() => dashboardAlerts[0] && setTab(dashboardAlerts[0].tab)}><span>Требуют внимания</span><strong className={dashboardAlerts.length ? "danger" : "ok"}>{dashboardAlerts.length}</strong><small>{dashboardAlerts.length ? "открой список ниже" : "всё под контролем"}</small></button>
            </section>

            {/* Вторые четыре показателя владельца — компактной строкой, а не вторым рядом крупных плиток:
                восемь одинаковых KPI-карточек подряд перестают читать целиком. */}
            {isAdmin && <section className="kd-pulsestrip">
              <button onClick={() => setTab("finance")}><span>Прибыль сегодня</span><strong className={todayProfit < 0 ? "danger" : ""}>{fmt(todayProfit)} ₸</strong></button>
              <button onClick={() => setTab("done")}><span>Ждём оплату</span><strong>{fmt(totalReceivables)} ₸</strong>{overdueTransfers.length > 0 && <em>{overdueTransfers.length} просроч.</em>}</button>
              <button onClick={() => setTab("routes")}><span>Сейчас в поле</span><strong>{enRouteNow + onSiteNow}</strong><em>{enRouteNow} в пути · {onSiteNow} на объекте</em></button>
              <button onClick={() => setTab("done")}><span>Без фото-отчёта</span><strong className={proofMissingToday ? "danger" : "ok"}>{proofMissingToday}</strong></button>
              <button className="copy" onClick={() => copyText(ownerSummaryText, () => showToast("Сводка скопирована"))} title="Скопировать сводку за день">Сводка</button>
            </section>}

            <section className="kd-todaysection">
              <div className="kd-todaysection-head"><div><div className="kd-title">{isAdmin ? "SLA и решения" : "Требуют внимания"}</div><div className="kd-muted">{isAdmin ? "Автоматически рассчитанные просрочки, риски и контрольные точки" : "Только то, что нужно решить сейчас"}</div></div></div>
              {dashboardAlerts.length === 0 ? <div className="kd-allgood"><CheckCircle2 size={20} />Критичных предупреждений нет</div> : <div className="kd-alertgrid">
                {dashboardAlerts.map((a) => <button key={a.id} className={a.tone} onClick={() => setTab(a.tab)}><AlertTriangle size={18} /><span>{a.label}</span><strong>{a.value}</strong><ArrowRight size={16} /></button>)}
              </div>}
            </section>

            <section className="kd-todaysection">
              <div className="kd-todaysection-head"><div><div className="kd-title">Заявки на сегодня</div><div className="kd-muted">По времени, от ближайшей к поздней</div></div><button className="kd-btn ghost sm" onClick={() => setTab("jobs")}>Все заявки <ArrowRight size={14} /></button></div>
              {todayJobs.length === 0 ? <div className="kd-empty">На сегодня заявок нет.</div> : <div className="kd-todayjobs">
                {todayJobs.map((j) => {
                  const phone = String(j.client_phone || "").replace(/\D/g, "");
                  const directMap = yandexMapUrl(j.address);
                  const late = j.status !== "done" && Number.isFinite(jobTime(j)) && jobTime(j) < Date.now();
                  const stageKey = jobWorkStage(j); const stage = WORK_STAGE[stageKey];
                  return <div className={`kd-todayjob ${j.status === "done" ? "done" : ""} ${late ? "late" : ""}`} key={j.id}>
                    <div className="kd-todaytime">{j.scheduled_time || "—"}</div>
                    <div className="kd-todayjobmain">
                      <strong>{j.pest || "Заявка"}</strong><span>{addressPlain(j.address) || "Адрес не указан"}</span>{partnerNameOf(j) && <span className="kd-todaypartner"><Handshake size={12} />Партнёр: <b>{partnerNameOf(j)}</b></span>}<small><b style={{ color: stage.color }}>{stage.short}</b> · {techById(j.assigned_to)?.full_name || (j.executor_partner_id ? partnerById(j.executor_partner_id)?.name : "Не назначен")}</small>
                    </div>
                    <div className="kd-todayjobactions">
                      {phone && <a href={`tel:+${phone}`} title="Позвонить"><Phone size={16} /></a>}
                      {phone && <a className="wa" href={roleWhatsappUrl(j, isAdmin)} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={16} /></a>}
                      {j.address && <a href={directMap} target="_blank" rel="noreferrer" title="Открыть в Яндекс Картах"><MapPin size={16} /></a>}
                      <button onClick={() => openJobProof(j)} title="Фото, геолокация и подпись"><Camera size={16} />{proofIsComplete(j.id) ? "✓" : ""}</button>
                      {isFieldTech && j.status !== "done" && j.status !== "canceled" && ["new", "confirmed", "assigned"].includes(stageKey) && <button className="primary" onClick={() => setJobWorkStage(j, "en_route")}>В путь</button>}
                      {isFieldTech && stageKey === "en_route" && <button className="primary" onClick={() => setJobWorkStage(j, "on_site")}>На объекте</button>}
                      {isFieldTech && stageKey === "on_site" && <button className="primary" onClick={() => setModal({ kind: "report", job: j })}>Отчёт</button>}
                      <button onClick={() => setModal(j.status === "done" ? { kind: "view", job: j } : canEditJobs ? { kind: "edit", job: j } : { kind: "details", job: j })}>{j.status === "done" ? "Отчёт" : "Открыть"}</button>
                    </div>
                  </div>;
                })}
              </div>}
            </section>

            <section className="kd-todaysection">
              <div className="kd-todaysection-head"><div><div className="kd-title">Ближайшие задачи</div><div className="kd-muted">На сегодня и просроченные</div></div><button className="kd-btn ghost sm" onClick={() => setTab("tasks")}>Все задачи <ArrowRight size={14} /></button></div>
              {visibleTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date <= todayIso).length === 0 ? <div className="kd-allgood"><CheckCircle2 size={20} />Срочных задач нет</div> : <div className="kd-todaytasks">
                {visibleTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date <= todayIso).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 6).map((t) => <button key={t.id} className={t.due_date < todayIso ? "overdue" : ""} onClick={() => setModal({ kind: "task", task: t })}><span>{t.title}</span><small>{t.due_date < todayIso ? `Просрочено · ${isoToRu(t.due_date)}` : "Сегодня"} · {personName(t.assignee_id)}</small><ArrowRight size={15} /></button>)}
              </div>}
            </section>
          </div>
        )}

        {!loading && (tab === "jobs" || tab === "done") && (
          <div className="kd-searchrow">
            <div className="kd-searchbar">
              <Search size={16} className="kd-search-icon" />
              <input className="kd-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по телефону, адресу или виду вредителя…" />
              {search && <button className="kd-x" onClick={() => setSearch("")}><X size={15} /></button>}
            </div>
            {canEditJobs && techs.length > 0 && (
              <select className="kd-techselect" value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
                <option value="">Все дезинфекторы</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name || t.id.slice(0, 6)}</option>)}
              </select>
            )}
          </div>
        )}

        {!loading && tab === "jobs" && (
          <>
            {canEditJobs && (
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
                      <JobCard key={j.id} job={j} isAdmin={canEditJobs} onCert={() => certifyJob(j)} onAct={() => certifyAct(j)} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerNameOf(j)} partnerRepeat={j.brand === "partner" ? repeatLabel(partnerById(j.partner_id)?.repeat_policy) : ""} share={partnerShareAmt(j)}
                        onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                        onProof={() => openJobProof(j)} proofComplete={proofIsComplete(j.id)}
                        onCopyPublicLink={() => copyPublicJobLink(j)}
                        onStageChange={(stage) => setJobWorkStage(j, stage)}
                        onReport={() => setModal({ kind: "report", job: j })}
                        onAssign={() => setModal({ kind: "assign", job: j })}
                        onView={() => setModal({ kind: "view", job: j })}
                        onEdit={() => setModal({ kind: "edit", job: j })}
                        onRepeat={() => askConfirm(`Отправить заявку «${j.pest} · ${j.address}» на повтор? Она уйдёт во вкладку «Повторы».`, () => putOnRepeat(j), { danger: false, confirmLabel: "Да, на повтор" })}
                        onPayPartner={(paid) => markPartnerPaid(j, paid)}
                        onCompPaid={(paid) => markCompPaid(j, paid)}
                        onCancel={() => setModal({ kind: "cancelJob", job: j })}
                        onRestore={() => restoreCanceled(j)}
                  onTransferPaid={() => setModal({ kind: "transferPay", job: j })}
                  onTechExtras={() => setModal({ kind: "techExtras", job: j })}
                  executorName={partnerById(j.executor_partner_id)?.name}
                  onExecutorDone={() => setModal({ kind: "executorDone", job: j })}
                  onExecutorPaid={(paid) => askConfirm(paid ? `Отметить долю исполнителю выплаченной?` : `Снять отметку выплаты доли?`, () => toggleExecutorPaid(j, paid), { danger: false, confirmLabel: "Да" })}
                  onRequestEdit={() => setModal({ kind: "requestEdit", job: j })}
                  onApproveEdit={() => askConfirm(`Разрешить дезинфектору изменить отчёт по «${j.pest} · ${j.address}»? Свяжись с ним перед этим.`, () => approveReportEdit(j), { danger: false, confirmLabel: "Да, разрешить" })}
                  onRejectEdit={() => askConfirm(`Отклонить запрос на изменение отчёта?`, () => rejectReportEdit(j), { danger: false, confirmLabel: "Да, отклонить" })}
                        onHistory={() => { loadClientEvents(); setModal({ kind: "history", job: j }); }}
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
                  <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "offCalendar" })}>📅 Выходные</button>
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
                        {!off && c.id && (() => {
                          const load = calc.dayLoad(dayJobs.filter((j) => j.assigned_to === c.id), durations);
                          if (!load.known && load.busyMin === null) return null;
                          const pct = Math.min(100, Math.round(load.busyMin / load.workdayMinutes * 100));
                          return (
                            <div className="kd-tlload" title={`Занято примерно ${fmtMin(load.busyMin)} из ${fmtMin(load.workdayMinutes)}`}>
                              <div className="kd-tlloadbar"><div style={{ width: `${pct}%`, background: pct >= 100 ? "var(--rust)" : pct >= 80 ? "var(--amber)" : "var(--primary)" }} /></div>
                              <span>{load.freeMin > 0 ? `ещё ~${fmtMin(load.freeMin)}` : "день полон"}</span>
                            </div>
                          );
                        })()}
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
            <DateFilterBar filter={doneDateFilter} onChange={setDoneDateFilter} hide={["tomorrow"]} />
            {doneFiltered.length === 0 ? <div className="kd-empty">{doneJobs.length === 0 ? "Выполненных заявок пока нет." : "По этому поиску ничего не найдено."}</div> :
              doneGroups.map((g) => (
                <div key={g.key} className="kd-group">
                  <div className="kd-datehead"><span>{g.label}</span><span className="kd-datecount">{g.jobs.length}</span></div>
                  <div className="kd-list">
                    {g.jobs.map((j) => (
                      <JobCard key={j.id} job={j} isAdmin={canEditJobs} onCert={() => certifyJob(j)} onAct={() => certifyAct(j)} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerNameOf(j)} partnerRepeat={j.brand === "partner" ? repeatLabel(partnerById(j.partner_id)?.repeat_policy) : ""} share={partnerShareAmt(j)}
                      onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                      onProof={() => openJobProof(j)} proofComplete={proofIsComplete(j.id)}
                      onCopyPublicLink={() => copyPublicJobLink(j)}
                      onStageChange={(stage) => setJobWorkStage(j, stage)}
                      onReport={() => setModal({ kind: "report", job: j })}
                      onAssign={() => setModal({ kind: "assign", job: j })}
                      onView={() => setModal({ kind: "view", job: j })}
                      onEdit={() => setModal({ kind: "edit", job: j })}
                      onRepeat={() => askConfirm(`Отправить заявку «${j.pest} · ${j.address}» на повтор? Она уйдёт во вкладку «Повторы».`, () => putOnRepeat(j), { danger: false, confirmLabel: "Да, на повтор" })}
                      onPayPartner={(paid) => markPartnerPaid(j, paid)}
                        onCompPaid={(paid) => markCompPaid(j, paid)}
                        onCancel={() => setModal({ kind: "cancelJob", job: j })}
                        onRestore={() => restoreCanceled(j)}
                  onTransferPaid={() => setModal({ kind: "transferPay", job: j })}
                  onTechExtras={() => setModal({ kind: "techExtras", job: j })}
                  executorName={partnerById(j.executor_partner_id)?.name}
                  onExecutorDone={() => setModal({ kind: "executorDone", job: j })}
                  onExecutorPaid={(paid) => askConfirm(paid ? `Отметить долю исполнителю выплаченной?` : `Снять отметку выплаты доли?`, () => toggleExecutorPaid(j, paid), { danger: false, confirmLabel: "Да" })}
                  onRequestEdit={() => setModal({ kind: "requestEdit", job: j })}
                  onApproveEdit={() => askConfirm(`Разрешить дезинфектору изменить отчёт по «${j.pest} · ${j.address}»? Свяжись с ним перед этим.`, () => approveReportEdit(j), { danger: false, confirmLabel: "Да, разрешить" })}
                  onRejectEdit={() => askConfirm(`Отклонить запрос на изменение отчёта?`, () => rejectReportEdit(j), { danger: false, confirmLabel: "Да, отклонить" })}
                      onHistory={() => { loadClientEvents(); setModal({ kind: "history", job: j }); }}
                        onOpenDetails={() => setModal({ kind: "details", job: j })}
                      onDelete={() => askConfirm(`Удалить заявку «${j.pest} · ${j.address}»? Она уйдёт в корзину, восстановить можно будет оттуда.`, () => deleteJob(j))} />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {!loading && tab === "cash" && !canManageCash && (
          <div className="kd-list">
            <div className="kd-card">
              <div className="kd-section">Наличные на руках</div>
              {techOpening(session.user.id).bal > 0 && <div className="kd-row"><span>Начальный остаток{techOpening(session.user.id).date ? ` (с ${isoToRu(techOpening(session.user.id).date)})` : ""}</span><strong>{fmt(techOpening(session.user.id).bal)} ₸</strong></div>}
              <div className="kd-row"><span>Собрано с заявок</span><strong>{fmt(techCashCollected(session.user.id))} ₸</strong></div>
              <div className="kd-row"><span>Уже внесено (подтверждено)</span><strong style={{ color: "var(--primary-d)" }}>{fmt(techDepositedConfirmed(session.user.id))} ₸</strong></div>
              {techDepositedPending(session.user.id) > 0 && <div className="kd-row"><span>Ожидает подтверждения</span><strong style={{ color: "#B4650B" }}>{fmt(techDepositedPending(session.user.id))} ₸</strong></div>}
              <div className="kd-row total"><span>На руках сейчас</span><strong style={{ color: "var(--primary-d)", fontSize: 17 }}>{fmt(techCashOnHand(session.user.id))} ₸</strong></div>
              <button className="kd-btn primary wide" disabled={techCashOnHand(session.user.id) <= 0} onClick={() => setModal({ kind: "deposit", max: techCashOnHand(session.user.id) })} style={{ marginTop: 12 }}><Banknote size={16} />Внести через банкомат</button>
            </div>
            {(techBonusTotal(session.user.id) > 0 || techTravelTotal(session.user.id) > 0) && (
              <div className="kd-card">
                <div className="kd-section">Мои начисления</div>
                <div className="kd-row"><span>🎁 Бонусы — начислено всего</span><strong style={{ color: "var(--violet)" }}>{fmt(techBonusTotal(session.user.id))} ₸</strong></div>
                <div className="kd-row"><span>⛽ Дорожные (ГСМ) — начислено всего</span><strong style={{ color: "var(--violet)" }}>{fmt(techTravelTotal(session.user.id))} ₸</strong></div>
                <div className="kd-muted" style={{ marginTop: 8 }}>Начисления по твоим заявкам. Выплаты оформляет админ.</div>
              </div>
            )}
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

        {!loading && tab === "cash" && canManageCash && (
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
              // если ревизия была — в карточке показываем движение от неё, а не за всю историю
              const lastRevision = techCashRevisions(t.id)[0];
              const collectedSince = lastRevision
                ? jobs.filter((j) => String(j.assigned_to) === String(t.id) && j.status === "done" && j.scheduled_date > lastRevision.event_date).reduce((s, j) => s + (Number(j.report_cash) || 0), 0)
                : 0;
              return (
                <div key={t.id} className="kd-card">
                  <div className="kd-card-head">
                    <div className="kd-pest">{t.full_name || "(без имени)"}</div>
                    <strong style={{ fontSize: 16, color: onHand > 0 ? "#B4650B" : "var(--muted)" }}>{fmt(onHand)} ₸ на руках</strong>
                  </div>
                  <div className="kd-meta">
                    {lastRevision && <><span>Ревизия {isoToRu(lastRevision.event_date)}: {fmt(lastRevision.balance_after)} ₸</span><span>·</span></>}
                    <span>Собрано{lastRevision ? " после" : ""}: {fmt(lastRevision ? collectedSince : techCashCollected(t.id))} ₸</span><span>·</span>
                    <span>Внесено: {fmt(techDepositedConfirmed(t.id))} ₸</span>
                    {pending > 0 && <><span>·</span><span style={{ color: "#B4650B" }}>в ожидании: {fmt(pending)} ₸</span></>}
                  </div>
                  <div className="kd-actions">
                    <button className="kd-btn primary sm" onClick={() => setModal({ kind: "cashRevision", tech: t })}><ClipboardCheck size={13} />Ревизия кассы</button>
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
            {leadSla.open > 0 && (
              <div className="kd-kpigrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginBottom: 12 }}>
                <div className="kd-kpicard"><span>В работе</span><strong>{leadSla.open}</strong><small>не превратились в заявку</small></div>
                <div className="kd-kpicard"><span>Без ответа дольше {leadSla.reactionHours} ч</span><strong className={leadSla.lateReaction ? "neg" : ""}>{leadSla.lateReaction}</strong><small>клиент уходит к тем, кто перезвонил</small></div>
                <div className="kd-kpicard"><span>Зависли дольше {leadSla.staleDays} дн.</span><strong className={leadSla.stale ? "neg" : ""}>{leadSla.stale}</strong><small>взяли в работу и забыли</small></div>
              </div>
            )}
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
                          {(() => {
                            const h = calc.leadWaitingHours(l);
                            if (h === null) return null;
                            const late = String(l.stage_id) === String(leadStages[0]?.id) ? h >= leadSla.reactionHours : h >= leadSla.staleDays * 24;
                            return <span className={late ? "kd-flag warn" : "kd-muted"} style={{ fontSize: 11, marginLeft: 8 }}>{h < 24 ? `ждёт ${h} ч` : `ждёт ${Math.floor(h / 24)} дн.`}</span>;
                          })()}
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
                {canEditTenders && <button className="kd-btn primary" onClick={() => setModal({ kind: "tender" })}><Plus size={15} />Новый тендер</button>}
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
                  {canEditTenders && <div className="kd-actions">
                    <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "tender", tender: t })}><Pencil size={13} />Изменить</button>
                    <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить тендер «${t.contract_no || t.title || ""}»? Вместе с обеспечениями и графиком.`, () => removeTender(t))}><Trash2 size={13} />Удалить</button>
                  </div>}
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
                <JobCard key={j.id} job={j} isAdmin={canEditJobs} onCert={() => certifyJob(j)} onAct={() => certifyAct(j)} assignedName={techById(j.assigned_to)?.full_name} partnerName={partnerNameOf(j)} partnerRepeat="" share={partnerShareAmt(j)}
                  onCopy={() => copyText(buildMsg(j, brandHeaderOf(j)), () => showToast("Текст скопирован"))}
                  onProof={() => openJobProof(j)} proofComplete={proofIsComplete(j.id)}
                  onCopyPublicLink={() => copyPublicJobLink(j)}
                  onStageChange={(stage) => setJobWorkStage(j, stage)}
                  onReport={() => setModal({ kind: "report", job: j })}
                  onAssign={() => setModal({ kind: "assign", job: j })}
                  onView={() => setModal({ kind: "view", job: j })}
                  onEdit={() => setModal({ kind: "edit", job: j })}
                  onRepeat={() => askConfirm(`Отправить заявку «${j.pest} · ${j.address}» на повтор? Она уйдёт во вкладку «Повторы».`, () => putOnRepeat(j), { danger: false, confirmLabel: "Да, на повтор" })}
                  onPayPartner={(paid) => markPartnerPaid(j, paid)}
                  onCompPaid={(paid) => markCompPaid(j, paid)}
                  onCancel={() => setModal({ kind: "cancelJob", job: j })}
                  onRestore={() => restoreCanceled(j)}
                  onTransferPaid={() => setModal({ kind: "transferPay", job: j })}
                  onTechExtras={() => setModal({ kind: "techExtras", job: j })}
                  executorName={partnerById(j.executor_partner_id)?.name}
                  onExecutorDone={() => setModal({ kind: "executorDone", job: j })}
                  onExecutorPaid={(paid) => askConfirm(paid ? `Отметить долю исполнителю выплаченной?` : `Снять отметку выплаты доли?`, () => toggleExecutorPaid(j, paid), { danger: false, confirmLabel: "Да" })}
                  onRequestEdit={() => setModal({ kind: "requestEdit", job: j })}
                  onApproveEdit={() => askConfirm(`Разрешить дезинфектору изменить отчёт по «${j.pest} · ${j.address}»? Свяжись с ним перед этим.`, () => approveReportEdit(j), { danger: false, confirmLabel: "Да, разрешить" })}
                  onRejectEdit={() => askConfirm(`Отклонить запрос на изменение отчёта?`, () => rejectReportEdit(j), { danger: false, confirmLabel: "Да, отклонить" })}
                  onHistory={() => { loadClientEvents(); setModal({ kind: "history", job: j }); }}
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

        {!loading && tab === "growth" && (
          <div className="kd-stage2">
            <div className="kd-kpigrid">
              <div className="kd-kpicard"><span>Прибыль по заявкам</span><strong className={totalJobProfit >= 0 ? "pos" : "neg"}>{fmt(totalJobProfit)} ₸</strong><small>без общих операционных расходов</small></div>
              <div className="kd-kpicard"><span>Средняя маржа</span><strong>{averageJobMargin}%</strong><small>{completedEconomics.length} выполненных заявок</small></div>
              <div className="kd-kpicard"><span>Убыточные заявки</span><strong className={lossJobs.length ? "neg" : "pos"}>{lossJobs.length}</strong><small>нужно проверить расходы и цену</small></div>
              <div className="kd-kpicard"><span>Потерянная выручка</span><strong className="neg">{fmt(lostRevenue)} ₸</strong><small>{canceledJobs.length} отменённых заявок</small></div>
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section" style={{ marginTop: 0 }}>С учётом труда и постоянных расходов</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>Прибыль выше — прямая: выручка минус препараты, комиссия, доли партнёров и бонусы. Она не знает про оклады и аренду, поэтому всегда выглядит бодрее, чем есть на самом деле.</div>
              <div className="kd-row"><span>Прямая прибыль по заявкам</span><strong>{fmt(totalJobProfit)} ₸</strong></div>
              <div className="kd-row"><span>Оклады, разнесённые на заявки</span><strong style={{ color: "var(--rust)" }}>− {fmt(totalLabor)} ₸</strong></div>
              <div className="kd-row"><span>Постоянные расходы (аренда, реклама, связь)</span><strong style={{ color: "var(--rust)" }}>− {fmt(totalOverhead)} ₸</strong></div>
              <div className="kd-row total"><span>Реальная прибыль</span><strong style={{ color: totalFullProfit >= 0 ? "var(--primary-d)" : "var(--rust)" }}>{fmt(totalFullProfit)} ₸</strong></div>
              {trueLossJobs.length > lossJobs.length && (
                <div className="kd-flag warn" style={{ marginTop: 10 }}>
                  Убыточных заявок на самом деле {trueLossJobs.length}, а не {lossJobs.length}: остальные не окупают труд и постоянные расходы
                </div>
              )}
              <div className="kd-muted" style={{ marginTop: 10 }}>Оклад делится на выполненные заявки того же дезинфектора за месяц. Постоянные расходы — поровну на все заявки месяца: аренда не растёт от того, что заявка дороже. Оклад задаётся в карточке сотрудника, расходы — в «Счетах и расходах».</div>
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section" style={{ marginTop: 0 }}>Сколько занимает работа</div>
              {durations.measured === 0 ? (
                <div className="kd-muted">Пока не по чему считать: нужны отметки «В путь» и «На объекте» в заявке. Дезинфекторы жмут их в поле — статистика наберётся сама.</div>
              ) : (<>
                <div className="kd-kpigrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                  <div className="kd-kpicard"><span>В пути</span><strong>{fmtMin(durations.avgTravel)}</strong><small>в среднем до объекта</small></div>
                  <div className="kd-kpicard"><span>На объекте</span><strong>{fmtMin(durations.avgOnSite)}</strong><small>сама обработка</small></div>
                  <div className="kd-kpicard"><span>Полный выезд</span><strong>{fmtMin(durations.avgTotal)}</strong><small>от выхода до отчёта</small></div>
                </div>
                {durations.byPest.length > 0 && (
                  <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr .8fr 1fr 1fr", marginTop: 14 }}><span>Вид</span><span>Замеров</span><span>На объекте</span><span>Полный выезд</span></div>
                )}
                {durations.byPest.map((p) => (
                  <div className="kd-ledgerrow" key={p.pest} style={{ gridTemplateColumns: "1.6fr .8fr 1fr 1fr" }}>
                    <span className="kd-ledgername">{p.pest}</span>
                    <span>{p.jobs}</span>
                    <span>{fmtMin(p.avgOnSite)}</span>
                    <strong>{fmtMin(p.avgTotal)}</strong>
                  </div>
                ))}
                <div className="kd-muted" style={{ marginTop: 10 }}>Посчитано по {durations.measured} из {durations.doneJobs} выполненных заявок — только там, где есть отметки этапов. Промежутки длиннее 12 часов отброшены: обычно это забытая кнопка, а не реальный выезд.</div>
              </>)}
            </div>

            <div className="kd-stage2grid">
              <section className="kd-card">
                <div className="kd-stage2head"><div><div className="kd-title">Юнит-экономика заявок</div><div className="kd-muted">Выручка минус все прямые расходы</div></div><TrendingUp size={20} /></div>
                {completedEconomics.length === 0 && <div className="kd-empty">Выполненных заявок пока нет.</div>}
                <div className="kd-metrictable">
                  {completedEconomics.sort((a, b) => a.econ.profit - b.econ.profit).slice(0, 30).map(({ job, econ }) => <button key={job.id} onClick={() => setModal({ kind: "economics", job, economics: econ })}>
                    <span><strong>{job.pest}</strong><small>{isoToRu(job.scheduled_date)} · {job.client_phone}</small></span>
                    <span className="right"><strong className={econ.profit >= 0 ? "pos" : "neg"}>{fmt(econ.profit)} ₸</strong><small>маржа {econ.margin}%</small></span><ArrowRight size={15} />
                  </button>)}
                </div>
              </section>
              <section className="kd-card">
                <div className="kd-stage2head"><div><div className="kd-title">Рейтинг источников</div><div className="kd-muted">Текущий месяц · сортировка по прибыли</div></div><Star size={20} /></div>
                {sourceRatings.length === 0 && <div className="kd-empty">Нет заявок за текущий месяц.</div>}
                <div className="kd-ranktable"><div className="head"><span># / Источник</span><span>Конверсия</span><span>Чек</span><span>ROI</span><span>Прибыль</span></div>
                  {sourceRatings.map((r, i) => <div key={r.key}><span><b>{i + 1}</b> {r.label}<small>{r.total} обращ.</small></span><strong>{r.conversion}%</strong><strong>{fmt(r.avgCheck)} ₸</strong><strong>{r.roi == null ? "—" : r.roi.toFixed(1) + "×"}</strong><strong className={r.profit >= 0 ? "pos" : "neg"}>{fmt(r.profit)} ₸</strong></div>)}
                </div>
              </section>
            </div>
            <section className="kd-card">
              <div className="kd-stage2head"><div><div className="kd-title">Рейтинг менеджеров</div><div className="kd-muted">Кто создаёт заявки, сколько закрывает и с какой прибылью</div></div><Users size={20} /></div>
              {managerRatings.length === 0 && <div className="kd-empty">Нет данных за текущий месяц.</div>}
              <div className="kd-ranktable"><div className="head"><span># / Менеджер</span><span>Заявки</span><span>Конверсия</span><span>Средний чек</span><span>Прибыль</span></div>
                {managerRatings.map((r, i) => <div key={r.id}><span><b>{i + 1}</b> {r.label}<small>{r.canceled} отмен</small></span><strong>{r.total}</strong><strong>{r.conversion}%</strong><strong>{fmt(r.avgCheck)} ₸</strong><strong className={r.profit >= 0 ? "pos" : "neg"}>{fmt(r.profit)} ₸</strong></div>)}
              </div>
            </section>
          </div>
        )}

        {!loading && tab === "retention" && (
          <div className="kd-stage2">
            <div className="kd-kpigrid">
              <div className="kd-kpicard"><span>Касания на сегодня</span><strong className={dueFollowups.length ? "neg" : "pos"}>{dueFollowups.length}</strong><small>{openFollowups.length} всего открыто</small></div>
              <div className="kd-kpicard"><span>Контроль качества</span><strong>{qualityPending.length}</strong><small>ожидают звонка</small></div>
              <div className="kd-kpicard"><span>Средняя оценка</span><strong>{qualityChecks.filter((q) => q.rating).length ? (qualityChecks.reduce((s, q) => s + (Number(q.rating) || 0), 0) / qualityChecks.filter((q) => q.rating).length).toFixed(1) : "—"}</strong><small>по ответившим клиентам</small></div>
              <div className="kd-kpicard"><span>Допродажи</span><strong>{upsellCandidates.length}</strong><small>актуальных возможностей</small></div>
            </div>

            <section className="kd-card">
              <div className="kd-stage2head"><div><div className="kd-title">Повторные касания</div><div className="kd-muted">Просроченные и запланированные звонки</div></div><CalendarClock size={20} /></div>
              {openFollowups.length === 0 && <div className="kd-empty">Касаний пока нет. Добавь их из отменённого клиента или вручную.</div>}
              <div className="kd-followlist">{openFollowups.map((f) => {
                const phone = String(f.phone || "").replace(/\D/g, ""); const overdue = f.due_date && f.due_date < todayIso;
                return <div key={f.id} className={overdue ? "overdue" : ""}><div><strong>{f.client_name || f.phone}</strong><span>{isoToRu(f.due_date)} · {({ lost: "возврат клиента", quality: "качество", review: "отзыв", upsell: "допродажа", contract: "абонент" })[f.kind] || f.kind}</span>{f.note && <small>{f.note}</small>}</div><div className="actions">{phone && <a className="kd-btn wa sm" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>}<button className="kd-btn ghost sm" onClick={() => setModal({ kind: "followup", followup: f })}>Изменить</button><button className="kd-btn primary sm" onClick={() => setFollowupDone(f)}>Готово</button></div></div>;
              })}</div>
            </section>

            {recentLowFeedback.length > 0 && (
              <section className="kd-card">
                <div className="kd-stage2head">
                  <div>
                    <div className="kd-title">Низкие оценки · {recentLowFeedback.length}</div>
                    <div className="kd-muted">Оценка 3 и ниже за последние 14 дней. Пока не перезвонили — это не разобранная жалоба.</div>
                  </div>
                </div>
                <div className="kd-followlist">
                  {recentLowFeedback.map((f) => {
                    const job = jobs.find((j) => String(j.id) === String(f.job_id));
                    const planned = openFollowups.some((x) => String(x.job_id) === String(f.job_id));
                    return (
                      <div key={f.id}>
                        <div>
                          <strong>{f.rating}/5 · {job?.contact_name || job?.client_phone || "клиент"}</strong>
                          <span>
                            {isoToRu(String(f.created_at).slice(0, 10))}
                            {job?.pest ? ` · ${job.pest}` : ""}
                            {job?.assigned_to ? ` · ${techById(job.assigned_to)?.full_name || ""}` : ""}
                            {f.comment ? ` · «${f.comment}»` : ""}
                          </span>
                        </div>
                        <div className="kd-actions">
                          {planned
                            ? <span className="kd-muted">звонок запланирован</span>
                            : canEditJobs && job && <button className="kd-btn primary sm" onClick={() => setModal({ kind: "followup", job, defaultKind: "quality" })}>Запланировать звонок</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {happy.length > 0 && (
              <section className="kd-card">
                <div className="kd-stage2head">
                  <div>
                    <div className="kd-title">Довольные клиенты · {happy.length}</div>
                    <div className="kd-muted">Оценка 4–5 за последнюю неделю. Просьба об отзыве на картах прямо приводит новых клиентов — и уместна, пока впечатление свежее.</div>
                  </div>
                </div>
                <div className="kd-followlist">
                  {happy.map(({ feedback: f, job }) => {
                    const name = job.contact_name || job.client_name || "";
                    const text = reviewRequestMsg(name, settings.review_link || "");
                    const link = waLink(job.client_phone, text);
                    return (
                      <div key={f.id}>
                        <div>
                          <strong>{f.rating}/5 · {name || job.client_phone}</strong>
                          <span>{isoToRu(String(f.created_at).slice(0, 10))}{job.pest ? ` · ${job.pest}` : ""}</span>
                        </div>
                        <div className="kd-actions">
                          {link && <a className="kd-btn primary sm" href={link} target="_blank" rel="noreferrer">Попросить отзыв</a>}
                          <button className="kd-btn ghost sm" onClick={() => copyText(text, () => showToast("Текст скопирован"))}>Копировать</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!settings.review_link && <div className="kd-muted" style={{ marginTop: 8 }}>Ссылку на страницу отзывов (2ГИС или Карты) можно вписать в Настройках — тогда она подставится в текст.</div>}
              </section>
            )}

            <section className="kd-card">
              <div className="kd-stage2head">
                <div>
                  <div className="kd-title">Не обращались дольше {dormantMonths} мес. · {dormant.length}</div>
                  <div className="kd-muted">Уже платили, адрес известен, сезон повторяется — самый дешёвый источник заказов. Сверху те, кого выгоднее вернуть.</div>
                </div>
                <SortBar value={String(dormantMonths)} onChange={(v) => setDormantMonths(Number(v))}
                  options={[["6", "6 мес."], ["9", "9 мес."], ["12", "год"], ["24", "2 года"]]} />
              </div>
              {dormant.length === 0 && <div className="kd-empty">Все клиенты обращались за последние {dormantMonths} мес. Либо срок слишком большой — попробуй короче.</div>}
              <div className="kd-followlist">
                {dormant.slice(0, 40).map((c) => {
                  const link = waLink(c.phone, winbackMsg(c));
                  return (
                    <div key={c.key}>
                      <div>
                        <strong>{c.name || c.phone}</strong>
                        <span>
                          последняя обработка {isoToRu(c.lastDone)} · {c.monthsSince} мес. назад
                          {c.pest ? ` · ${c.pest}` : ""} · заявок {c.done} на {fmt(c.revenue)} ₸
                        </span>
                      </div>
                      <div className="kd-actions">
                        {link && <a className="kd-btn primary sm" href={link} target="_blank" rel="noreferrer">Написать</a>}
                        <button className="kd-btn ghost sm" onClick={() => copyText(winbackMsg(c), () => showToast("Текст скопирован"))}>Копировать текст</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {dormant.length > 40 && <div className="kd-muted" style={{ marginTop: 8 }}>Показаны первые 40 из {dormant.length} — по убыванию выручки.</div>}
            </section>

            <div className="kd-stage2grid">
              <section className="kd-card"><div className="kd-stage2head"><div><div className="kd-title">Потерянные клиенты</div><div className="kd-muted">Отменённые заявки без запланированного возврата</div></div><UserRoundX size={20} /></div>
                <div className="kd-compactlist">{canceledJobs.filter((j) => !openFollowups.some((f) => f.job_id === j.id && f.kind === "lost")).slice(0, 15).map((j) => <div key={j.id}><span><strong>{j.client_phone}</strong><small>{j.cancel_reason || "Причина не указана"} · {j.pest}</small></span><button className="kd-btn ghost sm" onClick={() => setModal({ kind: "followup", job: j, defaultKind: "lost" })}>Вернуть</button></div>)}</div>
              </section>
              <section className="kd-card"><div className="kd-stage2head"><div><div className="kd-title">Контроль качества</div><div className="kd-muted">После выполненной обработки</div></div><ClipboardCheck size={20} /></div>
                <div className="kd-compactlist">{qualityPending.slice(0, 15).map((j) => <div key={j.id}><span><strong>{j.client_phone} · {j.pest}</strong><small>{isoToRu(j.scheduled_date)} · {addressPlain(j.address)}</small></span><button className="kd-btn primary sm" onClick={() => setModal({ kind: "quality", job: j })}>Проверить</button></div>)}</div>
              </section>
            </div>

            {qualityChecks.length > 0 && <section className="kd-card"><div className="kd-stage2head"><div><div className="kd-title">Результаты контроля и отзывы</div><div className="kd-muted">Оценки, проблемы и готовые запросы отзывов</div></div><Star size={20} /></div>
              <div className="kd-followlist">{qualityChecks.slice(0, 20).map((q) => { const job = jobs.find((j) => j.id === q.job_id); if (!job) return null; const phone = String(job.client_phone || "").replace(/\D/g, ""); const reviewText = `Здравствуйте! Спасибо, что выбрали KazDez. Будем благодарны, если вы оставите отзыв о нашей работе: ${q.review_url || ""}`; return <div key={q.id}><div><strong>{job.client_phone} · оценка {q.rating || "—"}/5</strong><span>{({ positive: "всё хорошо", repeat: "нужен повтор", complaint: "претензия", no_answer: "не ответил" })[q.result] || q.result}</span>{q.note && <small>{q.note}</small>}</div><div className="actions"><button className="kd-btn ghost sm" onClick={() => setModal({ kind: "quality", job })}>Изменить</button>{q.review_requested && q.review_url && phone && <a className="kd-btn wa sm" href={`https://wa.me/${phone}?text=${encodeURIComponent(reviewText)}`} target="_blank" rel="noreferrer"><Star size={14} />Запросить отзыв</a>}</div></div>; })}</div>
            </section>}

            <section className="kd-card"><div className="kd-stage2head"><div><div className="kd-title">Автоматические допродажи</div><div className="kd-muted">Предложение определяется по виду услуги и объекту</div></div><Sparkles size={20} /></div>
              <div className="kd-upsellgrid">{upsellCandidates.map((j) => <div key={j.id}><div><strong>{j.client_phone} · {j.pest}</strong><span>Предложить: {upsellFor(j)}</span></div><div className="actions"><a className="kd-btn wa sm" href={upsellWhatsappUrl(j)} target="_blank" rel="noreferrer"><MessageCircle size={14} />Предложить</a><button className="kd-btn ghost sm" onClick={() => setModal({ kind: "followup", job: j, defaultKind: "upsell" })}>На потом</button></div></div>)}</div>
            </section>
          </div>
        )}

        {!loading && tab === "subscriptions" && (
          <div className="kd-stage2">
            <div className="kd-kpigrid">
              <div className="kd-kpicard"><span>Активных договоров</span><strong>{activeContracts.length}</strong><small>регулярные клиенты</small></div>
              <div className="kd-kpicard"><span>Пора создать заявку</span><strong className={dueContracts.length ? "neg" : "pos"}>{dueContracts.length}</strong><small>дата уже наступила</small></div>
              <div className="kd-kpicard"><span>Плановая выручка</span><strong>{fmt(activeContracts.reduce((s, c) => s + (Number(c.price) || 0), 0))} ₸</strong><small>один цикл всех договоров</small></div>
              <div className="kd-kpicard"><span>Неактивных</span><strong>{contracts.length - activeContracts.length}</strong><small>приостановленные договоры</small></div>
            </div>
            {contracts.length === 0 && <div className="kd-empty">Абонентских договоров нет. Добавь первый договор кнопкой «+ Абонент».</div>}
            <div className="kd-contractgrid">{contracts.map((c) => { const due = c.active !== false && c.next_service_date <= todayIso; return <div className={`kd-card ${due ? "low" : ""}`} key={c.id}><div className="kd-card-head"><div className="kd-pest">{c.client_name}</div><span className="kd-badge" style={{ color: c.active !== false ? "#0E7C66" : "#6E7871", background: c.active !== false ? "#E4F3EE" : "#F0F0EE" }}>{c.active !== false ? "активен" : "пауза"}</span></div><div className="kd-addr">{c.address}</div><div className="kd-row"><span>Услуга</span><strong>{c.service}</strong></div><div className="kd-row"><span>Каждые</span><strong>{c.interval_days} дн.</strong></div><div className="kd-row"><span>Следующий выезд</span><strong className={due ? "kd-neg" : ""}>{isoToRu(c.next_service_date)}</strong></div><div className="kd-row total"><span>Стоимость</span><strong>{fmt(c.price)} ₸</strong></div><div className="kd-actions">{c.active !== false && <button className="kd-btn primary sm" onClick={() => createContractJob(c)}><Plus size={13} />Создать заявку</button>}<button className="kd-btn ghost sm" onClick={() => setModal({ kind: "contract", contract: c })}>Изменить</button><button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить договор «${c.client_name}»?`, () => removeContract(c))}><Trash2 size={13} /></button></div></div>; })}</div>
          </div>
        )}

        {!loading && tab === "routes" && (() => {
          const rows = jobs.filter((j) => j.scheduled_date === routeDate && j.status !== "canceled" && (routeTech === "all" || (routeTech === "none" ? !j.assigned_to : j.assigned_to === routeTech))).sort((a, b) => jobTime(a) - jobTime(b));
          const groups = [...new Set(rows.map((j) => j.assigned_to || "none"))].map((techId) => ({ techId, jobs: rows.filter((j) => (j.assigned_to || "none") === techId) }));
          return <div className="kd-stage2">
            <div className="kd-routebar">
              <input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />
              <select value={routeTech} onChange={(e) => setRouteTech(e.target.value)}>
                <option value="all">Все исполнители</option><option value="none">Не назначено</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
              <button className="kd-btn ghost" onClick={() => setRouteDate(todayIso)}>Сегодня</button>
            </div>
            {rows.length === 0 && <div className="kd-empty">На выбранную дату заявок нет.</div>}
            <div className="kd-routegrid">{groups.map((g) => <section className="kd-card" key={g.techId}>
              <div className="kd-stage2head"><div>
                <div className="kd-title">{g.techId === "none" ? "Не назначено" : techById(g.techId)?.full_name}</div>
                <div className="kd-muted">{g.jobs.length} адресов · по времени заявок{g.jobs.length > 8 ? " · в маршрут войдут первые 8" : ""}</div>
              </div>
                <div className="kd-route-actions">
                  <button className="kd-btn ghost sm" onClick={() => copyText(g.jobs.map((j, index) => `${index + 1}. ${j.scheduled_time || "без времени"} · ${addressPlain(j.address)}`).join("\n"), () => showToast("Адреса скопированы"))}>Скопировать</button>
                  <a className="kd-btn primary sm" href={yandexRouteUrl(g.jobs.map((j) => addressPlain(j.address)).filter((address) => address && address !== "📍 точка на карте"))} target="_blank" rel="noreferrer">
                    <Navigation size={14} />Маршрут в Яндекс
                  </a>
                </div>
              </div>
              <div className="kd-routelist">{g.jobs.map((j, i) => <div key={j.id}>
                <b>{i + 1}</b><span><strong>{j.scheduled_time || "без времени"} · {j.pest}</strong><small>{addressPlain(j.address)} · {j.client_phone}</small></span>
                <a href={yandexMapUrl(j.address)} target="_blank" rel="noreferrer" title="Открыть адрес в Яндекс Картах"><MapPin size={16} /></a>
              </div>)}</div>
            </section>)}</div>
          </div>;
        })()}

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
            {pMode === "month" && (
              <div className="kd-card" style={{ marginBottom: 14 }}>
                <div className="kd-tabbar" style={{ marginBottom: 10 }}>
                  <div>
                    <div className="kd-section" style={{ margin: 0 }}>План на {range.label}</div>
                    <div className="kd-muted">
                      {planTarget
                        ? `Прошло ${planRows[0].progress.daysPassed} из ${planRows[0].progress.daysInMonth} дней. Смотреть надо на темп, а не на процент: 60% к 20 числу — провал, к 8 числу — опережение.`
                        : "Цель на месяц не задана. Пока её нет, все цифры отвечают только на «сколько получилось»."}
                    </div>
                  </div>
                  {canManageCash && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "plan", monthKey: planMonthKey, label: range.label, target: planTarget })}>{planTarget ? "Изменить план" : "Задать план"}</button>}
                </div>
                {planTarget && planRows.map((r) => {
                  const p = r.progress;
                  const ahead = p.gap >= 0;
                  return (
                    <div className="kd-planrow" key={r.key}>
                      <span>{r.label}</span>
                      <span className="kd-planbar" title={`Отметка — сколько должно быть на сегодня: ${r.money ? fmt(p.expected) + " ₸" : p.expected}`}>
                        <i style={{ width: `${Math.min(100, p.pct == null ? 0 : p.pct)}%`, background: ahead ? "var(--primary)" : "var(--amber)" }} />
                        <b style={{ left: `${Math.min(100, Math.round(p.daysPassed / p.daysInMonth * 100))}%` }} />
                      </span>
                      <strong>{r.money ? `${fmt(p.actual)} ₸` : p.actual}</strong>
                      <span className="kd-muted">из {r.money ? `${fmt(p.target)} ₸` : p.target}</span>
                      <span className={ahead ? "kd-delta-up" : "kd-delta-down"}>
                        {p.pct == null ? "план не задан" : `${p.pct}% · ${ahead ? "+" : ""}${r.money ? fmt(p.gap) : p.gap} к темпу`}
                      </span>
                    </div>
                  );
                })}
                {planTarget && planRows[0].progress.daysLeft > 0 && planRows[0].progress.perDayNeeded > 0 && (
                  <div className="kd-muted" style={{ marginTop: 8 }}>
                    Чтобы закрыть план по выручке, осталось делать {fmt(planRows[0].progress.perDayNeeded)} ₸ в день — {planRows[0].progress.daysLeft} дней.
                  </div>
                )}
              </div>
            )}

            <div className="kd-twocol">
              <div className="kd-card">
                <div className="kd-section">Итоги · {range.label}{brandFilter !== "all" ? ` · ${brandFilter === "ours" ? "наши заявки" : "партнёрские"}` : ""}</div>
                <div className="kd-row"><span>Выручка</span><strong>{fmt(fin.revenue)} ₸</strong></div>
                {periodDelta && (
                  <div className="kd-row kd-delta">
                    <span className="kd-muted">Выручка к прошлому периоду</span>
                    <span className={periodDelta.revenue == null ? "kd-muted" : periodDelta.revenue >= 0 ? "kd-delta-up" : "kd-delta-down"}>
                      {deltaNote(periodDelta.revenue, totalsPrev.revenue) || "—"}
                    </span>
                  </div>
                )}
                <div className="kd-row"><span>· наличными</span><span className="kd-muted">{fmt(fin.cash)} ₸</span></div>
                <div className="kd-row"><span>· QR / переводом</span><span className="kd-muted">{fmt(fin.qr)} ₸</span></div>
                <div className="kd-row"><span>Себестоимость препаратов</span><strong style={{ color: "#B42318" }}>− {fmt(fin.cost)} ₸</strong></div>
                <div className="kd-row"><span>Доли партнёров</span><strong style={{ color: "#B42318" }}>− {fmt(fin.partnerShares)} ₸</strong></div>
                {fin.executorShares > 0 && <div className="kd-row"><span>Доли исполнителей (наши заявки партнёрам)</span><strong style={{ color: "#B42318" }}>− {fmt(fin.executorShares)} ₸</strong></div>}
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
                {periodDelta && (
                  <>
                    <div className="kd-row kd-delta">
                      <span className="kd-muted">Чек к прошлому периоду</span>
                      <span className={periodDelta.avg == null ? "kd-muted" : periodDelta.avg >= 0 ? "kd-delta-up" : "kd-delta-down"}>
                        {deltaNote(periodDelta.avg, totalsPrev.avg) || "—"}
                      </span>
                    </div>
                    <div className="kd-row kd-delta">
                      <span className="kd-muted">Заявок к прошлому периоду</span>
                      <span className={periodDelta.done == null ? "kd-muted" : periodDelta.done >= 0 ? "kd-delta-up" : "kd-delta-down"}>
                        {periodDelta.done == null ? `в ${prevRange.label} не с чем сравнивать` : `${periodDelta.done > 0 ? "+" : ""}${periodDelta.done}% к ${prevRange.label} (${totalsPrev.done})`}
                      </span>
                    </div>
                  </>
                )}
                <div className="kd-row total"><span>Общий (все заявки)</span><span className="kd-twoval"><em>{fin.avgCheck.allN} заявок</em><strong style={{ color: "var(--primary-d)" }}>{fmt(fin.avgCheck.all)} ₸</strong></span></div>
                <div className="kd-section" style={{ marginTop: 12 }}>По типу обработки</div>
                {fin.avgByType.filter((r) => r.n > 0).map((r) => (
                  <div className="kd-row" key={r.type}><span>{r.type}</span><span className="kd-twoval"><em>{r.n} заявок</em><strong>{fmt(r.avg)} ₸</strong></span></div>
                ))}
                {fin.avgByType.every((r) => r.n === 0) && <div className="kd-muted">За период оплаченных заявок нет.</div>}
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
              <SortBar value={daySort} onChange={setDaySort} options={[["order", "По порядку"], ["revenue", "По выручке"], ["count", "По заявкам"]]} />
              {finWeekSorted.map((w) => (
                <div className="kd-weekrow" key={w.dow}>
                  <span className="kd-weekday">{w.label}</span>
                  <div className="kd-weekbar"><div className="kd-weekfill" style={{ width: `${Math.round((w.revenue / fin.weekMax) * 100)}%` }} /></div>
                  <span className="kd-weekcount">{w.count} зав.</span>
                  <strong className="kd-weeksum">{fmt(w.revenue)} ₸</strong>
                </div>
              ))}
            </div>

            {pMode === "month" && (
              <div className="kd-card kd-mweeks" style={{ marginTop: 14 }}>
                <div className="kd-section">По неделям месяца · {range.label}</div>
                <SortBar value={daySort} onChange={setDaySort} options={[["order", "По порядку"], ["revenue", "По выручке"], ["count", "По заявкам"]]} />
                {fin.monthWeeks.length === 0 && <div className="kd-muted">За месяц выполненных заявок нет.</div>}
                {finMonthWeeksSorted.map((w) => {
                  const open = !!openWeeks[w.idx];
                  const days = daySort === "order" ? w.days : sortByMetric(w.days);
                  return (
                    <div key={w.idx}>
                      <div className="kd-weekrow head" onClick={() => setOpenWeeks((s) => ({ ...s, [w.idx]: !s[w.idx] }))}>
                        <span className="kd-weekday">{w.label}</span>
                        <div className="kd-weekbar"><div className="kd-weekfill" style={{ width: `${Math.round((w.revenue / fin.monthWeekMax) * 100)}%` }} /></div>
                        <span className="kd-weekcount">{w.count} зав.</span>
                        <strong className="kd-weeksum">{fmt(w.revenue)} ₸</strong>
                        <ChevronDown size={15} className={`kd-weekchev ${open ? "open" : ""}`} />
                      </div>
                      {open && days.map((d) => (
                        <div className="kd-weekrow sub" key={d.date}>
                          <span className="kd-weekday">{d.dom} · {WEEKDAYS[d.dow].slice(0, 2)}</span>
                          <div className="kd-weekbar"><div className="kd-weekfill" style={{ width: `${Math.round((d.revenue / w.dayMax) * 100)}%` }} /></div>
                          <span className="kd-weekcount">{d.count} зав.</span>
                          <strong className="kd-weeksum">{fmt(d.revenue)} ₸</strong>
                          <span />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Оборот для отчётности · {range.label}</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>Деньги, фактически полученные за период. Перечисления считаются только после того, как оплата зачтена: до этого денег нет.</div>
              <div className="kd-kpigrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                <div className="kd-kpicard"><span>Всего получено</span><strong>{fmt(turnover.total)} ₸</strong><small>{turnover.jobs} выполненных заявок</small></div>
                <div className="kd-kpicard"><span>Официально</span><strong>{fmt(turnover.official)} ₸</strong><small>{turnover.officialShare}% — QR и перечисления</small></div>
                <div className="kd-kpicard"><span>Наличными</span><strong>{fmt(turnover.cash)} ₸</strong><small>{100 - turnover.officialShare}% оборота</small></div>
              </div>
              {turnover.transferPending > 0 && (
                <div className="kd-flag warn" style={{ marginTop: 10 }}>
                  Ещё {fmt(turnover.transferPending)} ₸ выставлено по счетам, но не оплачено — в оборот периода не вошло
                </div>
              )}
              {turnover.byBrand.length > 1 && (
                <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr .8fr 1fr 1fr", marginTop: 14 }}><span>Юрлицо / бренд</span><span>Заявок</span><span>Официально</span><span>Наличными</span></div>
              )}
              {turnover.byBrand.length > 1 && turnover.byBrand.map((b) => (
                <div className="kd-ledgerrow" key={b.brand} style={{ gridTemplateColumns: "1.6fr .8fr 1fr 1fr" }}>
                  <span className="kd-ledgername">{b.brand}</span>
                  <span>{b.jobs}</span>
                  <span>{fmt(b.official)} ₸</span>
                  <strong>{fmt(b.cash)} ₸</strong>
                </div>
              ))}
              <div className="kd-muted" style={{ marginTop: 10 }}>Разбивка идёт по бренду заявки. Если ИП и ТОО у вас отличаются не брендом, скажите — заведём отдельное поле «юрлицо».</div>
            </div>
            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Клиенты и возвраты · {range.label}</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>Клиент относится к периоду по своей первой заявке. Возврат засчитывается по всей истории — даже если он пришёл снова позже.</div>
              <div className="kd-kpigrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                <div className="kd-kpicard"><span>Клиентов пришло</span><strong>{fmt(retention.clients)}</strong><small>первая заявка за период</small></div>
                <div className="kd-kpicard"><span>Вернулись</span><strong className={retention.returnRate < 20 ? "neg" : ""}>{retention.returnRate} %</strong><small>{fmt(retention.returned)} из {fmt(retention.clients)} заказали снова</small></div>
                <div className="kd-kpicard"><span>Ценность клиента</span><strong>{fmt(retention.ltv)} ₸</strong><small>принёс в среднем за всё время</small></div>
              </div>
              {retention.sources.length > 0 && (
                <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr .9fr .9fr 1fr", marginTop: 14 }}><span>Источник</span><span>Клиентов</span><span>Вернулись</span><span>Ценность</span></div>
              )}
              {retention.sources.map((r) => (
                <div className="kd-ledgerrow" key={r.label} style={{ gridTemplateColumns: "1.6fr .9fr .9fr 1fr" }}>
                  <span className="kd-ledgername">{r.label}</span>
                  <span>{r.clients}</span>
                  <span style={{ color: r.returnRate >= 20 ? "var(--primary-d)" : "var(--muted)" }}>{r.returnRate} %</span>
                  <strong>{fmt(r.ltv)} ₸</strong>
                </div>
              ))}
              {retention.clients === 0 && <div className="kd-muted">За период новых клиентов нет.</div>}
              <div className="kd-muted" style={{ marginTop: 10 }}>Источник, дающий мало клиентов, но с высоким возвратом, обычно выгоднее того, что даёт много разовых.</div>
            </div>
            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">По видам вредителей · {range.label}</div>
              <SortBar value={pestSort} onChange={setPestSort} options={[["revenue", "По выручке"], ["count", "По заявкам"], ["avg", "По чеку"]]} />
              {pestRows.length === 0 && <div className="kd-muted">За период выполненных заявок нет.</div>}
              {pestRows.length > 0 && (
                <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr .9fr 1fr 1fr" }}><span>Вид</span><span>Заявок</span><span>Выручка</span><span>Средний чек</span></div>
              )}
              {pestRows.map((p) => (
                <div className="kd-ledgerrow" key={p.pest} style={{ gridTemplateColumns: "1.6fr .9fr 1fr 1fr" }}>
                  <span className="kd-ledgername">{p.pest}</span>
                  <span>{p.count} зав.</span>
                  <span>{fmt(p.revenue)} ₸</span>
                  <strong>{fmt(p.avg)} ₸</strong>
                </div>
              ))}
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">По дезинфекторам · {range.label}</div>
              <SortBar value={techSort} onChange={setTechSort} options={[["revenue", "По выручке"], ["count", "По заявкам"], ["avg", "По чеку"], ["markup", "По % поднятия"]]} />
              {techs.length === 0 && <div className="kd-muted">Дезинфекторов пока нет.</div>}
              {techs.length > 0 && techRows.length === 0 && <div className="kd-muted">За период выполненных заявок нет.</div>}
              {techRows.length > 0 && (
                <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.4fr .8fr 1fr 1fr 1fr" }}><span>Сотрудник</span><span>Заявок</span><span>Выручка</span><span>Ср. чек</span><span>Прибыль</span></div>
              )}
              {techRows.map(({ t, v, avg, profit }) => (
                <div className="kd-ledgerrow" key={t.id} style={{ gridTemplateColumns: "1.4fr .8fr 1fr 1fr 1fr" }}>
                  <span className="kd-ledgername">{t.full_name || "?"}</span>
                  <span>{v.count} зав.</span>
                  <span>{fmt(v.revenue)} ₸</span>
                  <span>{fmt(avg)} ₸</span>
                  <strong style={{ color: "#0E7C66" }}>{fmt(profit)} ₸</strong>
                </div>
              ))}
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Оценки клиентов · {range.label}</div>
              {feedbackRating.total === 0 && <div className="kd-muted">За период клиенты не оставляли оценок.</div>}
              {feedbackRating.total > 0 && (
                <>
                  <div className="kd-row">
                    <span>Средняя оценка</span>
                    <span className="kd-twoval"><em>{feedbackRating.total} оценок{feedbackRating.low ? ` · низких ${feedbackRating.low}` : ""}</em>
                      <strong style={{ color: feedbackRating.avg >= 4.5 ? "var(--primary)" : feedbackRating.avg >= 4 ? "var(--amber)" : "var(--rust)" }}>{feedbackRating.avg}</strong>
                    </span>
                  </div>
                  <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr 1fr 1fr" }}><span>Сотрудник</span><span>Оценок</span><span>Средняя</span></div>
                  {feedbackRating.byTech.map((r) => (
                    <div className="kd-ledgerrow" key={String(r.techId)} style={{ gridTemplateColumns: "1.6fr 1fr 1fr" }}>
                      <span className="kd-ledgername">{techById(r.techId)?.full_name || personName(r.techId) || "не назначен"}</span>
                      <span className="kd-muted">{r.count}{r.low ? ` · низких ${r.low}` : ""}</span>
                      <strong style={{ color: r.avg >= 4.5 ? "var(--primary)" : r.avg >= 4 ? "var(--amber)" : "var(--rust)" }}>{r.avg}</strong>
                    </div>
                  ))}
                  <div className="kd-section" style={{ marginTop: 12 }}>По видам работ</div>
                  {feedbackRating.byPest.map((r) => (
                    <div className="kd-row" key={r.pest}><span>{r.pest}</span>
                      <span className="kd-twoval"><em>{r.count} оценок</em><strong>{r.avg}</strong></span>
                    </div>
                  ))}
                  <div className="kd-muted" style={{ marginTop: 8 }}>
                    Средняя по двум-трём отзывам ничего не значит — поэтому рядом всегда стоит их количество.
                  </div>
                </>
              )}
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Сезонность · два года по месяцам</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>
                Сравнение с предыдущим месяцем здесь ничего не говорит: разница между июлем и августом — это сезон, а не работа компании. Поэтому справа стоит тот же месяц год назад.
              </div>
              <div className="kd-seasonlist">
                {season.map((r) => (
                  <div className="kd-seasonrow" key={r.month}>
                    <span className="kd-muted">{monthLabel(r.month)}</span>
                    <span className="kd-seasonbar"><i style={{ width: `${Math.round(r.revenue / seasonMax * 100)}%` }} /></span>
                    <strong>{r.revenue ? fmt(r.revenue) : "—"}</strong>
                    <span className="kd-muted">{r.done || ""}</span>
                    <span className={r.yoy == null ? "kd-muted" : r.yoy >= 0 ? "kd-delta-up" : "kd-delta-down"}>
                      {r.yoy == null ? (r.revenue ? "год назад данных нет" : "") : `${r.yoy > 0 ? "+" : ""}${r.yoy}% к ${monthLabel(r.prevYear.month)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Абоненты против разовых · {range.label}</div>
              {subsVsOne.subscription.done === 0 && subsVsOne.oneOff.done === 0 && <div className="kd-muted">За период выполненных заявок нет.</div>}
              {(subsVsOne.subscription.done > 0 || subsVsOne.oneOff.done > 0) && (
                <>
                  <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr" }}>
                    <span> </span><span>Заявок</span><span>Выручка</span><span>Чек</span><span>С клиента</span>
                  </div>
                  {[subsVsOne.subscription, subsVsOne.oneOff].map((r) => (
                    <div className="kd-ledgerrow" key={r.label} style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr" }}>
                      <span className="kd-ledgername">{r.label}<em className="kd-muted" style={{ display: "block", fontStyle: "normal", fontSize: 10.5 }}>{r.clients} клиентов · {r.jobsPerClient} заявки на клиента</em></span>
                      <span>{r.done}</span>
                      <span>{fmt(r.revenue)} ₸</span>
                      <span>{fmt(r.avg)} ₸</span>
                      <strong>{fmt(r.perClient)} ₸</strong>
                    </div>
                  ))}
                  <div className="kd-muted" style={{ marginTop: 8 }}>
                    Смотреть надо на последнюю колонку, а не на чек. У абонента чек ниже, но он приходит сам, не стоит рекламы и даёт несколько заявок в год.
                  </div>
                </>
              )}
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Расход против нормы · {range.label}</div>
              {Object.keys(chemNorms).length === 0 && (
                <div className="kd-muted">Нормы расхода не заданы. Их вписывают в справочнике по вредителям в Настройках — без них сравнивать не с чем.</div>
              )}
              {Object.keys(chemNorms).length > 0 && (() => {
                const rows = jobs
                  .filter((j) => j.status === "done" && inPeriodIso(j.scheduled_date))
                  .map((j) => ({ job: j, check: calc.chemNormCheck(j, { norms: chemNorms }) }))
                  .filter((r) => r.check && r.check.state !== "ok")
                  .sort((a, b) => Math.abs(b.check.deviation) - Math.abs(a.check.deviation));
                if (rows.length === 0) return <div className="kd-muted">Отклонений больше чем на треть за период нет.</div>;
                return (
                  <>
                    <div className="kd-muted" style={{ marginBottom: 8 }}>
                      Отклонение больше трети от нормы. Это повод посмотреть, а не обвинение: если на заявке смешаны жидкий и порошковый препарат, сумма условная.
                    </div>
                    <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr .8fr 1fr 1fr 1fr" }}>
                      <span>Заявка</span><span>Площадь</span><span>Норма</span><span>Факт</span><span>Отклонение</span>
                    </div>
                    {rows.slice(0, 25).map(({ job: j, check }) => (
                      <div className="kd-ledgerrow" key={j.id} style={{ gridTemplateColumns: "1.6fr .8fr 1fr 1fr 1fr" }}>
                        <span className="kd-ledgername">{j.pest} · {isoToRu(j.scheduled_date)}
                          <em className="kd-muted" style={{ display: "block", fontStyle: "normal", fontSize: 10.5 }}>{techById(j.assigned_to)?.full_name || "не назначен"}</em>
                        </span>
                        <span className="kd-muted">{j.area} м²</span>
                        <span className="kd-muted">{fmt(check.expected)}</span>
                        <span>{fmt(check.used)}</span>
                        <strong style={{ color: check.state === "over" ? "var(--rust)" : "var(--amber)" }}>
                          {check.deviation > 0 ? "+" : ""}{check.deviation}%
                        </strong>
                      </div>
                    ))}
                    {rows.length > 25 && <div className="kd-muted" style={{ marginTop: 8 }}>Показаны 25 из {rows.length} — с наибольшим отклонением.</div>}
                  </>
                );
              })()}
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Возвраты по гарантии · {range.label}</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>
                Повтор считается тому, кто делал исходную заявку, и в её период — иначе июльская работа попадёт в августовскую статистику другого человека.
              </div>
              {guaranteeRows.length === 0 && <div className="kd-muted">За период выполненных заявок нет.</div>}
              {guaranteeRows.length > 0 && (
                <>
                  <div className="kd-row"><span>Всего заявок / из них с возвратом</span>
                    <strong>{guaranteeTotals.done} / {guaranteeTotals.returns}{guaranteeTotals.done ? ` · ${Math.round(guaranteeTotals.returns / guaranteeTotals.done * 100)}%` : ""}</strong>
                  </div>
                  <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }}>
                    <span>Сотрудник</span><span>Заявок</span><span>Возвратов</span><span>Доля</span>
                  </div>
                  {guaranteeRows.map((r) => (
                    <div className="kd-ledgerrow" key={String(r.techId)} style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }}>
                      <span className="kd-ledgername">{techById(r.techId)?.full_name || personName(r.techId) || "не назначен"}</span>
                      <span>{r.done}</span>
                      <span>{r.returns}</span>
                      <strong style={{ color: r.rate >= 15 ? "var(--rust)" : r.rate >= 8 ? "var(--amber)" : "var(--primary)" }}>{r.rate}%</strong>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Поднятие цены · {range.label}</div>
              <div className="kd-row"><span>Изначально (сумма макс. цен)</span><strong>{fmt(upliftTotals.quote)} ₸</strong></div>
              <div className="kd-row"><span>Итого получено</span><strong>{fmt(upliftTotals.paid)} ₸</strong></div>
              <div className="kd-row total"><span>Поднятие</span><strong style={{ color: upliftPct >= 0 ? "#0E7C66" : "#B42318" }}>{upliftTotals.paid - upliftTotals.quote >= 0 ? "+" : ""}{fmt(upliftTotals.paid - upliftTotals.quote)} ₸ · {upliftPct} %</strong></div>
              {upliftRows.length > 0 && (
                <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1.6fr 1fr 1fr .8fr", marginTop: 10 }}><span>Сотрудник</span><span>Изначально</span><span>Итого</span><span>%</span></div>
              )}
              {upliftRows.map(({ t, v, markup }) => (
                <div className="kd-ledgerrow" key={t.id} style={{ gridTemplateColumns: "1.6fr 1fr 1fr .8fr" }}>
                  <span className="kd-ledgername">{t.full_name || "?"}</span>
                  <span>{fmt(v.quoteSum)} ₸</span>
                  <span>{fmt(v.paidOnQuote)} ₸</span>
                  <strong style={{ color: markup >= 0 ? "#0E7C66" : "#B42318" }}>{markup >= 0 ? "+" : ""}{markup} %</strong>
                </div>
              ))}
              <div className="kd-muted" style={{ marginTop: 8 }}>Изначальная цена = самый дорогой из озвученных в заявке вариантов. Учитываются только заявки с указанной ценой.</div>
            </div>
          </>
        )}

        {!loading && tab === "payroll" && (
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
            <div className="kd-kpigrid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              <div className="kd-kpicard"><span>Начислено</span><strong>{fmt(payrollTotals.accrued)} ₸</strong><small>{payrollSalaryCounts ? "оклады + бонусы + дорожные" : "бонусы + дорожные (без окладов)"}</small></div>
              <div className="kd-kpicard"><span>Выплачено</span><strong>{fmt(payrollTotals.paid)} ₸</strong><small>проведено по кассе за период</small></div>
              <div className="kd-kpicard"><span>К выплате</span><strong className={payrollTotals.owed > 0 ? "neg" : ""}>{fmt(payrollTotals.owed)} ₸</strong><small>{payrollOwedCount ? `${payrollOwedCount} сотр. ждут выплаты` : "все рассчитаны"}</small></div>
            </div>
            {!payrollSalaryCounts && (
              <div className="kd-hint" style={{ marginTop: 12 }}>Оклады показываются только в режиме «Месяц» — это месячная величина, делить её на недели некорректно. Здесь видны бонусы и дорожные за выбранный период.</div>
            )}
            <div className="kd-card" style={{ marginTop: 14 }}>
              <div className="kd-section">Начисления и выплаты · {range.label}</div>
              {techs.length === 0 && <div className="kd-muted">Сотрудников пока нет.</div>}
              {techs.length > 0 && (
                <div className="kd-ledgerhead kd-payrollrow"><span>Сотрудник</span><span>Оклад</span><span>Бонусы</span><span>Дорожные</span><span>Начислено</span><span>Выплачено</span><span>К выплате</span><span /></div>
              )}
              {payrollRows.map((r) => (
                <div key={r.tech.id}>
                  <div className="kd-ledgerrow kd-payrollrow">
                    <span className="kd-ledgername">{r.tech.full_name || "(без имени)"}</span>
                    <span className="kd-muted" data-l="Оклад" title={r.salaryCalc.deduction > 0 ? `Оклад ${fmt(r.salaryCalc.base)} ₸, отсутствовал ${r.salaryCalc.absenceDays} дн. при норме ${r.salaryCalc.norm?.offDays}, вычет ${fmt(r.salaryCalc.deduction)} ₸` : ""}>
                      {payrollSalaryCounts ? fmt(r.salary) : "—"}
                      {payrollSalaryCounts && r.salaryCalc.deduction > 0 && <em style={{ display: "block", fontStyle: "normal", fontSize: 10.5, color: "var(--rust)" }}>−{fmt(r.salaryCalc.deduction)} за {r.salaryCalc.excessDays} дн.</em>}
                    </span>
                    <span data-l="Бонусы" title={r.helperBonus > 0 ? `Свои заявки ${fmt(r.bonus - r.helperBonus)} ₸ + помощь на чужих ${fmt(r.helperBonus)} ₸` : ""}>
                      {fmt(r.bonus)}
                      {r.helperBonus > 0 && <em style={{ display: "block", fontStyle: "normal", fontSize: 10.5, color: "var(--violet)" }}>из них {fmt(r.helperBonus)} за помощь</em>}
                    </span>
                    <span data-l="Дорожные">{fmt(r.travel)}</span>
                    <span data-l="Начислено">{fmt(r.accrued)}</span>
                    <span className="kd-muted" data-l="Выплачено">{fmt(r.paid)}</span>
                    <strong data-l="К выплате" style={{ color: r.owed > 0 ? "var(--amber)" : "var(--muted)" }}>{fmt(r.owed)} ₸</strong>
                    <span>{canManageCash && <button className="kd-btn primary sm" onClick={() => setModal({ kind: "payrollPay", tech: r.tech, owed: r.owed })}>Выплатить</button>}</span>
                  </div>
                  {r.unposted.length > 0 && (
                    <div className="kd-flag warn" style={{ margin: "0 0 8px", flexWrap: "wrap" }}>
                      Не проведено по кассе: {r.unposted.length} на {fmt(r.unposted.reduce((s, e) => s + (Number(e.amount) || 0), 0))} ₸ — на эту сумму завышены остатки счетов
                      {canManageCash && <button className="kd-btn primary sm" style={{ marginLeft: 10 }} onClick={() => setModal({ kind: "payrollPay", tech: r.tech, owed: Number(r.unposted[0].amount) || 0, expense: r.unposted[0] })}>Провести {isoToRu(r.unposted[0].expense_date) || ""}</button>}
                    </div>
                  )}
                  {r.payments.length > 0 && (
                    <details className="kd-more" style={{ margin: "0 0 10px" }}>
                      <summary>Выплаты за период · {r.payments.length}</summary>
                      {r.payments.map((e) => (
                        <div className="kd-row" key={e.id}>
                          <span>{isoToRu(e.expense_date)} · {EXPENSE_TYPES[e.type] || e.type}{e.account_id ? ` · ${accountById(e.account_id)?.name || "счёт"}` : ""}{e.note ? ` · ${e.note}` : ""}</span>
                          <strong>{fmt(e.amount)} ₸</strong>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ))}
              <div className="kd-muted" style={{ marginTop: 10 }}>В бонусы входят доплаты за помощь на чужих заявках — они начисляются тому, кто помогал, и уменьшают прибыль по той заявке. Оклад режется за дни отсутствия сверх нормы графика: при 6/1 положено 4 выходных в месяц, при 5/2 — девять. Дни берутся из раздела «Выходные», график задаётся в карточке сотрудника. Бонусы и дорожные подтягиваются из выполненных заявок периода (кнопка «Бонус / дорожные» в карточке заявки). Оклад задаётся в карточке сотрудника.</div>
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
            <div className="kd-card" style={{ marginBottom: 14 }}>
              <div className="kd-section" style={{ marginTop: 0 }}>Хватит ли денег</div>
              <div className="kd-row"><span>На счетах</span><strong>{fmt(totalOnAccounts)} ₸</strong></div>
              <div className="kd-row"><span>Наличные у бригад</span><strong>{fmt(totalInHands)} ₸</strong></div>
              <div className="kd-row total"><span>Есть сейчас</span><strong>{fmt(forecast.available)} ₸</strong></div>
              <div className="kd-row"><span>Зарплата к выплате</span><strong style={{ color: "var(--rust)" }}>− {fmt(forecast.payrollOwed)} ₸</strong></div>
              <div className="kd-row total">
                <span>Останется после зарплаты</span>
                <strong style={{ color: forecast.covered ? "var(--primary-d)" : "var(--rust)" }}>{fmt(forecast.afterPayroll)} ₸</strong>
              </div>
              {!forecast.covered && (
                <div className="kd-flag danger" style={{ marginTop: 10 }}>
                  Своих денег на зарплату не хватает {fmt(Math.abs(forecast.afterPayroll))} ₸
                </div>
              )}
              {forecast.expected > 0 && (
                <div className="kd-row"><span>Ждём от клиентов (ещё не пришло)</span><span className="kd-twoval"><em>с ними будет {fmt(forecast.afterPayrollWithExpected)} ₸</em><strong style={{ color: "var(--amber)" }}>+ {fmt(forecast.expected)} ₸</strong></span></div>
              )}
              {forecast.monthsOfRunway !== null && (
                <div className="kd-row"><span>Хватит на обычные расходы</span><span className="kd-twoval"><em>обычно {fmt(forecast.monthlyOpex)} ₸ в месяц</em><strong>{forecast.monthsOfRunway} мес.</strong></span></div>
              )}
              <div className="kd-muted" style={{ marginTop: 10 }}>Ожидаемые поступления показаны отдельно: это деньги, которых ещё нет. Норма расходов — среднее за три полных прошедших месяца, текущий не учитывается, чтобы не занижать её в начале месяца.</div>
            </div>

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
                  <div className="kd-pest">{c.name}{c.low && <span className="kd-lowtag">мало</span>}{c.orderSoon && !c.low && <span className="kd-lowtag">пора заказывать</span>}</div>
                  <span className="kd-muted">{fmt(c.price_per_liter)} ₸/{chemUnit(c.unit_kind).big}</span>
                </div>
                <div className="kd-stockgrid">
                  <div><span>Куплено</span><strong>{fmtAmount(c.purchased_ml, c.unit_kind)}</strong></div>
                  <div><span>Ушло</span><strong>{fmtAmount(c.used, c.unit_kind)}</strong></div>
                  <div><span>Остаток</span><strong style={{ color: c.low ? "#B42318" : "var(--primary)" }}>{fmtAmount(c.remaining, c.unit_kind)}</strong></div>
                  <div><span>Стоимость остатка</span><strong>{fmt(c.stockValue)} ₸</strong></div>
                  <div title={c.forecast?.basedOnDays ? `По расходу за последние ${c.forecast.basedOnDays} дн.` : ""}>
                    <span>Расход в месяц</span>
                    <strong>{c.forecast?.perMonth ? fmtAmount(Math.round(c.forecast.perMonth), c.unit_kind) : "—"}</strong>
                  </div>
                  <div>
                    <span>Хватит на</span>
                    <strong style={{ color: c.orderSoon ? "var(--rust)" : undefined }}>
                      {c.forecast?.daysLeft != null ? `${c.forecast.daysLeft} дн.` : "—"}
                    </strong>
                  </div>
                </div>
                {c.forecast?.orderByIso && (
                  <div className="kd-muted" style={{ marginTop: 6, color: c.orderSoon ? "var(--rust)" : undefined }}>
                    Заказать до {isoToRu(c.forecast.orderByIso)} — с запасом недели на доставку.
                  </div>
                )}
                {!c.forecast?.daysLeft && !c.forecast?.perMonth && (
                  <div className="kd-muted" style={{ marginTop: 6 }}>Расхода за последние три месяца нет — срок жизни остатка посчитать не из чего.</div>
                )}
                {c.batches.some((b) => b.purchase.expires_on || b.purchase.batch_no) && (
                  <details className="kd-more" style={{ marginTop: 8 }}>
                    <summary>Партии · {c.batches.filter((b) => b.remaining > 0).length} в остатке</summary>
                    <div className="kd-muted" style={{ marginBottom: 6 }}>
                      Расход раскладывается по приходам с самого раннего: какая партия ушла на конкретную заявку, система не знает и не выдумывает.
                    </div>
                    {c.batches.filter((b) => b.remaining > 0 || b.purchase.expires_on).map((b) => {
                      const st = b.purchase.expires_on ? calc.docStatus({ expires_on: b.purchase.expires_on }) : { state: "nolimit", daysLeft: null };
                      const alive = b.remaining > 0;
                      const color = !alive ? "var(--muted)" : st.state === "expired" ? "var(--rust)" : st.state === "soon" ? "var(--amber)" : "var(--muted)";
                      return (
                        <div className="kd-ledgerrow" key={b.purchase.id} style={{ gridTemplateColumns: "96px 1fr 110px 120px" }}>
                          <span className="kd-muted" style={{ textAlign: "left" }}>{isoToRu(b.purchase.purchase_date)}</span>
                          <span style={{ textAlign: "left" }}>{b.purchase.batch_no || <em className="kd-muted" style={{ fontStyle: "normal" }}>партия не указана</em>}</span>
                          <span className={alive ? "" : "kd-muted"}>{alive ? `осталось ${fmtAmount(b.remaining, c.unit_kind)}` : "израсходована"}</span>
                          <span style={{ color }}>
                            {b.purchase.expires_on
                              ? (st.state === "expired" ? `просрочена ${-st.daysLeft} дн.` : `годна до ${isoToRu(b.purchase.expires_on)}`)
                              : "срок не указан"}
                          </span>
                        </div>
                      );
                    })}
                  </details>
                )}
                {c.suppliers.length > 0 && (
                  <details className="kd-more" style={{ marginTop: 8 }}>
                    <summary>Поставщики · {c.suppliers.length}{c.suppliers.length > 1 ? ` · дешевле всех ${c.suppliers[0].supplier}` : ""}</summary>
                    <div className="kd-ledgerhead" style={{ gridTemplateColumns: "1fr 110px 110px 90px" }}>
                      <span>Поставщик</span><span>Последняя цена</span><span>Разброс</span><span>Приходов</span>
                    </div>
                    {c.suppliers.map((sp) => (
                      <div className="kd-ledgerrow" key={sp.supplier} style={{ gridTemplateColumns: "1fr 110px 110px 90px" }}>
                        <span style={{ textAlign: "left" }}>{sp.supplier}<em className="kd-muted" style={{ display: "block", fontStyle: "normal", fontSize: 10.5 }}>с {isoToRu(sp.lastDate)}</em></span>
                        <strong>{fmt(sp.lastPrice)} ₸</strong>
                        <span className="kd-muted">{sp.minPrice === sp.maxPrice ? "—" : `${fmt(sp.minPrice)}–${fmt(sp.maxPrice)}`}</span>
                        <span className="kd-muted">{sp.count} · {fmtAmount(sp.amount, c.unit_kind)}</span>
                      </div>
                    ))}
                  </details>
                )}
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
                  {canAccess("action.team_manage") && (
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
            {canAccess("action.team_manage") && <div className="kd-card kd-access-card">
              <div className="kd-tabbar" style={{ marginBottom: 12 }}>
                <div><div className="kd-section" style={{ margin: 0 }}>Сотрудники и права доступа</div><div className="kd-muted">Добавление, блокировка, роли и персональные разрешения</div></div>
                <button className="kd-btn primary" onClick={() => setModal({ kind: "userAccess", user: null })}><UserPlus size={15} />Добавить сотрудника</button>
              </div>
              <div className="kd-user-list">
                {allProfiles.map((p) => {
                  const authUser = authUsers.find((item) => item.id === p.id) || {};
                  const roleInfo = ROLE_DEFINITIONS[p.role] || { label: p.role || "Без роли", color: "#6E7871" };
                  const isSelf = p.id === session.user.id;
                  return <div className={`kd-user-row ${p.is_active === false ? "inactive" : ""}`} key={p.id}>
                    <div className="kd-tech-avatar">{(p.full_name || authUser.email || "?").slice(0, 1).toUpperCase()}</div>
                    <div className="kd-user-main"><strong>{p.full_name || "Без имени"}</strong><span>{authUser.email || "Почта загружается…"}{p.phone ? ` · ${p.phone}` : ""}</span></div>
                    <span className="kd-role-badge" style={{ color: roleInfo.color, borderColor: `${roleInfo.color}55`, background: `${roleInfo.color}12` }}>{roleInfo.label}</span>
                    <span className={`kd-access-status ${p.is_active === false ? "off" : "on"}`}>{p.is_active === false ? "Отключён" : "Активен"}</span>
                    <div className="kd-actions">
                      {p.role !== "admin" && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "userAccess", user: { ...p, email: authUser.email || "" } })}><ShieldCheck size={13} />Права</button>}
                      {!isSelf && p.role !== "admin" && <button className="kd-btn ghost danger sm" onClick={() => askConfirm(`Удалить учётную запись «${p.full_name || authUser.email}» навсегда? История действий в журнале сохранится.`, () => deleteAdminUser({ ...p, email: authUser.email }), { confirmLabel: "Удалить навсегда" })}><Trash2 size={13} /></button>}
                    </div>
                  </div>;
                })}
              </div>
            </div>}
            {canAccess("action.team_manage") && <div className="kd-card">
              <div className="kd-section" style={{ marginTop: 0 }}>Допуски и документы{docAlerts.length ? ` · ${docAlerts.length}` : ""}</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>
                Медкнижка, санминимум, инструктаж по ТБ. Напоминаем за месяц до конца срока: сотрудник с просроченной медкнижкой на объекте — это штраф и остановка работ.
              </div>
              {allProfiles.filter((p) => p.is_active !== false).map((p) => {
                const docs = techDocs.filter((d) => String(d.tech_id) === String(p.id));
                return (
                  <div className="kd-ledgerrow" key={p.id} style={{ gridTemplateColumns: "180px 1fr auto", alignItems: "start" }}>
                    <span className="kd-ledgername">{p.full_name || "Без имени"}</span>
                    <span style={{ textAlign: "left", minWidth: 0 }}>
                      {docs.length === 0 && <em className="kd-muted" style={{ fontStyle: "normal" }}>документов нет</em>}
                      {docs.map((d) => {
                        const st = calc.docStatus(d);
                        const color = st.state === "expired" ? "var(--rust)" : st.state === "soon" ? "var(--amber)" : "var(--muted)";
                        return (
                          <button key={d.id} className="kd-doc-chip" style={{ borderColor: `${color}55`, color }}
                            onClick={() => setModal({ kind: "techDoc", tech: p, doc: d })}
                            title={d.note || "Открыть документ"}>
                            {TECH_DOC_KINDS[d.kind] || d.kind}
                            {d.expires_on && <em> · {st.state === "expired" ? `просрочен ${-st.daysLeft} дн.` : st.state === "soon" ? `осталось ${st.daysLeft} дн.` : `до ${isoToRu(d.expires_on)}`}</em>}
                            {!d.expires_on && <em> · бессрочно</em>}
                          </button>
                        );
                      })}
                    </span>
                    <span>
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "techDoc", tech: p, doc: null })}><Plus size={13} />Документ</button>
                    </span>
                  </div>
                );
              })}
            </div>}
            {canAccess("action.team_manage") && <div className="kd-card">
              <div className="kd-section" style={{ marginTop: 0 }}>Инструктаж и материалы</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>
                Кто подтвердил, что ознакомился. Отметку ставит сам человек в разделе с материалами — за него это сделать нельзя, иначе подпись ничего не подтверждает.
              </div>
              {DRIVE_LINKS.filter((l) => l.ack).map((l) => {
                const pending = calc.notAcknowledged(allProfiles, safetyAcks, l.key);
                return (
                  <div className="kd-ledgerrow" key={l.key} style={{ gridTemplateColumns: "220px 1fr", alignItems: "start" }}>
                    <span className="kd-ledgername">{l.emoji} {l.label}</span>
                    <span style={{ textAlign: "left" }}>
                      {pending.length === 0
                        ? <em className="kd-muted" style={{ fontStyle: "normal", color: "var(--primary)" }}>ознакомились все</em>
                        : <>
                            <strong style={{ color: "var(--rust)" }}>не ознакомились: {pending.length}</strong>
                            <em className="kd-muted" style={{ display: "block", fontStyle: "normal" }}>{pending.map((p) => p.full_name || "без имени").join(", ")}</em>
                          </>}
                    </span>
                  </div>
                );
              })}
            </div>}
            {canAccess("action.team_manage") && <div className="kd-card">
              <div className="kd-section" style={{ marginTop: 0 }}>История сотрудников</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>
                Приём, изменения оклада, переводы и взыскания. Изменение оклада записывается само — вручную это забывают.
              </div>
              {allProfiles.filter((p) => p.is_active !== false).map((p) => {
                const hist = calc.employeeHistory(peopleEvents, p.id);
                return (
                  <details className="kd-more" key={p.id}>
                    <summary>
                      {p.full_name || "Без имени"}
                      {hist.hired ? ` · с ${isoToRu(hist.hired)}` : " · дата приёма не указана"}
                      {hist.lastSalary ? ` · оклад ${fmt(hist.lastSalary.amount)} ₸ с ${isoToRu(hist.lastSalary.happened_on)}` : ""}
                      {` · записей ${hist.rows.length}`}
                    </summary>
                    {hist.rows.length === 0 && <div className="kd-muted">Записей нет.</div>}
                    {hist.rows.map((e) => (
                      <div className="kd-ledgerrow" key={e.id} style={{ gridTemplateColumns: "96px 160px 1fr auto" }}>
                        <span className="kd-muted" style={{ textAlign: "left" }}>{isoToRu(e.happened_on)}</span>
                        <span style={{ textAlign: "left" }}>{EMPLOYEE_EVENTS[e.kind] || e.kind}</span>
                        <span className="kd-muted" style={{ textAlign: "left" }}>{e.note || ""}</span>
                        <strong>{e.amount != null ? `${fmt(e.amount)} ₸` : ""}</strong>
                      </div>
                    ))}
                    <button className="kd-btn ghost sm" style={{ marginTop: 8 }} onClick={() => setModal({ kind: "peopleEvent", person: p, record: null })}><Plus size={13} />Запись</button>
                  </details>
                );
              })}
            </div>}
            {canAccess("action.team_manage") && <div className="kd-card">
              <div className="kd-section" style={{ marginTop: 0 }}>Обучение{trainingAlerts.length ? ` · перепроверить ${trainingAlerts.length}` : ""}</div>
              <div className="kd-muted" style={{ marginBottom: 10 }}>
                Скрипты лежат на Диске, но факт обучения — здесь. Рядом стоит конверсия: без неё непонятно, кто провалился и по какой теме.
              </div>
              {allProfiles.filter((p) => p.is_active !== false).map((p) => {
                const sum = calc.trainingSummary(training, p.id);
                const rank = managerRatings.find((r) => String(r.id) === String(p.id));
                const rows = training.filter((r) => String(r.person_id) === String(p.id));
                const color = sum.state === "expired" ? "var(--rust)" : sum.state === "soon" ? "var(--amber)" : "var(--muted)";
                return (
                  <div className="kd-ledgerrow" key={p.id} style={{ gridTemplateColumns: "180px 1fr auto", alignItems: "start" }}>
                    <span className="kd-ledgername">{p.full_name || "Без имени"}
                      {rank && <em className="kd-muted" style={{ display: "block", fontStyle: "normal", fontSize: 10.5 }}>конверсия {rank.conversion}% · {rank.total} заявок</em>}
                    </span>
                    <span style={{ textAlign: "left", minWidth: 0 }}>
                      {rows.length === 0 && <em className="kd-muted" style={{ fontStyle: "normal" }}>обучение не отмечено</em>}
                      {rows.map((r) => {
                        const st = r.next_check_on ? calc.docStatus({ expires_on: r.next_check_on }) : { state: "nolimit", daysLeft: null };
                        const c = st.state === "expired" ? "var(--rust)" : st.state === "soon" ? "var(--amber)" : "var(--muted)";
                        return (
                          <button key={r.id} className="kd-doc-chip" style={{ borderColor: `${c}55`, color: c }}
                            onClick={() => setModal({ kind: "training", person: p, record: r })}
                            title={r.note || "Открыть запись"}>
                            {r.topic}
                            <em>
                              {r.score != null ? ` · ${r.score}` : ""}
                              {st.state === "expired" ? ` · просрочено ${-st.daysLeft} дн.` : st.state === "soon" ? ` · через ${st.daysLeft} дн.` : ""}
                            </em>
                          </button>
                        );
                      })}
                      {sum.avgScore != null && <em className="kd-muted" style={{ display: "block", fontStyle: "normal", fontSize: 11, color }}>средний балл {sum.avgScore} по {sum.topics} темам</em>}
                    </span>
                    <span>
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "training", person: p, record: null })}><Plus size={13} />Обучение</button>
                    </span>
                  </div>
                );
              })}
            </div>}
            <div className="kd-card">
              <div className="kd-section" style={{ marginTop: 0 }}>Отчёты за период</div>
              <DateFilterBar filter={teamRepFilter} onChange={setTeamRepFilter} hide={["tomorrow"]} />
              {(() => {
                const paidExp = expenses.filter((e) => e.status === "paid" && dateInFilter(e.expense_date || (e.created_at || "").slice(0, 10), teamRepFilter));
                const byTechPay = {};
                paidExp.forEach((e) => {
                  if (!byTechPay[e.tech_id]) byTechPay[e.tech_id] = { salary: 0, travel: 0, other: 0, total: 0 };
                  const t = EXPENSE_TYPES[e.type] !== undefined ? e.type : "other";
                  byTechPay[e.tech_id][t] += Number(e.amount) || 0;
                  byTechPay[e.tech_id].total += Number(e.amount) || 0;
                });
                return (
                  <>
                    <div className="kd-section">💰 Выплачено сотрудникам</div>
                    {Object.keys(byTechPay).length === 0 && <div className="kd-muted">Выплат за период нет.</div>}
                    {Object.entries(byTechPay).map(([tid, v]) => (
                      <div className="kd-row" key={tid}>
                        <span>{personName(tid)}</span>
                        <span className="kd-twoval"><em>зп {fmt(v.salary)} · дор. {fmt(v.travel)}{v.other ? ` · др. ${fmt(v.other)}` : ""}</em><strong>{fmt(v.total)} ₸</strong></span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
            <div className="kd-section">Остатки, выплаты и имущество дезинфекторов</div>
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
                        {techExtrasTotal(t.id) > 0 && canManageCash && <button className="kd-clientlink" style={{ color: "var(--violet)" }} onClick={() => setTab("payroll")} title="Бонусы и дорожные за период — в разделе «Зарплата»">🎁 Зарплата за период →</button>}
                      </div>
                    </div>
                    <div className="kd-actions" style={{ marginBottom: 0 }}>
                      {canAccess("action.team_manage") && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "techedit", tech: t })}><Pencil size={13} />Данные</button>}
                      {canAccess("action.stock_edit") && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "inventoryMovement", tech: t })}><ClipboardCheck size={13} />Ревизия / движение</button>}
                      {canAccess("action.stock_edit") && <button className="kd-btn primary sm" onClick={() => setModal({ kind: "handout", tech: t })}>Выдать / остаток</button>}
                      {canAccess("action.finance_edit") && <button className="kd-btn ghost sm" onClick={() => setTab("payroll")}><Plus size={13} />Зарплата</button>}
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
                              {canAccess("action.finance_edit") && e.status !== "paid" && <button className="kd-btn primary sm" onClick={() => setModal({ kind: "payrollPay", tech: t, owed: Number(e.amount) || 0, expense: e })}>Провести по кассе</button>}
                              {e.status === "paid" && <span className="kd-muted" style={{ fontSize: 12 }}>{e.account_id ? (accountById(e.account_id)?.name || "проведено") : "без счёта"}</span>}
                              {canAccess("action.finance_edit") && <button className="kd-btn ghost danger sm" onClick={() => removeExpense(e)}><Trash2 size={13} /></button>}
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
                      {canAccess("action.team_manage") && <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "issueEquip", tech: t })}><Plus size={13} />Выдать</button>}
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
                              {canAccess("action.team_manage") && <><button className="kd-btn ghost sm" onClick={() => setModal({ kind: "transferEquip", handout: r.handout })}>Передать</button><button className="kd-btn ghost sm" onClick={() => setEquipStatus(r.handout, "returned")}>Возврат</button><button className="kd-btn ghost danger sm" onClick={() => setEquipStatus(r.handout, "broken")}>Сломано</button></>}
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
            {partners.length > 0 && (
              <div className="kd-searchbar" style={{ marginBottom: 4 }}>
                <Search size={16} className="kd-search-icon" />
                <input className="kd-search" value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} placeholder="Поиск партнёра по имени…" />
              </div>
            )}
            {partners.filter((p) => !partnerSearch.trim() || norm(p.name).includes(norm(partnerSearch))).map((p) => {
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
                  {canEditPartners && (
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

        {!loading && tab === "materials" && <MaterialsTab settings={settings} isAdmin={isAdmin} acks={safetyAcks} myId={session.user.id} onAcknowledge={acknowledgeDoc} />}

        {!loading && tab === "knowledge" && <KnowledgeTab settings={settings} isAdmin={isAdmin} acks={safetyAcks} myId={session.user.id} onAcknowledge={acknowledgeDoc} />}

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
                    {canEditDocs && <div className="kd-actions">
                      {d.status !== "done" && <button className="kd-btn ghost sm" onClick={() => setDocStatus(d, "done")}>Сделано</button>}
                      {d.status !== "paid" && <button className="kd-btn primary sm" onClick={() => setDocStatus(d, "paid")}>Оплачено</button>}
                      {d.status === "paid" && <button className="kd-btn ghost sm" onClick={() => setDocStatus(d, "done")}>Снять оплату</button>}
                      <button className="kd-btn ghost sm" onClick={() => setModal({ kind: "doc", doc: d })}>Изменить</button>
                      <button className="kd-btn ghost danger sm" onClick={() => removeDoc(d)}>Удалить</button>
                    </div>}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {!loading && tab === "journal" && isAdmin && <ErrorsPanel errors={clientErrors} />}

        {!loading && tab === "journal" && (
          <div className="kd-card">
            <div className="kd-section" style={{ marginTop: 0 }}>Действия сотрудников</div>
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

        {!loading && tab === "trash" && <TrashTab trash={trash} onRestore={restore} onPurge={purge} />}
      </main>
      </div>

      {modal?.kind === "new" && <JobFormModal title="Новая заявка" submitLabel="Создать" partners={partners} techs={techs} existingJobs={jobs} sources={sources} pestTypes={pestTypes} priceList={priceList} pestGuide={pestGuideObj} defaultGuarantee={defaultGuarantee} onClose={() => setModal(null)} onSave={createJob} />}
      {modal?.kind === "edit" && <JobFormModal title="Изменить заявку" submitLabel="Сохранить" keepStatus partners={partners} techs={techs} existingJobs={jobs} sources={sources} pestTypes={pestTypes} priceList={priceList} pestGuide={pestGuideObj} initial={jobToForm(modal.job)} onClose={() => setModal(null)} onSave={(payload) => editJob(modal.job, payload)} />}
      {modal?.kind === "assign" && <AssignModal job={modal.job} techs={techs} onClose={() => setModal(null)} onSave={assignJob} assignInfo={(techId) => {
        const d = modal.job.scheduled_date;
        if (!d) return { off: false, night: false, count: 0, score: 50, reasons: ["дата ещё не задана"] };
        const off = daysOff.some((x) => x.tech_id === techId && x.off_date === d);
        const prev = parseIso(d); prev.setDate(prev.getDate() - 1); const prevIso = isoOf(prev);
        // ночной выезд: заявка накануне с началом >= 22:00 ИЛИ в этот же день 00:00–05:59
        const night = jobs.some((j) => {
          if (j.assigned_to !== techId || j.status === "canceled") return false;
          const r = timeRangeMin(j.scheduled_time);
          if (!r) return false;
          if (j.scheduled_date === prevIso && r.from >= 22 * 60) return true;
          if (j.scheduled_date === d && r.from < 6 * 60) return true;
          return false;
        });
        const count = jobs.filter((j) => j.assigned_to === techId && j.scheduled_date === d && j.status !== "canceled").length;
        const addressWords = (text) => norm(addressPlain(text)).split(/[^a-zа-яё0-9]+/i).filter((word) => word.length >= 5 && !["улица", "квартира", "микрорайон", "алматы"].includes(word));
        const targetWords = new Set(addressWords(modal.job.address));
        const sameArea = jobs.some((j) => j.assigned_to === techId && j.scheduled_date === d && j.status !== "canceled" && addressWords(j.address).some((word) => targetWords.has(word)));
        const techJobIds = new Set(jobs.filter((j) => j.assigned_to === techId).map((j) => String(j.id)));
        const ratings = qualityChecks.filter((q) => techJobIds.has(String(q.job_id)) && Number(q.rating) > 0).slice(0, 20).map((q) => Number(q.rating));
        const avgRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
        const score = Math.max(0, Math.round(100 - count * 18 - (off ? 100 : 0) - (night ? 35 : 0) + (sameArea ? 18 : 0) + (avgRating ? (avgRating - 4) * 8 : 0)));
        const reasons = [count === 0 ? "свободен в этот день" : `${count} заяв. в этот день`, sameArea ? "есть выезд рядом" : "", avgRating ? `качество ${avgRating.toFixed(1)}/5` : ""].filter(Boolean);
        return { off, night, count, score, reasons };
      }} />}
      {modal?.kind === "report" && <ReportModal job={modal.job} partnerName={partnerNameOf(modal.job)} chemicals={chemicals} primaryReport={(() => {
        if (!modal.job.repeat_of) return null;
        const p = jobs.find((x) => x.id === modal.job.repeat_of);
        if (!p) return null;
        return {
          paid: Number(p.report_paid) || 0,
          techName: techById(p.assigned_to)?.full_name || "—",
          date: p.scheduled_date,
          chems: (p.chemicals || []).map((rc) => ({ name: rc.name || (chemicals.find((c) => c.id === rc.chemical_id)?.name) || "препарат", amount: rc.amount })),
        };
      })()} onClose={() => setModal(null)} onSave={submitReport} />}
      {modal?.kind === "reportSuccess" && <ReportSuccessModal onClose={() => setModal(null)} />}
      {modal?.kind === "view" && <ViewModal job={modal.job} partnerName={partnerNameOf(modal.job)} chemicals={chemicals} performedBy={profileById(modal.job.reported_by)?.full_name || techById(modal.job.assigned_to)?.full_name} chemicalsUnavailable={reportChemsFailed} onClose={() => setModal(null)} />}
      {modal?.kind === "details" && <DetailsModal job={modal.job} header={brandHeaderOf(modal.job)} partnerName={partnerNameOf(modal.job)} onReport={() => setModal({ kind: "report", job: modal.job })} onClose={() => setModal(null)} />}
      {modal?.kind === "proof" && <ProofModal job={modal.job} proof={proofByJob(modal.job.id)} media={proofMedia} onClose={() => setModal(null)} onSave={saveJobProof} />}
      {modal?.kind === "history" && <HistoryModal
        job={modal.job} jobs={jobs} followups={followups} qualityChecks={qualityChecks} contracts={contracts}
        events={clientEvents} feedback={publicFeedback} profiles={allProfiles} canPlanFollowup={canEditJobs} partnerNameOf={partnerNameOf}
        onAddNote={addClientNote} onCopyPublicLink={copyPublicJobLink}
        onPlanFollowup={(j) => setModal({ kind: "followup", job: j, defaultKind: "lost" })}
        onClose={() => setModal(null)}
        onOpen={(j) => setModal(j.status === "done" ? { kind: "view", job: j } : canEditJobs ? { kind: "edit", job: j } : { kind: "details", job: j })} />}
      {modal?.kind === "addchem" && <AddChemModal onClose={() => setModal(null)} onSave={addChem} />}
      {modal?.kind === "stockin" && <StockInModal chem={modal.chem} purchases={chemPurchases.filter((p) => String(p.chemical_id) === String(modal.chem.id))} onClose={() => setModal(null)} onSave={stockIn} />}
      {modal?.kind === "handout" && <HandoutModal tech={modal.tech} chemicals={chemicals} onClose={() => setModal(null)} onSave={addHandout} />}
      {modal?.kind === "techedit" && <TechEditModal tech={modal.tech} onClose={() => setModal(null)} onSave={(payload) => editTechProfile(modal.tech, payload)} />}
      {modal?.kind === "cashRevision" && <CashRevisionModal tech={modal.tech} currentBalance={techCashOnHand(modal.tech.id)} onClose={() => setModal(null)} onSave={(payload) => saveCashRevision(modal.tech, payload)} />}
      {modal?.kind === "inventoryMovement" && <InventoryMovementModal tech={modal.tech} techs={techs} chemicals={chemicals} ledger={techLedger(modal.tech.id)} onClose={() => setModal(null)} onSave={(payload) => saveInventoryMovement(modal.tech, payload)} />}
      {modal?.kind === "peopleEvent" && <PeopleEventModal person={modal.person} record={modal.record} onClose={() => setModal(null)} onSave={savePeopleEvent} />}
      {modal?.kind === "training" && <TrainingModal person={modal.person} record={modal.record} onClose={() => setModal(null)} onSave={saveTraining} />}
      {modal?.kind === "techDoc" && <TechDocModal tech={modal.tech} doc={modal.doc} onClose={() => setModal(null)} onSave={saveTechDoc} />}
      {modal?.kind === "plan" && <PlanModal monthKey={modal.monthKey} label={modal.label} target={modal.target} onClose={() => setModal(null)} onSave={saveMonthlyPlan} />}
      {modal?.kind === "payrollPay" && <PayrollPayModal tech={modal.tech} owed={modal.owed} existing={modal.expense} accounts={accounts} onClose={() => setModal(null)} onSave={(payload) => (modal.expense ? payExistingExpense(modal.tech, modal.expense, payload) : savePayrollPayment(modal.tech, payload))} />}
      {modal?.kind === "userAccess" && <UserAccessModal user={modal.user} onClose={() => setModal(null)} onSave={saveAdminUser} />}
      {modal?.kind === "equip" && <EquipModal item={modal.item} onClose={() => setModal(null)} onSave={saveEquipment} />}
      {modal?.kind === "issueEquip" && <IssueEquipModal tech={modal.tech} equipment={equipment} onClose={() => setModal(null)} onSave={issueEquipment} />}
      {modal?.kind === "transferEquip" && <TransferEquipModal handout={modal.handout} techs={techs.filter((t) => t.id !== modal.handout.tech_id)} onClose={() => setModal(null)} onSave={(newTechId, note) => transferEquipment(modal.handout, newTechId, note)} />}
      {modal?.kind === "reportEquip" && <ReportEquipModal equip={modal.equip} status={modal.status} onClose={() => setModal(null)} onSave={(note) => reportEquipIssue(modal.handout, modal.status, note)} />}
      {modal?.kind === "settings" && (
        <SettingsModal
          settings={settings} sources={sources} pestTypes={pestTypes} priceList={priceList} expCats={expCats} accounts={accounts}
          tabOrder={savedOrder.length ? [...ADMIN_TAB_ORDER].sort((a, b) => { const ia = savedOrder.indexOf(a), ib = savedOrder.indexOf(b); return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); }) : ADMIN_TAB_ORDER}
          leadStages={leadStages} onAddLeadStage={addLeadStage} onRemoveLeadStage={removeLeadStage} onMoveLeadStage={moveLeadStage}
          onClose={() => setModal(null)}
          onSaveSetting={saveAppSetting}
          priceList={priceList} onSavePriceRow={savePriceRow} onRemovePriceRow={removePriceRow}
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
      {modal?.kind === "dayOff" && <DayOffModal techs={techs} defaultDate={modal.date || scheduleDate} daysOff={daysOff} personName={personName} onClose={() => setModal(null)} onAdd={addDayOff} onRemove={removeDayOff} />}
      {modal?.kind === "offCalendar" && <OffCalendarModal techs={techs} daysOff={daysOff} personName={personName} defaultDate={scheduleDate} onClose={() => setModal(null)} onPickDay={(iso) => setModal({ kind: "dayOff", date: iso })} />}
      {modal?.kind === "transferPay" && <TransferPayModal job={modal.job} accounts={accounts} onClose={() => setModal(null)} onConfirm={(accId, date) => markTransferPaid(modal.job, accId, date)} />}
      {modal?.kind === "techExtras" && <TechExtrasModal job={modal.job} techs={techs} helpers={jobHelpers.filter((h) => String(h.job_id) === String(modal.job.id))} techName={techById(modal.job.assigned_to)?.full_name} onClose={() => setModal(null)} onSave={(bonus, travel, helpers) => saveTechExtras(modal.job, bonus, travel, helpers)} />}
      {modal?.kind === "requestEdit" && <RequestEditModal job={modal.job} onClose={() => setModal(null)} onSave={(reason) => requestReportEdit(modal.job, reason)} />}
      {modal?.kind === "executorDone" && <ExecutorDoneModal job={modal.job} partnerName={partnerById(modal.job.executor_partner_id)?.name} accounts={accounts} defaultAccountId={settings.cash_account_id || ""} onClose={() => setModal(null)} onConfirm={(amount, settlement, accId, date) => markExecutorDone(modal.job, amount, settlement, accId, date)} />}
      {modal?.kind === "leadStageSelect" && <LeadStageSelectModal lead={modal.lead} stages={leadStages} onClose={() => setModal(null)} onPick={(sid) => { setLeadStage(modal.lead, sid); setModal(null); }} />}
      {modal?.kind === "guarantee" && <GuaranteeModal tenderId={modal.tenderId} onClose={() => setModal(null)} onSave={saveGuarantee} />}
      {modal?.kind === "payGuarantee" && <PayGuaranteeModal g={modal.g} accounts={accounts} onClose={() => setModal(null)} onConfirm={(accId, date) => markGuaranteePaid(modal.g, accId, date)} />}
      {modal?.kind === "returnGuarantee" && <ReturnGuaranteeModal g={modal.g} remaining={modal.remaining} accounts={accounts} onClose={() => setModal(null)} onConfirm={(amount, date, accId, note) => addGuaranteeReturn(modal.g, amount, date, accId, note)} />}
      {modal?.kind === "rejectDeposit" && <RejectDepositModal dep={modal.dep} techName={techById(modal.dep.tech_id)?.full_name} onClose={() => setModal(null)} onSave={(adminNote) => { decideDeposit(modal.dep, "rejected", adminNote); setModal(null); }} />}
      {modal?.kind === "partner" && <PartnerModal partner={modal.partner} onClose={() => setModal(null)} onSave={savePartner} />}
      {modal?.kind === "partnerJobs" && <PartnerJobsModal partner={modal.partner} jobs={jobs.filter((j) => j.partner_id === modal.partner.id)} shareOf={partnerShareAmt} onClose={() => setModal(null)}
        onOpenClient={(phone) => { setSearch(phone); setTab("done"); setModal(null); }} />}
      {modal?.kind === "doc" && <DocModal doc={modal.doc} partners={partners} onClose={() => setModal(null)} onSave={saveDoc} />}
      {modal?.kind === "economics" && <JobEconomicsModal job={modal.job} economics={jobEconomics(modal.job)} onClose={() => setModal(null)} onSave={(payload) => saveJobEconomics(modal.job, payload)} />}
      {modal?.kind === "followup" && <FollowupModal followup={modal.followup} job={modal.job} lead={modal.lead} defaultKind={modal.defaultKind || "lost"} people={allProfiles.filter((p) => p.role === "admin" || p.role === "manager")} onClose={() => setModal(null)} onSave={saveFollowup} />}
      {modal?.kind === "quality" && <QualityModal job={modal.job} check={qualityByJob(modal.job.id)} defaultReviewUrl={settings.review_url || ""} onClose={() => setModal(null)} onSave={(payload, existing) => saveQualityCheck(modal.job, payload, existing)} />}
      {modal?.kind === "contract" && <ContractModal contract={modal.contract} people={allProfiles.filter((p) => p.role === "admin" || p.role === "manager")} onClose={() => setModal(null)} onSave={saveContract} />}
      {confirmState && (
        <ConfirmModal message={confirmState.message} danger={confirmState.danger} confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onYes(); setConfirmState(null); }} />
      )}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}
