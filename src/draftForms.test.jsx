// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobFormModal, ReportModal, jobToForm } from "./modals";
import { CHECK_RESULTS, WORK_EQUIPMENT } from "./shared";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const job = { id: "report-test", pest: "Тараканы", address: "Тестовый адрес", quoted_price: 10000 };
const draftKey = `kazdez-report-draft-v4:${job.id}`;
const equipment = WORK_EQUIPMENT.find((e) => e.common);
let container, root;
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); localStorage.clear(); });
async function mountReport(onSave = vi.fn().mockResolvedValue(false), onClose = vi.fn()) {
  await act(async () => root.render(<ReportModal job={job} chemicals={[]} controlPoints={[{ id: "point", number: 1, kind: "bait" }]} onSave={onSave} onClose={onClose} />));
}
function button(text) { return [...container.querySelectorAll("button")].find((b) => b.textContent === text); }
async function click(text) { await act(async () => button(text).click()); }
function field(label) { return [...container.querySelectorAll(".kd-field")].find((el) => el.querySelector("span")?.textContent === label)?.querySelector("input,select,textarea"); }
async function change(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
const read = () => JSON.parse(localStorage.getItem(draftKey));

describe("report drafts and submission failures", () => {
  it("persists equipment, inspection, discount note and debt due date without another field changing", async () => {
    await mountReport();
    await click(equipment.label);
    expect(read().equipment).toEqual([equipment.code]);
    const result = Object.keys(CHECK_RESULTS)[0];
    await change(container.querySelector(".kd-pointrow select"), result);
    expect(read().checks.point.result).toBe(result);
    await change(field("Наличными (₸)"), "5000");
    await change(field("Причина"), "debt");
    await change(field("Когда обещал заплатить"), "2026-10-01");
    await change(field("Пояснение"), "Остаток позже");
    expect(read()).toMatchObject({ discountReason: "debt", debtDue: "2026-10-01", discountNote: "Остаток позже" });
    await act(async () => root.unmount()); root = createRoot(container);
    await mountReport();
    expect(button(equipment.label).classList.contains("on")).toBe(true);
    expect(field("Когда обещал заплатить").value).toBe("2026-10-01");
    expect(container.querySelector(".kd-pointrow select").value).toBe(result);
  });
  it.each([false, undefined])("retains the draft unless save explicitly succeeds (%s)", async (result) => {
    await mountReport(vi.fn().mockResolvedValue(result)); await click(equipment.label); await click("Сохранить отчёт");
    expect(read().equipment).toEqual([equipment.code]);
    expect(container.textContent).toContain("Сохранение отчёта не подтверждено");
    expect(button("Сохранить отчёт").disabled).toBe(false);
  });
  it("recovers after a thrown network error without erasing the draft", async () => {
    await mountReport(vi.fn().mockRejectedValue(new Error("network"))); await click(equipment.label); await click("Сохранить отчёт");
    expect(container.textContent).toContain("сервер мог принять запрос");
    expect(read()).not.toBeNull();
    expect(button("Сохранить отчёт").disabled).toBe(false);
  });
  it("prevents double submission, editing and closing while a save is pending", async () => {
    let resolve; const onSave = vi.fn(() => new Promise((r) => { resolve = r; })); const onClose = vi.fn();
    await mountReport(onSave, onClose); await click(equipment.label);
    await act(async () => { const save = button("Сохранить отчёт"); save.click(); save.click(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(field("Наличными (₸)").matches(":disabled")).toBe(true);
    await click("Отмена"); expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve(true));
    expect(localStorage.getItem(draftKey)).toBeNull();
    await change(field("Примечание"), "after success");
    expect(localStorage.getItem(draftKey)).toBeNull();
  });
  it("warns about unavailable storage without crashing or claiming an offline save", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    const onSave = vi.fn(); await mountReport(onSave); await click(equipment.label); await click("Сохранить отчёт");
    expect(container.textContent).toContain("Черновик не сохранён на устройстве");
    expect(container.textContent).not.toContain("Черновик сохранён на устройстве");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("continues rendering if a stored draft is malformed JSON", async () => {
    localStorage.setItem(draftKey, "{broken"); await mountReport();
    expect(container.textContent).toContain("Отчёт по заявке");
    expect(read().equipment).toEqual([]);
  });
});

describe("job form save recovery", () => {
  it("reenables the form after a thrown save and warns about an uncertain result", async () => {
    const initial = jobToForm({ ...job, type: "Первичная", client_phone: "+77010000000", price_options: [{ label: "Стоимость", amount: 10000 }] });
    const onSave = vi.fn().mockRejectedValue(new Error("network"));
    await act(async () => root.render(<JobFormModal initial={initial} title="Изменить заявку" submitLabel="Сохранить" onSave={onSave} onClose={vi.fn()} />));
    await click("Сохранить");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(button("Сохранить").disabled).toBe(false);
    expect(container.textContent).toContain("сервер мог принять запрос");
  });
});
