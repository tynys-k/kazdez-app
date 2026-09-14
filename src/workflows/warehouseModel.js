export function warehouseBalance(warehouse, kind, itemId, moves, legacyAvailable = 0, warehouses = []) {
  const rows = moves.filter((m) => m.item_kind === kind && m.item_id === itemId);
  const net = (id) => rows.reduce((sum, m) => sum + (m.to_warehouse_id === id ? Number(m.amount) : 0) - (m.from_warehouse_id === id ? Number(m.amount) : 0), 0);
  if (kind === "chemical" && warehouse.unallocated) return legacyAvailable - warehouses.filter((w) => !w.unallocated).reduce((sum, w) => sum + net(w.id), 0);
  return net(warehouse.id);
}
export function warehouseRevisionDelta(moves, itemId) {
  return moves.filter((m) => m.item_kind === "chemical" && m.item_id === itemId).reduce((sum, m) => sum + Number(m.inventory_delta || 0), 0);
}
