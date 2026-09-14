// Development-only fixture. Not an application route, not a production entry.
// All component data access is replaced locally; no live records are read or written.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../supabaseClient";
import TaskBoard from "./TaskBoard";
import ContractsRegister from "./ContractsRegister";
import StockRegister from "../StockRegister";
import JobObjectFields from "./JobObjectFields";
import "../styles.css";
import "./workflows.css";
const people = [{ id: "demo-admin", full_name: "Администратор" }, { id: "demo-worker", full_name: "Аян" }, { id: "demo-observer", full_name: "Менеджер" }];
const initialTasks = [
  { id: "demo-task-1", title: "Сверить остатки на Байзакова", description: "Пересчитать препараты и оформить акт ревизии. Сверить Кельт с журналом выдач.", status: "new", created_at: "2026-09-14T08:10:00+05:00", created_by: people[0].id, assignee_id: people[1].id, observer_ids: [people[2].id], due_date: "2026-09-16", due_time: "17:00", comment_policy: "participants" },
  { id: "demo-task-2", title: "Получить подписанный АВР", description: "Ответственный заказчика работает до 16:00.", status: "in_progress", created_at: "2026-09-13T12:00:00+05:00", created_by: people[0].id, assignee_id: people[2].id, due_date: "2026-09-18", due_time: "16:00", comment_policy: "author" },
  { id: "demo-task-3", title: "Сравнить цены поставщиков", status: "done", created_at: "2026-09-12T09:00:00+05:00", created_by: people[0].id, assignee_id: people[1].id },
];
const chemical = { id: "demo-chem", name: "Кельт", unit_kind: "volume", remaining: 6000, stockValue: 102000, price_per_liter: 17000, low: false, forecast: { perMonth: 2000 }, batches: [] };
const warehouses = [{ id: "demo-legacy", name: "Не распределено", unallocated: true }, { id: "demo-b", name: "Байзакова" }, { id: "demo-m", name: "Мамыр-4" }];
const moves = [{ id: "demo-move", item_kind: "chemical", item_id: chemical.id, kind: "receipt", to_warehouse_id: "demo-b", amount: 4000, created_at: "2026-09-14T08:00:00+05:00", note: "Тестовый приход" }];
const suppliers = [{ id: "demo-s1", name: "Поставщик А", contact_name: "Контакт поставщика" }, { id: "demo-s2", name: "Поставщик Б" }];
const offers = [17000, 22000].map((price, i) => ({ id: `offer-${i}`, supplier_id: suppliers[i].id, item_kind: "chemical", item_id: chemical.id, price, quoted_on: "2026-09-14", available: true }));
const noop = () => {};
function ResponsivePreview() {
  const [width, setWidth] = useState(320);
  return <main><nav className="wf-toolbar">{[320, 768, 1024, 1440].map((size) => <button className="kd-btn ghost" key={size} onClick={() => setWidth(size)}>{size} px</button>)}</nav><iframe title="Проверка адаптивности" src="/workflow-preview.html" width={width} height="850" style={{ border: "1px solid var(--line)", display: "block", margin: "16px auto" }} /></main>;
}
function Preview() {
  const [page, setPage] = useState("Задачи"), [tasks, setTasks] = useState(initialTasks), [selected, setSelected] = useState(null), [form, setForm] = useState({ object_kind: "commercial", object_details: { measurement: "fumigation", volume_method: "dimensions", length_m: 5, width_m: 4, height_m: 3 } });
  return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}><p className="kd-notebox">Локальный макет · вымышленные данные · сохранение в рабочую базу отключено</p><nav className="wf-toolbar" style={{ marginBottom: 24 }}>{["Задачи", "Склад", "Договоры", "Тип объекта"].map((label) => <button className="kd-btn ghost" key={label} onClick={() => setPage(label)}>{label}</button>)}</nav>
    {page === "Задачи" && <TaskBoard tasks={tasks} people={people} userId={people[0].id} canManage onCreate={noop} onEdit={noop} onRemove={noop} onStatus={async (task, status) => { setTasks(tasks.map((t) => t.id === task.id ? { ...t, status } : t)); return true; }} />}
    {page === "Склад" && <StockRegister warehouses={warehouses} warehouseMoves={moves} suppliers={suppliers} supplierOffers={offers} inventory={[chemical]} techs={people} techLedger={(id) => id === people[1].id ? [{ chem: chemical, received: 1000, consumed: 0, balance: 1000 }] : []} purchases={[]} handouts={[]} adjustments={[]} jobs={[]} sales={[]} equipment={[]} equipIssuedQty={() => 0} totalStockValue={102000} totalEquipValue={0} selectedId={chemical.id} onSelect={noop} canEditStock canManageTeam onStockIn={noop} onMovement={noop} onRemoveChem={noop} onAddEquipment={noop} onEditEquipment={noop} onRemoveEquipment={noop} techEquipment={() => []} onTransferEquipment={noop} onEquipStatus={noop} />}
    {page === "Договоры" && <ContractsRegister contracts={[{ id: "demo-contract", client_id: "demo-client", number: "Д-2026/15", signed_on: "2026-09-14", organization: "ТОО Тестовая организация", title: "Абонентское обслуживание", status: "active", amount: 180000 }]} clients={[{ id: "demo-client", name: "Тестовый клиент", phone: "+7 700 000 0000" }]} people={people} canEdit selectedId={selected} onSelect={setSelected} onReload={noop} onOpenClient={noop} />}
    {page === "Тип объекта" && <section className="kd-card"><h2>Параметры объекта</h2><JobObjectFields form={form} onChange={setForm} /></section>}
  </main>;
}
if (import.meta.env.DEV) {
  document.documentElement.dataset.theme = "light";
  const fixtures = { task_subtasks: [{ id: "demo-subtask", task_id: "demo-task-1", title: "Пересчитать Кельт", assignee_id: people[1].id, created_by: people[0].id, created_at: "2026-09-14T08:20:00+05:00", due_at: "2026-09-16T12:00:00+05:00", done: false }], entity_activity: [{ id: "demo-event", body: "Проверьте также закрытые упаковки на верхней полке.", created_by: people[0].id, created_at: "2026-09-14T08:22:00+05:00", event_type: "comment" }] };
  supabase.from = (table) => { const result = { data: fixtures[table] || [], error: null }; const q = { select: () => q, eq: () => q, order: () => q, range: (from, to) => Promise.resolve({ ...result, data: result.data.slice(from, to + 1) }), then: (resolve) => Promise.resolve(result).then(resolve), insert: () => Promise.resolve({ error: { message: "Макет: сохранение отключено" } }), update: () => q }; return q; };
  supabase.rpc = async () => ({ error: { message: "Макет: проведение операций отключено" } });
  supabase.storage.from = () => ({ upload: async () => ({ error: { message: "Макет: загрузка файлов отключена" } }), createSignedUrl: async () => ({ error: { message: "Макет: нет рабочих файлов" } }) });
  const previewRoot = createRoot(document.getElementById("root"));
  previewRoot.render(new URLSearchParams(window.location.search).has("responsive") ? <ResponsivePreview /> : <Preview />);
  if (import.meta.hot) import.meta.hot.dispose(() => previewRoot.unmount());
} else { document.getElementById("root").textContent = "Только для локальной разработки"; }
