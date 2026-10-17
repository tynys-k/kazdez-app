// Выплата сотруднику относится к расчётному периоду (period_month, «ГГГГ-ММ»),
// а не к дате оплаты: зарплату за сентябрь платят 1–5 октября, и считать её
// октябрьской нельзя — иначе в сентябре висит долг, а в октябре переплата.
// Записи без периода (до миграции 2026-10-17) относятся к месяцу даты оплаты.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export function isPayrollMonth(value) {
  return MONTH_RE.test(String(value || ""));
}

export function paymentPeriod(expense) {
  if (isPayrollMonth(expense?.period_month)) return expense.period_month;
  const date = String(expense?.expense_date || "").slice(0, 7);
  return isPayrollMonth(date) ? date : "";
}

// «2026-09» → «Сентябрь 2026».
export function payrollPeriodLabel(month) {
  if (!isPayrollMonth(month)) return "";
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

// Проведённые выплаты сотрудника, которые гасят начисление выбранного периода.
// В режиме «Месяц» — по расчётному периоду. Неделя и «всё время» периода
// начисления не имеют (оклад в них не считается), там остаётся дата оплаты.
export function payrollPaymentsFor(expenses, techId, { monthKey = "", inPeriod = () => true } = {}) {
  return (expenses || []).filter((e) => e.tech_id === techId && e.status === "paid"
    && (monthKey ? paymentPeriod(e) === monthKey : inPeriod(e.expense_date)));
}

// Текст подтверждения удаления ошибочной выплаты: что именно удаляем и что
// вместе с ней исчезнет расход по счёту.
export function payrollPaymentDeleteMessage(expense, { person = "", typeLabel = "Выплата", accountName = "", amountText = "", dateText = "" } = {}) {
  const period = payrollPeriodLabel(paymentPeriod(expense)).toLowerCase();
  const what = [person, `${typeLabel}${period ? ` за ${period}` : ""}`, amountText, dateText ? `оплачено ${dateText}` : ""].filter(Boolean).join(" · ");
  const cash = expense?.account_id
    ? `Расход по счёту${accountName ? ` «${accountName}»` : ""} тоже удалится, остаток счёта вернётся.`
    : "Расхода по счёту у неё нет.";
  return `Удалить выплату: ${what}? ${cash} Отменить удаление нельзя.`;
}

// Месяц, который форма «Добавить выплату» предлагает по умолчанию: открытый в
// разделе месяц, а без него — месяц сегодняшней даты.
export function defaultPayrollPeriod(monthKey, today = new Date()) {
  if (isPayrollMonth(monthKey)) return monthKey;
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
