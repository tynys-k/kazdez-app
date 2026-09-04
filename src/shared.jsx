// KAZDEZ-USABILITY-YANDEX-2026-07-18
import React, { useState } from "react";
import { Calendar, ExternalLink } from "lucide-react";

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ml2l = (ml) => Math.round(((Number(ml) || 0) / 1000) * 100) / 100;
const norm = (s) => (s || "").trim().toLowerCase();
// Ключ клиента по телефону: последние 10 цифр. В Казахстане значащая часть
// ровно такая, а записывают по-разному — «+7 701 …» и «8 701 …». Сравнение
// «только цифры» считало это разными людьми: терялась история, гарантия и
// предупреждение «клиент уже обращался».
const phoneKey = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};
const samePhone = (a, b) => { const k = phoneKey(a); return !!k && k === phoneKey(b); };
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
// Что бывает в истории сотрудника. Список закрытый: свободный вид события
// превращает историю в переписку, по которой ничего не посчитать.
const EMPLOYEE_EVENTS = {
  hired: "Принят на работу",
  salary: "Изменение оклада",
  transfer: "Перевод / смена роли",
  award: "Премия",
  penalty: "Взыскание",
  left: "Уволен",
  other: "Другое",
};

// Почему клиента внесли в чёрный список. Список закрытый: «плохой клиент» в
// свободном поле ничего не объясняет тому, кто читает это через полгода.
const BLOCK_REASONS = {
  no_pay: "Не оплатил выполненную работу",
  refund: "Требовал возврат после работы",
  aggressive: "Хамство или угрозы сотруднику",
  fraud: "Обман: другой объём или площадь на месте",
  free: "Требует всё бесплатно, торг до нуля",
  other: "Другое",
};

// Причины скидки. Список закрытый: свободный ввод превращает контроль в
// отписки вида «договорились», по которым ничего не разобрать и не сравнить.
const DISCOUNT_REASONS = {
  repeat_client: "Постоянный клиент",
  volume: "Несколько объектов или большой объём",
  competitor: "Клиент называл цену конкурента",
  partial: "Часть работ клиент сделал сам",
  complaint: "Компенсация за прошлую работу",
  contract: "Условие абонентского договора",
  manager: "Согласовано руководителем",
  other: "Другое — обязательно пояснить",
};

// Человеческие имена для журнала изменений. Без них строка выглядит как
// «jobs.report_paid: 40000 → 15000» — технически полно, читать невозможно.
const CHANGE_ENTITIES = {
  jobs: "Заявка",
  tech_expenses: "Выплата сотруднику",
  money_moves: "Движение по счёту",
  profiles: "Сотрудник",
  price_list: "Прайс",
  chemicals: "Препарат",
  app_settings: "Настройка",
  job_discounts: "Скидка",
};

const CHANGE_FIELDS = {
  report_paid: "Сумма оплаты", report_cash: "Наличными", report_qr: "По QR",
  report_transfer: "Перечислением", quoted_price: "Цена по прайсу",
  status: "Статус", assigned_to: "Исполнитель", scheduled_date: "Дата выезда",
  tech_bonus: "Бонус исполнителю", tech_travel: "Дорожные",
  partner_id: "Партнёр", partner_share: "Доля партнёра",
  transport_cost: "Транспорт", other_cost: "Прочие расходы",
  amount: "Сумма", type: "Тип", expense_date: "Дата", account_id: "Счёт",
  direction: "Направление", move_date: "Дата", source: "Основание",
  role: "Роль", is_active: "Доступ", salary_monthly: "Оклад",
  work_schedule: "График", access_overrides: "Персональные права",
  cash_opening_balance: "Начальный остаток", cash_opening_date: "Дата остатка",
  pest: "Вредитель", area_from: "Площадь от", area_to: "Площадь до", price: "Цена",
  name: "Название", price_per_liter: "Цена за единицу",
  purchased_ml: "Куплено", min_ml: "Минимальный остаток",
  key: "Параметр", value: "Значение",
};

