// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { supabase } from "./supabaseClient";

vi.mock("./supabaseClient", () => ({ supabase: {
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
  from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() },
} }));
vi.mock("./errorLog", () => ({ installGlobalErrorLogging: vi.fn(), logClientError: vi.fn(), setErrorActor: vi.fn() }));
vi.mock("./pdfDocs", () => ({ generateAct: vi.fn(), generateCertificate: vi.fn() }));
vi.mock("exceljs", () => ({ default: {} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const person = { id: "admin-test", full_name: "Тестовый администратор", role: "admin", is_active: true };
let container, root, failures, tables;
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); failures = new Set();
  person.role = "admin";
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const today = new Date().toISOString().slice(0, 10);
  tables = {
    profiles: [person],
    jobs: [{ id: "job-test", address: "Контрольный адрес 314", pest: "Тараканы", type: "Первичная", status: "new", scheduled_date: today, price_options: [], brand: "KazDez", client_phone: "+77010000000" }],
    report_chemicals: [{ id: "line-test", job_id: "job-test", amount: 250, chemical_id: "chemical-test" }],
  };
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: person.id, email: "test@example.invalid" } } } });
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  supabase.functions.invoke.mockResolvedValue({ data: { users: [] } });
  supabase.rpc.mockResolvedValue({ data: [], error: null });
  supabase.from.mockImplementation((table) => {
    let offset = 0;
    const query = {
      select: () => query, order: () => query, eq: () => query, in: () => query, not: () => query, or: () => query,
      limit: () => query, range: (from) => { offset = from; return query; },
      single: () => Promise.resolve({ data: person }),
      then: (resolve, reject) => Promise.resolve(failures.has(table)
        ? { data: null, error: { message: "Тестовый отказ сети" } }
        : { data: offset ? [] : tables[table] || [], error: null }).then(resolve, reject),
    };
    return query;
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.restoreAllMocks(); });
async function render() { await act(async () => root.render(<App />)); }
async function refresh() { await act(async () => container.querySelector('[aria-label="Обновить данные"]').click()); }

it("refresh button loads tables, retains last good jobs on error and recovers on retry", async () => {
  await render();
  expect(container.textContent).not.toContain("Интерфейс временно не загрузился");
  expect(container.textContent).toContain("Контрольный адрес 314");
  const requests = supabase.from.mock.calls.length;
  failures.add("jobs");
  await refresh();
  expect(supabase.from.mock.calls.length).toBeGreaterThan(requests);
  expect(container.textContent).toContain("Контрольный адрес 314");
  expect(container.textContent).toContain("Данные неполные или устарели");
  expect(container.textContent).not.toContain("Компания работает по плану");
  failures.clear(); tables.jobs = [{ ...tables.jobs[0], address: "Обновлённый адрес 628" }];
  await refresh();
  expect(container.textContent).toContain("Обновлённый адрес 628");
  expect(container.textContent).not.toContain("Данные неполные или устарели");
});

it("keeps the previous jobs and chemical join together if report lines fail", async () => {
  await render();
  failures.add("report_chemicals"); tables.jobs = [{ ...tables.jobs[0], address: "Не подтверждён целиком" }];
  await refresh();
  expect(container.textContent).toContain("Контрольный адрес 314");
  expect(container.textContent).not.toContain("Не подтверждён целиком");
  expect(container.textContent).toContain("Данные неполные или устарели");
});

it("shows a refresh warning to a technician without disclosing raw database errors", async () => {
  person.role = "tech"; failures.add("jobs");
  await render();
  expect(container.textContent).toContain("Данные неполные или устарели");
  expect(container.textContent).not.toContain("Тестовый отказ сети");
});

it("never restores the legacy shared snapshot or a snapshot owned by another account", async () => {
  const snapshot = { owner: "another-user", jobs: [{ ...tables.jobs[0], address: "Чужой адрес" }], profiles: [], chemicals: [], settings: {}, savedAt: new Date().toISOString() };
  localStorage.setItem("kd-offline-snapshot-v4", JSON.stringify(snapshot));
  localStorage.setItem(`kd-offline-snapshot-v5:${person.id}:admin::undefined`, JSON.stringify(snapshot));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  failures.add("jobs");
  await render();
  expect(container.textContent).not.toContain("Чужой адрес");
  expect(container.textContent).toContain("Данные неполные или устарели");
});
