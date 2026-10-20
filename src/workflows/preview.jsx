// Development-only fixture. Not an application route, not a production entry.
// All component data access is replaced locally; no live records are read or written.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../supabaseClient";
import TaskBoard from "./TaskBoard";
import ContractsRegister from "./ContractsRegister";
import StockRegister from "../StockRegister";
import JobObjectFields from "./JobObjectFields";
import BankReconciliation from "./BankReconciliation";
import FinanceAnalysis from "./FinanceAnalysis";
import Proposals from "./Proposals";
import AdsIntelligence from "./AdsIntelligence";
import { blankItem } from "../proposals";
import { jobDebtState } from "./jobDebtModel";
import { JobCard, JobFormModal, LeadModal, LeadStageSelectModal } from "../modals";
import { DealSummary } from "./HunterDeal";
import { nextStageHint } from "./hunterFunnelModel";
import "../styles.css";
// Токены и мост legacy-классов: без них макет рисуется без цветов и
// радиусов, и проверка вёрстки ничего не значит — приложение грузит их
// в main.jsx, значит и локальная проверка обязана.
import "../ui/design-tokens.css";
import "../ui/primitives.css";
import "../ui/legacy-bridge.css";
import "./workflows.css";
import { CallQueue, JobCallPanel } from "./ClientCalls";
import CallModal from "./CallModal";
import { buildCallQueue, buildLaterJobIndex, callStateOf, callsForJob, callStageOf } from "./clientCallsModel";
import { RepeatPendingList, RepeatTriageBar } from "./RepeatTriage";
import { buildRepeatTriage } from "./repeatTriageModel";
import { DateFilterBar } from "../shared";
import Pulse from "./Pulse";
import { b2bFunnel, cashRunway, decisionQueue, monthProgress, planFact } from "./pulseModel";
const people = [{ id: "demo-admin", full_name: "Администратор" }, { id: "demo-worker", full_name: "Аян" }, { id: "demo-observer", full_name: "Менеджер" }];
const initialTasks = [
  { id: "demo-task-1", title: "Сверить остатки на Байзакова", description: "Пересчитать препараты и оформить акт ревизии. Сверить Кельт с журналом выдач.", status: "new", created_at: "2026-09-14T08:10:00+05:00", created_by: people[0].id, assignee_id: people[1].id, observer_ids: [people[2].id], due_date: "2026-09-16", due_time: "17:00", comment_policy: "participants" },
  { id: "demo-task-2", title: "Получить подписанный АВР", description: "Ответственный заказчика работает до 16:00.", status: "in_progress", created_at: "2026-09-13T12:00:00+05:00", created_by: people[0].id, assignee_id: people[2].id, due_date: "2026-09-18", due_time: "16:00", comment_policy: "author" },
  { id: "demo-task-3", title: "Сравнить цены поставщиков", status: "done", created_at: "2026-09-12T09:00:00+05:00", created_by: people[0].id, assignee_id: people[1].id },
];
const chemical = { id: "demo-chem", name: "Кельт", unit_kind: "volume", remaining: 6000, stockValue: 102000, price_per_liter: 17000, low: false, forecast: { perMonth: 2000 }, batches: [] };
const warehouses = [{ id: "demo-legacy", name: "Не распределено", unallocated: true }, { id: "demo-b", name: "Байзакова" }, { id: "demo-m", name: "Мамыр-4" }];
const moves = [{ id: "demo-move", item_kind: "chemical", item_id: chemical.id, kind: "receipt", to_warehouse_id: "demo-b", amount: 4000, created_at: "2026-09-14T08:00:00+05:00", note: "Тестовый приход" }];
const suppliers = [{ id: "demo-s1", name: "Поставщик А", contact_name: "Контакт поставщика" }, { id: "demo-s2", name: "Поставщик Б" }];
const offers = [17000, 22000].map((price, i) => ({ id: `offer-${i}`, supplier_id: suppliers[i].id, item_kind: "chemical", item_id: chemical.id, price, quoted_on: "2026-09-14", available: true }));
const previewJobs = [
  { id: "demo-job-1", pest: "Блохи", type: "Первичная", brand: "Sanitex", status: "new", work_stage: "assigned", scheduled_date: "2026-09-14", scheduled_time: "12:00", address: "9 мкр., д. 27, кв. 5", client_phone: "+7 777 125 8013", assigned_to: people[1].id, price_options: [{ amount: 17000 }], area: 44, note: "Блохи с подвала приходят, КСК не делает" },
  { id: "demo-job-2", pest: "Постельные клопы", type: "Первичная", brand: "KazDez", status: "new", work_stage: "assigned", scheduled_date: "2026-09-14", scheduled_time: "13:30", address: "ул. Абая, д. 18, кв. 42", client_phone: "+7 701 555 1212", assigned_to: people[1].id, price_options: [{ amount: 25000 }], debt_mode: "advance", debt_due_on: "2026-09-25" },
  { id: "demo-job-3", pest: "Тараканы", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: "2026-09-12", scheduled_time: "10:00", address: "мкр. Самал-2, д. 5", client_phone: "+7 702 111 2233", assigned_to: people[1].id, price_options: [{ amount: 20000 }], report_paid: 8000, debt_mode: "on_site" },
];
const previewDebts = [{ id: "demo-debt", job_id: "demo-job-3", amount: 12000, due_on: "2026-09-20" }];
const previewAccounts = [{ id: "demo-kaspi", name: "Kaspi Pay", kind: "bank", scope: "business" }, { id: "demo-cash", name: "Наличные", kind: "cash", scope: "business" }, { id: "demo-owner", name: "Личный счёт", kind: "bank", scope: "owner" }];
const previewMoney = [{ id: "demo-paid", account_id: "demo-kaspi", direction: "expense", amount: 140000, move_date: "2026-09-15", category_id: "demo-chem-cat", source: "manual", note: "Препараты для склада" }, { id: "demo-cash-transfer", account_id: "demo-kaspi", to_account_id: "demo-cash", direction: "transfer", amount: 25000, move_date: "2026-09-15", source: "manual", note: "Снял в кассу" }];
const previewBankStatements = [{ id: "demo-statement", account_id: "demo-kaspi", bank_name: "Kaspi Pay", filename: "kaspi-15-sep.xlsx", period_from: "2026-09-15", period_to: "2026-09-15", imported_count: 3, duplicate_count: 0, closing_balance: 341000 }];
const previewBankRows = [{ id: "demo-r1", statement_id: "demo-statement", account_id: "demo-kaspi", booked_on: "2026-09-15", direction: "expense", amount: 140000, description: "Покупка препаратов", fingerprint: "demo-a" }, { id: "demo-r2", statement_id: "demo-statement", account_id: "demo-kaspi", booked_on: "2026-09-15", direction: "expense", amount: 4000, description: "Списание Kaspi", fingerprint: "demo-b" }, { id: "demo-r3", statement_id: "demo-statement", account_id: "demo-kaspi", booked_on: "2026-09-15", direction: "expense", amount: 25000, description: "Снятие наличных", fingerprint: "demo-c" }];
const previewCategories = [{ id: "demo-chem-cat", name: "Препараты", purpose: "operations" }, { id: "demo-growth-cat", name: "Развитие", purpose: "growth" }];
const noop = () => {};
const previewClients = [
  { id: "demo-cl-1", client_type: "company", legal_name: "ТОО «Логистическая компания»", name: "Дмитрий", phone: "+7 701 222 3344", bin_iin: "221240015875" },
  { id: "demo-cl-2", client_type: "company", legal_name: "ОСИ «Verona»", name: "Председатель ОСИ", phone: "+7 700 111 2233", bin_iin: "190240004411" },
];
const previewContacts = [{ id: "demo-ct-1", client_id: "demo-cl-1", name: "Дмитрий Николаевич", role: "Директор", phone: "+7 701 222 3344" }];
const previewObjects = [
  { id: "demo-ob-1", address: "г. Алматы, ул. Саина — Райымбека, складской комплекс", kind: "warehouse", area: 3900 },
  { id: "demo-ob-2", address: "г. Алматы, ул. Жаксылык Ушкемпиров, ЖК «Verona»", kind: "house", area: 800 },
];
const previewPrices = [
  { id: "demo-pr-1", pest: "Крысы", area_from: 1000, area_to: null, price: 105000 },
  { id: "demo-pr-2", pest: "Тараканы", area_from: 1000, area_to: null, price: 140000 },
];
const previewPests = [{ name: "Крысы" }, { name: "Тараканы" }, { name: "Мыши" }, { name: "Комары" }];
const previewProposals = [
  {
    id: "demo-kp-1", number: "КП-2026-№52-ALA", year: 2026, seq: 52, branch_code: "ALA",
    issue_date: "2026-08-13", style: "sales", segment: "logistics", status: "sent",
    client_id: "demo-cl-1", client_title: "ТОО «Логистическая компания»", client_bin: "221240015875",
    recipient: "Директор, Дмитрий Николаевич", city: "г. Алматы",
    object_label: "склады, фургоны, вагоны, территория", object_address: "г. Алматы, ул. Саина — Райымбека",
    object_area: 3900, subject: "Санитарная обработка складов, фургонов, вагонов, зданий и территорий",
    intro: "Фура стоит на воротах, а груз не принимают. Клиент требует акт о дезинфекции фургона — акта нет.",
    items: [
      blankItem({ name: "Дератизация складских помещений", note: "Приманочные станции по периметру и в зонах хранения", volume: "3 900 м²", amount: 105000 }),
      blankItem({ name: "Дезинсекция складских помещений", note: "Обработка от тараканов, мух и муравьёв", volume: "3 900 м²", amount: 140000 }),
      blankItem({ name: "Приманочные контейнеры", note: "Установка и заправка антивандальных контейнеров", mode: "unit", volume: "46 шт", qty: 46, unit_price: 3000 }),
    ],
    sections: {}, total: 383000, validity_days: 30, payment_terms: "100% предоплата", author_name: "Менеджер",
  },
  {
    id: "demo-kp-2", number: "КП-2026-№51-ALA", year: 2026, seq: 51, branch_code: "ALA",
    issue_date: "2026-07-29", style: "sales", segment: "residential", status: "accepted",
    client_id: "demo-cl-2", client_title: "ОСИ «Verona»", recipient: "Председателю ОСИ", city: "г. Алматы",
    object_label: "16 подвальных помещений", object_address: "г. Алматы, ул. Жаксылык Ушкемпиров",
    object_area: 800, subject: "Дератизация подвальных помещений жилого комплекса",
    items: [blankItem({ name: "Дератизация подвальных помещений", volume: "16 подв. · 800 м²", amount: 320000 })],
    sections: {}, total: 368000, validity_days: 30, author_name: "Менеджер",
  },
];
const previewSettings = { company_name: "ТОО «Служба дезинфекции KAZDEZ»" };
const isoAgo = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const callJobs = [
  { id: "call-1", pest: "Постельные клопы", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(7), scheduled_time: "10:00", address: "ЖК Каргалы Сити, ул. Омарова, д. 7, кв. 54", client_phone: "+7 708 508 3756", contact_name: "Айгуль", price_options: [{ amount: 20000, label: "Стоимость" }], report_paid: 20000, reported_at: isoAgo(7) + "T12:00:00+05:00" },
  { id: "call-2", pest: "Тараканы", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(9), address: "ул. Сатпаева, д. 30/5", client_phone: "+7 701 501 7287", report_paid: 18000 },
  { id: "call-3", pest: "Блохи", type: "Вторичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(10), address: "ул. Доспанова, д. 55", client_phone: "+7 708 288 3463", report_paid: 15000 },
  { id: "call-4", pest: "Мухи", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(2), address: "ул. Байтерекова, д. 53", client_phone: "+7 702 407 8573", report_paid: 25000 },
];
const initialCalls = [
  { id: "pc-1", job_id: "call-2", client_phone: "+7 701 501 7287", stage: "after_primary", outcome: "no_answer", created_by: "demo-admin", created_at: isoAgo(1) + "T11:00:00+05:00" },
  { id: "pc-2", job_id: "call-2", client_phone: "+7 701 501 7287", stage: "after_primary", outcome: "note", note: "Просил звонить после 18:00", created_by: "demo-worker", created_at: isoAgo(1) + "T11:05:00+05:00" },
];
function CallsPreview() {
  const [calls, setCalls] = useState(initialCalls), [callJob, setCallJob] = useState(null), [view, setView] = useState("after_primary"), [windowDays, setWindowDays] = useState(60), [expanded, setExpanded] = useState(""), [dateFilter, setDateFilter] = useState({ preset: "all" });
  const queue = buildCallQueue(callJobs, { calls, today: isoAgo(0), windowDays });
  const remove = (call) => setCalls((rows) => rows.map((c) => (c.id === call.id ? { ...c, deleted_at: new Date().toISOString() } : c)));
  const save = async (payload) => { setCalls((rows) => [{ id: `pc-${rows.length + 1}`, job_id: callJob.id, client_phone: callJob.client_phone, stage: callStageOf(callJob), created_by: "demo-admin", created_at: new Date().toISOString(), ...payload }, ...rows]); setCallJob(null); return ""; };
  return <section style={{ display: "grid", gap: 16 }}>
    <DateFilterBar filter={dateFilter} onChange={setDateFilter} hide={["tomorrow"]} />
    <CallQueue queue={queue} view={view} onViewChange={setView} windowDays={windowDays} onWindowChange={setWindowDays} people={people} onCall={setCallJob} onOpenJob={(j) => setExpanded(j.id)} />
    <div className="kd-list">{callJobs.map((job) => <JobCard key={job.id} job={job} compact={expanded !== job.id} onExpand={() => setExpanded(job.id)} onCollapse={() => setExpanded("")} isAdmin assignedName="Олжас" onHistory={noop} onView={noop} onEdit={noop} onAssign={noop} onDelete={noop} onCall={() => setCallJob(job)}
      callPanel={expanded === job.id ? <JobCallPanel job={job} state={callStateOf(job, { ownCalls: callsForJob(calls, job.id), jobs: callJobs })} people={people} userId="demo-admin" isAdmin onCall={() => setCallJob(job)} onDelete={remove} /> : null} />)}</div>
    {callJob && <CallModal job={callJob} calls={callsForJob(calls, callJob.id)} people={people} userId="demo-admin" isAdmin onClose={() => setCallJob(null)} onSave={save} onDelete={remove} />}
  </section>;
}
const repeatJobs = [
  ...callJobs,
  { id: "rep-1", pest: "Постельные клопы", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(16), address: "мкр. Аксай-4, д. 12, кв. 31", client_phone: "+7 707 111 2233", contact_name: "Ерлан", report_paid: 32000 },
  { id: "rep-2", pest: "Тараканы", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(11), address: "ул. Розыбакиева, д. 247", client_phone: "+7 705 444 5566", report_paid: 22000, repeat_state: "on_repeat" },
  { id: "rep-3", pest: "Клещи", type: "Первичная", brand: "KazDez", status: "done", work_stage: "done", scheduled_date: isoAgo(8), address: "Талгарский тракт, уч. 5", client_phone: "+7 777 909 1010", report_paid: 40000, repeat_state: "finished" },
];
function RepeatPreview() {
  const [calls, setCalls] = useState(initialCalls), [filter, setFilter] = useState("all"), [callJob, setCallJob] = useState(null), [jobs, setJobs] = useState(repeatJobs), [expanded, setExpanded] = useState("");
  const laterIndex = buildLaterJobIndex(jobs);
  const triage = buildRepeatTriage(jobs, { laterIndex, today: isoAgo(0), stateOf: (j) => callStateOf(j, { ownCalls: callsForJob(calls, j.id), laterIndex }) });
  const save = async (payload) => { setCalls((rows) => [{ id: `pc-${rows.length + 1}`, job_id: callJob.id, client_phone: callJob.client_phone, stage: callStageOf(callJob), created_by: "demo-admin", created_at: new Date().toISOString(), ...payload }, ...rows]); setCallJob(null); return ""; };
  const visible = jobs.filter((j) => j.status === "done" && (filter === "all" || triage.byJob.get(j.id)?.bucket === filter));
  return <section>
    <RepeatTriageBar triage={triage} value={filter} onChange={setFilter} />
    {filter === "pending"
      ? <RepeatPendingList entries={triage.pending} people={people} onCall={setCallJob} onRepeat={(j) => setJobs((rows) => rows.map((r) => (r.id === j.id ? { ...r, repeat_state: "on_repeat" } : r)))} onOpenJob={noop} />
      : <div className="kd-list">{visible.map((job) => <JobCard key={job.id} job={job} repeatTriage={triage.byJob.get(job.id) || null} compact={expanded !== job.id} onExpand={() => setExpanded(job.id)} onCollapse={() => setExpanded("")} isAdmin assignedName="Олжас" onHistory={noop} onView={noop} onEdit={noop} onAssign={noop} onDelete={noop} onCall={() => setCallJob(job)} />)}</div>}
    {callJob && <CallModal job={callJob} calls={callsForJob(calls, callJob.id)} people={people} userId="demo-admin" isAdmin onClose={() => setCallJob(null)} onSave={save} onDelete={noop} />}
  </section>;
}
const ym = new Date().toISOString().slice(0, 7);
const previewAdAccounts = [{ id: "acc-kd", platform: "olx", name: "Бренд KazDez" }, { id: "acc-dz", platform: "olx", name: "Dezline" }];
const previewAdAssets = [
  { id: "ad-1", account_id: "acc-kd", name: "Дезинсекция: тараканы, клопы — фото с бригадой", landing_url: "https://www.olx.kz/d/obyavlenie/dezinsektsiya-IDn5Kx7.html", external_id: "n5Kx7" },
  { id: "ad-2", account_id: "acc-kd", name: "Уничтожение клопов — фото кровати" },
  { id: "ad-3", account_id: "acc-dz", name: "Дератизация — мыши, крысы" },
  { id: "ad-4", account_id: "acc-dz", name: "Обработка от клещей участка" },
  { id: "ad-5", account_id: "acc-kd", name: "Старое объявление", is_active: false },
];
const previewAdSnapshots = [
  ["ad-1", "01", 1200, 40, 70], ["ad-1", "08", 1350, 44, 79], ["ad-1", "15", 1600, 52, 91],
  ["ad-2", "01", 500, 10, 20], ["ad-2", "15", 520, 10, 20],
  ["ad-3", "01", 300, 5, 9], ["ad-3", "15", 420, 9, 16],
].map(([asset_id, d, views, favorites, phone_views]) => ({ id: asset_id + d, asset_id, snapshot_date: ym + "-" + d, views, favorites, phone_views }));
const previewAdPromotions = [
  { id: "pr-1", asset_id: "ad-1", promotion_type: "top_30", started_on: ym + "-01", ended_on: ym + "-30", activated_hour: 8, cost: 5000 },
  { id: "pr-2", asset_id: "ad-1", promotion_type: "lift_7", started_on: ym + "-04", ended_on: ym + "-10", activated_hour: 13, cost: 2750 },
  { id: "pr-3", asset_id: "ad-2", promotion_type: "top_7", started_on: ym + "-02", ended_on: ym + "-08", activated_hour: 9, cost: 3000 },
];
const previewAdMetrics = [{ id: "m-1", asset_id: "ad-1", metric_date: ym + "-10", hour_slot: 12, views: 24, favorites: 0, phone_views: 7 }];
const dealStages = [["new", "Новый / Разведка"], ["lpr_found", "ЛПР найден"], ["kp_sent", "КП отправлено"], ["negotiation", "Переговоры"], ["contract", "Договор на согласовании"], ["first_service", "Первая обработка"], ["subscriber", "Абонент", true], ["lost", "Отказ", true, true], ["snoozed", "Отложено"]]
  .map(([code, name, isFinal = false, isLost = false], i) => ({ id: "st-" + code, code, name, sort: (i + 1) * 10, is_final: isFinal, is_lost: isLost }));
const previewDeal = { id: "deal-1", name: "Кафе «Дастархан»", client_type: "company", phone: "+7 727 300 1122", address: "Алматы, Абая 10", stage_id: "st-lpr_found", object_type: "catering", area_m2: 140, lpr_name: "Аскар Бекович", lpr_position: "Управляющий", lpr_phone: "+7 701 555 1234", pests: ["Тараканы"], next_action: "Уточнить периодичность", next_action_at: "2026-10-20T10:00:00+05:00" };
function DealPreview() {
  const [open, setOpen] = useState("");
  return <section className="kd-card"><h2>{previewDeal.name}</h2><DealSummary lead={previewDeal} hint={nextStageHint(previewDeal, "lpr_found")} />
    <div className="kd-actions"><button className="kd-btn ghost" onClick={() => setOpen("card")}>Карточка сделки</button><button className="kd-btn ghost" onClick={() => setOpen("stage")}>Сменить стадию</button></div>
    {open === "card" && <LeadModal lead={previewDeal} stages={dealStages} sources={[]} owners={people} defaultOwnerId={people[0].id} pestOptions={previewPests.map((p) => p.name)} companies={previewClients} onClose={() => setOpen("")} onSave={noop} />}
    {open === "stage" && <LeadStageSelectModal lead={previewDeal} stages={dealStages} initialStageId="st-kp_sent" onEditDeal={() => setOpen("card")} onClose={() => setOpen("")} onPick={noop} />}
  </section>;
}
const pulseToday = new Date();
const pulseIso = (days) => { const d = new Date(pulseToday); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const pulseLeads = [
  { id: "pl-1", name: "Кафе «Дастархан»", client_type: "company", stage_id: "st-kp_sent", expected_mrr: 45000, stage_changed_at: pulseIso(-21) },
  { id: "pl-2", name: "Склад «Алатау»", client_type: "company", stage_id: "st-negotiation", quoted_price: 80000, stage_changed_at: pulseIso(-3) },
  { id: "pl-3", name: "Детсад №12", client_type: "company", stage_id: "st-contract", expected_mrr: 30000, stage_changed_at: pulseIso(-16) },
  { id: "pl-4", name: "ТЦ «Мега»", client_type: "company", stage_id: "st-lpr_found", stage_changed_at: pulseIso(-2) },
  { id: "pl-5", name: "Пекарня", client_type: "company", stage_id: "st-subscriber", contract_signed_at: pulseIso(-4) },
];
const pulseContracts = [
  { id: "pc-1", price: 30000, interval_days: 30, next_service_date: pulseIso(5), created_at: pulseIso(-4) },
  { id: "pc-2", price: 120000, interval_days: 90, next_service_date: pulseIso(18), created_at: pulseIso(-200) },
  { id: "pc-3", price: 25000, interval_days: 14, next_service_date: pulseIso(-1), created_at: pulseIso(-90) },
];
const pulseAlerts = [
  { id: "debts", label: "Просроченные долги клиентов", value: "184 000 ₸", tab: "opex", tone: "danger" },
  { id: "overdue-jobs", label: "Просроченные заявки", value: 3, tab: "jobs", tone: "danger" },
  { id: "stockorder", label: "Пора заказывать препараты", value: 2, tab: "stock", tone: "warning" },
  { id: "contracts", label: "Пора создать плановые выезды", value: 1, tab: "subscriptions", tone: "danger" },
];
function PulsePreview() {
  const [decisions, setDecisions] = useState([{ alert_key: "overdue-jobs", status: "open", owner_id: people[1].id, due_on: pulseIso(-1), task_id: "demo-task-1" }, { alert_key: "stockorder", status: "open", snoozed_until: pulseIso(5), note: "Ждём поставщика" }]);
  const [target, setTarget] = useState({ revenue: 4200000, profit: 900000, jobs: 110, new_subscribers: 4, mrr: 250000 });
  const day = pulseToday.getDate();
  const funnel = b2bFunnel({ leads: pulseLeads, stages: dealStages, contracts: pulseContracts, today: pulseToday });
  const decide = async (alert, action, { ownerId, due, until, note } = {}) => {
    setDecisions((rows) => [...rows.filter((d) => d.alert_key !== alert.id), ...(action === "close" ? [] : [{ alert_key: alert.id, status: "open", owner_id: ownerId, due_on: due, snoozed_until: until, note }])]);
    return null;
  };
  return <Pulse monthLabel={new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(pulseToday)} elapsedShare={monthProgress(pulseToday).share}
    plan={planFact({ target, today: pulseToday, fact: { revenue: 125000 * day, profit: 21000 * day, jobs: Math.round(3.1 * day), new_subscribers: funnel.mrr.newThisMonth, mrr: funnel.mrr.current } })} target={target}
    runway={cashRunway({ today: pulseToday, startBalance: 1450000, receivables: 210000, debts: [{ amount: 184000, due_on: pulseIso(-6) }, { amount: 60000, due_on: pulseIso(12) }, { amount: 15000 }],
      plannedJobs: [{ scheduled_date: pulseIso(1), quoted_price: 45000 }, { scheduled_date: pulseIso(2), price_options: [{ amount: 30000 }] }, { scheduled_date: pulseIso(9), quoted_price: 220000 }],
      contracts: pulseContracts, completionRate: 0.87, directCostShare: 0.38, payrollOwed: 940000, monthlyOpex: 1100000, monthlySalaries: 1500000, monthlyMarketing: 350000 })}
    assumptions={{ completionRate: 0.87, directCostShare: 0.38, monthlyOpex: 1100000 }} funnel={funnel}
    queue={decisionQueue({ alerts: pulseAlerts, decisions, tasks: initialTasks, profiles: people, today: pulseToday })} people={people} ready
    onSaveTargets={async (values) => { setTarget(values); return null; }} onDecide={decide} onNavigate={noop} onOpenLead={noop} onOpenAlert={noop} />;
}
function ResponsivePreview() {
  const [width, setWidth] = useState(320);
  return <main><nav className="wf-toolbar">{[320, 768, 1024, 1440].map((size) => <button className="kd-btn ghost" key={size} onClick={() => setWidth(size)}>{size} px</button>)}</nav><iframe title="Проверка адаптивности" src="/workflow-preview.html" width={width} height="850" style={{ border: "1px solid var(--line)", display: "block", margin: "16px auto" }} /></main>;
}
function Preview() {
  const [page, setPage] = useState("Задачи"), [tasks, setTasks] = useState(initialTasks), [selected, setSelected] = useState(null), [expandedJob, setExpandedJob] = useState(""), [jobFormOpen, setJobFormOpen] = useState(false), [form, setForm] = useState({ object_kind: "commercial", object_details: { measurement: "fumigation", volume_method: "dimensions", length_m: 5, width_m: 4, height_m: 3 } });
  return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}><p className="kd-notebox">Локальный макет · вымышленные данные · сохранение в рабочую базу отключено</p><nav className="wf-toolbar" style={{ marginBottom: 24 }}>{["Задачи", "Обзвон", "Повтор", "Заявки", "Склад", "Договоры", "Тип объекта", "Выписки", "Финансы", "КП", "Реклама", "Сделка", "Пульс"].map((label) => <button className="kd-btn ghost" key={label} onClick={() => setPage(label)}>{label}</button>)}</nav>
    {page === "Задачи" && <TaskBoard tasks={tasks} people={people} userId={people[0].id} canManage onCreate={noop} onEdit={noop} onRemove={noop} onStatus={async (task, status) => { setTasks(tasks.map((t) => t.id === task.id ? { ...t, status } : t)); return true; }} />}
    {page === "Обзвон" && <CallsPreview />}
    {page === "Повтор" && <RepeatPreview />}
    {page === "Заявки" && <section><h2>Заявки</h2><p className="kd-muted">Нажмите на строку, чтобы увидеть детали и действия.</p><div className="kd-list">{previewJobs.map((job) => <JobCard key={job.id} job={job} debt={jobDebtState(job, previewDebts)} onDebtPay={noop} compact={expandedJob !== job.id} onExpand={() => setExpandedJob(job.id)} onCollapse={() => setExpandedJob("")} isAdmin assignedName="Аян" onHistory={noop} onObject={noop} onProof={noop} onCopyPublicLink={noop} onReport={noop} onCancel={noop} onAssign={noop} onEdit={noop} onDelete={noop} />)}</div><button className="kd-btn primary" style={{ marginTop: 16 }} onClick={() => setJobFormOpen(true)}>Новая заявка</button>{jobFormOpen && <JobFormModal title="Новая заявка" submitLabel="Создать" draftOwnerId="demo-admin" techs={people} onClose={() => setJobFormOpen(false)} onSave={async () => { setJobFormOpen(false); return true; }} />}</section>}
    {page === "Склад" && <StockRegister warehouses={warehouses} warehouseMoves={moves} suppliers={suppliers} supplierOffers={offers} inventory={[chemical]} techs={people} techLedger={(id) => id === people[1].id ? [{ chem: chemical, received: 1000, consumed: 0, balance: 1000 }] : []} purchases={[]} handouts={[]} adjustments={[]} jobs={[]} sales={[]} equipment={[]} equipIssuedQty={() => 0} totalStockValue={102000} totalEquipValue={0} selectedId={chemical.id} onSelect={noop} canEditStock canManageTeam onStockIn={noop} onMovement={noop} onRemoveChem={noop} onAddEquipment={noop} onEditEquipment={noop} onRemoveEquipment={noop} techEquipment={() => []} onTransferEquipment={noop} onEquipStatus={noop} />}
    {page === "Договоры" && <ContractsRegister contracts={[{ id: "demo-contract", client_id: "demo-client", number: "Д-2026/15", signed_on: "2026-09-14", organization: "ТОО Тестовая организация", title: "Абонентское обслуживание", status: "active", amount: 180000 }]} clients={[{ id: "demo-client", name: "Тестовый клиент", phone: "+7 700 000 0000" }]} people={people} canEdit selectedId={selected} onSelect={setSelected} onReload={noop} onOpenClient={noop} />}
    {page === "Тип объекта" && <section className="kd-card"><h2>Параметры объекта</h2><JobObjectFields form={form} onChange={setForm} /></section>}
    {page === "Выписки" && <BankReconciliation statements={previewBankStatements} transactions={previewBankRows} evidence={[]} accounts={previewAccounts} moves={previewMoney} manualExpenses={[]} categories={previewCategories} jobs={[]} qrAccountId="demo-kaspi" qrFeeRate={0.0095} accountBalanceAt={() => 341000} onReload={noop} />}
    {page === "Финансы" && <FinanceAnalysis moves={previewMoney} accounts={previewAccounts} categories={previewCategories} bankRows={previewBankRows} evidence={[]} jobs={[]} manualExpenses={[]} />}
    {page === "Реклама" && <AdsIntelligence accounts={previewAdAccounts} assets={previewAdAssets} snapshots={previewAdSnapshots} promotions={previewAdPromotions} metrics={previewAdMetrics} canEdit />}
    {page === "Сделка" && <DealPreview />}
    {page === "Пульс" && <PulsePreview />}
    {page === "КП" && <Proposals proposals={previewProposals} clients={previewClients} clientContacts={previewContacts}
      objects={previewObjects} leads={[]} priceList={previewPrices} pestTypes={previewPests} settings={previewSettings}
      branches={[{ id: "demo-br", code: "ALA", is_default: true }]} canEdit isAdmin userName="Менеджер" onReload={noop} />}
  </main>;
}
if (import.meta.env.DEV) {
  document.documentElement.dataset.theme = "light";
  const fixtures = { task_subtasks: [{ id: "demo-subtask", task_id: "demo-task-1", title: "Пересчитать Кельт", assignee_id: people[1].id, created_by: people[0].id, created_at: "2026-09-14T08:20:00+05:00", due_at: "2026-09-16T12:00:00+05:00", done: false }], entity_activity: [{ id: "demo-event", body: "Проверьте также закрытые упаковки на верхней полке.", created_by: people[0].id, created_at: "2026-09-14T08:22:00+05:00", event_type: "comment" }] };
  supabase.from = (table) => { const result = { data: fixtures[table] || [], error: null }; const q = { select: () => q, eq: () => q, order: () => q, range: (from, to) => Promise.resolve({ ...result, data: result.data.slice(from, to + 1) }), then: (resolve) => Promise.resolve(result).then(resolve), insert: () => Promise.resolve({ error: { message: "Макет: сохранение отключено" } }), update: () => q }; return q; };
  supabase.rpc = async () => ({ error: { message: "Макет: проведение операций отключено" } });
  supabase.storage.from = () => ({ upload: async () => ({ error: { message: "Макет: загрузка файлов отключена" } }), createSignedUrl: async () => ({ error: { message: "Макет: нет рабочих файлов" } }) });
  const previewRoot = createRoot(document.getElementById("root"));
  previewRoot.render(new URLSearchParams(window.location.search).has("responsive") ? <ResponsivePreview /> : <Preview />);
  if (import.meta.hot) import.meta.hot.dispose(() => previewRoot.unmount());
} else { document.getElementById("root").textContent = "Только для локальной разработки"; }