// Поля, где хранится идентификатор человека или счёта: их надо переводить в
// имя, иначе в журнале останутся нечитаемые строки из тридцати шести знаков.
const CHANGE_ID_FIELDS = new Set(["assigned_to", "partner_id", "account_id", "created_by"]);

function describeChangeValue(field, raw, nameOf) {
  if (raw === null || raw === undefined || raw === "") return "пусто";
  if (CHANGE_ID_FIELDS.has(field) && typeof nameOf === "function") return nameOf(raw) || "—";
  if (raw === "true") return "есть";
  if (raw === "false") return "нет";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoToRu(raw);
  if (/^-?\d+(\.\d+)?$/.test(raw)) return fmt(Math.round(Number(raw)));
  return raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
}

// Одна строка журнала изменений, готовая к показу.
function describeChange(row, { nameOf } = {}) {
  const entity = CHANGE_ENTITIES[row?.entity] || row?.entity || "Запись";
  if (row?.action === "insert") return { entity, title: "создано", before: null, after: null };
  if (row?.action === "delete") return { entity, title: "удалено", before: null, after: null };
  const field = CHANGE_FIELDS[row?.field] || row?.field || "поле";
  return {
    entity,
    title: field,
    before: describeChangeValue(row?.field, row?.before, nameOf),
    after: describeChangeValue(row?.field, row?.after, nameOf),
  };
}

// Типы объектов. От типа зависит и норма расхода, и требования проверяющих:
// на пищевом производстве нужен журнал, в квартире — нет.
const OBJECT_KINDS = {
  apartment: "Квартира",
  house: "Частный дом",
  office: "Офис",
  food: "Пищевое производство или общепит",
  warehouse: "Склад",
  production: "Производство",
  land: "Участок или территория",
  other: "Другое",
};

// Технический ключ адреса: нижний регистр, ё→е, всё кроме букв и цифр — в
// пробел. «Мкр. Аксай-3, д.12, кв.45» и «мкр аксай 3 д 12 кв 45» сходятся.
//
// Номер квартиры намеренно остаётся частью ключа: для нас объект — это
// конкретное помещение, а не дом. Две квартиры в одном подъезде — два разных
// объекта с разной историей заражения.
//
// Правило обязано совпадать с kd_address_key в базе: по нему собирались
// объекты при переносе, и расхождение развело бы одну точку на две.
const addressKey = (text) => String(text || "")
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^a-zа-я0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Схемы проведения документов.
const PAPERWORK_SCHEMES = {
  own: { label: "Свои документы", hint: "Наш клиент, документы делаем сами" },
  for_partner: { label: "Для партнёра", hint: "Клиент партнёра, проводим через нас — партнёру отдаём за вычетом нашего процента" },
  via_partner: { label: "Через партнёра", hint: "Наш клиент, нужен ОУР с НДС — партнёр удерживает свой процент и возвращает остаток" },
};

// Путь бумаги. Порядок здесь — это и есть последовательность шагов, по нему
// считается, где документ застрял.
//
// Чек нужен только за наличные, поэтому у шага стоит признак cashOnly:
// показывать его при оплате перечислением — значит держать вечно
// незакрытый шаг и приучить смотреть мимо.
const PAPERWORK_STEPS = [
  { key: "requisites_at", label: "Реквизиты получены" },
  { key: "contract_at", label: "Договор составлен" },
  { key: "invoice_at", label: "Счёт выставлен" },
  { key: "paid_at", label: "Оплата пришла" },
  { key: "receipt_at", label: "Чек выбит", cashOnly: true },
  { key: "avr_ready_at", label: "АВР подготовлен" },
  { key: "avr_sent_at", label: "АВР у клиента" },
  { key: "avr_signed_at", label: "Клиент подписал" },
  { key: "avr_returned_at", label: "Подписанный АВР забрали" },
  { key: "avr_office_at", label: "АВР привезли в офис" },
  { key: "filed_at", label: "Подшит в папку" },
];

const SETTLE_METHODS = ["Каспи", "Наличными", "Перевод на счёт"];

