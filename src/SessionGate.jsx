import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ROLE_DEFINITIONS } from "./shared";

// Do not mount the data-owning screen until the current user's profile is known.
// The user id on the result also protects the render before effect cleanup runs.
export default function SessionGate({ login, children }) {
  const [auth, setAuth] = useState({ loading: true, session: null, error: false });
  const [access, setAccess] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [exitError, setExitError] = useState(false);
  const userId = auth.session?.user?.id;

  useEffect(() => {
    let active = true;
    let authChanged = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      if (active) setAuth({ loading: false, session, error: false });
    });
    Promise.resolve().then(() => supabase.auth.getSession()).then(({ data, error }) => {
      if (active && !authChanged) setAuth({ loading: false, session: data?.session || null, error: !!error });
    }).catch(() => {
      if (active && !authChanged) setAuth({ loading: false, session: null, error: true });
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    setAccess(null);
    if (!userId) return () => { active = false; };
    Promise.resolve().then(() => supabase.from("profiles")
      .select("id, role, full_name, phone, is_active, access_overrides, branch_id")
      .eq("id", userId).single()).then(({ data, error }) => {
      if (!active) return;
      const valid = !error && data?.id === userId && Object.hasOwn(ROLE_DEFINITIONS, data.role);
      setAccess({ userId, profile: valid ? data : null, error: !valid });
    }).catch(() => { if (active) setAccess({ userId, profile: null, error: true }); });
    return () => { active = false; };
  }, [userId, attempt]);

  async function signOut() {
    setExitError(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setExitError(true);
    } catch { setExitError(true); }
  }
  function retry() {
    setAccess(null);
    if (auth.error) setAuth({ loading: true, session: null, error: false });
    setAttempt((value) => value + 1);
  }

  if (auth.loading) return <div className="kd-center" role="status">Загрузка…</div>;
  if (auth.error || (userId && access?.userId === userId && access.error)) {
    return <div className="kd-center"><div className="kd-card" style={{ maxWidth: 460 }} role="alert">
      <h2>Не удалось проверить доступ</h2>
      <p className="kd-muted">Проверьте соединение и повторите загрузку. Если ошибка остаётся, попросите администратора проверить профиль сотрудника.</p>
      <button className="kd-btn primary" onClick={retry}>Повторить</button>
      {userId && <button className="kd-btn ghost" onClick={signOut}>Выйти</button>}
      {exitError && <p className="kd-err">Не удалось выйти. Попробуйте ещё раз.</p>}
    </div></div>;
  }
  if (!userId) return login;
  if (access?.userId !== userId || !access.profile) return <div className="kd-center" role="status">Проверяем доступ…</div>;
  if (access.profile.is_active === false) return <div className="kd-center"><div className="kd-card" style={{ maxWidth: 460 }}>
    <h2>Доступ отключён</h2><p className="kd-muted">Администратор временно отключил эту учётную запись.</p>
    <button className="kd-btn ghost" onClick={signOut}>Выйти</button>
    {exitError && <p className="kd-err" role="alert">Не удалось выйти. Попробуйте ещё раз.</p>}
  </div></div>;
  return children(auth.session, access.profile);
}
