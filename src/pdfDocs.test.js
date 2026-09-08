import { describe, expect, it } from "vitest";
import { safePdfImage } from "./pdfDocs";

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