// Чем работают на выезде.
//
// Первые два используются почти всегда и стоят на виду. Горячий туман и
// бензиновый опрыскиватель нужны редко — они спрятаны под «ещё», чтобы не
// мешать в каждом отчёте. «Без оборудования» — это в основном дератизация,
// и он исключает остальные: нельзя работать ничем и одновременно туманом.
const WORK_EQUIPMENT = [
  { code: "cold_fog", label: "Генератор холодного тумана", common: true },
  { code: "sprayer", label: "Опрыскиватель", common: true },
  { code: "hot_fog", label: "Генератор горячего тумана" },
  { code: "gas_sprayer", label: "Бензиновый опрыскиватель" },
  { code: "duster", label: "Порошковый распылитель" },
  { code: "none", label: "Без оборудования", exclusive: true },
];

const equipmentLabel = (code) => WORK_EQUIPMENT.find((e) => e.code === code)?.label || code;

// Темы обучения менеджеров. Список закрытый намеренно: свободный ввод темы
// превращает отчёт в кашу, где «Возражения» и «работа с возражениями» — две
// разные строки, и сравнить людей между собой уже нельзя.
const TRAINING_TOPICS = [
  "Скрипт первого звонка",
  "Работа с возражениями",
  "Расчёт цены и допродажа",
  "Разговор с недовольным клиентом",
  "Виды вредителей и препараты",
  "Абонентское обслуживание",
];

// Настройки, в которых лежат картинки в base64. Они весят больше, чем все
// остальные данные компании вместе, и нужны только для печати документов —
// поэтому в общую загрузку не входят.
const COMPANY_IMAGE_KEYS = ["company_stamp", "company_signature"];

// Виды допусков. Для дезинфекции первые три обязательны по закону, поэтому
// они идут первыми и именно в этом порядке.
const TECH_DOC_KINDS = {
  medbook: "Медкнижка",
  sanmin: "Санминимум",
  safety: "Инструктаж по ТБ",
  driver: "Водительское удостоверение",
  other: "Другое",
};

// Памятка клиенту: что сделать до обработки и чего не делать после.
//
// Результат обработки зависит от клиента не меньше, чем от препарата: помыл
// полы на следующий день — обработка насмарку, и мы едем по гарантии за свой
// счёт. Памятка на публичной странице заявки дешевле любого такого выезда.
//
// Текст общий для всех работ, плюс уточнения по виду вредителя. Ключи должны
// совпадать с тем, что пишется в jobs.pest, поэтому сверка идёт по вхождению
// слова, а не по точному равенству.
const CLIENT_MEMO_COMMON = {
  before: [
    "Уберите со столов и открытых поверхностей продукты, посуду и детские вещи.",
    "Обеспечьте доступ к плинтусам, задним стенкам мебели и местам под раковиной.",
    "Уведите из помещения детей, животных и аквариумных рыб (аквариум накройте и отключите компрессор).",
    "Снимите постельное бельё, если обрабатываются спальные места.",
  ],
  after: [
    "Не входите в помещение в течение времени, которое назовёт мастер, затем хорошо проветрите.",
    "Влажную уборку полов и плинтусов делайте не раньше чем через две недели — именно там работает препарат.",
    "Столы, подоконники и места приготовления еды протрите содовым раствором сразу после проветривания.",
    "Единичные насекомые в первые дни — это нормально: препарат действует не мгновенно.",
  ],
};

const CLIENT_MEMO_BY_PEST = [
  { match: ["клоп"], before: ["Отодвиньте кровати и диваны от стен, освободите доступ к каркасу."], after: ["Не переставляйте мебель обратно к стенам до конца обработки помещения."] },
  { match: ["таракан"], before: ["Перекройте доступ к воде: вытрите раковины и ванну насухо."], after: ["Не оставляйте открытую воду и крошки — иначе насекомым не нужна приманка."] },
  { match: ["грызун", "крыс", "мыш"], before: ["Уберите доступный корм и мусор, закройте пищевые отходы."], after: ["Не трогайте приманочные станции и не подпускайте к ним детей и животных."] },
  { match: ["комар", "клещ", "муравь"], before: ["Скосите высокую траву и уберите с участка игрушки и посуду животных."], after: ["Не поливайте обработанный участок и не косите траву несколько дней."] },
];

