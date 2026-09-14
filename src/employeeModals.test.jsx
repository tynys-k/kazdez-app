// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TechEditModal, UserAccessModal } from "./modals";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

function field(label) {
  return [...container.querySelectorAll(".kd-field")].find((node) => node.querySelector("span")?.textContent === label)?.querySelector("input,select");
}

describe("employee forms", () => {
  it("separates job title from access role and saves the hiring date", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(<TechEditModal tech={{ id: "1", full_name: "Айжан", role: "accountant", salary_monthly: 80000 }} onClose={vi.fn()} onSave={onSave} />));
    expect(field("Должность").textContent).toContain("Главный бухгалтер");
    expect(field("Должность").textContent).toContain("Координатор");
    expect(field("Роль доступа").textContent).toContain("Бухгалтер");
    await act(async () => {
      const input = field("Дата приёма на работу");
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set.call(input, "2026-08-15");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Сохранить").click());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ job_title: "Бухгалтер", hired_on: "2026-08-15", role: "accountant" }));
  });

  it("collects payroll details during initial employee creation", async () => {
    await act(async () => root.render(<UserAccessModal user={null} onClose={vi.fn()} onSave={vi.fn()} />));
    expect(field("Дата приёма на работу")).not.toBeNull();
    expect(field("Оклад в месяц (₸)")).not.toBeNull();
    expect(field("График работы")).not.toBeNull();
    expect(container.textContent).toContain("автоматически появится в «Зарплате»");
  });
});
