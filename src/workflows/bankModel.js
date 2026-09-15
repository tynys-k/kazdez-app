const DAY = 86400000;

export function bankSideOfMove(move, accountId) {
  if (move.direction === "transfer") {
    if (move.account_id === accountId) return "expense";
    if (move.to_account_id === accountId) return "income";
    return null;
  }
  return move.account_id === accountId ? move.direction : null;
}

export function suggestBankMatches(rows, moves, evidence = [], manualExpenses = []) {
  const linkedRows = new Set(evidence.map((item) => item.fingerprint));
  const linkedMoves = new Set(evidence.filter((item) => item.move_id).map((item) => `${item.move_id}:${item.account_id}`));
  const candidates = rows.filter((row) => !linkedRows.has(row.fingerprint)).map((row) => {
    const moveOptions = moves.filter((move) =>
      !linkedMoves.has(`${move.id}:${row.account_id}`) &&
      bankSideOfMove(move, row.account_id) === row.direction &&
      Math.round(Number(move.amount) * 100) === Math.round(Number(row.amount) * 100) &&
      Math.abs(new Date(`${move.move_date}T00:00:00`).getTime() - new Date(`${row.booked_on}T00:00:00`).getTime()) <= 3 * DAY
    ).map((item) => ({ kind: "move", item }));
    const manualOptions = row.direction !== "expense" ? [] : manualExpenses.filter((expense) =>
      !expense.money_move_id && (!expense.account_id || expense.account_id === row.account_id) &&
      Math.round(Number(expense.amount) * 100) === Math.round(Number(row.amount) * 100) &&
      Math.abs(new Date(`${expense.spent_date}T00:00:00`).getTime() - new Date(`${row.booked_on}T00:00:00`).getTime()) <= 3 * DAY
    ).map((item) => ({ kind: "opex", item }));
    const options = [...moveOptions, ...manualOptions];
    return { row, options };
  });
  const useCount = new Map();
  candidates.forEach(({ row, options }) => options.forEach((option) => {
    const key = `${option.kind}:${option.item.id}:${row.account_id}`;
    useCount.set(key, (useCount.get(key) || 0) + 1);
  }));
  return candidates.filter(({ row, options }) => options.length === 1 && useCount.get(`${options[0].kind}:${options[0].item.id}:${row.account_id}`) === 1)
    .map(({ row, options }) => ({ row, move: options[0].kind === "move" ? options[0].item : null,
      opex: options[0].kind === "opex" ? options[0].item : null }));
}

export function financePeriod(mode, offset = 0, now = new Date()) {
  const y = now.getFullYear(); const m = now.getMonth();
  let start; let end;
  if (mode === "day") { start = new Date(y, m, now.getDate() + offset); end = new Date(y, m, now.getDate() + offset + 1); }
  else if (mode === "week") { const mon = new Date(y, m, now.getDate() - (now.getDay() + 6) % 7 + 7 * offset); start = mon; end = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7); }
  else if (mode === "quarter") { start = new Date(y, Math.floor(m / 3) * 3 + 3 * offset, 1); end = new Date(start.getFullYear(), start.getMonth() + 3, 1); }
  else if (mode === "half") { start = new Date(y, Math.floor(m / 6) * 6 + 6 * offset, 1); end = new Date(start.getFullYear(), start.getMonth() + 6, 1); }
  else if (mode === "year") { start = new Date(y + offset, 0, 1); end = new Date(y + offset + 1, 0, 1); }
  else { start = new Date(y, m + offset, 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 1); }
  const label = mode === "day" ? start.toLocaleDateString("ru-RU") : `${start.toLocaleDateString("ru-RU")} — ${new Date(end.getTime() - DAY).toLocaleDateString("ru-RU")}`;
  return { start: start.getTime(), end: end.getTime(), label };
}

export function moneyInPeriod(rows, dateKey, period) {
  return rows.filter((row) => {
    const date = row[dateKey];
    if (!date) return false;
    const time = new Date(`${String(date).slice(0, 10)}T00:00:00`).getTime();
    return time >= period.start && time < period.end;
  });
}

export function financeClassification(move, accounts) {
  if (move.finance_class === "owner_direct_spend") return "owner_direct_spend";
  const account = accounts.find((item) => item.id === move.account_id);
  const destination = accounts.find((item) => item.id === move.to_account_id);
  if (move.direction === "transfer") return destination?.scope === "owner" && account?.scope !== "owner" ? "owner_draw" : "transfer";
  if (account?.scope === "owner") return move.direction === "expense" ? "owner_spend" : "owner_income";
  if (/personal_debt|tender_pledge|tender_return|deposit/.test(String(move.source || ""))) return "non_operating";
  return move.direction === "expense" ? "business_expense" : "business_income";
}

export function incomeChannel(move) {
  const named = { clients: "Клиенты / заявки", tenders: "Тендеры", products: "Продажа препаратов", other: "Прочие поступления" };
  if (named[move.income_channel]) return named[move.income_channel];
  const source = String(move.source || "");
  if (/tender|customer_payment/.test(source)) return "Тендеры";
  if (/chem_sale/.test(source)) return "Препараты";
  if (/job|qr|cash/.test(source)) return "Клиенты / заявки";
  if (/personal_debt/.test(source)) return "Возврат займа";
  return "Прочие поступления";
}