const clientMemoFor = (pest) => {
  const key = String(pest || "").toLowerCase();
  const extra = CLIENT_MEMO_BY_PEST.find((m) => m.match.some((w) => key.includes(w)));
  return {
    before: [...CLIENT_MEMO_COMMON.before, ...(extra?.before || [])],
    after: [...CLIENT_MEMO_COMMON.after, ...(extra?.after || [])],
  };
};

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
  { key: "drive_safety", label: "Техника безопасности", desc: "Инструкции по ТБ", emoji: "🦺", place: "materials", ack: true },
  { key: "drive_training", label: "Обучение", desc: "Скрипты продаж и разговора с клиентами", emoji: "🎓", place: "knowledge", ack: true },
  { key: "drive_kp", label: "КП клиентов", desc: "Папка со всеми коммерческими предложениями", emoji: "📑", place: "leads" },
];
// Короткое честное имя раздела: используется в заголовке страницы и мобильной навигации.
// Счётчики сюда НЕ добавляем — они живут только в боковом меню и только там, где требуют действия.
const TAB_LABELS = { today: "Сегодня", jobs: "Заявки", schedule: "График", done: "Выполненные", canceled: "Отменённые", leads: "Лиды", tasks: "Задачи", tenders: "Тендеры", repeats: "Повторные выезды", growth: "Прибыль по заявкам", retention: "Обзвон и качество", subscriptions: "Абоненты", routes: "Маршруты", finance: "Выручка и чек", opex: "Счета и расходы", cash: "Наличные от бригад", stock: "Склад", team: "Сотрудники", payroll: "Зарплата", partners: "Партнёры", docs: "Документы", materials: "Материалы", knowledge: "База знаний", journal: "Журнал", trash: "Корзина", myequip: "Моё оборудование" };
// Нижняя панель на телефоне даёт ~9 символов на подпись — длинные имена там режутся многоточием.
// Здесь только те разделы, чьё полное имя не влезает; остальные берутся из TAB_LABELS.
const TAB_LABELS_SHORT = { payroll: "Зарплата", cash: "Касса", finance: "Выручка", growth: "Прибыль", opex: "Расходы", retention: "Обзвон", repeats: "Повторы", subscriptions: "Абоненты", team: "Люди", myequip: "Инвентарь" };
// Порядок по частоте использования: сначала ежедневная работа, потом клиенты, деньги, архив, команда.
const ADMIN_TAB_ORDER = ["today", "jobs", "schedule", "routes", "tasks", "leads", "retention", "subscriptions", "repeats", "finance", "growth", "opex", "cash", "done", "canceled", "team", "payroll", "partners", "stock", "tenders", "docs", "materials", "knowledge", "journal", "trash"];

// Единый справочник ролей для экрана «Команда и доступы».
// Поля permissions и defaultPermissions намеренно содержат один набор:
// это сохраняет совместимость с обеими версиями интерфейса ролей.
const ROLE_DEFAULT_PERMISSIONS = {
  tech: ["tab.today", "tab.jobs", "tab.done", "tab.tasks", "tab.cash", "tab.materials", "tab.knowledge", "tab.myequip", "data.stock_self", "data.equipment"],
  manager: ["tab.today", "tab.jobs", "tab.schedule", "tab.done", "tab.canceled", "tab.routes", "tab.tasks", "action.tasks_manage", "action.jobs_edit", "tab.leads", "action.leads_edit", "tab.repeats", "tab.retention", "tab.subscriptions", "tab.partners", "action.partners_edit", "tab.materials", "tab.knowledge"],
  marketer: ["tab.today", "tab.leads", "action.leads_edit", "tab.retention", "tab.growth", "tab.materials", "tab.knowledge", "tab.tasks"],
  accountant: ["tab.today", "tab.finance", "tab.opex", "tab.cash", "tab.payroll", "tab.docs", "action.docs_edit", "tab.tasks", "action.finance_edit", "tab.materials"],
  tender: ["tab.today", "tab.tenders", "action.tenders_edit", "tab.docs", "action.docs_edit", "tab.tasks", "action.tasks_manage", "tab.materials", "tab.knowledge"],
  curator: ["tab.today", "tab.jobs", "tab.schedule", "tab.done", "tab.canceled", "tab.routes", "tab.tasks", "action.tasks_manage", "action.jobs_edit", "tab.retention", "action.leads_edit", "tab.team", "tab.stock", "data.stock_self", "data.equipment", "tab.materials", "tab.knowledge"],
};

