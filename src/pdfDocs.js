// src/pdfDocs.js
// Документы используют согласованный по заказу номер начала гарантии.
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


// pdfmake supports PNG/JPEG data URLs. Old or manually edited settings may
// contain an empty/truncated value; omit only that decoration instead of
// failing the entire customer document.
export function safePdfImage(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const payload = match[2].replace(/\s/g, "");
  return payload.length >= 16 && payload.length % 4 === 0 ? `${value.slice(0, value.indexOf(",") + 1)}${payload}` : null;
}

// ── реквизиты компании из settings ──
function company(settings = {}) {
  return {
    name: settings.company_name || "ТОО «KazDez»",
    bin: settings.company_bin || "—",
    address: settings.company_address || "—",
    phone: settings.company_phone || "—",
    director: settings.company_director || "Директор",
    stamp: safePdfImage(settings.company_stamp),       // data-URL картинки печати
    signature: safePdfImage(settings.company_signature), // data-URL картинки подписи
  };
}

// ── макет гарантийного сертификата ──
export function certificateDef(job, c) {
  const months = Number(job.guarantee_months);
  if (!Number.isInteger(months) || months < 1 || months > 120
    || (Number(job.visit_no) || 1) !== (Number(job.guarantee_after_visit) || 2)) {
    throw new Error("Гарантийный талон доступен только после согласованной обработки при положительном сроке гарантии.");
  }
  const number = job.doc_number || `ГТ-${new Date().getFullYear()}-00001`;
  const date = dateRu(job.scheduled_date);
  const sy = 650; // вертикальное положение блока подписи/печати. Если стоят высоко/низко — меняй это одно число.

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
              { text: "ТАЛОН", bold: true, fontSize: 15, alignment: "right" },
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
            ["Заказчик (телефон)", (job.client_phone || "—") + (job.contact_name ? ` (${job.contact_name})` : "")],
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
          `Гарантия действует ${months} мес. с даты обработки № ${Number(job.visit_no) || 1} (${date}).`,
          ...(job.guarantee_terms ? [job.guarantee_terms] : [
            "Гарантийное обращение рассматривается после осмотра объекта и проверки соблюдения рекомендаций специалиста.",
            "Условия повторного выезда согласуются с заказчиком с учётом вида услуги и результатов осмотра.",
          ]),
        ],
        fontSize: 10,
        color: "#333",
      },

      // ── подпись и печать (абсолютно, привязано к низу страницы) ──
      // порядок = слои: сначала линия, затем подпись, сверху печать
      { text: c.director, bold: true, absolutePosition: { x: 42, y: sy } },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: "#cccccc" }], absolutePosition: { x: 42, y: sy + 46 } },
      { text: "подпись / М.П.", fontSize: 8, color: MUTED, absolutePosition: { x: 42, y: sy + 50 } },
      ...(c.signature ? [{ image: c.signature, width: 130, absolutePosition: { x: 46, y: sy - 40 } }] : []),
      ...(c.stamp ? [{ image: c.stamp, width: 120, opacity: 0.9, absolutePosition: { x: 150, y: sy + 2 } }] : []),
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
  pdfMake.createPdf(def).download(`Гарантийный-талон-${job.doc_number || "работы"}.pdf`);
}

// ── акт выполненных работ для любого завершённого выезда ──
export function actDef(job, c) {
  const number = job.doc_number || `АКТ-${new Date().getFullYear()}-00001`;
  const date = dateRu(job.scheduled_date);
  const chems = job.chemicals && job.chemicals.length ? job.chemicals : null;
  const sy = 650;

  return {
    pageSize: "A4",
    pageMargins: [42, 42, 42, 56],
    defaultStyle: { font: "Roboto", fontSize: 11, color: "#1A1F1C", lineHeight: 1.3 },
    content: [
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
              { text: "АКТ ВЫПОЛНЕННЫХ", bold: true, fontSize: 14, alignment: "right" },
              { text: "РАБОТ", bold: true, fontSize: 14, alignment: "right" },
              { text: `№ ${number}`, alignment: "right", margin: [0, 6, 0, 0] },
              { text: `от ${date}`, alignment: "right", fontSize: 10, color: MUTED },
            ],
          },
        ],
        columnGap: 16,
      },
      { canvas: [{ type: "line", x1: 0, y1: 10, x2: 511, y2: 10, lineWidth: 1.4, lineColor: GREEN }], margin: [0, 8, 0, 16] },

      {
        text: `Настоящим подтверждается, что специалистами ${c.name} выполнены работы по обработке объекта Заказчика.`,
        margin: [0, 0, 0, 14],
      },

      {
        table: {
          widths: [150, "*"],
          body: [
            ["Объект (адрес)", job.address || "—"],
            ["Заказчик (телефон)", (job.client_phone || "—") + (job.contact_name ? ` (${job.contact_name})` : "")],
            ["Вид обработки", `${job.type || "—"} · ${job.pest || "—"}`],
            ...(job.area ? [["Площадь", `${job.area} м²`]] : []),
            ["Дата обработки", date + (job.scheduled_time ? `, ${job.scheduled_time}` : "")],
            ["Специалист", job.tech || "—"],
          ].map(([k, v]) => [
            { text: k, color: MUTED, fontSize: 10, margin: [0, 3, 0, 3] },
            { text: v, bold: true, margin: [0, 3, 0, 3] },
          ]),
        },
        layout: "noBorders",
      },

      { text: "Использованные препараты", bold: true, margin: [0, 16, 0, 6] },
      chems
        ? { ul: chems, fontSize: 10, color: "#333" }
        : { text: "Не указаны.", fontSize: 10, color: MUTED },

      // Условие о следующем визите печатается только пока гарантия не началась.
      ...((Number(job.guarantee_months) > 0 && (Number(job.visit_no) || 1) < (Number(job.guarantee_after_visit) || 2)) ? [{
        table: {
          widths: ["*"],
          body: [[
            {
              stack: [
                { text: "Гарантия", bold: true, color: GREEN, margin: [0, 0, 0, 4] },
                {
                  text: `По согласованному плану гарантия ${job.guarantee_months} мес. начинается после обработки № ${Number(job.guarantee_after_visit) || 2}. Дату следующей обработки необходимо согласовать с заказчиком.`,
                  fontSize: 10,
                },
              ],
              margin: [10, 8, 10, 8],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => "#EAF4F0",
        },
        margin: [0, 14, 0, 0],
      }] : []),

      // подпись и печать — те же позиции, что в сертификате
      { text: c.director, bold: true, absolutePosition: { x: 42, y: sy } },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: "#cccccc" }], absolutePosition: { x: 42, y: sy + 46 } },
      { text: "подпись / М.П.", fontSize: 8, color: MUTED, absolutePosition: { x: 42, y: sy + 50 } },
      ...(c.signature ? [{ image: c.signature, width: 130, absolutePosition: { x: 46, y: sy - 40 } }] : []),
      ...(c.stamp ? [{ image: c.stamp, width: 120, opacity: 0.9, absolutePosition: { x: 150, y: sy + 2 } }] : []),
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

// ── создать и скачать акт по заявке ──
export function generateAct(job, settings) {
  const def = actDef(job, company(settings));
  pdfMake.createPdf(def).download(`Акт-${job.doc_number || "работы"}.pdf`);
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
    guarantee_after_visit: 1,
    visit_no: 1,
    tech: "Тыныс",
  };
  generateCertificate(demoJob, settings);
}
