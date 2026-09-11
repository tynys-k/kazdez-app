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
      addresses={[]} contracts={[{ id: "contract-1", client_id: "client-1", service: "Дезинсекция", active: true }]}
      attachments={[]} jobProofs={[]} onClose={vi.fn()} onEdit={vi.fn()} onAddNote={vi.fn()} onUpload={vi.fn()}
      onOpenAttachment={vi.fn()} onOpenJob={vi.fn()} onOpenContract={vi.fn()} onOpenProof={vi.fn()} />));
    expect(container.textContent).toContain("Клиент 360° · ТОО Посиделки");
    expect(container.textContent).toContain("Айжан");
    expect(container.textContent).toContain("Макатаева 127");
    expect(container.textContent).toContain("Дезинсекция");
    expect(container.textContent).toContain("Заявки · 1");
    expect(container.textContent).toContain("Файлы · 0");
  });

  it("provides structured company, contact and address editing", async () => {
    await act(async () => root.render(<ClientProfileModal client={client} contacts={[]} addresses={[]} onClose={vi.fn()} onSave={vi.fn()} />));
    expect(container.textContent).toContain("Юридическое наименование");
    expect(container.textContent).toContain("БИН / ИИН");
    expect(container.textContent).toContain("Контактные лица");
    expect(container.textContent).toContain("Адреса клиента");
  });
});