const makeRole = (label, description, permissions = []) => ({
  label,
  name: label,
  description,
  permissions,
  defaultPermissions: permissions,
});

const ROLE_DEFINITIONS = {
  admin: makeRole("Администратор", "Полный доступ и управление сотрудниками", ["*"]),
  tech: makeRole("Дезинфектор", "Свои заявки, касса, препараты и оборудование", ROLE_DEFAULT_PERMISSIONS.tech),
  manager: makeRole("Менеджер", "Клиенты, заявки, маршруты и повторные обращения", ROLE_DEFAULT_PERMISSIONS.manager),
  marketer: makeRole("Маркетолог", "Лиды, касания, показатели роста и материалы", ROLE_DEFAULT_PERMISSIONS.marketer),
  accountant: makeRole("Бухгалтер", "Финансы, касса и документы", ROLE_DEFAULT_PERMISSIONS.accountant),
  tender: makeRole("Тендерщик", "Тендеры, задачи и документы", ROLE_DEFAULT_PERMISSIONS.tender),
  curator: makeRole("Куратор", "Контроль заявок, команды, склада и задач", ROLE_DEFAULT_PERMISSIONS.curator),
};

function effectivePermissions(profileOrRole, overridesArg = {}) {
  const profile = typeof profileOrRole === "object" && profileOrRole !== null ? profileOrRole : null;
  const role = profile ? profile.role : profileOrRole;
  const overrides = profile?.access_overrides && typeof profile.access_overrides === "object"
    ? profile.access_overrides
    : (overridesArg && typeof overridesArg === "object" ? overridesArg : {});
  const permissions = new Set(ROLE_DEFAULT_PERMISSIONS[role] || []);
  Object.entries(overrides).forEach(([key, allowed]) => {
    if (allowed === true) permissions.add(key);
    if (allowed === false) permissions.delete(key);
  });
  const nativeHas = Set.prototype.has.bind(permissions);
  permissions.has = (key) => role === "admin" || nativeHas(key);
  permissions.includes = permissions.has;
  permissions.can = permissions.has;
  return permissions;
}
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
// «2026-08» → «авг 26». Год нужен: в списке за два года без него не понять,
// какой из двух августов перед тобой.
const monthLabel = (key) => {
  const [y, m] = String(key || "").split("-");
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || !MONTHS_GEN[idx]) return String(key || "");
  return `${MONTHS_GEN[idx]} ${String(y).slice(2)}`;
};
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

// Единый жизненный цикл заявки. STATUS отвечает за итоговое состояние,
// WORK_STAGE — за то, что происходит с заявкой прямо сейчас.
const WORK_STAGE = {
  new: { label: "Новая", short: "Новая", color: "#2563EB", bg: "#EAF1FE", step: 0 },
  confirmed: { label: "Подтверждена", short: "Подтверждена", color: "#7C3AED", bg: "#F0EAFE", step: 1 },
  assigned: { label: "Исполнитель назначен", short: "Назначена", color: "#B45309", bg: "#FCF1E2", step: 2 },
  en_route: { label: "Исполнитель в пути", short: "В пути", color: "#0369A1", bg: "#E0F2FE", step: 3 },
  on_site: { label: "Исполнитель на объекте", short: "На объекте", color: "#0F766E", bg: "#CCFBF1", step: 4 },
  done: { label: "Работа выполнена", short: "Выполнена", color: "#0E7C66", bg: "#E4F3EE", step: 5 },
  canceled: { label: "Заявка отменена", short: "Отменена", color: "#B3261E", bg: "#FBE7E5", step: -1 },
};

