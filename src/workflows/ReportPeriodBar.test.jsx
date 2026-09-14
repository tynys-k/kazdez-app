// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportPeriodBar from "./ReportPeriodBar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("report period bar", () => {
  it("offers every management period and navigates backwards", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<ReportPeriodBar filter={{ preset: "month", offset: 0 }} onChange={onChange} />));
    ["День", "Неделя", "Месяц", "Квартал", "Полугодие", "Год", "Всё время", "Период"].forEach((label) => expect(container.textContent).toContain(label));
    await act(async () => container.querySelector('[aria-label="Предыдущий период"]').click());
    expect(onChange).toHaveBeenCalledWith({ preset: "month", offset: -1 });
    expect(container.querySelector('[aria-label="Следующий период"]').disabled).toBe(true);
  });
});
