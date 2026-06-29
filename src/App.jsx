import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ----------------------------- helpers -----------------------------
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const isoToRu = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STATUS = {
  new: { label: "Новая", color: "#2563EB", bg: "#EAF1FE" },
  assigned: { label: "Назначена", color: "#B45309", bg: "#FCF1E2" },
  done: { label: "Выполнена", color: "#0E7C66", bg: "#E4F3EE" },
};

function jobTime(j) {
  if (!j.scheduled_date) return Infinity;
  return new Date(`${j.scheduled_date}T${j.scheduled_time || "00:00"}`).getTime();
}
function dateGroupLabel(iso) {
  if (!iso) return "Без даты";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d); date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - todayStart()) / 86400000);
  const ru = isoToRu(iso);
  if (diff === 0) return `Сегодня · ${ru}`;
  if (diff === 1) return `Завтра · ${ru}`;
  if (diff === -1) return `Вчера · ${ru}`;
  return `${WEEKDAYS[date.getDay()]} · ${ru}`;
}
function isPast(iso) {
  if (!iso) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d); date.setHours(0, 0, 0, 0);
  return date.getTime() < todayStart();
}
function groupByDate(jobs) {
  const groups = [], idx = {};
  jobs.forEach((j) => {
    const key = j.scheduled_date || "—";
    if (idx[key] === undefined) { idx[key] = groups.length; groups.push({ key, label: dateGroupLabel(j.scheduled_date), past: isPast(j.scheduled_date), jobs: [] }); }
    groups[idx[key]].jobs.push(j);
  });
  return groups;
}
function buildMsg(job) {
  const lines = [];
  lines.push("Наша заявка");
  lines.push(`${job.type || "Первичная"} обработка`);
  lines.push(`Дата: ${isoToRu(job.scheduled_date)}`);
  lines.push(`Время: ${job.scheduled_time || ""}`);
  lines.push(`Адрес: ${job.address || ""}`);
  if (job.floor) lines.push(`Этаж: ${job.floor}`);
  if (job.area) lines.push(`Метраж: ${job.area} м²`);
  lines.push(`Вид: ${job.pest || ""}`);
  lines.push("Цена:");
  (job.price_options || []).forEach((p) => { if (p.amount) lines.push(`${fmt(p.amount)} теңге${p.label ? " - " + p.label : ""}`); });
  lines.push(`Номер телефона: ${job.client_phone || ""}`);
  lines.push(`Гарантия ${job.guarantee_months || 6} месяцев после вторичной (повторной обработки)`);
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
    supabase.from("profiles").select("role, full_name").eq("id", session.user.id).single()
      .then(({ data }) => setProfile(data));
  }, [session]);

  if (booting) return <div className="kd-center">Загрузка…</div>;
  if (!session) return <Login />;
  return <Dashboard session={session} profile={profile} />;
}

// ----------------------------- login -----------------------------
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
        <label className="kd-field"><span>Почта</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.kz" autoComplete="username" /></label>
        <label className="kd-field"><span>Пароль</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
        {err && <div className="kd-err">{err}</div>}
        <button className="kd-btn primary wide" disabled={loading || !email || !pass}>{loading ? "Входим…" : "Войти"}</button>
      </form>
    </div>
  );
}

