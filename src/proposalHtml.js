// Вёрстка КП: из записи в базе — готовый документ формата A4.
//
// Почему HTML, а не pdfmake, которым делаются акты: в КП визуал работает
// на продажу. Цветные карточки, две колонки, плашки лицензий и призыв к
// действию в pdfmake описываются координатами и рвутся при правке текста,
// а в CSS это десять строк и переносится по страницам само. PDF получается
// печатью браузера — текст остаётся векторным, ищется и копируется.
//
// Один и тот же HTML идёт и в предпросмотр внутри приложения, и в печать:
// то, что менеджер видит на экране, клиент получит файлом.

import { formatArea, itemAmount, itemPerTreatment, proposalTotal, validUntil } from "./proposals";

// Экранируем всё, что пришло из формы: в названии фирмы легко встречается
// «ТОО "Альфа & Омега"», и без экранирования такой текст ломает разметку.
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Абзацы из многострочного поля: менеджер жмёт Enter, и это должно
// оставаться абзацем, а не склеиваться в одну простыню.
function paragraphs(value) {
  return String(value ?? "")
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${esc(line)}</p>`)
    .join("");
}

const NBSP = " ";

export function money(value) {
  const n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// Площадь форматирует модель: в форме и в документе она обязана выглядеть
// одинаково, иначе клиент видит «3 900 м²» в таблице и «3900» в шапке.
export const area = formatArea;

const areaLabel = (value) => (area(value) ? `${area(value)} м²` : "");

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function dateLong(iso) {
  const [y, m, d] = String(iso || "").split("-");
  if (!y || !m || !d) return String(iso || "");
  return `${Number(d)} ${MONTHS[Number(m) - 1] || ""} ${y} г.`;
}

export function dateShort(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}.${m}.${y} г.` : String(iso || "");
}

// Заполненные строки блока: выключенный или пустой блок не должен
// оставлять в документе висячий заголовок.
function liveItems(section) {
  if (!section || section.on === false) return [];
  return (section.items || []).filter((item) => (typeof item === "string" ? item.trim() : String(item?.title || item?.text || "").trim()));
}

