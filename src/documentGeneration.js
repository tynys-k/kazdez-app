let pdfDocumentsPromise = null;

const defaultImporter = () => import("./pdfDocs");

// Keep the lazy-loaded PDF bundle in memory. This preserves the fast first
// screen, but prevents an already-open tab from requesting an obsolete chunk
// only when the user finally clicks a document button after a deployment.
export function loadPdfDocuments(importer = defaultImporter) {
  if (!pdfDocumentsPromise) {
    pdfDocumentsPromise = importer().catch((error) => {
      // A temporary network failure must not poison every later attempt.
      pdfDocumentsPromise = null;
      throw error;
    });
  }
  return pdfDocumentsPromise;
}

export function preloadPdfDocuments() {
  return loadPdfDocuments().catch(() => null);
}

export function documentFailureMessage(error, documentName) {
  const message = String(error?.message || error || "");
  if (/dynamically imported module|chunkloaderror|loading chunk|failed to fetch/i.test(message)) {
    return `Приложение обновилось. Обновите страницу и снова нажмите «${documentName}».`;
  }
  if (/network|offline|internet/i.test(message)) {
    return `Нет связи для подготовки документа. Проверьте интернет и повторите «${documentName}».`;
  }
  return `Не удалось сформировать ${documentName.toLowerCase()}. Обновите страницу и попробуйте ещё раз.`;
}

export function resetPdfDocumentsForTests() {
  pdfDocumentsPromise = null;
}