// ----------------------------- dashboard -----------------------------
function Dashboard({ session, profile }) {
  const [jobs, setJobs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jobs");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const isAdmin = profile?.role === "admin";
  const actorName = profile?.full_name || (isAdmin ? "Админ" : session.user.email);

  function showToast(t) { setToast(t); setTimeout(() => setToast(""), 2200); }

  async function load() {
    setLoading(true);
    const [jr, cr, ar, tr] = await Promise.all([
      supabase.from("jobs").select("*"),
      supabase.from("report_chemicals").select("*"),
      supabase.from("audit_log").select("*").order("ts", { ascending: false }),
      supabase.from("trash").select("*").order("deleted_at", { ascending: false }),
    ]);
    const chems = cr.data || [];
    const withChems = (jr.data || []).map((j) => ({ ...j, chemicals: chems.filter((c) => c.job_id === j.id) }));
    setJobs(withChems);
    setAudit(ar.data || []);
    setTrash(tr.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function logAction(action, summary) {
    await supabase.from("audit_log").insert({ actor: actorName, actor_id: session.user.id, action, summary });
  }

  async function createJob(payload) {
    const { error } = await supabase.from("jobs").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Создание", `${payload.pest} · ${payload.address}`);
    setModal(null); showToast("Заявка создана"); load();
  }

  async function submitReport(job, report, chems, docs) {
    const { error } = await supabase.from("jobs").update({
      report_paid: report.paid, report_cash: report.cash, report_qr: report.qr,
      report_method: report.method, report_note: report.note,
      reported_by: session.user.id, reported_at: new Date().toISOString(),
      followup_wanted: report.followUp.wanted, followup_date: report.followUp.date, followup_note: report.followUp.note,
      docs_needed: docs.needed, docs_avr: docs.avr, docs_dogovor: docs.dogovor, docs_note: docs.note, docs_done: docs.done,
      status: "done",
    }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await supabase.from("report_chemicals").delete().eq("job_id", job.id);
    const rows = chems.filter((c) => c.name).map((c) => ({ job_id: job.id, name: c.name, ml: Number(c.ml) || 0 }));
    if (rows.length) await supabase.from("report_chemicals").insert(rows);
    const payStr = (report.cash > 0 && report.qr > 0)
      ? `${fmt(report.paid)} ₸ (нал ${fmt(report.cash)} + QR ${fmt(report.qr)})`
      : `${fmt(report.paid)} ₸ (${report.method})`;
    await logAction("Отчёт", `${job.pest} · оплата ${payStr}`);
    setModal(null); showToast("Отчёт сохранён"); load();
  }

  async function deleteJob(job) {
    const snapshot = { ...job };
    await supabase.from("trash").insert({ deleted_by: actorName, deleted_by_id: session.user.id, job: snapshot });
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Удаление", `${job.pest} · ${job.address}`);
    showToast("Заявка в корзине"); load();
  }

  async function restore(row) {
    const j = row.job; const chems = j.chemicals || [];
    const { chemicals, ...jobRow } = j;
    const { error } = await supabase.from("jobs").insert(jobRow);
    if (error) { showToast("Ошибка: " + error.message); return; }
    if (chems.length) await supabase.from("report_chemicals").insert(chems.map((c) => ({ job_id: j.id, name: c.name, ml: c.ml })));
    await supabase.from("trash").delete().eq("id", row.id);
    await logAction("Восстановление", `${j.pest} · ${j.address}`);
    showToast("Заявка восстановлена"); load();
  }

  async function purge(row) {
    await supabase.from("trash").delete().eq("id", row.id);
    await logAction("Удалено навсегда", `${row.job.pest} · ${row.job.address}`);
    showToast("Удалено навсегда"); load();
  }

  const sorted = [...jobs].sort((a, b) => jobTime(a) - jobTime(b));
  const groups = groupByDate(sorted);

  const tabs = [
    { id: "jobs", label: "Заявки" },
    { id: "journal", label: "Журнал" },
    { id: "trash", label: `Корзина${trash.length ? " · " + trash.length : ""}` },
  ];

  return (
    <div className="kd-app">
      <header className="kd-top">
        <div className="kd-brand">
          <div className="kd-logo">KD</div>
          <div>
            <div className="kd-brand-name">KazDez</div>
            <div className="kd-brand-sub">{isAdmin ? "Админ" : "Дезинфектор"} · {actorName}</div>
          </div>
        </div>
        <button className="kd-btn ghost" onClick={() => supabase.auth.signOut()}>Выйти</button>
      </header>

      <main className="kd-main">
        <div className="kd-tabbar">
          <div className="kd-tabs">
            {tabs.map((t) => (
              <button key={t.id} className={`kd-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          {tab === "jobs" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "new" })}>+ Новая заявка</button>}
        </div>

        {loading && <div className="kd-empty">Загрузка…</div>}

        {!loading && tab === "jobs" && (
          jobs.length === 0 ? <div className="kd-empty">Заявок пока нет.</div> :
            groups.map((g) => (
              <div key={g.key} className="kd-group">
                <div className={`kd-datehead ${g.past ? "past" : ""}`}><span>{g.label}</span><span className="kd-datecount">{g.jobs.length}</span></div>
                <div className="kd-list">
                  {g.jobs.map((j) => (
                    <JobCard key={j.id} job={j} isAdmin={isAdmin}
                      onCopy={() => copyText(buildMsg(j), () => showToast("Текст скопирован"))}
                      onReport={() => setModal({ kind: "report", job: j })}
                      onView={() => setModal({ kind: "view", job: j })}
                      onDelete={() => deleteJob(j)} />
                  ))}
                </div>
              </div>
            ))
        )}

        {!loading && tab === "journal" && (
          <div className="kd-card">
            {audit.length === 0 && <div className="kd-muted">Пока нет записей.</div>}
            {audit.map((a) => (
              <div key={a.id} className="kd-logrow">
                <span className="kd-logwhen">{fmtTs(a.ts)}</span>
                <span className={`kd-actor ${a.actor === "Админ" || isAdmin ? "admin" : ""}`}>{a.actor}</span>
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

      {modal?.kind === "new" && <NewJobModal onClose={() => setModal(null)} onSave={createJob} />}
      {modal?.kind === "report" && <ReportModal job={modal.job} onClose={() => setModal(null)} onSave={submitReport} />}
      {modal?.kind === "view" && <ViewModal job={modal.job} onClose={() => setModal(null)} />}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

function JobCard({ job, isAdmin, onCopy, onReport, onView, onDelete }) {
  const st = STATUS[job.status] || STATUS.new;
  return (
    <div className="kd-card">
      <div className="kd-card-head">
        <div className="kd-pest">{job.pest}</div>
        <span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
      </div>
      <div className="kd-meta">
        <span>{job.type}</span><span>·</span><span>{isoToRu(job.scheduled_date)} {job.scheduled_time}</span>
        {job.floor && (<><span>·</span><span>{job.floor} этаж</span></>)}
        {job.area && (<><span>·</span><span>{job.area} м²</span></>)}
      </div>
      <div className="kd-addr">{job.address}</div>
      <div className="kd-prices">
        {(job.price_options || []).map((p, i) => (<span className="kd-price" key={i}>{fmt(p.amount)} ₸{p.label ? <em> · {p.label}</em> : null}</span>))}
        {job.source && <span className="kd-srctag">{job.source}</span>}
        {job.docs_needed && <span className="kd-doctag">{job.docs_done ? "Документы готовы" : "Нужны документы"}</span>}
      </div>
      <div className="kd-card-foot">
        <span className="kd-muted">Клиент: {job.client_phone}</span>
        {job.report_paid != null && <span className="kd-muted paid">Оплачено: {fmt(job.report_paid)} ₸</span>}
      </div>
      <div className="kd-actions">
        <button className="kd-btn wa" onClick={onCopy}>Скопировать для WhatsApp</button>
        {isAdmin && job.status !== "done" && <button className="kd-btn primary" onClick={onReport}>Отметить выполненной</button>}
        {job.status === "done" && <button className="kd-btn ghost" onClick={onView}>Отчёт</button>}
        {isAdmin && <button className="kd-btn ghost danger sm" onClick={onDelete} title="Удалить">✕</button>}
      </div>
    </div>
  );
}

// ----------------------------- modals -----------------------------
function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="kd-overlay" onClick={onClose}>
      <div className="kd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-head"><h3>{title}</h3><button className="kd-x" onClick={onClose}>✕</button></div>
        <div className="kd-modal-body">{children}</div>
        {footer && <div className="kd-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => <label className="kd-field"><span>{label}</span>{children}</label>;

function NewJobModal({ onClose, onSave }) {
  const [f, setF] = useState({ type: "Первичная", scheduled_date: "", scheduled_time: "", address: "", floor: "", area: "", source: "", pest: "", p1label: "С запахом", p1amount: "", p2label: "Без запаха", p2amount: "", client_phone: "+7 ", guarantee_months: 6 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.address && f.pest && (f.p1amount || f.p2amount);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const price_options = [];
    if (f.p1amount) price_options.push({ label: f.p1label, amount: Number(f.p1amount) });
    if (f.p2amount) price_options.push({ label: f.p2label, amount: Number(f.p2amount) });
    await onSave({ type: f.type, scheduled_date: f.scheduled_date || null, scheduled_time: f.scheduled_time, address: f.address, floor: f.floor, area: f.area ? Number(f.area) : null, source: f.source, pest: f.pest, price_options, client_phone: f.client_phone, guarantee_months: Number(f.guarantee_months) || 6, status: "new" });
    setSaving(false);
  }
  return (
    <ModalShell title="Новая заявка" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "Сохраняем…" : "Создать"}</button>
    </>}>
      <div className="kd-grid2">
        <Field label="Тип обработки"><select value={f.type} onChange={set("type")}><option>Первичная</option><option>Вторичная</option><option>Гарантийная</option></select></Field>
        <Field label="Вид (вредитель)"><input value={f.pest} onChange={set("pest")} placeholder="Тараканы" /></Field>
        <Field label="Дата"><input type="date" value={f.scheduled_date} onChange={set("scheduled_date")} /></Field>
        <Field label="Время"><input value={f.scheduled_time} onChange={set("scheduled_time")} placeholder="12:00" /></Field>
      </div>
      <Field label="Адрес"><input value={f.address} onChange={set("address")} placeholder="ул. ..., кв. ..." /></Field>
      <div className="kd-grid3">
        <Field label="Этаж"><input value={f.floor} onChange={set("floor")} inputMode="numeric" placeholder="5" /></Field>
        <Field label="Метраж (м²)"><input value={f.area} onChange={set("area")} inputMode="numeric" placeholder="45" /></Field>
        <Field label="Источник"><input value={f.source} onChange={set("source")} placeholder="OLX" /></Field>
      </div>
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
    </ModalShell>
  );
}

function ReportModal({ job, onClose, onSave }) {
  const [cash, setCash] = useState(""); const [qr, setQr] = useState(""); const [note, setNote] = useState("");
  const [chems, setChems] = useState([{ name: "", ml: "" }, { name: "", ml: "" }]);
  const [fuWanted, setFuWanted] = useState(false); const [fuDate, setFuDate] = useState(""); const [fuNote, setFuNote] = useState("");
  const [docNeeded, setDocNeeded] = useState(false); const [avr, setAvr] = useState(false); const [dogovor, setDogovor] = useState(false); const [docNote, setDocNote] = useState("");
  const [saving, setSaving] = useState(false);
  const total = (Number(cash) || 0) + (Number(qr) || 0);
  const setChem = (i, k) => (e) => { const n = chems.slice(); n[i] = { ...n[i], [k]: e.target.value }; setChems(n); };
  function methodLabel() { const c = Number(cash) || 0, q = Number(qr) || 0; if (c > 0 && q > 0) return "Наличные + QR"; if (q > 0) return "QR"; return "Наличные"; }
  async function save() {
    setSaving(true);
    await onSave(job,
      { paid: total, cash: Number(cash) || 0, qr: Number(qr) || 0, method: methodLabel(), note, followUp: { wanted: fuWanted, date: fuDate, note: fuNote } },
      chems, { needed: docNeeded, avr, dogovor, note: docNote, done: false });
    setSaving(false);
  }
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={total <= 0 || saving} onClick={save}>{saving ? "Сохраняем…" : "Сохранить отчёт"}</button>
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
      {chems.map((c, i) => (
        <div className="kd-chemrow" key={i}>
          <input placeholder="Препарат (Культ)" value={c.name} onChange={setChem(i, "name")} />
          <input placeholder="мл" inputMode="numeric" value={c.ml} onChange={setChem(i, "ml")} />
        </div>
      ))}
      <button className="kd-btn ghost sm" onClick={() => setChems([...chems, { name: "", ml: "" }])}>+ ещё препарат</button>
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

function ViewModal({ job, onClose }) {
  const hasSplit = (job.report_cash || 0) > 0 && (job.report_qr || 0) > 0;
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
      {(job.chemicals || []).map((c) => (<div className="kd-row" key={c.id}><span>{c.name}</span><strong>{fmt(c.ml)} мл</strong></div>))}
      {job.followup_wanted && <div className="kd-followbox"><strong>Повторный выезд:</strong> {job.followup_note || "по просьбе клиента"}{job.followup_date ? ` — ${job.followup_date}` : ""}</div>}
      {job.docs_needed && <div className="kd-docbox"><strong>Документы:</strong> {[job.docs_avr && "АВР", job.docs_dogovor && "Договор"].filter(Boolean).join(", ") || "да"}{job.docs_note ? ` — ${job.docs_note}` : ""}{job.docs_done ? " · готовы" : " · ожидают"}</div>}
    </ModalShell>
  );
}
