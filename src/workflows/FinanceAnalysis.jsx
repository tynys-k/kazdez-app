import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmt } from "../shared";
import { financeClassification, financePeriod, incomeChannel, moneyInPeriod } from "./bankModel";
import "./financeAnalysis.css";

const MODES = [["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["quarter", "Квартал"], ["half", "Полугодие"], ["year", "Год"]];
const total = (rows) => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
const grouped = (rows, labelOf) => {
  const groups = new Map();
  rows.forEach((row) => { const label = labelOf(row); groups.set(label, (groups.get(label) || 0) + Number(row.amount || 0)); });
  return [...groups].sort((a, b) => b[1] - a[1]);
};

export default function FinanceAnalysis({ moves, accounts, categories, bankRows, evidence, jobs, manualExpenses }) {
  const [mode, setMode] = useState("month");
  const [offset, setOffset] = useState(0);
  const period = financePeriod(mode, offset);
  const previous = financePeriod(mode, offset - 1);
  const currentMoves = moneyInPeriod(moves, "move_date", period);
  const unpostedManual = moneyInPeriod(manualExpenses.filter((row) => !row.money_move_id), "spent_date", period);
  const previousMoves = moneyInPeriod(moves, "move_date", previous);
  const classification = (row) => financeClassification(row, accounts);
  const expenses = currentMoves.filter((row) => classification(row) === "business_expense");
  const incomes = currentMoves.filter((row) => classification(row) === "business_income");
  const previousExpenses = previousMoves.filter((row) => classification(row) === "business_expense");
  const previousIncomes = previousMoves.filter((row) => classification(row) === "business_income");
  const ownerDraws = currentMoves.filter((row) => classification(row) === "owner_draw");
  const ownerSpends = currentMoves.filter((row) => classification(row) === "owner_spend");
  const ownerDirect = currentMoves.filter((row) => classification(row) === "owner_direct_spend");
  const ownerIncomes = currentMoves.filter((row) => classification(row) === "owner_income");
  const proofMoveIds = new Set(evidence.filter((row) => row.kind === "move").map((row) => row.move_id));
  const currentBank = moneyInPeriod(bankRows, "booked_on", period);
  const proofFingerprints = new Set(evidence.map((row) => row.fingerprint));
  const pending = currentBank.filter((row) => !proofFingerprints.has(row.fingerprint));
  const qrVerified = moneyInPeriod(evidence.filter((row) => row.kind === "qr_job"), "booked_on", period);
  const excluded = moneyInPeriod(evidence.filter((row) => row.kind === "excluded"), "booked_on", period);
  const jobDone = moneyInPeriod(jobs.filter((job) => job.status === "done"), "scheduled_date", period);
  const jobSource = grouped(jobDone.map((job) => ({ amount: Number(job.report_paid) || 0, source: job.source || "Не указан" })), (row) => row.source);
  const categoryName = (row) => categories.find((cat) => cat.id === row.category_id)?.name || "Без статьи";
  const isGrowth = (row) => {
    const category = categories.find((cat) => cat.id === row.category_id);
    return category?.purpose === "growth" || categories.find((cat) => cat.id === category?.parent_id)?.purpose === "growth";
  };
  const growthExpense = total(expenses.filter(isGrowth));
  const previousGrowth = total(previousExpenses.filter(isGrowth));
  const cats = grouped(expenses, categoryName);
  const previousCats = new Map(grouped(previousExpenses, categoryName));
  const largestGrowth = cats.map(([name, value]) => ({ name, value, previous: previousCats.get(name) || 0 }))
    .filter((row) => row.value > row.previous).sort((a, b) => (b.value - b.previous) - (a.value - a.previous)).slice(0, 5);
  const channels = grouped(incomes, incomeChannel);
  const confirmedExpense = total(expenses.filter((row) => proofMoveIds.has(row.id)));
  const confirmedIncome = total(incomes.filter((row) => proofMoveIds.has(row.id))) + total(qrVerified);
  const enteredExpense = total(expenses); const enteredIncome = total(incomes);
  const changePct = (now, before) => before > 0 ? Math.round((now / before - 1) * 100) : null;
  const expenseChange = changePct(enteredExpense, total(previousExpenses));
  const incomeChange = changePct(enteredIncome, total(previousIncomes));

  return <div className="finance-analysis">
    <div className="kd-tabbar"><div><h2 className="kd-title">Финансовый пульс</h2><div className="kd-muted">Сверенные деньги показаны отдельно от ручных записей и отчётной выручки по заявкам.</div></div></div>
    <div className="finance-period"><div className="kd-seg finance-period-modes">{MODES.map(([value, label]) =>
      <button key={value} className={`kd-segbtn ${mode === value ? "on" : ""}`} onClick={() => { setMode(value); setOffset(0); }}>{label}</button>)}</div>
      <div className="kd-pernav"><button className="kd-arrow" aria-label="Предыдущий период" onClick={() => setOffset(offset - 1)}><ChevronLeft size={18} /></button><span className="kd-perlabel">{period.label}</span><button className="kd-arrow" aria-label="Следующий период" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}><ChevronRight size={18} /></button></div></div>
    <div className="finance-score">
      <div><span>Расходы компании записаны</span><strong>{fmt(enteredExpense)} ₸</strong><small>{expenseChange == null ? "нет сравнимого прошлого периода" : `${expenseChange > 0 ? "+" : ""}${expenseChange}% к прошлому периоду`}</small></div>
      <div><span>Из них банк подтвердил</span><strong>{fmt(confirmedExpense)} ₸</strong><small>{expenses.length - expenses.filter((row) => proofMoveIds.has(row.id)).length} движений без выписки</small></div>
      <div><span>Поступления компании записаны</span><strong>{fmt(enteredIncome)} ₸</strong><small>{incomeChange == null ? "нет сравнимого прошлого периода" : `${incomeChange > 0 ? "+" : ""}${incomeChange}% к прошлому периоду`}</small></div>
      <div><span>Подтверждено банком + QR</span><strong>{fmt(confirmedIncome)} ₸</strong><small>QR из заявки отдельно от банковских движений</small></div>
    </div>
    <div className="finance-alerts">
      {pending.length > 0 && <div className="kd-flag danger">В выписках этого периода не разнесено {pending.length} операций: списания {fmt(total(pending.filter((row) => row.direction === "expense")))} ₸, поступления {fmt(total(pending.filter((row) => row.direction === "income")))} ₸.</div>}
      {excluded.length > 0 && <div className="kd-flag danger">Исключено из разноски {excluded.length} банковских строк на {fmt(total(excluded))} ₸. Проверьте объяснения: эти суммы не меняют баланс приложения.</div>}
      {expenses.some((row) => !proofMoveIds.has(row.id)) && <div className="kd-flag">Есть расходы компании без банковского подтверждения. Сверьте их с выпиской либо с кассовыми документами.</div>}
      {unpostedManual.length > 0 && <div className="kd-flag danger">Ручных расходов без кассового движения: {unpostedManual.length} на {fmt(total(unpostedManual))} ₸. Найдите их в выписке и подтвердите, иначе остатки счетов завышены.</div>}
      {!bankRows.length && !evidence.length && <div className="kd-flag">Выписок нет. Текущие цифры — записи приложения, не проверенная банковская картина.</div>}
    </div>
    <div className="finance-details">
      <section className="kd-card"><h3 className="kd-section">Статьи расходов</h3>{!cats.length && <div className="kd-empty">Расходов за период не записано.</div>}{cats.map(([name, amount]) => <div className="kd-row" key={name}><span>{name}</span><strong>{fmt(amount)} ₸</strong></div>)}</section>
      <section className="kd-card"><h3 className="kd-section">Ручные расходы без кассовой проводки</h3>{!unpostedManual.length && <div className="kd-empty">Таких расходов за период нет.</div>}{grouped(unpostedManual, categoryName).map(([name, amount]) => <div className="kd-row" key={name}><span>{name}</span><strong>{fmt(amount)} ₸</strong></div>)}</section>
      <section className="kd-card"><h3 className="kd-section">Источники денежных поступлений</h3>{!channels.length && <div className="kd-empty">Поступлений за период не записано.</div>}{channels.map(([name, amount]) => <div className="kd-row" key={name}><span>{name}</span><strong>{fmt(amount)} ₸</strong></div>)}
        {qrVerified.length > 0 && <div className="kd-row"><span>QR заявок, подтверждённые банком</span><strong>{fmt(total(qrVerified))} ₸</strong></div>}</section>
      <section className="kd-card"><h3 className="kd-section">Что выросло к прошлому периоду</h3>{!largestGrowth.length && <div className="kd-empty">Рост расходов по статьям не обнаружен.</div>}{largestGrowth.map((row) => <div className="kd-row" key={row.name}><span>{row.name}<small className="kd-muted">было {fmt(row.previous)} ₸</small></span><strong>+{fmt(row.value - row.previous)} ₸</strong></div>)}</section>
      <section className="kd-card"><h3 className="kd-section">Расходы на развитие</h3><div className="kd-row"><span>Вложено в отмеченные категории</span><strong>{fmt(growthExpense)} ₸</strong></div><div className="kd-row"><span>Доля расходов компании</span><strong>{enteredExpense ? Math.round(growthExpense / enteredExpense * 100) : 0}%</strong></div><div className="kd-row"><span>Прошлый период</span><strong>{fmt(previousGrowth)} ₸</strong></div><div className="kd-muted">Отмечайте категории «Развитие» в настройках. Это классификация использования денег, не расчёт окупаемости.</div></section>
      <section className="kd-card"><h3 className="kd-section">Деньги предпринимателя</h3><div className="kd-row"><span>Изъято из компании на личный счёт</span><strong>{fmt(total(ownerDraws))} ₸</strong></div><div className="kd-row"><span>Личные траты прямо с бизнес-счёта</span><strong>{fmt(total(ownerDirect))} ₸</strong></div><div className="kd-row"><span>Итого изъято владельцем</span><strong>{fmt(total(ownerDraws) + total(ownerDirect))} ₸</strong></div><div className="kd-row"><span>Потрачено с личного счёта</span><strong>{fmt(total(ownerSpends))} ₸</strong></div><div className="kd-row"><span>Прочие личные поступления</span><strong>{fmt(total(ownerIncomes))} ₸</strong></div><div className="kd-muted">Прямая личная покупка показана и как изъятие, и как трата — это одно банковское списание, не два движения. Личные суммы не включены в операционные затраты или выручку компании.</div></section>
      <section className="kd-card finance-wide"><h3 className="kd-section">Источник заявок — отчётная выручка, не банковская сверка</h3><div className="kd-muted">По выполненным заявкам этого периода. Денежные поступления могли прийти в другой день или на другой счёт.</div>{!jobSource.length && <div className="kd-empty">Выполненных заявок нет.</div>}{jobSource.map(([name, amount]) => <div className="kd-row" key={name}><span>{name}</span><strong>{fmt(amount)} ₸</strong></div>)}</section>
    </div>
    <div className="kd-muted">Это контроль денежных потоков, а не бухгалтерская прибыль: себестоимость, начисления и налоговые обязательства учитываются в других разделах.</div>
  </div>;
}
