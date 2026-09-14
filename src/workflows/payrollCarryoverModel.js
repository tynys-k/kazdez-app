export function payrollCarryover(rows, techId, month) {
  if (!month) return { incoming: 0, outgoing: 0, net: 0 };
  const own = rows.filter((r) => r.tech_id === techId);
  const incoming = own.filter((r) => r.to_month === month).reduce((s, r) => s + Number(r.amount), 0);
  const outgoing = own.filter((r) => r.from_month === month).reduce((s, r) => s + Number(r.amount), 0);
  return { incoming, outgoing, net: outgoing - incoming };
}
