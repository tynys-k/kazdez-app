// Воронка Хантера (B2B): объект доводим до «Абонента» — регулярного
// обслуживания, а не разовой обработки. Каждая стадия пускает сделку только
// с заполненными полями. Те же правила проверяет сервер
// (supabase/2026-10-18_hunter_funnel.sql, kd_lead_stage_missing) — держи их одинаковыми.

export const HUNTER_FUNNEL_MIGRATION = "2026-10-18_hunter_funnel.sql";
export const HUNTER_ROLE_MIGRATION = "2026-10-22_hunter_role.sql";
export const HUNTER_PROPOSALS_MIGRATION = "2026-10-22_hunter_proposals.sql";
export const LEAD_CLIENT_HISTORY_MIGRATION = "2026-10-22_lead_client_history.sql";

// Линейная часть воронки в порядке прохождения.
export const DEAL_STAGES = [
  { code: "new", label: "Новый / Разведка", goal: "Найти ЛПР" },
  { code: "lpr_found", label: "ЛПР найден", goal: "Получить согласие на КП и вводные для расчёта" },
  { code: "kp_sent", label: "КП отправлено", goal: "Дожать до обсуждения, назначить следующее касание" },
  { code: "negotiation", label: "Переговоры", goal: "Снять возражения, согласовать цену и периодичность" },
  { code: "contract", label: "Договор на согласовании", goal: "Подписать договор, назначить первую обработку" },
  { code: "first_service", label: "Первая обработка", goal: "Качественно отработать, закрыть акт" },
  { code: "subscriber", label: "Абонент", goal: "Передать на удержание, проконтролировать продление" },
];
// Терминальные выходы — доступны с любой стадии.
export const EXIT_STAGES = [
  { code: "lost", label: "Отказ" },
  { code: "snoozed", label: "Отложено" },
];

export const OBJECT_TYPES = [
  { id: "catering", label: "Общепит", priority: "A" },
  { id: "retail_food", label: "Продуктовый ритейл", priority: "A" },
  { id: "food_production", label: "Пищевое производство", priority: "A" },
  { id: "warehouse", label: "Склад", priority: "A" },
  { id: "medical", label: "Медицина", priority: "A" },
  { id: "childcare", label: "Детское учреждение", priority: "A" },
  { id: "hotel", label: "Гостиница", priority: "A" },
  { id: "office", label: "Офис", priority: "B" },
  { id: "fitness", label: "Фитнес / салон", priority: "B" },
  { id: "auto", label: "Авто", priority: "B" },
  { id: "housing", label: "ТСЖ / КСК / частный сектор", priority: "C" },
  { id: "other", label: "Другое", priority: "C" },
];

export const FREQUENCIES = [
  { id: "monthly", label: "Ежемесячно", perMonth: 1 },
  { id: "quarterly", label: "Раз в квартал", perMonth: 1 / 3 },
  { id: "semiannual", label: "Раз в полгода", perMonth: 1 / 6 },
  { id: "one_time", label: "Разово", perMonth: 0 },
  { id: "on_demand", label: "По заявке", perMonth: 0 },
];

export const LOST_REASONS = [
  { id: "price", label: "Дорого" },
  { id: "has_contract", label: "Уже есть договор" },
  { id: "no_need", label: "Нет потребности" },
  { id: "no_budget", label: "Нет бюджета" },
  { id: "no_answer", label: "Не выходит на связь" },
  { id: "competitor", label: "Выбрал конкурента" },
  { id: "closed_business", label: "Бизнес закрылся" },
  { id: "other", label: "Другое" },
];

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
const OBJECT_TYPE_BY_ID = byId(OBJECT_TYPES);
const FREQUENCY_BY_ID = byId(FREQUENCIES);
const LOST_REASON_BY_ID = byId(LOST_REASONS);

export const objectTypeLabel = (id) => OBJECT_TYPE_BY_ID[id]?.label || "";
export const objectPriority = (id) => OBJECT_TYPE_BY_ID[id]?.priority || "";
export const frequencyLabel = (id) => FREQUENCY_BY_ID[id]?.label || "";
// Старые отказы записаны свободным текстом — показываем их как есть.
export const lostReasonLabel = (value) => LOST_REASON_BY_ID[value]?.label || value || "";

// Ожидаемая ежемесячная выручка: цена за выезд × выездов в месяц.
export function suggestedMrr(price, frequency) {
  const amount = Number(price);
  const perMonth = FREQUENCY_BY_ID[frequency]?.perMonth;
  if (!Number.isFinite(amount) || amount <= 0 || !perMonth) return null;
  return Math.round(amount * perMonth);
}

