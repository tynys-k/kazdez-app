function requiredPart(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required for local storage isolation`);
  return encodeURIComponent(text);
}

function scopedKey(prefix, ownerId, ...parts) {
  return [prefix, requiredPart(ownerId, "ownerId"), ...parts.map((part) => requiredPart(part, "key part"))].join(":");
}

export const offlineActionsStorageKey = (ownerId) => scopedKey("kd-offline-actions-v5", ownerId);
export const newJobDraftStorageKey = (ownerId) => scopedKey("kazdez-new-job-draft-v3", ownerId);
export const reportDraftStorageKey = (ownerId, jobId) => scopedKey("kazdez-report-draft-v5", ownerId, jobId);

export function ownedOfflineActions(value, ownerId) {
  if (!Array.isArray(value)) return [];
  const expected = String(ownerId);
  return value.filter((item) => item && typeof item === "object" && item.ownerId === expected);
}

export function clearUserLocalData(storage, ownerId) {
  const encodedOwner = requiredPart(ownerId, "ownerId");
  const rawOwner = String(ownerId);
  const exactKeys = new Set([
    offlineActionsStorageKey(ownerId),
    newJobDraftStorageKey(ownerId),
    // Старые общие ключи нельзя безопасно приписать кому-либо. До выхода они
    // помещены в карантин, а при явном выходе удаляются вместе с данными сессии.
    "kd-offline-snapshot-v4",
    "kd-offline-actions-v4",
    "kazdez-new-job-draft-v2",
  ]);
  const prefixes = [
    `kazdez-report-draft-v5:${encodedOwner}:`,
    `kd-offline-snapshot-v5:${rawOwner}:`,
    "kazdez-report-draft-v4:",
  ];
  let removed = 0;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && (exactKeys.has(key) || prefixes.some((prefix) => key.startsWith(prefix)))) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}
