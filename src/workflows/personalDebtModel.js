export function personalDebtBalance(events, debtId) {
  return events.filter((event) => event.debt_id === debtId)
    .reduce((balance, event) => balance + (event.kind === "principal" ? 1 : -1) * Number(event.amount || 0), 0);
}

export function personalDebtMoveDirection(direction, kind) {
  return (direction === "receivable") === (kind === "principal") ? "expense" : "income";
}
