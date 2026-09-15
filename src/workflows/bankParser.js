const HEADER_HINTS = {
  date: ["дата", "date", "күні", "операции", "проведения"],
  debit: ["расход", "списан", "дебет", "debit", "withdrawal"],
  credit: ["приход", "поступ", "кредит", "credit", "deposit"],
  amount: ["сумма", "amount", "сома"],
  direction: ["тип операции", "направление", "direction", "type"],
  description: ["назначение", "описание", "детали", "комментар", "description", "purpose"],
  reference: ["референс", "номер операции", "документ", "reference", "transaction id"],
  counterparty: ["контрагент", "получатель", "отправитель", "recipient", "payer"],
};

const cellText = (cell) => {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "object") return String(cell.text || cell.result || cell.richText?.map((part) => part.text).join("") || "");
  return String(cell);
};

export function bankAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) && value !== 0 ? Math.abs(value) : null;
  const raw = cellText(value).replace(/[₸\s\u00a0\u202f]/g, "").replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const comma = raw.lastIndexOf(","); const dot = raw.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const normalized = decimal === "," ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount !== 0 ? Math.abs(amount) : null;
}

export function bankDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const raw = cellText(value).trim();
  const ru = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (ru) {
    const iso = `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
    const day = new Date(`${iso}T00:00:00`);
    return day.getFullYear() === Number(ru[3]) && day.getMonth() + 1 === Number(ru[2]) && day.getDate() === Number(ru[1]) ? iso : null;
  }
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const day = new Date(`${iso[0]}T00:00:00`);
  return day.getFullYear() === Number(iso[1]) && day.getMonth() + 1 === Number(iso[2]) && day.getDate() === Number(iso[3]) ? iso[0] : null;
}

export function bankDirection(value) {
  const text = cellText(value).toLowerCase();
  if (/(расход|списан|дебет|debit|withdraw|платёж|платеж|оплата)/.test(text)) return "expense";
  if (/(приход|поступ|зачисл|кредит|credit|deposit)/.test(text)) return "income";
  return null;
}

function findColumns(header) {
  const lowered = header.map((value) => cellText(value).toLowerCase().trim());
  const columns = {};
  Object.entries(HEADER_HINTS).forEach(([key, hints]) => {
    const index = lowered.findIndex((value) => hints.some((hint) => value.includes(hint)));
    if (index >= 0) columns[key] = index;
  });
  return columns;
}

export function parseTabularBankRows(matrix) {
  const headerIndex = matrix.findIndex((row) => {
    const cols = findColumns(row);
    return cols.date !== undefined && (cols.amount !== undefined || cols.debit !== undefined || cols.credit !== undefined);
  });
  if (headerIndex < 0) throw new Error("Не найдены колонки даты и суммы. Нужен Excel/CSV с заголовками операций.");
  const columns = findColumns(matrix[headerIndex]);
  const rows = []; const warnings = [];
  matrix.slice(headerIndex + 1).forEach((line, offset) => {
    const date = bankDate(line[columns.date]);
    if (!date) {
      if (/\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}/.test(cellText(line[columns.date])))
        warnings.push(`Строка ${headerIndex + offset + 2}: дата неверна — пропущена.`);
      return;
    }
    const debit = columns.debit === undefined ? null : bankAmount(line[columns.debit]);
    const credit = columns.credit === undefined ? null : bankAmount(line[columns.credit]);
    let direction; let amount;
    if (debit && credit) { warnings.push(`Строка ${headerIndex + offset + 2}: одновременно расход и приход — пропущена.`); return; }
    if (debit || credit) { direction = debit ? "expense" : "income"; amount = debit || credit; }
    else {
      const raw = line[columns.amount]; amount = bankAmount(raw);
      direction = columns.direction === undefined ? null : bankDirection(line[columns.direction]);
      if (!direction && typeof raw === "number") direction = raw < 0 ? "expense" : "income";
      if (!direction && typeof raw === "string" && raw.trim().startsWith("-")) direction = "expense";
    }
    if (!amount || !direction) { warnings.push(`Строка ${headerIndex + offset + 2}: направление или сумма неясны — пропущена.`); return; }
    rows.push({ booked_on: date, direction, amount: Math.round(amount * 100) / 100,
      description: cellText(line[columns.description]).trim() || "Операция по выписке",
      counterparty: cellText(line[columns.counterparty]).trim() || null,
      reference: cellText(line[columns.reference]).trim() || null });
  });
  if (!rows.length) throw new Error("Операции не распознаны. Проверьте формат выписки или приложите образец для настройки импорта.");
  return { rows, warnings, columns: matrix[headerIndex] };
}

function csvMatrix(text) {
  const delimiter = (text.split(/\r?\n/)[0].match(/;/g) || []).length >= (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  const result = []; let line = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { field += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) { line.push(field); field = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line.push(field); if (line.some((item) => item.trim())) result.push(line);
      line = []; field = "";
    } else field += ch;
  }
  line.push(field); if (line.some((item) => item.trim())) result.push(line);
  return result;
}

async function pdfMatrix(buffer) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  if (pdf.numPages > 100) throw new Error("PDF слишком большой: не более 100 страниц.");
  const matrix = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent();
    const byY = new Map();
    text.items.forEach((item) => {
      const y = Math.round(item.transform?.[5] || 0);
      const current = byY.get(y) || [];
      current.push({ x: item.transform?.[4] || 0, text: item.str }); byY.set(y, current);
    });
    [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, fragments]) =>
      matrix.push(fragments.sort((a, b) => a.x - b.x).map((fragment) => fragment.text.trim()).filter(Boolean)));
  }
  if (!matrix.length) throw new Error("В PDF нет текстового слоя. Для сканированной выписки нужен Excel или PDF с выделяемым текстом.");
  return matrix;
}

export function parsePdfBankLines(matrix) {
  const rows = []; const warnings = [];
  matrix.forEach((fragments, index) => {
    const line = fragments.join(" ").replace(/\s+/g, " ").trim();
    const dateMatch = line.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/);
    if (!dateMatch) return;
    const date = bankDate(dateMatch[0]);
    const rest = line.replace(dateMatch[0], "").trim();
    const candidates = [...rest.matchAll(/-?\d{1,3}(?:[ \u00a0]\d{3})+(?:[,.]\d{2})?|-?\d{4,}(?:[,.]\d{2})?/g)];
    const direction = bankDirection(rest) || (rest.match(/(?:^|\s)-\s*\d/) ? "expense" : null);
    if (!date || !direction || candidates.length !== 1) {
      warnings.push(`PDF, строка ${index + 1}: дата, направление или сумма неясны — пропущена.`);
      return;
    }
    const amount = bankAmount(candidates[0][0]);
    if (!amount) { warnings.push(`PDF, строка ${index + 1}: сумма неясна — пропущена.`); return; }
    rows.push({ booked_on: date, direction, amount: Math.round(amount * 100) / 100,
      description: rest.replace(candidates[0][0], "").trim() || "Операция по PDF", counterparty: null, reference: null });
  });
  if (!rows.length) throw new Error("Текст PDF не удалось разобрать надёжно. Загрузите Excel или приложите обезличенный образец выписки.");
  return { rows, warnings, columns: [] };
}

export async function parseBankFile(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error("Файл больше 15 МБ. Выгрузите меньший период.");
  const ext = file.name.split(".").pop().toLowerCase();
  let matrix; let parsed;
  if (ext === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const rows = []; const warnings = [];
    workbook.worksheets.forEach((sheet) => {
      const sheetRows = [];
      sheet.eachRow((row) => sheetRows.push(row.values.slice(1).map((value) => value ?? "")));
      try {
        const result = parseTabularBankRows(sheetRows);
        rows.push(...result.rows); warnings.push(...result.warnings.map((message) => `${sheet.name}: ${message}`));
      } catch {
        if (sheetRows.some((line) => line.some((cell) => bankDate(cell))))
          warnings.push(`${sheet.name}: даты есть, но колонки операций не распознаны; лист пропущен.`);
      }
    });
    if (!rows.length) throw new Error("Ни на одном листе Excel не распознаны операции. Нужен лист с заголовками даты и сумм.");
    parsed = { rows, warnings, columns: [] };
  } else if (ext === "csv") matrix = csvMatrix(await file.text());
  else if (ext === "pdf") matrix = await pdfMatrix(await file.arrayBuffer());
  else throw new Error("Поддерживаются .xlsx, .csv и текстовые .pdf. Старый .xls сохраните как .xlsx.");
  if (ext === "pdf") {
    const dateLines = matrix.filter((line) => line.some((fragment) => /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(fragment)));
    if (dateLines.length && dateLines.every((line) => line.length === 1)) parsed = parsePdfBankLines(matrix);
    else {
      try { parsed = parseTabularBankRows(matrix); }
      catch { parsed = parsePdfBankLines(matrix); }
    }
  } else if (ext === "csv") parsed = parseTabularBankRows(matrix);
  if (parsed.rows.length > 3000) throw new Error("Не более 3000 операций за одну загрузку.");
  return { ...parsed, fileType: ext };
}
