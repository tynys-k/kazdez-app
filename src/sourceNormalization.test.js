import { describe, expect, it } from "vitest";
import { canonicalSourceKey, canonicalSourceName, canonicalSourceOptions, sourceNamesMatch } from "./sourceNormalization";

describe("source normalization", () => {
  it.each([
    ["Инстаграм", "Instagram"],
    ["insta", "Instagram"],
    ["гугл", "Google Ads"],
    ["Яндекс Директ", "Яндекс"],
    ["двагис", "2ГИС"],
    ["сарафанное радио", "Рекомендация"],
    ["партнеры", "Партнёр"],
  ])("turns %s into %s", (input, expected) => {
    expect(canonicalSourceName(input)).toBe(expected);
  });

  it("matches historical aliases by meaning", () => {
    expect(sourceNamesMatch(" Instagram Ads ", "инста")).toBe(true);
    expect(canonicalSourceKey("2 gis")).toBe(canonicalSourceKey("2ГИС"));
    expect(sourceNamesMatch("Google Карты", "Google Ads")).toBe(false);
  });

  it("shows every source once and keeps unknown sources", () => {
    expect(canonicalSourceOptions([
      { name: "Инстаграм" },
      { name: "insta" },
      { name: "Instagram" },
      { name: "Выставка" },
    ], "выставка")).toEqual(["Выставка", "Instagram"]);
  });
});
