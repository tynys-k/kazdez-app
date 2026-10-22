// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeadCard from "./LeadCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const stages = [
  { id: "s1", code: "new", name: "Новый / Разведка", sort: 10 },
  { id: "s2", code: "lpr_found", name: "ЛПР найден", sort: 20 },
  { id: "s3", code: "kp_sent", name: "КП отправлено", sort: 30 },
  { id: "s8", code: "lost", name: "Отказ", sort: 80, is_final: true, is_lost: true },
  { id: "s9", code: "snoozed", name: "Отложено", sort: 90 },
];
const lead = { id: "lead-1", name: "Два Японца", client_type: "company", phone: "+7 747 108 8385", stage_id: "s2", owner_id: "u1",
  next_action: "Позвонить клиенту", next_action_at: "2026-10-22T13:00:00Z", object_type: "catering", area_m2: 250, lpr_name: "Наурыз", lpr_position: "админ", note: "админ занят" };
const text = () => document.body.textContent;
const button = (label) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const typeInto = async (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});

describe("карточка лида в духе Bitrix", () => {
  it("показывает воронку, сделку и одну ленту с касаниями и прошлыми заявками", async () => {
    const loadTimeline = vi.fn().mockResolvedValue({ rows: [{ kind: "job", ref_id: "j1", happened_at: "2026-08-18T00:00:00Z", status: "done", title: "Насекомые", details: "с. Байкент", amount: 25000 }] });
    const onPickStage = vi.fn();
    await act(async () => root.render(<LeadCard lead={lead} stages={stages} profileName={() => "Сейлжан"} loadTimeline={loadTimeline} onPickStage={onPickStage}
      actionState={{ kind: "overdue" }} onRecord={vi.fn()} onEdit={vi.fn()}
      activities={[{ id: "a1", lead_id: "lead-1", kind: "system", outcome: "created", comment: "Карточка лида создана", occurred_at: "2026-10-22T09:19:00Z" }]} />));
    expect(loadTimeline).toHaveBeenCalledWith("lead-1");
    expect([...document.body.querySelectorAll(".crm-stage")].map((b) => b.textContent)).toEqual(["Новый / Разведка", "ЛПР найден", "КП отправлено"]);
    expect(document.body.querySelector(".crm-stage.on").textContent).toBe("ЛПР найден");
    expect(text()).toContain("Просрочено");
    expect(text()).toContain("Общепит (A)");
    expect(text()).toContain("Наурыз, админ");
    expect(text()).toContain("Заявка: Насекомые");
    expect(text()).toContain("Карточка лида создана");
    await act(async () => button("КП отправлено").click());
    expect(onPickStage).toHaveBeenCalledWith(stages[2]);
  });

  it("записывает звонок прямо из карточки и объясняет, чего не хватает", async () => {
    const onRecord = vi.fn().mockResolvedValue(null);
    await act(async () => root.render(<LeadCard lead={lead} stages={stages} onRecord={onRecord} onEdit={vi.fn()} />));
    await act(async () => button("Звонок").click());
    await act(async () => button("Сохранить касание").click());
    expect(text()).toContain("Напиши, что сказал клиент.");
    expect(onRecord).not.toHaveBeenCalled();
    await typeInto(document.body.querySelector(".crm-composer-text"), "Админ занят, просил набрать завтра");
    await act(async () => button("Сохранить касание").click());
    expect(onRecord.mock.calls[0][0]).toMatchObject({ kind: "call", outcome: "connected", comment: "Админ занят, просил набрать завтра", nextAction: "Позвонить клиенту" });
    expect(new Date(onRecord.mock.calls[0][0].nextActionAt).getTime()).toBeGreaterThan(Date.now());
  });
});
