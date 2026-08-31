// Журнал ошибок приложения.
//
// Раньше ошибка показывалась пользователю строкой «Ошибка: …» и исчезала.
// Никто не узнавал, что она была: три поломки прожили от двух недель до месяца,
// пока владелец случайно не заметил их глазами. Теперь каждая ошибка попадает
// в таблицу client_errors в нашей же базе — без внешних сервисов, чтобы данные
// клиентов и суммы никуда не уходили.
//
// Главное правило модуля: он НИКОГДА не мешает работе. Если записать не вышло —
// молча забываем. Сообщение об ошибке журнала ошибок было бы издевательством.

import { supabase } from "./supabaseClient";

// Кто сейчас работает — подставляется из приложения после входа.
let actor = { id: null, name: null };
export function setErrorActor(id, name) { actor = { id: id || null, name: name || null }; }

// Одна и та же ошибка часто повторяется десятки раз подряд (цикл перерисовки,
// повторные запросы). Пишем один раз в минуту, иначе таблица засорится.
const recent = new Map();
const REPEAT_WINDOW_MS = 60_000;
function seenRecently(key) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > REPEAT_WINDOW_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

const clip = (v, max) => (v == null ? null : String(v).slice(0, max));

export async function logClientError({ kind, place, message, stack }) {
  try {
    const text = clip(message, 1000);
    if (!text) return;
    if (seenRecently(`${kind}|${place}|${text}`)) return;
    await supabase.from("client_errors").insert({
      user_id: actor.id, user_name: actor.name,
      kind: kind || "handled", place: clip(place, 200), message: text,
      stack: clip(stack, 4000),
      url: clip(window.location?.href, 500),
      user_agent: clip(navigator.userAgent, 300),
    });
  } catch {
    // Журнал ошибок, который сам шумит ошибками, бесполезен.
  }
}

// Ловим то, что иначе не заметит никто: падения вне обработчиков и
// необработанные промисы. Ставится один раз при запуске.
let installed = false;
export function installGlobalErrorLogging() {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => {
    logClientError({
      kind: "window",
      place: "глобальная ошибка",
      message: e?.message || String(e?.error || "неизвестная ошибка"),
      stack: e?.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e?.reason;
    logClientError({
      kind: "promise",
      place: "необработанный промис",
      message: reason?.message || String(reason || "неизвестная причина"),
      stack: reason?.stack,
    });
  });
}
