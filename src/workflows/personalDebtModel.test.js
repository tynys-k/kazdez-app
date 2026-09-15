import { describe, expect, it } from "vitest";
import { personalDebtBalance, personalDebtMoveDirection } from "./personalDebtModel";

describe("personal debt ledger", () => {
  it("keeps the running balance across partial returns and another advance", () => {
    const events = [
      { debt_id: "arsen", kind: "principal", amount: 55000 },
      { debt_id: "arsen", kind: "repayment", amount: 10000 },
      { debt_id: "arsen", kind: "repayment", amount: 15000 },
      { debt_id: "arsen", kind: "principal", amount: 20000 },
      { debt_id: "other", kind: "principal", amount: 100000 },
    ];
    expect(personalDebtBalance(events, "arsen")).toBe(50000);
  });

  it("posts both sides to accounts in the correct direction", () => {
    expect(personalDebtMoveDirection("receivable", "principal")).toBe("expense");
    expect(personalDebtMoveDirection("receivable", "repayment")).toBe("income");
    expect(personalDebtMoveDirection("payable", "principal")).toBe("income");
    expect(personalDebtMoveDirection("payable", "repayment")).toBe("expense");
  });
});
