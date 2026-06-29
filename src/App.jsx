import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ----------------------------- helpers -----------------------------
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ml2l = (ml) => Math.round(((Number(ml) || 0) / 1000) * 100) / 100;
const norm = (s) => (s || "").trim().toLowerCase();
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
function buildMsg(job) {
  const lines = ["Наша заявка", `${job.type || "Первичная"} обработка`, `Дата: ${isoToRu(job.scheduled_date)}`, `Время: ${job.scheduled_time || ""}`, `Адрес: ${job.address || ""}`];
  if (job.floor) lines.push(`Этаж: ${job.floor}`);
  if (job.area) lines.push(`Метраж: ${job.area} м²`);
  lines.push(`Вид: ${job.pest || ""}`, "Цена:");
  (job.price_options || []).forEach((p) => { if (p.amount) lines.push(`${fmt(p.amount)} теңге${p.label ? " - " + p.label : ""}`); });
  lines.push(`Номер телефона: ${job.client_phone || ""}`, `Гарантия ${job.guarantee_months || 6} месяцев после вторичной (повторной обработки)`);
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
  const [audit, setAudit] = useState([]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("jobs");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [pMode, setPMode] = useState("all");
  const [pOff, setPOff] = useState(0);
  const isAdmin = profile?.role === "admin";
  const actorName = profile?.full_name || (isAdmin ? "Админ" : session.user.email);

  function showToast(t) { setToast(t); setTimeout(() => setToast(""), 2200); }

  async function load() {
    setLoading(true);
    const [jr, cr, chr, ar, tr] = await Promise.all([
      supabase.from("jobs").select("*"),
      supabase.from("report_chemicals").select("*"),
      supabase.from("chemicals").select("*"),
      supabase.from("audit_log").select("*").order("ts", { ascending: false }),
      supabase.from("trash").select("*").order("deleted_at", { ascending: false }),
    ]);
    const chems = cr.data || [];
    setJobs((jr.data || []).map((j) => ({ ...j, chemicals: chems.filter((c) => c.job_id === j.id) })));
    setChemicals(chr.data || []);
    setAudit(ar.data || []);
    setTrash(tr.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function logAction(action, summary) {
    await supabase.from("audit_log").insert({ actor: actorName, actor_id: session.user.id, action, summary });
  }
  const pricePerMl = (name) => { const c = chemicals.find((x) => norm(x.name) === norm(name)); return c ? (Number(c.price_per_liter) || 0) / 1000 : 0; };
  const jobChemCost = (job) => (job.chemicals || []).reduce((s, c) => s + (Number(c.ml) || 0) * pricePerMl(c.name), 0);

  async function createJob(payload) {
    const { error } = await supabase.from("jobs").insert({ ...payload, created_by: session.user.id });
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Создание", `${payload.pest} · ${payload.address}`);
    setModal(null); showToast("Заявка создана"); load();
  }
  async function submitReport(job, report, chems, docs) {
    const { error } = await supabase.from("jobs").update({
      report_paid: report.paid, report_cash: report.cash, report_qr: report.qr, report_method: report.method, report_note: report.note,
      reported_by: session.user.id, reported_at: new Date().toISOString(),
      followup_wanted: report.followUp.wanted, followup_date: report.followUp.date, followup_note: report.followUp.note,
      docs_needed: docs.needed, docs_avr: docs.avr, docs_dogovor: docs.dogovor, docs_note: docs.note, docs_done: docs.done, status: "done",
    }).eq("id", job.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await supabase.from("report_chemicals").delete().eq("job_id", job.id);
    const rows = chems.filter((c) => c.name).map((c) => ({ job_id: job.id, name: c.name, ml: Number(c.ml) || 0 }));
    if (rows.length) await supabase.from("report_chemicals").insert(rows);
    const payStr = (report.cash > 0 && report.qr > 0) ? `${fmt(report.paid)} ₸ (нал ${fmt(report.cash)} + QR ${fmt(report.qr)})` : `${fmt(report.paid)} ₸ (${report.method})`;
    await logAction("Отчёт", `${job.pest} · оплата ${payStr}`);
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
  async function addChem(c) {
    const { error } = await supabase.from("chemicals").insert(c);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Склад", `Новый препарат: ${c.name} (${ml2l(c.purchased_ml)} л)`);
    setModal(null); showToast("Препарат добавлен"); load();
  }
  async function stockIn(chem, addMl, newPrice) {
    const patch = { purchased_ml: (Number(chem.purchased_ml) || 0) + addMl };
    if (newPrice != null) patch.price_per_liter = newPrice;
    const { error } = await supabase.from("chemicals").update(patch).eq("id", chem.id);
    if (error) { showToast("Ошибка: " + error.message); return; }
    await logAction("Склад", `Приход: ${chem.name} +${ml2l(addMl)} л`);
    setModal(null); showToast("Приход оформлен"); load();
  }
  async function removeChem(chem) {
    await supabase.from("chemicals").delete().eq("id", chem.id);
    await logAction("Склад", `Удалён препарат: ${chem.name}`);
    showToast("Препарат удалён"); load();
  }

  // ---- финансы за период ----
  const range = periodRange(pMode, pOff);
  const fin = (() => {
    const weekIdx = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const week = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: WEEKDAYS[dow].slice(0, 2), count: 0, revenue: 0 }));
    let revenue = 0, cost = 0, cash = 0, qr = 0; const bySource = {};
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
        bySource[src].revenue += paid;
        if (dt) { const wi = weekIdx[dt.getDay()]; week[wi].count++; week[wi].revenue += paid; }
      }
    });
    const weekMax = Math.max(1, ...week.map((w) => w.revenue));
    return { revenue, cost, profit: revenue - cost, cash, qr, bySource, week, weekMax };
  })();

  // ---- склад ----
  const inventory = chemicals.map((c) => {
    const used = jobs.reduce((s, j) => s + (j.chemicals || []).filter((x) => norm(x.name) === norm(c.name)).reduce((a, x) => a + (Number(x.ml) || 0), 0), 0);
    const remaining = (Number(c.purchased_ml) || 0) - used;
    return { ...c, used, remaining, low: remaining <= (Number(c.min_ml) || 0), stockValue: remaining * ((Number(c.price_per_liter) || 0) / 1000) };
  });
  const lowCount = inventory.filter((i) => i.low).length;

  const sorted = [...jobs].sort((a, b) => jobTime(a) - jobTime(b));
  const groups = groupByDate(sorted);
  const tabs = [
    { id: "jobs", label: "Заявки" },
    { id: "finance", label: "Финансы" },
    { id: "stock", label: `Склад${lowCount ? " · " + lowCount + " мало" : ""}` },
    { id: "journal", label: "Журнал" },
    { id: "trash", label: `Корзина${trash.length ? " · " + trash.length : ""}` },
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
          {tab === "jobs" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "new" })}>+ Новая заявка</button>}
          {tab === "stock" && isAdmin && <button className="kd-btn primary" onClick={() => setModal({ kind: "addchem" })}>+ Препарат</button>}
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
                  <span className="kd-muted">{fmt(c.price_per_liter)} ₸/л</span>
                </div>
                <div className="kd-stockgrid">
                  <div><span>Куплено</span><strong>{ml2l(c.purchased_ml)} л</strong></div>
                  <div><span>Ушло</span><strong>{fmt(c.used)} мл</strong></div>
                  <div><span>Остаток</span><strong style={{ color: c.low ? "#B42318" : "var(--primary)" }}>{ml2l(c.remaining)} л</strong></div>
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

      {modal?.kind === "new" && <NewJobModal onClose={() => setModal(null)} onSave={createJob} />}
      {modal?.kind === "report" && <ReportModal job={modal.job} chemicals={chemicals} onClose={() => setModal(null)} onSave={submitReport} />}
      {modal?.kind === "view" && <ViewModal job={modal.job} onClose={() => setModal(null)} />}
      {modal?.kind === "addchem" && <AddChemModal onClose={() => setModal(null)} onSave={addChem} />}
      {modal?.kind === "stockin" && <StockInModal chem={modal.chem} onClose={() => setModal(null)} onSave={stockIn} />}
      {toast && <div className="kd-toast">{toast}</div>}
    </div>
  );
}

