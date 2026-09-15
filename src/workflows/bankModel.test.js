import { describe, expect, it } from "vitest";
import { bankSideOfMove, financeClassification, financePeriod, suggestBankMatches } from "./bankModel";

describe("bank reconciliation", () => {
  it("matches only a unique amount, account, direction and nearby date", () => {
    const moves = [{ id: "m1", account_id: "kaspi", direction: "expense", amount: 140000, move_date: "2026-09-15" }];
    const rows = [{ id: "r1", account_id: "kaspi", direction: "expense", amount: 140000, booked_on: "2026-09-15", fingerprint: "a" }];
    expect(suggestBankMatches(rows, moves)).toHaveLength(1);
    expect(suggestBankMatches([...rows, { ...rows[0], id: "r2", fingerprint: "b" }], moves)).toHaveLength(0);
    const planned = [{ id: "o1", amount: 140000, spent_date: "2026-09-15", money_move_id: null }];
    expect(suggestBankMatches(rows, [], [], planned)[0].opex.id).toBe("o1");
    expect(suggestBankMatches(rows, moves, [], planned)).toHaveLength(0);
  });
  it("does not treat cash transfers or owner draws as business costs", () => {
    const accounts = [{ id: "kaspi", scope: "business" }, { id: "cash", scope: "business" }, { id: "owner", scope: "owner" }];
    expect(bankSideOfMove({ account_id: "kaspi", to_account_id: "cash", direction: "transfer" }, "kaspi")).toBe("expense");
    expect(financeClassification({ account_id: "kaspi", to_account_id: "cash", direction: "transfer" }, accounts)).toBe("transfer");
    expect(financeClassification({ account_id: "kaspi", to_account_id: "owner", direction: "transfer" }, accounts)).toBe("owner_draw");
    expect(financeClassification({ account_id: "owner", direction: "expense" }, accounts)).toBe("owner_spend");
    expect(financeClassification({ account_id: "kaspi", direction: "income", source: "personal_debt" }, accounts)).toBe("non_operating");
    expect(financeClassification({ account_id: "kaspi", direction: "expense", finance_class: "owner_direct_spend" }, accounts)).toBe("owner_direct_spend");
  });
  it("supports day through annual periods", () => {
    const now = new Date(2026, 8, 16);
    expect(financePeriod("day", 0, now).label).toContain("16.09.2026");
    expect(financePeriod("half", 0, now).label).toContain("01.07.2026");
    expect(financePeriod("quarter", 0, now).label).toContain("01.07.2026");
    expect(financePeriod("year", 0, now).label).toContain("01.01.2026");
  });
});