// Поле → с какой стадии оно обязательно (вход в эту стадию требует его).
// Порядок ключей = порядок подсказок пользователю.
const FIELD_RULES = [
  { key: "object_type", label: "тип объекта", stage: "lpr_found" },
  { key: "address", label: "адрес объекта", stage: "lpr_found" },
  { key: "area_m2", label: "площадь, м²", stage: "lpr_found" },
  { key: "lpr_name", label: "ФИО ЛПР", stage: "kp_sent" },
  { key: "lpr_phone", label: "телефон ЛПР", stage: "kp_sent" },
  { key: "pests", label: "какие вредители беспокоят", stage: "kp_sent" },
  { key: "current_provider", label: "текущий подрядчик (или «нет»)", stage: "kp_sent" },
  { key: "desired_frequency", label: "нужная периодичность", stage: "kp_sent" },
  { key: "kp", label: "КП (ссылка на файл или КП из раздела «КП»)", stage: "kp_sent" },
  { key: "quoted_price", label: "согласованная цена", stage: "contract" },
  { key: "agreed_frequency", label: "согласованная периодичность", stage: "contract" },
  { key: "expected_mrr", label: "ожидаемая выручка в месяц", stage: "contract" },
  { key: "company_id", label: "юрлицо (карточка клиента с БИН)", stage: "first_service" },
  { key: "signer_name", label: "подписант договора", stage: "first_service" },
  { key: "first_service_at", label: "дата первой обработки", stage: "first_service" },
  { key: "contract_signed_at", label: "дата подписания договора", stage: "subscriber" },
  { key: "job_done", label: "закрытый акт первой обработки (заявка выполнена)", stage: "subscriber" },
  { key: "next_service_at", label: "дата следующего регулярного выезда", stage: "subscriber" },
  { key: "keeper_id", label: "ответственный за удержание", stage: "subscriber" },
];
const EXIT_RULES = {
  lost: [{ key: "lost_reason", label: "причина отказа" }],
  snoozed: [
    { key: "snooze_until", label: "дата возврата" },
    { key: "snooze_reason", label: "причина переноса" },
  ],
};

const STAGE_INDEX = Object.fromEntries(DEAL_STAGES.map((stage, index) => [stage.code, index]));
export const stageIndex = (code) => (code in STAGE_INDEX ? STAGE_INDEX[code] : -1);
export const stageLabel = (code) => [...DEAL_STAGES, ...EXIT_STAGES].find((stage) => stage.code === code)?.label || "";

const filled = (value) => {
  if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim());
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return String(value ?? "").trim() !== "";
};
const positive = (value) => value !== null && value !== undefined && value !== "" && Number(value) > 0;
const phoneFilled = (value) => String(value ?? "").replace(/\D/g, "").length >= 10;

function fieldOk(key, deal, ctx) {
  switch (key) {
    case "area_m2": case "quoted_price": case "expected_mrr": return positive(deal[key]);
    case "lpr_phone": return phoneFilled(deal.lpr_phone);
    case "kp": return filled(deal.kp_url) || !!ctx.hasProposal;
    case "job_done": return !!ctx.jobDone;
    default: return filled(deal[key]);
  }
}

// Чего не хватает, чтобы сделка встала на стадию targetCode.
// Правила воронки действуют только для юрлиц: B2C-клиент двигается свободно,
// но отказ и перенос и у него требуют причины.
// ctx: { hasProposal, jobDone } — то, что живёт вне карточки сделки.
export function missingForStage(deal = {}, targetCode, ctx = {}) {
  if (EXIT_RULES[targetCode]) return EXIT_RULES[targetCode].filter((rule) => !filled(deal[rule.key]));
  if (deal.client_type !== "company") return [];
  const target = stageIndex(targetCode);
  if (target < 0) return [];
  return FIELD_RULES
    .filter((rule) => stageIndex(rule.stage) <= target && !fieldOk(rule.key, deal, ctx))
    .map(({ key, label }) => ({ key, label }));
}

// Можно ли перевести сделку со стадии fromCode на toCode. Назад — всегда можно
// (ошиблись стадией), вперёд и в выходы — только с заполненными полями.
export function stageTransition(deal, fromCode, toCode, ctx = {}) {
  if (!toCode || fromCode === toCode) return { ok: true, missing: [] };
  const from = stageIndex(fromCode), to = stageIndex(toCode);
  if (to >= 0 && from >= 0 && to < from) return { ok: true, missing: [] };
  const missing = missingForStage(deal, toCode, ctx);
  return { ok: missing.length === 0, missing };
}

// Подсказка для карточки: что заполнить, чтобы перейти на следующую стадию.
export function nextStageHint(deal, currentCode, ctx = {}) {
  const index = stageIndex(currentCode);
  if (index < 0 || index >= DEAL_STAGES.length - 1) return null;
  const next = DEAL_STAGES[index + 1];
  return { stage: next, missing: missingForStage(deal, next.code, ctx) };
}

export const missingText = (missing = []) => missing.map((item) => item.label).join(", ");
