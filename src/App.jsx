import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ----------------------------- helpers -----------------------------
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const isoToRu = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

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
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone, onDone);
  } else { onDone && onDone(); }
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
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setErr("");
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.kz" autoComplete="username" />
        </label>
        <label className="kd-field"><span>Пароль</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </label>
        {err && <div className="kd-err">{err}</div>}
        <button className="kd-btn primary wide" disabled={loading || !email || !pass}>{loading ? "Входим…" : "Войти"}</button>
      </form>
    </div>
  );
}

// ----------------------------- dashboard -----------------------------
function Dashboard({ session, profile }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const isAdmin = profile?.role === "admin";

  function showToast(t) { setToast(t); setTimeout(() => setToast(""), 1900); }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("jobs").select("*");
    if (!error) setJobs(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createJob(payload) {
    const { error } = await supabase.from("jobs").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка сохранения: " + error.message); return; }
    setModal(false); showToast("Заявка создана"); load();
  }

  const sorted = [...jobs].sort((a, b) => jobTime(a) - jobTime(b));
  const groups = groupByDate(sorted);

  return (
    <div className="kd-app">
      <header className="kd-top">
        <div className="kd-brand">
          <div className="kd-logo">KD</div>
          <div>
            <div className="kd-brand-name">KazDez</div>
            <div className="kd-brand-sub">{isAdmin ? "Админ" : "Дезинфектор"} · {profile?.full_name || session.user.email}</div>
          </div>
        </div>
        <button className="kd-btn ghost" onClick={() => supabase.auth.signOut()}>Выйти</button>
      </header>

      <main className="kd-main">
        <div className="kd-tabbar">
          <div className="kd-title">Заявки</div>
          {isAdmin && <button className="kd-btn primary" onClick={() => setModal(true)}>+ Новая заявка</button>}
        </div>

        {loading ? (
          <div className="kd-empty">Загрузка…</div>
        ) : jobs.length === 0 ? (
          <div className="kd-empty">Заявок пока нет. {isAdmin ? "Создай первую через «+ Новая заявка»." : ""}</div>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="kd-group">
              <div className={`kd-datehead ${g.past ? "past" : ""}`}>
                <span>{g.label}</span><span className="kd-datecount">{g.jobs.length}</span>
              </div>
              <div className="kd-list">
                {g.jobs.map((j) => (
                  <JobCard key={j.id} job={j} onCopy={() => copyText(buildMsg(j), () => showToast("Текст скопирован"))} />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {modal && <NewJobModal onClose={() => setModal(false)} onSave={createJob} />}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

function JobCard({ job, onCopy }) {
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
        {(job.price_options || []).map((p, i) => (
          <span className="kd-price" key={i}>{fmt(p.amount)} ₸{p.label ? <em> · {p.label}</em> : null}</span>
        ))}
        {job.source && <span className="kd-srctag">{job.source}</span>}
      </div>
      <div className="kd-card-foot"><span className="kd-muted">Клиент: {job.client_phone}</span></div>
      <div className="kd-actions">
        <button className="kd-btn wa" onClick={onCopy}>Скопировать для WhatsApp</button>
      </div>
    </div>
  );
}

function NewJobModal({ onClose, onSave }) {
  const [f, setF] = useState({
    type: "Первичная", scheduled_date: "", scheduled_time: "", address: "", floor: "", area: "",
    source: "", pest: "", p1label: "С запахом", p1amount: "", p2label: "Без запаха", p2amount: "",
    client_phone: "+7 ", guarantee_months: 6,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.address && f.pest && (f.p1amount || f.p2amount);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const price_options = [];
    if (f.p1amount) price_options.push({ label: f.p1label, amount: Number(f.p1amount) });
    if (f.p2amount) price_options.push({ label: f.p2label, amount: Number(f.p2amount) });
    await onSave({
      type: f.type, scheduled_date: f.scheduled_date || null, scheduled_time: f.scheduled_time,
      address: f.address, floor: f.floor, area: f.area ? Number(f.area) : null, source: f.source,
      pest: f.pest, price_options, client_phone: f.client_phone,
      guarantee_months: Number(f.guarantee_months) || 6, status: "new",
    });
    setSaving(false);
  }

  return (
    <div className="kd-overlay" onClick={onClose}>
      <div className="kd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kd-modal-head"><h3>Новая заявка</h3><button className="kd-x" onClick={onClose}>✕</button></div>
        <div className="kd-modal-body">
          <div className="kd-grid2">
            <label className="kd-field"><span>Тип обработки</span>
              <select value={f.type} onChange={set("type")}><option>Первичная</option><option>Вторичная</option><option>Гарантийная</option></select>
            </label>
            <label className="kd-field"><span>Вид (вредитель)</span><input value={f.pest} onChange={set("pest")} placeholder="Тараканы" /></label>
            <label className="kd-field"><span>Дата</span><input type="date" value={f.scheduled_date} onChange={set("scheduled_date")} /></label>
            <label className="kd-field"><span>Время</span><input value={f.scheduled_time} onChange={set("scheduled_time")} placeholder="12:00" /></label>
          </div>
          <label className="kd-field"><span>Адрес</span><input value={f.address} onChange={set("address")} placeholder="ул. ..., кв. ..." /></label>
          <div className="kd-grid3">
            <label className="kd-field"><span>Этаж</span><input value={f.floor} onChange={set("floor")} inputMode="numeric" placeholder="5" /></label>
            <label className="kd-field"><span>Метраж (м²)</span><input value={f.area} onChange={set("area")} inputMode="numeric" placeholder="45" /></label>
            <label className="kd-field"><span>Источник</span><input value={f.source} onChange={set("source")} placeholder="OLX" /></label>
          </div>
          <div className="kd-grid2">
            <label className="kd-field"><span>Цена 1 — подпись</span><input value={f.p1label} onChange={set("p1label")} /></label>
            <label className="kd-field"><span>Цена 1 — сумма (₸)</span><input value={f.p1amount} onChange={set("p1amount")} inputMode="numeric" placeholder="15000" /></label>
            <label className="kd-field"><span>Цена 2 — подпись</span><input value={f.p2label} onChange={set("p2label")} /></label>
            <label className="kd-field"><span>Цена 2 — сумма (₸)</span><input value={f.p2amount} onChange={set("p2amount")} inputMode="numeric" placeholder="20000" /></label>
          </div>
          <div className="kd-grid2">
            <label className="kd-field"><span>Телефон клиента</span><input value={f.client_phone} onChange={set("client_phone")} placeholder="+7 701 ..." /></label>
            <label className="kd-field"><span>Гарантия (мес.)</span><input value={f.guarantee_months} onChange={set("guarantee_months")} inputMode="numeric" /></label>
          </div>
        </div>
        <div className="kd-modal-foot">
          <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
          <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "Сохраняем…" : "Создать"}</button>
        </div>
      </div>
    </div>
  );
}
