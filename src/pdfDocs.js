// src/pdfDocs.js
// Шаг 3: настоящий гарантийный сертификат с реквизитами компании из Настроек.
// (Печать и подпись добавим на следующем шаге.)
// Библиотека уже стоит: pdfmake

import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";

pdfMake.vfs =
  pdfFonts.pdfMake?.vfs ||
  pdfFonts.vfs ||
  pdfFonts.default?.pdfMake?.vfs ||
  pdfFonts.default?.vfs;

const GREEN = "#0E7C66";
const MUTED = "#6E7871";

// ── дата в формате ДД.ММ.ГГГГ ──
function dateRu(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

// ── реквизиты компании из settings ──
function company(settings = {}) {
  return {
    name: settings.company_name || "ТОО «KazDez»",
    bin: settings.company_bin || "—",
    address: settings.company_address || "—",
    phone: settings.company_phone || "—",
    director: settings.company_director || "Директор",
  };
}

// ── макет гарантийного сертификата ──
function certificateDef(job, c) {
  const months = job.guarantee_months || 6;
  const number = job.doc_number || `ГС-${new Date().getFullYear()}-00001`;
  const date = dateRu(job.scheduled_date);

  return {
    pageSize: "A4",
    pageMargins: [42, 42, 42, 56],
    defaultStyle: { font: "Roboto", fontSize: 11, color: "#1A1F1C", lineHeight: 1.3 },
    content: [
      // шапка
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: "KazDez", fontSize: 22, bold: true, color: GREEN },
              { text: c.name, bold: true, margin: [0, 4, 0, 0] },
              { text: `БИН ${c.bin}`, fontSize: 9, color: MUTED },
              { text: c.address, fontSize: 9, color: MUTED },
              { text: `тел. ${c.phone}`, fontSize: 9, color: MUTED },
            ],
          },
          {
            width: "auto",
            stack: [
              { text: "ГАРАНТИЙНЫЙ", bold: true, fontSize: 15, alignment: "right" },
              { text: "СЕРТИФИКАТ", bold: true, fontSize: 15, alignment: "right" },
              { text: `№ ${number}`, alignment: "right", margin: [0, 6, 0, 0] },
              { text: `от ${date}`, alignment: "right", fontSize: 10, color: MUTED },
            ],
          },
        ],
        columnGap: 16,
      },
      { canvas: [{ type: "line", x1: 0, y1: 10, x2: 511, y2: 10, lineWidth: 1.4, lineColor: GREEN }], margin: [0, 8, 0, 16] },

      {
        text: "Настоящий сертификат подтверждает выполнение работ по обработке объекта Заказчика и предоставление гарантии на выполненные работы.",
        margin: [0, 0, 0, 14],
      },

      // таблица данных
      {
        table: {
          widths: [150, "*"],
          body: [
            ["Объект (адрес)", job.address || "—"],
            ["Вид обработки", `${job.type || "—"} · ${job.pest || "—"}`],
            ...(job.area ? [["Площадь", `${job.area} м²`]] : []),
            ["Дата обработки", date + (job.scheduled_time ? `, ${job.scheduled_time}` : "")],
            ["Специалист", job.tech || "—"],
            ["Срок гарантии", `${months} мес.`],
          ].map(([k, v]) => [
            { text: k, color: MUTED, fontSize: 10, margin: [0, 3, 0, 3] },
            { text: v, bold: true, margin: [0, 3, 0, 3] },
          ]),
        },
        layout: "noBorders",
      },

      { text: "Условия гарантии", bold: true, margin: [0, 18, 0, 6] },
      {
        ul: [
          `Гарантия действует ${months} месяцев с даты повторной (закрепляющей) обработки.`,
          "При повторном появлении вредителей в гарантийный срок повторная обработка проводится бесплатно.",
          "Гарантия сохраняется при соблюдении рекомендаций специалиста: доступ к объекту, отсутствие самостоятельных обработок, соблюдение чистоты.",
        ],
        fontSize: 10,
        color: "#333",
      },

      // подпись (место под печать оставим на след. шаге)
      { text: c.director, bold: true, margin: [0, 40, 0, 0] },
      {
        canvas: [{ type: "line", x1: 0, y1: 6, x2: 200, y2: 6, lineWidth: 0.7, lineColor: "#cccccc" }],
        margin: [0, 30, 0, 2],
      },
      { text: "подпись / М.П.", fontSize: 8, color: MUTED },
    ],
    footer: () => ({
      text: `${c.name} · ${c.phone}`,
      alignment: "center",
      fontSize: 8,
      color: MUTED,
      margin: [0, 12, 0, 0],
    }),
  };
}

// ── создать и скачать сертификат по заявке ──
export function generateCertificate(job, settings) {
  const def = certificateDef(job, company(settings));
  pdfMake.createPdf(def).download(`Сертификат-${job.doc_number || "тест"}.pdf`);
}

// ── тест: демо-заявка + твои реальные реквизиты из Настроек ──
export function testPdf(settings) {
  const demoJob = {
    address: "г. Алматы, ул. Абая, 112, цоколь",
    type: "Дезинсекция",
    pest: "Тараканы",
    area: 140,
    scheduled_date: "2026-07-14",
    scheduled_time: "11:00",
    guarantee_months: settings?.default_guarantee_months || 6,
    tech: "Тыныс",
  };
  generateCertificate(demoJob, settings);
}