function metaRow(label, value) {
  return value ? `<div class="meta-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : "";
}

// ── Таблица стоимости ────────────────────────────────────────────────

function salesCostTable(proposal) {
  const items = (proposal.items || []).filter((item) => String(item.name || "").trim());
  if (!items.length) return "";
  const rows = items.map((item) => {
    const price = itemAmount(item);
    const unitHint = item.mode === "unit" && Number(item.qty) && Number(item.unit_price)
      ? `${esc(item.qty)}${NBSP}×${NBSP}${money(item.unit_price)}${NBSP}₸${Number(item.times) > 1 ? `${NBSP}×${NBSP}${esc(item.times)}${NBSP}обр.` : ""}`
      : "";
    return `<tr>
      <td class="svc"><strong>${esc(item.name)}</strong>${item.note ? `<span>${esc(item.note)}</span>` : ""}</td>
      <td class="vol">${esc(item.volume || "—")}${unitHint ? `<span>${unitHint}</span>` : ""}</td>
      <td class="sum">${money(price)}</td>
    </tr>`;
  }).join("");

  return `<section class="block">
    <h2>Стоимость услуг</h2>
    <table class="cost">
      <thead><tr><th>Наименование услуги</th><th class="vol">Объём</th><th class="sum">Стоимость, ₸</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Итого за комплекс работ</td><td class="vol">${esc(areaLabel(proposal.object_area))}</td><td class="sum">${money(proposalTotal(proposal.items))}</td></tr></tfoot>
    </table>
  </section>`;
}

function officialCostTable(proposal, company) {
  const items = (proposal.items || []).filter((item) => String(item.name || "").trim());
  if (!items.length) return "";
  // Кратность печатаем только если она где-то больше единицы: для разовой
  // обработки колонки «кратность» и «сумма за год» лишние и путают.
  const periodic = items.some((item) => Number(item.times) > 1);
  const head = periodic
    ? `<tr><th class="n">№</th><th>Наименование работ</th><th class="c">Ед. изм.</th><th class="c">Кратность</th><th class="c">Объём</th><th class="sum">За 1 обработку, ₸</th><th class="sum">Сумма, ₸</th></tr>`
    : `<tr><th class="n">№</th><th>Наименование работ</th><th class="c">Ед. изм.</th><th class="c">Объём</th><th class="sum">Стоимость, ₸</th></tr>`;

  const rows = items.map((item, index) => {
    const cells = periodic
      ? `<td class="c">${esc(item.unit || "услуга")}</td>
         <td class="c">${Number(item.times) > 1 ? `${esc(item.times)} раза` : "1 раз"}</td>
         <td class="c">${esc(item.volume || "—")}</td>
         <td class="sum">${money(itemPerTreatment(item))}</td>
         <td class="sum">${money(itemAmount(item))}</td>`
      : `<td class="c">${esc(item.unit || "услуга")}</td>
         <td class="c">${esc(item.volume || "—")}</td>
         <td class="sum">${money(itemAmount(item))}</td>`;
    return `<tr><td class="n">${index + 1}</td><td class="svc"><strong>${esc(item.name)}</strong>${item.note ? `<span>${esc(item.note)}</span>` : ""}</td>${cells}</tr>`;
  }).join("");

  return `<section class="block">
    <h2>Стоимость работ</h2>
    <table class="cost official">
      <thead>${head}</thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="${periodic ? 6 : 4}">ИТОГО${periodic ? " за период" : ""}:</td><td class="sum">${money(proposalTotal(proposal.items))}</td></tr></tfoot>
    </table>
    <p class="note">${periodic
      ? "* Указана стоимость одной обработки. Итоговая сумма рассчитана исходя из кратности обработок. Стоимость может быть уточнена после обследования объекта."
      : "* Указана стоимость за одну разовую обработку."} Налоговый режим: ${esc(company.company_tax_note)}.</p>
  </section>`;
}

// ── Общие блоки ──────────────────────────────────────────────────────

function riskBlock(proposal) {
  const items = liveItems(proposal.sections?.risks);
  if (!items.length) return "";
  return `<section class="block">
    <h2>Чем это заканчивается</h2>
    <div class="cards two">${items.map((text) => `<div class="card risk"><i>✕</i><p>${esc(text)}</p></div>`).join("")}</div>
  </section>`;
}

function advantageBlock(proposal, company) {
  const items = liveItems(proposal.sections?.advantages);
  if (!items.length) return "";
  return `<section class="block">
    <h2>Почему выбирают ${esc(company.company_brand)}</h2>
    <div class="cards two">${items.map((item) => `<div class="card good"><i>✓</i><div><strong>${esc(item.title || "")}</strong><p>${esc(item.text || "")}</p></div></div>`).join("")}</div>
  </section>`;
}

function listBlock(title, section, className = "") {
  const items = liveItems(section);
  if (!items.length) return "";
  return `<section class="block ${className}">
    <h2>${esc(title)}</h2>
    <ul class="ticks">${items.map((text) => `<li>${esc(text)}</li>`).join("")}</ul>
  </section>`;
}

function documentsBlock(proposal) {
  const items = liveItems(proposal.sections?.documents);
  if (!items.length) return "";
  return `<section class="block">
    <h2>Документы, которые вы получаете</h2>
    <div class="docs">${items.map((text) => `<span><i>✓</i>${esc(text)}</span>`).join("")}</div>
  </section>`;
}

function licenseBlock(proposal, company) {
  if (proposal.sections?.licenses?.on === false) return "";
  return `<section class="block licenses">
    <h2>Лицензии и подтверждение квалификации</h2>
    <p class="note">Все работы выполняются на основании действующих государственных лицензий. Копии документов предоставляются заказчику при заключении договора и по первому запросу его поставщиков или клиентов.</p>
    <div class="cards three">
      <div class="lic"><strong>Лицензия на дезинфекцию, дезинсекцию и дератизацию</strong><em>${esc(company.company_license_ddd)}</em><p>${esc(company.company_license_ddd_issuer)}</p></div>
      <div class="lic"><strong>Лицензия на обращение с ядами</strong><em>${esc(company.company_license_poisons)}</em><p>${esc(company.company_license_poisons_issuer)}</p></div>
      <div class="lic"><strong>Лицензия на применение пестицидов</strong><em>${esc(company.company_license_pesticides)}</em><p>${esc(company.company_license_pesticides_issuer)}</p></div>
    </div>
    <div class="badges">
      <span><strong>Член СРО</strong>${esc(company.company_sro)}</span>
      <span><strong>Работаем по всему Казахстану</strong>${esc(company.company_geography)}</span>
      <span><strong>БИН ${esc(company.company_bin)}</strong>${esc(company.company_tax_note)}</span>
    </div>
  </section>`;
}

function ctaBlock(proposal, company) {
  const cta = proposal.sections?.cta;
  if (!cta || cta.on === false || !String(cta.title || "").trim()) return "";
  return `<section class="cta">
    <strong>${esc(cta.title)}</strong>
    <p>${esc(cta.text || "")}</p>
    <div class="cta-phone">${esc(company.company_phone)} <span>звонок · WhatsApp · Telegram</span></div>
  </section>`;
}

function signatureBlock(proposal, company) {
  if (proposal.sections?.signature?.on === false) return "";
  const stamp = company.company_stamp ? `<img class="stamp" src="${esc(company.company_stamp)}" alt="" />` : "";
  const sign = company.company_signature ? `<img class="sign" src="${esc(company.company_signature)}" alt="" />` : "";
  return `<section class="block sign-block">
    <p>С уважением,</p>
    <div class="sign-row">
      <div class="sign-who"><strong>Директор ${esc(company.company_name)}</strong>
        <div class="sign-line">${sign}${stamp}<span>_______________________ / ${esc(company.company_director)} /</span></div>
        <em>(подпись, М.П.)</em>
      </div>
    </div>
  </section>`;
}

function contactsFooter(company) {
  return `<footer class="doc-foot">
    <strong>${esc(company.company_name)}</strong>
    <span>БИН ${esc(company.company_bin)} · ${esc(company.company_tax_note)}</span>
    <span>${esc(company.company_phone)} · ${esc(company.company_email)} · ${esc(company.company_site)}${company.company_address ? ` · ${esc(company.company_address)}` : ""}</span>
  </footer>`;
}

// ── Стиль «Продающее» ────────────────────────────────────────────────

function salesBody(proposal, company) {
  const until = validUntil(proposal.issue_date, proposal.validity_days);
  return `
  <header class="brand">
    <div>
      <div class="brand-name">${esc(company.company_brand_line)}</div>
      <div class="brand-sub">Дезинфекция · Дезинсекция · Дератизация</div>
    </div>
    <div class="brand-contacts">
      <strong>${esc(company.company_phone)}</strong>
      <span>${esc(company.company_email)} · ${esc(company.company_site)}</span>
      <span>БИН ${esc(company.company_bin)}</span>
    </div>
  </header>
  <div class="rule"></div>

  <div class="title-block">
    <h1>Коммерческое предложение</h1>
    <p class="subject">${esc(proposal.subject)}</p>
  </div>

  <div class="meta">
    ${metaRow("№ КП", proposal.number)}
    ${metaRow("Дата", dateShort(proposal.issue_date))}
    ${metaRow("Кому", proposal.recipient)}
    ${metaRow("Заказчик", proposal.client_title)}
    ${metaRow("БИН заказчика", proposal.client_bin)}
    ${metaRow("Объект", proposal.object_label)}
    ${metaRow("Адрес", proposal.object_address)}
    ${metaRow("Площадь", areaLabel(proposal.object_area))}
    ${metaRow("Город", proposal.city)}
    ${metaRow("Действительно до", until ? dateShort(until) : "")}
  </div>

  ${proposal.intro ? `<section class="intro">${paragraphs(proposal.intro)}</section>` : ""}
  ${riskBlock(proposal)}
  ${advantageBlock(proposal, company)}
  ${salesCostTable(proposal)}
  ${listBlock("В стоимость уже включено", proposal.sections?.included)}
  ${documentsBlock(proposal)}
  <div class="two-col">
    ${listBlock("Гарантии", proposal.sections?.guarantees)}
    ${listBlock("Условия сотрудничества", proposal.sections?.conditions)}
  </div>
  ${listBlock("Рекомендации на время обработки", proposal.sections?.recommendations)}
  ${licenseBlock(proposal, company)}
  ${ctaBlock(proposal, company)}
  ${signatureBlock(proposal, company)}
  ${contactsFooter(company)}`;
}

// ── Стиль «Официальное» ──────────────────────────────────────────────

function officialBody(proposal, company) {
  const until = validUntil(proposal.issue_date, proposal.validity_days);
  const objectRows = [
    ["Заказчик", proposal.client_title],
    ["БИН", proposal.client_bin],
    ["Объект", proposal.object_label],
    ["Город", proposal.city],
    ["Адрес", proposal.object_address],
    ["Общая площадь", areaLabel(proposal.object_area)],
  ].filter(([, value]) => String(value || "").trim());

  return `
  <header class="official-head">
    <div class="oh-name">${esc(company.company_name.toLocaleUpperCase("ru-RU"))}</div>
    <div class="oh-line">БИН: ${esc(company.company_bin)}</div>
    <div class="oh-line">тел. / WhatsApp: ${esc(company.company_phone)} · e-mail: ${esc(company.company_email)} · сайт: ${esc(company.company_site)}</div>
  </header>

  <div class="official-ref">
    <span>Исх. ${esc(proposal.number)} от ${esc(dateShort(proposal.issue_date))}</span>
    ${proposal.recipient ? `<p class="addressee">${esc(proposal.recipient)}</p>` : ""}
  </div>

  <div class="title-block official">
    <h1>Коммерческое предложение</h1>
    <p class="subject">${esc(proposal.subject)}</p>
  </div>

  ${proposal.intro ? `<section class="intro plain">${paragraphs(proposal.intro)}</section>` : ""}

  ${objectRows.length ? `<section class="block">
    <h2>Сведения об объекте</h2>
    <table class="facts">${objectRows.map(([label, value]) => `<tr><td>${esc(label)}</td><td><strong>${esc(value)}</strong></td></tr>`).join("")}</table>
  </section>` : ""}

  ${officialCostTable(proposal, company)}
  ${listBlock("Что входит в обслуживание", proposal.sections?.included)}
  ${documentsBlock(proposal)}
  ${listBlock("Гарантии", proposal.sections?.guarantees)}
  ${listBlock("Условия", proposal.sections?.conditions)}
  ${listBlock("Рекомендации на время обработки", proposal.sections?.recommendations)}
  ${advantageBlock(proposal, company)}
  ${licenseBlock(proposal, company)}
  ${until ? `<p class="note">Предложение действительно до ${esc(dateShort(until))}</p>` : ""}
  ${signatureBlock(proposal, company)}
  ${ctaBlock(proposal, company)}
  ${contactsFooter(company)}`;
}

// ── Стили документа ──────────────────────────────────────────────────
//
// Размеры в миллиметрах: страница должна совпасть с A4 и на экране, и в
// печати. print-color-adjust обязателен — без него браузер выбрасывает
// фоны плашек, и КП уходит клиенту чёрно-белым.

const CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #E8EBE7; }
body {
  font-family: "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif;
  color: #14201B; font-size: 10.2pt; line-height: 1.45;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
/* Поля страницы заданы дважды намеренно.
   На экране это один длинный «лист» с внутренними отступами — так виден
   весь документ сразу. В печати отступы обязаны стоять в @page: КП на две
   страницы, и padding элемента даёт поля только сверху первой и снизу
   последней — вторая страница начиналась бы от самого края бумаги. */
.page { margin: 0 auto; background: #fff; position: relative; }
p { orphans: 3; widows: 3; }
h1, h2, h3, p, ul { margin: 0; }
strong { font-weight: 650; }

/* шапка продающего стиля */
.brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; }
.brand-name { font-size: 15pt; font-weight: 700; letter-spacing: .01em; color: #0E7C66; }
.brand-sub { font-size: 8.6pt; color: #6E7871; letter-spacing: .06em; text-transform: uppercase; margin-top: 1mm; }
.brand-contacts { text-align: right; font-size: 8.8pt; color: #6E7871; line-height: 1.5; }
.brand-contacts strong, .brand-contacts span { display: block; }
.brand-contacts strong { font-size: 11pt; color: #14201B; }
.rule { height: 1.4mm; background: linear-gradient(90deg, #0E7C66 0%, #0E7C66 62%, #C9A227 62%, #C9A227 100%); border-radius: 1mm; margin: 3.5mm 0 6mm; }

.title-block { margin-bottom: 5mm; }
.title-block h1 { font-size: 19pt; font-weight: 750; text-transform: uppercase; letter-spacing: .1em; line-height: 1.1; }
.title-block .subject { font-size: 12.4pt; color: #0E7C66; font-weight: 600; margin-top: 2mm; }
.title-block.official { text-align: center; margin: 6mm 0 5mm; }
.title-block.official h1 { font-size: 16pt; letter-spacing: .08em; }
.title-block.official .subject { color: #14201B; font-size: 11.4pt; }

/* реквизиты КП */
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 0.35mm solid #DCE5DE; border-radius: 2mm; overflow: hidden; margin-bottom: 6mm; }
.meta-cell { display: flex; justify-content: space-between; gap: 4mm; padding: 2.1mm 3.5mm; border-bottom: 0.3mm solid #EDF2EE; background: #FAFCFA; }
.meta-cell:nth-child(odd) { border-right: 0.3mm solid #EDF2EE; }
.meta-cell span { color: #6E7871; font-size: 8.8pt; white-space: nowrap; }
.meta-cell strong { font-size: 9.4pt; text-align: right; }

.intro { border-left: 1mm solid #0E7C66; background: #F4F8F5; padding: 4mm 5mm; border-radius: 0 2mm 2mm 0; margin-bottom: 6mm; break-inside: avoid; }
.intro p { font-size: 10.6pt; }
.intro p + p { margin-top: 2.5mm; }
.intro.plain { border-left: 0; background: transparent; padding: 0; }
.intro.plain p { font-size: 10.4pt; text-align: justify; }

.block { margin-bottom: 6mm; break-inside: avoid; }
.block h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .1em; color: #0E7C66; margin-bottom: 3mm; padding-bottom: 1.4mm; border-bottom: 0.35mm solid #DCE5DE; }

.cards { display: grid; gap: 3mm; }
.cards.two { grid-template-columns: 1fr 1fr; }
.cards.three { grid-template-columns: repeat(3, 1fr); }
.card { display: flex; gap: 2.5mm; padding: 3mm 3.5mm; border-radius: 2mm; font-size: 9.4pt; break-inside: avoid; }
.card i { font-style: normal; font-weight: 700; line-height: 1.2; }
.card.risk { background: #FDF3F2; border: 0.3mm solid #F3D6D2; }
.card.risk i { color: #B3261E; }
.card.good { background: #F2F8F5; border: 0.3mm solid #CFE4D9; }
.card.good i { color: #0E7C66; }
.card.good strong { display: block; margin-bottom: 0.8mm; }
.card p { color: #3C4A43; }

/* таблица стоимости */
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.cost thead th { font-size: 8.4pt; text-transform: uppercase; letter-spacing: .06em; color: #6E7871; text-align: left; padding: 0 3mm 1.8mm; font-weight: 600; }
.cost tbody td { padding: 2.6mm 3mm; border-top: 0.3mm solid #E4EBE6; vertical-align: top; font-size: 9.6pt; }
.cost .svc strong { display: block; font-size: 10pt; }
.cost .svc span { display: block; color: #6E7871; font-size: 8.8pt; margin-top: 0.6mm; }
.cost .vol { width: 32mm; color: #3C4A43; }
.cost .vol span { display: block; color: #6E7871; font-size: 8.2pt; }
.cost .sum { width: 30mm; text-align: right; white-space: nowrap; font-weight: 650; }
.cost tfoot td { padding: 3mm; background: #0E7C66; color: #fff; font-size: 10.6pt; font-weight: 700; }
.cost tfoot .sum { font-size: 12.4pt; }
.cost tfoot .vol { color: #CDE7DE; font-weight: 500; }
.cost.official .n { width: 8mm; color: #6E7871; }
.cost.official .c { width: 20mm; text-align: center; color: #3C4A43; }
.cost.official thead th.c, .cost.official thead th.sum { text-align: center; }
.cost.official tbody td, .cost.official thead th { border: 0.3mm solid #D8E2DB; padding: 2mm 2.4mm; font-size: 9pt; }
.cost.official thead th { background: #F2F6F3; color: #14201B; text-transform: none; letter-spacing: 0; }
.cost.official tfoot td { border: 0.3mm solid #0E7C66; text-align: right; font-size: 10pt; }

.facts td { padding: 2mm 3mm; border-bottom: 0.3mm solid #EDF2EE; font-size: 9.6pt; }
.facts td:first-child { width: 42mm; color: #6E7871; }

ul.ticks { list-style: none; padding: 0; }
ul.ticks li { position: relative; padding-left: 5mm; font-size: 9.6pt; margin-bottom: 1.6mm; color: #26332C; }
ul.ticks li::before { content: "—"; position: absolute; left: 0; color: #0E7C66; font-weight: 700; }

.docs { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6mm 5mm; }
.docs span { display: flex; gap: 2mm; font-size: 9.4pt; }
.docs i { font-style: normal; color: #0E7C66; font-weight: 700; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.two-col .block { margin-bottom: 6mm; }

.licenses .lic { border: 0.3mm solid #DCE5DE; border-radius: 2mm; padding: 3mm; font-size: 8.8pt; break-inside: avoid; }
.licenses .lic strong { display: block; font-size: 9.2pt; margin-bottom: 1.4mm; }
.licenses .lic em { display: block; font-style: normal; color: #0E7C66; font-weight: 650; margin-bottom: 1.2mm; }
.licenses .lic p { color: #6E7871; }
.badges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 3mm; }
.badges span { display: block; background: #F4F8F5; border-radius: 2mm; padding: 2.6mm 3mm; font-size: 8.6pt; color: #6E7871; }
.badges strong { display: block; color: #14201B; font-size: 9.2pt; margin-bottom: 0.6mm; }

.cta { background: #0E7C66; color: #fff; border-radius: 2.5mm; padding: 5mm 6mm; text-align: center; margin-bottom: 5mm; break-inside: avoid; }
.cta strong { display: block; font-size: 12.4pt; text-transform: uppercase; letter-spacing: .06em; }
.cta p { font-size: 9.6pt; color: #D6ECE4; margin-top: 2mm; }
.cta-phone { font-size: 14pt; font-weight: 700; margin-top: 3mm; }
.cta-phone span { display: block; font-size: 8.6pt; font-weight: 400; color: #CDE7DE; letter-spacing: .04em; }

.sign-block { margin-top: 8mm; break-inside: avoid; }
.sign-row { margin-top: 3mm; }
.sign-who { position: relative; display: inline-block; }
.sign-line { position: relative; margin-top: 12mm; font-size: 9.6pt; }
.sign-line .sign { position: absolute; left: 2mm; bottom: 3mm; height: 13mm; }
.sign-line .stamp { position: absolute; left: 34mm; bottom: -6mm; height: 26mm; opacity: .92; }
.sign-block em { display: block; font-style: normal; color: #6E7871; font-size: 8.4pt; margin-top: 1mm; }

.note { font-size: 8.6pt; color: #6E7871; margin-top: 2mm; }

.doc-foot { margin-top: 7mm; padding-top: 3mm; border-top: 0.35mm solid #DCE5DE; text-align: center; font-size: 8.4pt; color: #6E7871; }
.doc-foot strong { display: block; color: #14201B; font-size: 9.2pt; margin-bottom: 0.8mm; }
.doc-foot span { display: block; }

.official-head { text-align: center; padding-bottom: 3mm; border-bottom: 0.5mm solid #14201B; }
.official-head .oh-name { font-size: 12pt; font-weight: 700; letter-spacing: .04em; }
.official-head .oh-line { font-size: 8.8pt; color: #3C4A43; margin-top: 1mm; }
.official-ref { margin-top: 4mm; font-size: 9.6pt; }
.official-ref .addressee { margin-top: 3mm; margin-left: 45%; font-weight: 600; }

@media print {
  @page { size: A4; margin: 13mm 14mm 12mm; }
  html, body { background: #fff; }
  .page { margin: 0; padding: 0; width: auto; min-height: 0; box-shadow: none; }
  .doc-foot { break-inside: avoid; }
}
@media screen {
  .page {
    width: 210mm; min-height: 297mm; padding: 13mm 14mm 11mm;
    box-shadow: 0 2mm 8mm rgba(20, 32, 27, .18); margin: 6mm auto;
  }
}
`;

export function proposalHtml(proposal, company) {
  const body = proposal.style === "official" ? officialBody(proposal, company) : salesBody(proposal, company);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8" />
<title>${esc(proposal.number || "КП")} — ${esc(proposal.client_title || proposal.subject || "коммерческое предложение")}</title>
<style>${CSS}</style></head>
<body><div class="page">${body}</div></body></html>`;
}

// Имя файла для «Сохранить как PDF»: браузер предлагает его сам, и если
// оставить заголовок по умолчанию, в папке клиента окажется десять файлов
// с именем «Документ».
export function proposalFileName(proposal) {
  const who = String(proposal.client_title || proposal.recipient || "клиент").replace(/[\\/:*?"<>|]/g, "").trim();
  return `${proposal.number || "КП"} ${who}`.slice(0, 120);
}
