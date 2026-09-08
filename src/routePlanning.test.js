import { describe, expect, it } from "vitest";
import { normalizeRouteAddress, yandexRouteUrl } from "./routePlanning";

describe("маршрут по Алматы и области", () => {
  it("добавляет Алматы к городскому адресу без названия города", () => {
    expect(normalizeRouteAddress("ул. Жамбыла, д. 31, кв. 2"))
      .toBe("Алматы, Казахстан, ул. Жамбыла, д. 31, кв. 2");
  });

  it("не приписывает Алматы адресу в селе или другом явно указанном городе", () => {
    expect(normalizeRouteAddress("село Шамалган, ул. Новикова, 2"))
      .toBe("село Шамалган, ул. Новикова, 2");
    expect(normalizeRouteAddress("г. Каскелен, ул. Абая, 5"))
      .toBe("г. Каскелен, ул. Абая, 5");
  });

  it("не дублирует Алматы и не меняет координаты", () => {
    expect(normalizeRouteAddress("Алматы, ул. Толе би, 10")).toBe("Алматы, ул. Толе би, 10");
    expect(normalizeRouteAddress("43.238949, 76.889709")).toBe("43.238949, 76.889709");
  });

  it("передаёт Яндексу уточнённый город для каждой городской точки", () => {
    const url = decodeURIComponent(yandexRouteUrl([
      "ул. Кабанбай батыра, д. 14, кв. 23",
      "ул. Жамбыла, д. 31, кв. 2",
      "село Шамалган, ул. Новикова, 2",
    ]));
    expect(url).toContain("Алматы, Казахстан, ул. Кабанбай батыра");
    expect(url).toContain("Алматы, Казахстан, ул. Жамбыла");
    expect(url).toContain("село Шамалган, ул. Новикова");
  });
});
