import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentFailureMessage, loadPdfDocuments, resetPdfDocumentsForTests } from "./documentGeneration";

describe("document generation loader", () => {
  beforeEach(() => resetPdfDocumentsForTests());

  it("loads the PDF bundle once and reuses it", async () => {
    const module = { generateAct: vi.fn() };
    const importer = vi.fn().mockResolvedValue(module);

    await expect(loadPdfDocuments(importer)).resolves.toBe(module);
    await expect(loadPdfDocuments(importer)).resolves.toBe(module);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a failed preload", async () => {
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ generateAct: vi.fn() });

    await expect(loadPdfDocuments(importer)).rejects.toThrow("Failed to fetch");
    await expect(loadPdfDocuments(importer)).resolves.toBeTruthy();
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("explains how to recover from an obsolete deployment chunk", () => {
    expect(documentFailureMessage(
      new TypeError("Failed to fetch dynamically imported module"),
      "Акт",
    )).toBe("Приложение обновилось. Обновите страницу и снова нажмите «Акт».");
  });

  it("does not expose technical errors to the employee", () => {
    const text = documentFailureMessage(new Error("Invalid image: corrupt-base64"), "Сертификат");
    expect(text).toContain("Не удалось сформировать сертификат");
    expect(text).not.toContain("corrupt-base64");
  });
});
