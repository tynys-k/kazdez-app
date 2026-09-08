export const ATOMIC_RECEIPTS_MIGRATION = "2026-09-07_atomic_receipts.sql";
export const ATOMIC_SETTLEMENTS_MIGRATION = "2026-09-07_atomic_settlements.sql";
export const ATOMIC_GUARANTEE_RETURNS_MIGRATION = "2026-09-08_atomic_guarantee_returns.sql";
export const ATOMIC_GUARANTEE_DELETIONS_MIGRATION = "2026-09-08_atomic_guarantee_deletions.sql";
export const ATOMIC_CASH_DEPOSITS_MIGRATION = "2026-09-08_atomic_cash_deposits.sql";
export const ATOMIC_PAYROLL_MIGRATION = "2026-09-08_atomic_payroll.sql";
export const ATOMIC_MARKETING_SPEND_MIGRATION = "2026-09-08_atomic_marketing_spend.sql";
export const ATOMIC_JOB_RECEIPTS_MIGRATION = "2026-09-08_atomic_job_receipts.sql";
export const ATOMIC_STOCK_RECEIPTS_MIGRATION = "2026-09-08_atomic_stock_receipts.sql";
export const ATOMIC_CHEMICAL_SALES_MIGRATION = "2026-09-08_atomic_chemical_sales.sql";
export const ATOMIC_PARTNER_SETTLEMENTS_MIGRATION = "2026-09-08_atomic_partner_settlements.sql";
export const ATOMIC_LEAD_CONVERSION_MIGRATION = "2026-09-08_atomic_lead_conversion.sql";
export const ON_SITE_ESTIMATES_MIGRATION = "2026-09-08_on_site_estimates.sql";
export const ATOMIC_CONTRACT_VISITS_MIGRATION = "2026-09-08_atomic_contract_visits.sql";

export function createFinancialRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function atomicReceiptRpcUnavailable(error, rpcName) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  const name = String(rpcName || "").toLowerCase();
  return code === "PGRST202"
    || (name && message.includes(name) && (message.includes("schema cache") || message.includes("could not find")));
}
