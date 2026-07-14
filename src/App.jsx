import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import ExcelJS from "exceljs";
import {
  ClipboardList, CheckCircle2, RefreshCw, Wallet, Package, Users, Handshake, FileText, History, Trash2,
  Plus, MessageCircle, Pencil, UserPlus, Download, Search, X, LogOut, Bug, ChevronLeft, ChevronRight, Wrench, Settings, Receipt, Banknote, XCircle, ListTodo, Calendar, Landmark, ArrowRightLeft, ArrowDownCircle, ArrowUpCircle, Gavel, ShieldCheck, FolderOpen, ExternalLink, GraduationCap, Contact, ArrowRight, CalendarClock,
} from "lucide-react";

// ----------------------------- helpers -----------------------------
import { ADMIN_TAB_ORDER, AddressText, DEPOSIT_STATUS, DOC_STATUS, DRIVE_LINKS, DateFilterBar, DriveLinkCard, EQUIP_CATEGORIES, EQUIP_STATUS, EXPENSE_TYPES, GUARANTEE_KINDS, STATUS, TASK_STATUS, TASK_TYPES, TENDER_STATUS, WEEKDAYS, addressPlain, buildMsg, chemUnit, copyText, dateInFilter, daysSince, fmt, fmtAmount, fmtTs, groupByDate, isoOf, isoToRu, jobTime, lineAmount, norm, parseIso, periodRange, pricePerBase, repeatLabel, timeRangeMin } from "./shared";
import { AccountModal, AddChemModal, AssignModal, CancelJobModal, ConfirmDepositModal, ConfirmModal, DayOffModal, DepositModal, DetailsModal, DocModal, EquipModal, ExecutorDoneModal, ExpenseModal, GuaranteeModal, HandoutModal, HistoryModal, IssueEquipModal, JobCard, JobFormModal, LeadModal, LeadStageSelectModal, MktChannelModal, MktTopupModal, MoveModal, OpexModal, PartnerJobsModal, PartnerModal, PayGuaranteeModal, RejectDepositModal, RepeatCard, ReportEquipModal, ReportModal, ReportSuccessModal, RequestEditModal, ReturnGuaranteeModal, SettingsModal, StockInModal, TaskModal, TechEditModal, TechExtrasModal, TenderModal, TransferEquipModal, TransferPayModal, ViewModal, jobToForm } from "./modals";

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
  const [partnerSearch, setPartnerSearch] = useState("");
  const [teamRepFilter, setTeamRepFilter] = useState({ preset: "month" });
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
  const techOpening = (techId) => { const p = profileById(techId); return { bal: Number(p?.cash_opening_balance) || 0, date: p?.cash_opening_date || null }; };
  const techCashCollected = (techId) => { const op = techOpening(techId); return jobs.filter((j) => j.assigned_to === techId && j.status === "done" && (!op.date || (j.scheduled_date && j.scheduled_date >= op.date))).reduce((s, j) => s + (Number(j.report_cash) || 0), 0); };
  // Сумма уже подтверждённых внесений (деньги, которые точно дошли)
  const techDepositedConfirmed = (techId) => { const op = techOpening(techId); return deposits.filter((d) => d.tech_id === techId && d.status === "confirmed" && (!op.date || (d.requested_at || "").slice(0, 10) >= op.date)).reduce((s, d) => s + (Number(d.amount) || 0), 0); };
  // Сумма ожидающих подтверждения внесений (деньги «в пути», ещё не подтверждены)
  const techDepositedPending = (techId) => { const op = techOpening(techId); return deposits.filter((d) => d.tech_id === techId && d.status === "pending" && (!op.date || (d.requested_at || "").slice(0, 10) >= op.date)).reduce((s, d) => s + (Number(d.amount) || 0), 0); };
  // Наличные, реально лежащие на руках прямо сейчас = собрано − подтверждено − в ожидании
  const techCashOnHand = (techId) => techOpening(techId).bal + techCashCollected(techId) - techDepositedConfirmed(techId) - techDepositedPending(techId);

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
      client_phone: job.client_phone, guarantee_months: job.guarantee_months, status: "new", repeat_of: job.id, created_by: session.user.id,
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
    // перечисление + пересчёт report_paid — через защищённую функцию (RLS блокировал прямой update)
    const upd = await supabase.rpc("save_report_extras", {
      p_job: job.id, p_cash: Number(report.cash) || 0, p_qr: Number(report.qr) || 0,
      p_transfer: Number(report.transfer) || 0, p_method: report.method,
    });
    if (upd.error) { showToast("Отчёт сохранён, но детали оплаты не записались: " + upd.error.message + ". Проверь, выполнен ли kazdez-report-rpc.sql."); load(); return; }
    setModal({ kind: "reportSuccess" }); load();
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
  async function saveTechExtras(job, bonus, travel) {
    const { error } = await supabase.from("jobs").update({ tech_bonus: Number(bonus) || null, tech_travel: Number(travel) || null }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Заявка", `Бонус/дорожные: ${job.pest} · бонус ${fmt(bonus)} · дорожные ${fmt(travel)}`);
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
    let revenue = 0, cost = 0, cash = 0, qr = 0, partnerShares = 0, executorShares = 0, qrFees = 0, partnerComp = 0; const bySource = {}; const byTech = {};
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
    return { revenue, cost, partnerShares, executorShares, qrFees, partnerComp, profit: revenue - cost - partnerShares - executorShares - qrFees + partnerComp, cash, qr, bySource, byTech, week, weekMax, avgCheck };
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
                  onTransferPaid={() => setModal({ kind: "transferPay", job: j })}
                  onTechExtras={() => setModal({ kind: "techExtras", job: j })}
                  executorName={partnerById(j.executor_partner_id)?.name}
                  onExecutorDone={() => setModal({ kind: "executorDone", job: j })}
                  onExecutorPaid={(paid) => askConfirm(paid ? `Отметить долю исполнителю выплаченной?` : `Снять отметку выплаты доли?`, () => toggleExecutorPaid(j, paid), { danger: false, confirmLabel: "Да" })}
                  onRequestEdit={() => setModal({ kind: "requestEdit", job: j })}
                  onApproveEdit={() => askConfirm(`Разрешить дезинфектору изменить отчёт по «${j.pest} · ${j.address}»? Свяжись с ним перед этим.`, () => approveReportEdit(j), { danger: false, confirmLabel: "Да, разрешить" })}
                  onRejectEdit={() => askConfirm(`Отклонить запрос на изменение отчёта?`, () => rejectReportEdit(j), { danger: false, confirmLabel: "Да, отклонить" })}
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
            <DateFilterBar filter={doneDateFilter} onChange={setDoneDateFilter} hide={["tomorrow"]} />
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
                  onTransferPaid={() => setModal({ kind: "transferPay", job: j })}
                  onTechExtras={() => setModal({ kind: "techExtras", job: j })}
                  executorName={partnerById(j.executor_partner_id)?.name}
                  onExecutorDone={() => setModal({ kind: "executorDone", job: j })}
                  onExecutorPaid={(paid) => askConfirm(paid ? `Отметить долю исполнителю выплаченной?` : `Снять отметку выплаты доли?`, () => toggleExecutorPaid(j, paid), { danger: false, confirmLabel: "Да" })}
                  onRequestEdit={() => setModal({ kind: "requestEdit", job: j })}
                  onApproveEdit={() => askConfirm(`Разрешить дезинфектору изменить отчёт по «${j.pest} · ${j.address}»? Свяжись с ним перед этим.`, () => approveReportEdit(j), { danger: false, confirmLabel: "Да, разрешить" })}
                  onRejectEdit={() => askConfirm(`Отклонить запрос на изменение отчёта?`, () => rejectReportEdit(j), { danger: false, confirmLabel: "Да, отклонить" })}
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
                  onTransferPaid={() => setModal({ kind: "transferPay", job: j })}
                  onTechExtras={() => setModal({ kind: "techExtras", job: j })}
                  executorName={partnerById(j.executor_partner_id)?.name}
                  onExecutorDone={() => setModal({ kind: "executorDone", job: j })}
                  onExecutorPaid={(paid) => askConfirm(paid ? `Отметить долю исполнителю выплаченной?` : `Снять отметку выплаты доли?`, () => toggleExecutorPaid(j, paid), { danger: false, confirmLabel: "Да" })}
                  onRequestEdit={() => setModal({ kind: "requestEdit", job: j })}
                  onApproveEdit={() => askConfirm(`Разрешить дезинфектору изменить отчёт по «${j.pest} · ${j.address}»? Свяжись с ним перед этим.`, () => approveReportEdit(j), { danger: false, confirmLabel: "Да, разрешить" })}
                  onRejectEdit={() => askConfirm(`Отклонить запрос на изменение отчёта?`, () => rejectReportEdit(j), { danger: false, confirmLabel: "Да, отклонить" })}
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
            <div className="kd-card">
              <div className="kd-section" style={{ marginTop: 0 }}>Отчёты за период</div>
              <DateFilterBar filter={teamRepFilter} onChange={setTeamRepFilter} hide={["tomorrow"]} />
              {(() => {
                const paidExp = expenses.filter((e) => e.status === "paid" && dateInFilter(e.expense_date || (e.created_at || "").slice(0, 10), teamRepFilter));
                const offRows = daysOff.filter((d) => dateInFilter(d.off_date, teamRepFilter)).sort((a, b) => b.off_date.localeCompare(a.off_date));
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
                    <div className="kd-section">🌴 Кто отдыхал</div>
                    {offRows.length === 0 && <div className="kd-muted">Выходных за период нет.</div>}
                    {offRows.map((d) => (
                      <div className="kd-row" key={d.id}><span>{personName(d.tech_id)}</span><span className="kd-twoval"><em>{d.note || ""}</em><strong>{isoToRu(d.off_date)}</strong></span></div>
                    ))}
                  </>
                );
              })()}
            </div>
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
                        {techExtrasTotal(t.id) > 0 && <div className="kd-muted" style={{ color: "var(--violet)", fontWeight: 700 }}>🎁 бонусы {fmt(techBonusTotal(t.id))} ₸ · дорожные {fmt(techTravelTotal(t.id))} ₸</div>}
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
      {modal?.kind === "assign" && <AssignModal job={modal.job} techs={techs} onClose={() => setModal(null)} onSave={assignJob} assignInfo={(techId) => {
        const d = modal.job.scheduled_date;
        if (!d) return { off: false, night: false, count: 0 };
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
        return { off, night, count };
      }} />}
      {modal?.kind === "report" && <ReportModal job={modal.job} chemicals={chemicals} primaryReport={(() => {
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
      {modal?.kind === "transferPay" && <TransferPayModal job={modal.job} accounts={accounts} onClose={() => setModal(null)} onConfirm={(accId, date) => markTransferPaid(modal.job, accId, date)} />}
      {modal?.kind === "techExtras" && <TechExtrasModal job={modal.job} techName={techById(modal.job.assigned_to)?.full_name} onClose={() => setModal(null)} onSave={(bonus, travel) => saveTechExtras(modal.job, bonus, travel)} />}
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
      {confirmState && (
        <ConfirmModal message={confirmState.message} danger={confirmState.danger} confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onYes(); setConfirmState(null); }} />
      )}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

