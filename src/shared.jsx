// KAZDEZ-USABILITY-YANDEX-2026-07-18
import React, { useState } from "react";
import { Calendar, ExternalLink } from "lucide-react";

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
const TAB_LABELS = { today: "Сегодня", jobs: "Заявки", schedule: "График", done: "Выполненные", canceled: "Отменённые", leads: "Клиенты", tasks: "Задачи", tenders: "Тендеры", repeats: "Повторы", growth: "Прибыль и KPI", retention: "Касания", subscriptions: "Абоненты", routes: "Маршруты", finance: "Аналитика", opex: "Финансы", cash: "Касса", stock: "Склад", team: "Дезинфекторы", partners: "Партнёры", docs: "Документы", materials: "Материалы", knowledge: "База знаний", journal: "Журнал", trash: "Корзина" };
const ADMIN_TAB_ORDER = ["today", "jobs", "schedule", "done", "canceled", "tasks", "repeats", "leads", "retention", "subscriptions", "routes", "growth", "finance", "opex", "cash", "stock", "team", "partners", "tenders", "docs", "materials", "knowledge", "journal", "trash"];
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
function yandexMapUrl(text) {
  const raw = String(text || "").trim();
  const existingYandex = (raw.match(/https?:\/\/(?:[^/\s]+\.)?yandex\.(?:ru|com|kz)\/maps[^\s]*/i) || [])[0];
  if (existingYandex) return existingYandex;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* оставляем исходную строку */ }
  const coords = decoded.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
    || decoded.match(/[?&](?:q|query|destination)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i);
  if (coords) return `https://yandex.com/maps/?rtext=~${coords[1]},${coords[2]}&rtt=auto`;
  const plain = addressPlain(raw);
  const query = plain === "📍 точка на карте" ? raw.replace(/https?:\/\/[^\s]+/g, "").trim() : plain;
  return query ? `https://yandex.com/maps/?text=${encodeURIComponent(query)}` : "https://yandex.com/maps/";
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
  const url = yandexMapUrl(text);
  const before = text.slice(0, urlMatch.index).trim();
  const after = text.slice(urlMatch.index + url.length).trim();
  return (
    <>
      {before && <span>{before} </span>}
      <a href={url} target="_blank" rel="noopener noreferrer" className="kd-maplink" onClick={(e) => e.stopPropagation()}>📍 Яндекс Карты</a>
      {after && <span> {after}</span>}
    </>
  );
}
function DateFilterBar({ filter, onChange, hide = [] }) {
  const [showCustom, setShowCustom] = useState(filter.preset === "custom");
  const presets = [
    { id: "all", label: "Всё" }, { id: "today", label: "Сегодня" }, { id: "tomorrow", label: "Завтра" },
    { id: "yesterday", label: "Вчера" }, { id: "week", label: "Неделя" }, { id: "month", label: "Месяц" }, { id: "quarter", label: "Квартал" },
  ].filter((p) => !hide.includes(p.id));
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
function technicianArrivalMessage(job) {
  const time = (String(job?.scheduled_time || "").match(/(?:[01]?\d|2[0-3]):[0-5]\d/) || [])[0];
  if (time) {
    return `Сәлеметсіз бе! Мен дезинфектормын, сізге дезинфекция бойынша жазып отырмын. Сіздерде сағат ${time}-де боламын.\n\nЗдравствуйте! Пишу по поводу дезинфекции. Я дезинфектор, приеду к вам к ${time}.`;
  }
  return "Сәлеметсіз бе! Мен дезинфектормын, сізге дезинфекция бойынша жазып отырмын. Сіздерде келісілген уақытта боламын.\n\nЗдравствуйте! Пишу по поводу дезинфекции. Я дезинфектор, приеду к вам в согласованное время.";
}
function jobWhatsappUrl(job, isAdmin) {
  const phone = String(job?.client_phone || "").replace(/\D/g, "");
  if (!phone) return "";
  if (isAdmin) return `https://wa.me/${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(technicianArrivalMessage(job))}`;
}
function copyText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(onDone, onDone);
  else onDone && onDone();
}

// ----------------------------- root -----------------------------

export { ADMIN_TAB_ORDER, AddressText, DEPOSIT_STATUS, DOC_STATUS, DOC_TYPES, DRIVE_LINKS, DateFilterBar, DriveLinkCard, EQUIP_CATEGORIES, EQUIP_STATUS, EXPENSE_TYPES, GUARANTEE_KINDS, MONTHS_GEN, MONTHS_NOM, REPEAT_POLICIES, STATUS, TAB_LABELS, TASK_STATUS, TASK_TYPES, TENDER_STATUS, WEEKDAYS, addressPlain, buildMsg, chemUnit, copyText, dateGroupLabel, dateInFilter, datePresetRange, daysSince, fmt, fmtAmount, fmtTs, groupByDate, isPast, isoOf, isoToRu, jobTime, jobWhatsappUrl, lineAmount, ml2l, norm, parseIso, periodRange, pricePerBase, repeatLabel, technicianArrivalMessage, timeRangeMin, timeStart, todayStart };
