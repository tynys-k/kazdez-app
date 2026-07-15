// src/pdfDocs.js
// Шаг 1: проверяем, что PDF формируется и кириллица рисуется.
// Перед этим в терминале: npm i pdfmake

import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";

// разные версии pdfmake хранят шрифты по-разному — берём с запасом
pdfMake.vfs =
  pdfFonts.pdfMake?.vfs ||
  pdfFonts.vfs ||
  pdfFonts.default?.pdfMake?.vfs ||
  pdfFonts.default?.vfs;

export function testPdf() {
  const def = {
    content: [
      { text: "KazDez", fontSize: 22, bold: true, color: "#0E7C66" },
      { text: "Гарантийный сертификат", fontSize: 16, margin: [0, 8, 0, 0] },
      { text: "Проверка кириллицы: съешь ещё этих мягких булок.", margin: [0, 12, 0, 0] },
    ],
  };
  pdfMake.createPdf(def).download("test.pdf");
}
