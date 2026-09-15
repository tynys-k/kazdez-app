import { describe, expect, it } from "vitest";
import { buildMapUrl, displayValue, formatDate, formatMoney, formatPhone } from "./formatters";

describe("UI formatters", () => {
  it("formats empty values and money", () => {
    expect(displayValue(null)).toBe("—");
    expect(formatMoney(12500)).toMatch(/12\s500 ₸/);
  });

  it("formats Kazakhstan phone numbers", () => {
    expect(formatPhone("8 (701) 234-56-78")).toBe("+7 701 234 56 78");
  });

  it("does not expose ISO dates", () => {
    expect(formatDate("2026-09-15T10:20:00Z")).toBe("15.09.2026");
  });

  it("decodes safe map links and builds address links", () => {
    expect(buildMapUrl({ url: "https%3A%2F%2Fyandex.kz%2Fmaps%2F" })).toContain("yandex.kz/maps/");
    expect(buildMapUrl({ address: "Алматы, Абая 1" })).toContain("text=");
  });
});