function JobCard({ job, isAdmin, onCopy, onReport, onView, onDelete }) {
  const st = STATUS[job.status] || STATUS.new;
  return (
    <div className="kd-card">
      <div className="kd-card-head"><div className="kd-pest">{job.pest}</div><span className="kd-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span></div>
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

function ReportModal({ job, chemicals, onClose, onSave }) {
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
    await onSave(job, { paid: total, cash: Number(cash) || 0, qr: Number(qr) || 0, method: methodLabel(), note, followUp: { wanted: fuWanted, date: fuDate, note: fuNote } }, chems, { needed: docNeeded, avr, dogovor, note: docNote, done: false });
    setSaving(false);
  }
  return (
    <ModalShell title="Отчёт по заявке" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={total <= 0 || saving} onClick={save}>{saving ? "Сохраняем…" : "Сохранить отчёт"}</button>
    </>}>
      <datalist id="kd-chemlist">{(chemicals || []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
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
          <input list="kd-chemlist" placeholder="Препарат (Культ)" value={c.name} onChange={setChem(i, "name")} />
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

function AddChemModal({ onClose, onSave }) {
  const [name, setName] = useState(""); const [liters, setLiters] = useState(""); const [price, setPrice] = useState(""); const [minL, setMinL] = useState("1");
  const [saving, setSaving] = useState(false);
  const ok = name && liters && price;
  async function save() {
    setSaving(true);
    await onSave({ name, purchased_ml: (Number(liters) || 0) * 1000, price_per_liter: Number(price) || 0, min_ml: (Number(minL) || 0) * 1000 });
    setSaving(false);
  }
  return (
    <ModalShell title="Препарат на склад" onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!ok || saving} onClick={save}>{saving ? "…" : "Добавить"}</button>
    </>}>
      <Field label="Название"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Культ" /></Field>
      <div className="kd-grid2">
        <Field label="Куплено (литров)"><input value={liters} onChange={(e) => setLiters(e.target.value)} inputMode="decimal" placeholder="5" /></Field>
        <Field label="Цена (₸ за литр)"><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="18000" /></Field>
      </div>
      <Field label="Сигнал «мало» при остатке (литров)"><input value={minL} onChange={(e) => setMinL(e.target.value)} inputMode="decimal" placeholder="1" /></Field>
    </ModalShell>
  );
}

function StockInModal({ chem, onClose, onSave }) {
  const [liters, setLiters] = useState(""); const [price, setPrice] = useState(""); const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    await onSave(chem, (Number(liters) || 0) * 1000, price ? Number(price) : null);
    setSaving(false);
  }
  return (
    <ModalShell title={`Приход: ${chem.name}`} onClose={onClose} footer={<>
      <button className="kd-btn ghost" onClick={onClose}>Отмена</button>
      <button className="kd-btn primary" disabled={!liters || saving} onClick={save}>{saving ? "…" : "Оформить"}</button>
    </>}>
      <div className="kd-muted" style={{ marginBottom: 12 }}>Текущая цена: {fmt(chem.price_per_liter)} ₸/л</div>
      <Field label="Докуплено (литров)"><input value={liters} onChange={(e) => setLiters(e.target.value)} inputMode="decimal" placeholder="5" /></Field>
      <Field label="Новая цена за литр (если изменилась)"><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="оставь пустым, если та же" /></Field>
    </ModalShell>
  );
}
