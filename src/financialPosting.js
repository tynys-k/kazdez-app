export const ATOMIC_RECEIPTS_MIGRATION = "2026-09-07_atomic_receipts.sql";
export const ATOMIC_SETTLEMENTS_MIGRATION = "2026-09-07_atomic_settlements.sql";

export function atomicReceiptRpcUnavailable(error, rpcName) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  const name = String(rpcName || "").toLowerCase();
  return code === "PGRST202"
    || (name && message.includes(name) && (message.includes("schema cache") || message.includes("could not find")));
}
