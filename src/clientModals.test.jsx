// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDetailsModal, ClientProfileModal } from "./clientModals";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const client = { id: "client-1", name: "ТОО Посиделки", phone: "+7 747 565 8082", phone_key: "7475658082", client_type: "company", legal_name: "ТОО «Посиделки»", bin_iin: "123456789012" };

describe("client card UI", () => {
  it("shows the complete customer context and navigation", async () => {
    await act(async () => root.render(<ClientDetailsModal client={client}
      jobs={[{ id: "job-1", client_id: "client-1", status: "done", pest: "Тараканы", address: "Макатаева 127", scheduled_date: "2026-09-10", report_paid: 20000 }]}
      contacts={[{ id: "contact-1", client_id: "client-1", name: "Айжан", role: "Управляющая", phone: "+7 700 000 00 00" }]}
      addresses={[]} legalContracts={[{ id: "contract-1", client_id: "client-1", number: "Д-41", organization: "Дезинсекция", signed_on: "2026-09-01", status: "active" }]}
      attachments={[]} jobProofs={[]} onClose={vi.fn()} onEdit={vi.fn()} onAddNote={vi.fn()} onUpload={vi.fn()}
      onOpenAttachment={vi.fn()} onOpenJob={vi.fn()} onOpenLegalContract={vi.fn()} onOpenContract={vi.fn()} onOpenProof={vi.fn()} />));
    expect(document.body.textContent).toContain("ТОО Посиделки");
    // Лента карточки: выполненная заявка видна сразу, без перехода по вкладкам.
    expect(document.body.textContent).toContain("Заявка: Тараканы");
    expect(document.body.textContent).toContain("Айжан");
    expect(document.body.textContent).toContain("Макатаева 127");
    expect(document.body.textContent).toContain("Дезинсекция");
    expect(document.body.textContent).toContain("Заявки · 1");
    expect(document.body.textContent).toContain("Файлы · 0");
  });

  it("добавляет комментарий прямо из карточки и объясняет пустой", async () => {
    const onAddNote = vi.fn().mockResolvedValue(true);
    await act(async () => root.render(<ClientDetailsModal client={client} jobs={[]} contacts={[]} addresses={[]} legalContracts={[]} attachments={[]} jobProofs={[]} canEdit
      onClose={vi.fn()} onEdit={vi.fn()} onAddNote={onAddNote} onUpload={vi.fn()} onOpenAttachment={vi.fn()} onOpenJob={vi.fn()} onOpenLegalContract={vi.fn()} onOpenContract={vi.fn()} onOpenProof={vi.fn()} />));
    const add = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Добавить комментарий");
    await act(async () => add.click());
    expect(document.body.textContent).toContain("Напиши комментарий.");
    expect(onAddNote).not.toHaveBeenCalled();
    const text = document.body.querySelector(".crm-composer-text");
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(text, "Просил КП на почту"); text.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => add.click());
    expect(onAddNote).toHaveBeenCalledWith(client, "Просил КП на почту");
  });

  it("provides structured company, contact and address editing", async () => {
    await act(async () => root.render(<ClientProfileModal client={client} contacts={[]} addresses={[]} onClose={vi.fn()} onSave={vi.fn()} />));
    expect(document.body.textContent).toContain("Юридическое наименование");
    expect(document.body.textContent).toContain("БИН / ИИН");
    expect(document.body.textContent).toContain("Контактные лица");
    expect(document.body.textContent).toContain("Адреса клиента");
  });
});
