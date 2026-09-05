import { useEffect, useRef, useState } from "react";

export function readLocalDraft(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

export function useLocalDraft(key, value, enabled = true) {
  const serialized = JSON.stringify(value);
  const [error, setError] = useState("");
  const completed = useRef(false);

  function persist() {
    if (!enabled || completed.current) return false;
    try {
      if (serialized === "null") localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ ...JSON.parse(serialized), savedAt: new Date().toISOString() }));
      setError("");
      return true;
    } catch {
      setError("Черновик не сохранён на устройстве: хранилище недоступно или заполнено. Не закрывайте форму до отправки на сервер.");
      return false;
    }
  }

  // Depend on the whole payload: newly added fields cannot silently miss autosave.
  // No delayed write remains to recreate a draft after a successful submission.
  useEffect(() => { if (enabled && !completed.current) persist(); }, [key, serialized, enabled]);

  function clear() {
    completed.current = true;
    try { localStorage.removeItem(key); }
    catch { /* Server confirmation, not cache cleanup, determines submission success. */ }
  }
  return { error, persist, clear };
}
