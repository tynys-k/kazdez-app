// Временная шкала вкладки «График».
//
// По умолчанию день показывается с 07:00 до 23:00. Если на выбранный день есть
// заявки вне этого окна, шкала расширяется ровно на нужные часы:
//  - ранние утренние заявки (05:30–07:00 того же дня) сдвигают начало раньше;
//  - ночные заявки (00:00–05:29) хранятся на свою календарную дату, то есть на
//    СЛЕДУЮЩИЙ день, но показываются хвостом текущего дня — после 24:00.
// Минуты на шкале отсчитываются от полуночи выбранного дня, поэтому 02:00
// следующей ночи — это 26 * 60.
import { isoOf, parseIso } from "./shared";

export const DAY_START = 7 * 60;
export const DAY_END = 23 * 60;
// Заявки раньше этого времени — ночь предыдущего дня, а не раннее утро.
export const NIGHT_TAIL_END = 5 * 60 + 30;
const DEFAULT_LENGTH = 60;
const MIN_LENGTH = 30;

// "23:00–02:00" → { from: 1380, to: 1560 }: конец раньше начала значит переход через полночь.
export function scheduleRange(time) {
  const all = [...String(time || "").matchAll(/(\d{1,2}):(\d{2})/g)];
  if (!all.length) return null;
  const from = Number(all[0][1]) * 60 + Number(all[0][2]);
  let to = all[1] ? Number(all[1][1]) * 60 + Number(all[1][2]) : from + DEFAULT_LENGTH;
  if (all[1] && to < from) to += 24 * 60;
  return { from, to: Math.max(to, from + MIN_LENGTH) };
}

function shiftIso(iso, days) {
  const d = parseIso(iso);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

const isNight = (range) => range.from < NIGHT_TAIL_END;

// Какие заявки и в каком окне показывать на дату dateIso.
// items — заявки со временем (from/to в минутах шкалы), untimed — без времени.
export function scheduleDay(jobs = [], dateIso) {
  const nextIso = shiftIso(dateIso, 1);
  const items = [], untimed = [];
  let nightOnPrevDay = 0;
  for (const job of jobs) {
    if (job.status === "canceled") continue;
    const range = scheduleRange(job.scheduled_time);
    if (job.scheduled_date === dateIso) {
      if (!range) untimed.push(job);
      else if (isNight(range)) nightOnPrevDay += 1;
      else items.push({ job, from: range.from, to: range.to, nextDay: false });
    } else if (job.scheduled_date === nextIso && range && isNight(range)) {
      items.push({ job, from: range.from + 24 * 60, to: range.to + 24 * 60, nextDay: true });
    }
  }
  items.sort((a, b) => a.from - b.from);
  const start = Math.min(DAY_START, ...items.map((x) => Math.floor(x.from / 60) * 60));
  const end = Math.max(DAY_END, ...items.map((x) => Math.ceil(x.to / 60) * 60));
  const hours = [];
  for (let h = start / 60; h <= end / 60; h++) hours.push(h);
  return { start, end, hours, items, untimed, nightOnPrevDay, nextIso };
}

export const hourLabel = (h) => `${String(h % 24).padStart(2, "0")}:00`;

// Положение «сейчас» на шкале выбранного дня (минуты) или null, если не попадает в окно.
export function nowOnScale(dateIso, { start, end }, now = new Date()) {
  const day = parseIso(dateIso);
  if (!day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((today - day) / 86400000);
  const minute = dayDiff * 24 * 60 + now.getHours() * 60 + now.getMinutes();
  return minute >= start && minute <= end ? minute : null;
}
