// Разместить как: supabase/functions/admin-users/index.ts
// Не переносите SUPABASE_SERVICE_ROLE_KEY в браузер — он используется только внутри Edge Function.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
// Должно совпадать с profiles_role_kazdez_check в базе (см. supabase/2026-10-22_hunter_role.sql).
const roles = new Set(["tech", "manager", "marketer", "accountant", "tender", "curator", "hunter"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Метод не поддерживается" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Нужен вход в систему" }, 401);

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Сессия недействительна" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: callerProfile } = await admin.from("profiles").select("role,is_active").eq("id", caller.id).single();
    if (callerProfile?.role !== "admin" || callerProfile?.is_active === false) return json({ error: "Только администратор может управлять доступами" }, 403);

    const body = await req.json();
    const action = String(body?.action || "");
    const input = body?.user || {};

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      return json({ users: data.users.map((u) => ({ id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at, created_at: u.created_at, banned_until: u.banned_until })) });
    }

    if (action === "create") {
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      const fullName = String(input.full_name || "").trim();
      const role = String(input.role || "tech");
      if (!email || password.length < 8 || !fullName || !roles.has(role)) return json({ error: "Проверьте имя, почту, роль и пароль (минимум 8 символов)" }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error || !data.user) throw error || new Error("Пользователь не создан");
      const { error: profileError } = await admin.from("profiles").upsert({
        id: data.user.id, full_name: fullName, phone: input.phone || null, role,
        is_active: input.is_active !== false, access_overrides: input.access_overrides || {},
      });
      if (profileError) { await admin.auth.admin.deleteUser(data.user.id); throw profileError; }
      return json({ user: { id: data.user.id, email } });
    }

    if (action === "update") {
      const id = String(input.id || "");
      const role = String(input.role || "");
      if (!id || !roles.has(role)) return json({ error: "Некорректный сотрудник или роль" }, 400);
      if (id === caller.id && input.is_active === false) return json({ error: "Нельзя отключить собственный доступ" }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
      if (target?.role === "admin") return json({ error: "Права администратора меняются только владельцем базы" }, 403);
      const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: input.is_active === false ? "876000h" : "none" });
      if (authError) throw authError;
      const { error } = await admin.from("profiles").update({
        full_name: String(input.full_name || "").trim(), phone: input.phone || null, role,
        is_active: input.is_active !== false, access_overrides: input.access_overrides || {},
      }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(input.id || "");
      if (!id || id === caller.id) return json({ error: "Нельзя удалить собственную учётную запись" }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
      if (target?.role === "admin") return json({ error: "Администратора нельзя удалить из приложения" }, 403);
      const { error } = await admin.auth.admin.deleteUser(id, false);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Неизвестная операция" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Внутренняя ошибка" }, 500);
  }
});
