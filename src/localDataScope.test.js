import { describe, expect, it } from "vitest";
import { clearUserLocalData, newJobDraftStorageKey, offlineActionsStorageKey, ownedOfflineActions, reportDraftStorageKey } from "./localDataScope";

describe("user-scoped local data", () => {
  it("uses different keys for different employees and reports", () => {
    expect(offlineActionsStorageKey("user-a")).not.toBe(offlineActionsStorageKey("user-b"));
    expect(newJobDraftStorageKey("user-a")).not.toBe(newJobDraftStorageKey("user-b"));
    expect(reportDraftStorageKey("user-a", "job-1")).not.toBe(reportDraftStorageKey("user-a", "job-2"));
  });

  it("keeps only actions explicitly owned by the signed-in employee", () => {
    const items = [
      { ownerId: "user-a", jobId: "own" },
      { ownerId: "user-b", jobId: "foreign" },
      { jobId: "legacy-without-owner" },
    ];
    expect(ownedOfflineActions(items, "user-a")).toEqual([{ ownerId: "user-a", jobId: "own" }]);
  });

  it("rejects missing identity instead of falling back to a shared key", () => {
    expect(() => offlineActionsStorageKey("")).toThrow(/ownerId/);
    expect(() => reportDraftStorageKey("user-a", "")).toThrow(/key part/);
  });

  it("removes private and legacy work on logout but keeps device preferences", () => {
    const storage = new Map([
      [offlineActionsStorageKey("user-a"), "queue"],
      [newJobDraftStorageKey("user-a"), "job draft"],
      [reportDraftStorageKey("user-a", "job-1"), "report draft"],
      ["kd-offline-snapshot-v5:user-a:admin::{}", "snapshot"],
      ["kd-offline-actions-v4", "legacy queue"],
      ["kazdez-report-draft-v4:old-job", "legacy report"],
      [offlineActionsStorageKey("user-b"), "other user"],
      ["kd-theme", "dark"],
    ]);
    const fakeStorage = {
      get length() { return storage.size; },
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => storage.delete(key),
    };

    expect(clearUserLocalData(fakeStorage, "user-a")).toBe(6);
    expect(storage.has(offlineActionsStorageKey("user-b"))).toBe(true);
    expect(storage.get("kd-theme")).toBe("dark");
  });
});
