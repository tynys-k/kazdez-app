// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailDrawer, KpiCard, ListRow, Pagination, SegmentedControl } from "./primitives";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("shared UI primitives", () => {
  it("exposes accessible navigation and compact list rows", async () => {
    const onOpen = vi.fn();
    const onPage = vi.fn();
    await act(async () => root.render(<><ListRow title="Контрольная заявка" meta="Алматы" onClick={onOpen} /><Pagination page={1} pageSize={25} total={100} onPageChange={onPage} /></>));
    const row = container.querySelector(".ui-list-row");
    expect(row.getAttribute("role")).toBe("button");
    await act(async () => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onOpen).toHaveBeenCalledOnce();
    await act(async () => container.querySelector('[aria-label="Следующая страница"]').click());
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("shares KPI, lens and detail presentation", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    await act(async () => root.render(<><KpiCard label="Выручка" value="100 000 ₸" description="за месяц" /><SegmentedControl label="Взгляд" value="ceo" onChange={onChange} options={[{ value: "ceo", label: "CEO" }, { value: "cfo", label: "CFO" }]} /><DetailDrawer open title="Деталь" onClose={onClose}><p>Содержание</p></DetailDrawer></>));
    expect(container.querySelectorAll(".ui-card")).toHaveLength(1);
    expect(container.querySelector('[aria-modal="true"]').textContent).toContain("Содержание");
    await act(async () => container.querySelector('[aria-label="Закрыть"]').click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps ordinary details on the right and centers only requested dialogs", async () => {
    await act(async () => root.render(<DetailDrawer open title="Стандартная деталь" onClose={() => {}}>Текст</DetailDrawer>));
    expect(container.querySelector(".ui-drawer--center")).toBeNull();
    await act(async () => root.render(<DetailDrawer open placement="center" title="Карточка заявки" onClose={() => {}}>Текст</DetailDrawer>));
    expect(container.querySelector(".ui-drawer--center")).not.toBeNull();
  });
});
