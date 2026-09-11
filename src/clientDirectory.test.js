import { describe, expect, it } from "vitest";
import { belongsToClient, clientAddresses, clientContracts, clientSummary, searchClients } from "./clientDirectory";

const client = { id: "client-1", phone_key: "7475658082", phone: "+7 747 565 8082", name: "ТОО Посиделки" };

describe("client directory", () => {
  it("uses client_id first and phone as a legacy fallback", () => {
    expect(belongsToClient({ client_id: "client-1", client_phone: "+7 000" }, client)).toBe(true);
    expect(belongsToClient({ client_id: "other", client_phone: "+7 747 565 8082" }, client)).toBe(false);
    expect(belongsToClient({ client_phone: "8 (747) 565-80-82" }, client)).toBe(true);
  });

  it("links contracts and calculates a complete client summary", () => {
    const jobs = [{ id: "j1", client_phone: "87475658082", status: "done", report_paid: 20000, scheduled_date: "2026-09-10" }];
    const contracts = [{ id: "c1", phone: "+7 747 565 8082", active: true }];
    expect(clientContracts(client, contracts)).toHaveLength(1);
    expect(clientSummary(client, jobs, contracts, [])).toMatchObject({ jobs: 1, done: 1, revenue: 20000, activeContracts: 1 });
  });

  it("combines saved and historical addresses without duplicates", () => {
    const rows = clientAddresses(client,
      [{ id: "a1", client_id: "client-1", address: "ул. Макатаева, 127" }],
      [{ client_id: "client-1", address: "ул Макатаева 127" }, { client_id: "client-1", address: "ул. Сейфуллина, 609" }]);
    expect(rows.map((row) => row.address)).toEqual(["ул. Макатаева, 127", "ул. Сейфуллина, 609"]);
  });

  it("searches legal data, contacts and addresses", () => {
    const context = {
      contacts: [{ client_id: "client-1", name: "Айжан", phone: "+7 700 111 22 33" }],
      addresses: [{ client_id: "client-1", address: "Абая 10" }],
    };
    expect(searchClients([{ ...client, bin_iin: "123456789012" }], "Айжан", context)).toHaveLength(1);
    expect(searchClients([client], "Абая", context)).toHaveLength(1);
    expect(searchClients([{ ...client, bin_iin: "123456789012" }], "123456", context)).toHaveLength(1);
  });
});