function jobWorkStage(job) {
  if (job?.status === "done") return "done";
  if (job?.status === "canceled") return "canceled";
  if (WORK_STAGE[job?.work_stage]) return job.work_stage;
  return job?.assigned_to ? "assigned" : "new";
}

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
// Текст для возврата ушедшего клиента. Пишется от лица компании, коротко и
// без давления: человек уже платил, ему достаточно напоминания и повода.
function winbackMsg(client, header) {
  const brand = header || "KazDez";
  const when = client?.monthsSince >= 12
    ? "больше года назад"
    : client?.monthsSince > 0 ? `${client.monthsSince} мес. назад` : "недавно";
  const lines = [
    `${client?.name ? `${client.name}, здравствуйте!` : "Здравствуйте!"} Это ${brand}.`,
    `Мы делали у вас обработку ${when}${client?.pest ? ` (${client.pest.toLowerCase()})` : ""}.`,
    "Сейчас как раз сезон, когда насекомые возвращаются. Если снова беспокоят — подскажем, что делать, и подберём удобное время.",
    "Для повторной обработки у нас действует сниженная цена.",
  ];
  return lines.join("\n");
}

// Просьба оставить отзыв на картах. Отправляется довольным клиентам через
// день-другой после работы: в этот момент результат уже виден, а впечатление
// ещё свежее.
function reviewRequestMsg(name, link) {
  const lines = [
    `${name ? `${name}, здравствуйте!` : "Здравствуйте!"} Это KazDez.`,
    "Спасибо за оценку — нам это правда важно.",
    link
      ? `Если не сложно, оставьте пару слов о работе здесь: ${link}`
      : "Если не сложно, оставьте пару слов о работе в 2ГИС или на Картах — так нас находят новые клиенты.",
  ];
  return lines.join("\n");
}

// Ссылка на переписку в WhatsApp с готовым текстом.
function waLink(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  // казахстанские номера пишут и через 8, и через +7 — для wa.me нужен код страны
  const normalized = digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
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

export {
  TECH_DOC_KINDS, TRAINING_TOPICS, WORK_EQUIPMENT, equipmentLabel, PAPERWORK_SCHEMES, PAPERWORK_STEPS, SETTLE_METHODS, BLOCK_REASONS, OBJECT_KINDS, addressKey, DISCOUNT_REASONS, describeChange, COMPANY_IMAGE_KEYS, EMPLOYEE_EVENTS, clientMemoFor, winbackMsg, waLink, monthLabel, reviewRequestMsg, ADMIN_TAB_ORDER, AddressText, DEPOSIT_STATUS, DOC_STATUS, DOC_TYPES, DRIVE_LINKS, DateFilterBar, DriveLinkCard, EQUIP_CATEGORIES, EQUIP_STATUS, EXPENSE_TYPES, GUARANTEE_KINDS, MONTHS_GEN, MONTHS_NOM, REPEAT_POLICIES, ROLE_DEFAULT_PERMISSIONS, ROLE_DEFINITIONS, STATUS, TAB_LABELS, TAB_LABELS_SHORT, phoneKey, samePhone, TASK_STATUS, TASK_TYPES, TENDER_STATUS, WEEKDAYS, WORK_STAGE, addressPlain, buildMsg, chemUnit, copyText, dateGroupLabel, dateInFilter, datePresetRange, daysSince, effectivePermissions, fmt, fmtAmount, fmtTs, groupByDate, isPast, isoOf, isoToRu, jobTime, jobWhatsappUrl, jobWorkStage, lineAmount, ml2l, norm, parseIso, periodRange, pricePerBase, repeatLabel, technicianArrivalMessage, timeRangeMin, timeStart, todayStart };
