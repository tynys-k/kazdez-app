import { describe, expect, it } from "vitest";
import { employeePosition, payrollEmployees } from "./employeeModel";

describe("employee model", () => {
  it("includes every active employee in payroll regardless of access role", () => {
    const rows = payrollEmployees([
      { id: 1, role: "tech", is_active: true },
      { id: 2, role: "accountant", is_active: true },
      { id: 3, role: "tender", is_active: true },
      { id: 4, role: "manager", is_active: false },
    ]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("keeps inactive legacy disinfectors visible to avoid losing payroll history", () => {
    expect(payrollEmployees([{ id: 1, role: "tech", is_active: false }])).toHaveLength(1);
  });

  it("provides a clear fallback for old profiles", () => {
    expect(employeePosition({ job_title: "Главный бухгалтер" })).toBe("Главный бухгалтер");
    expect(employeePosition({})).toBe("Должность не указана");
  });
});
