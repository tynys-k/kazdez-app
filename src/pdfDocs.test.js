import { describe, expect, it } from "vitest";
import { actDef, certificateDef, safePdfImage } from "./pdfDocs";

describe("PDF company images", () => {
  it("keeps supported PNG and JPEG data URLs", () => {
    const png = "data:image/png;base64,QUJDREVGR0hJSktM";
    const jpeg = "data:image/jpeg;base64,QUJDREVGR0hJSktM";
    expect(safePdfImage(png)).toBe(png);
    expect(safePdfImage(jpeg)).toBe(jpeg);
  });

  it("removes whitespace from otherwise valid base64", () => {
    expect(safePdfImage("data:image/png;base64,QUJD REVG R0hJ SktM"))
      .toBe("data:image/png;base64,QUJDREVGR0hJSktM");
  });

  it("ignores unsupported, truncated and non-string settings", () => {
    expect(safePdfImage("https://example.invalid/stamp.png")).toBeNull();
    expect(safePdfImage("data:image/png;base64,broken")).toBeNull();
    expect(safePdfImage({ value: "data:image/png;base64,QUJDREVGR0hJSktM" })).toBeNull();
  });
});

const company = { name: "KazDez", bin: "123456789012", address: "Алматы", phone: "+7 700", director: "Директор" };
const visit = { address: "Алматы", pest: "Дератизация", type: "Первичная", scheduled_date: "2026-09-15", guarantee_months: 3, guarantee_after_visit: 1, visit_no: 1 };

describe("documents for an agreed treatment plan", () => {
  it("allows a warranty talon immediately after a single deratization visit", () => {
    const pdf = certificateDef(visit, company);
    expect(JSON.stringify(pdf)).toContain("Гарантия действует 3 мес. с даты обработки № 1");
    expect(JSON.stringify(pdf)).not.toContain("повторной (закрепляющей)");
  });

  it("does not issue the talon before the agreed second visit or for zero warranty", () => {
    expect(() => certificateDef({ ...visit, guarantee_after_visit: 2 }, company)).toThrow();
    expect(() => certificateDef({ ...visit, guarantee_months: 0 }, company)).toThrow();
  });

  it("prints the agreed special terms instead of generic repeat promises", () => {
    const pdf = JSON.stringify(certificateDef({ ...visit, guarantee_terms: "Повторный выезд после осмотра объекта" }, company));
    expect(pdf).toContain("Повторный выезд после осмотра объекта");
    expect(pdf).not.toContain("повторная обработка проводится бесплатно");
  });

  it("mentions the next visit in the act only if warranty has not started", () => {
    const immediate = JSON.stringify(actDef(visit, company));
    const twoVisits = JSON.stringify(actDef({ ...visit, guarantee_after_visit: 2 }, company));
    expect(immediate).not.toContain("Следующую обработку");
    expect(twoVisits).toContain("после обработки № 2");
    expect(twoVisits).toContain("3 мес.");
  });
});
