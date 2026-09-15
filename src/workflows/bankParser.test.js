import { describe, expect, it } from "vitest";
import { bankAmount, bankDate, parsePdfBankLines, parseTabularBankRows } from "./bankParser";

describe("bank statement parsing", () => {
  it("recognizes debit/credit columns and Russian amounts", () => {
    const matrix = [
      ["Дата операции", "Назначение платежа", "Расход", "Приход", "Номер операции"],
      ["15.09.2026", "Покупка препаратов", "140 000,00", "", "A1"],
      ["16.09.2026", "Оплата клиента", "", "4 000,00", "A2"],
    ];
    expect(parseTabularBankRows(matrix).rows).toEqual([
      { booked_on: "2026-09-15", direction: "expense", amount: 140000, description: "Покупка препаратов", counterparty: null, reference: "A1" },
      { booked_on: "2026-09-16", direction: "income", amount: 4000, description: "Оплата клиента", counterparty: null, reference: "A2" },
    ]);
  });
  it("does not guess direction when it is missing", () => {
    const result = parseTabularBankRows([
      ["Дата", "Сумма", "Описание"],
      ["15.09.2026", "-4 000,00", "Перевод"],
      ["16.09.2026", "4 000,00", "Неясно"],
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });
  it("parses Excel dates and blocks empty amounts", () => {
    expect(bankDate(46280)).toMatch(/^2026-/);
    expect(bankAmount("1 200,50 ₸")).toBe(1200.5);
    expect(bankAmount(0)).toBeNull();
    expect(bankDate("31.02.2026")).toBeNull();
  });
  it("requires an explicit direction for free-text PDF lines", () => {
    const parsed = parsePdfBankLines([
      ["15.09.2026", "Расход", "Покупка препарата", "140 000,00"],
      ["16.09.2026", "Непонятный перевод", "4 000,00"],
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(1);
  });
});
