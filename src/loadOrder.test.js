import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Загрузка данных в App.jsx — это Promise.all из сорока с лишним запросов,
// результат которого разбирается ПОЗИЦИОННО: const [jr, cr, chr, ...] = responses.
// Стоит вставить новый запрос не туда или переставить два соседних — и переменная
// молча начинает держать чужую таблицу. Сборка проходит, тесты проходят, линтер
// молчит, а в интерфейсе просто нет данных.
//
// Так уже случилось: price_list и job_helpers стояли в массиве в обратном порядке
// относительно имён jhr/plr, из-за чего доплаты помощникам читались как строки
// прайса и не попадали в зарплату — по этому расчёту людям платили деньги.
//
// Этот тест фиксирует соответствие «имя переменной → таблица». Он не проверяет,
// что порядок правильный сам по себе, — он требует, чтобы любое изменение порядка
// было осознанным: правку списка ниже придётся сделать руками.

const EXPECTED = [
  ["jr","jobs"], ["cr","report_chemicals"], ["chr","chemicals"], ["ar","deferred"],
  ["tr","deferred"], ["pr","profiles"], ["hr","handouts"], ["ptr","partners"],
  ["dsr","doc_services"], ["exr","tech_expenses"], ["eqr","equipment"], ["ehr","equipment_handouts"],
  ["scr","client_sources"], ["ptyr","pest_types"], ["str","app_settings"], ["ecr","expense_categories"],
  ["opr","opex"], ["dpr","cash_deposits"], ["tkr","tasks"], ["accr","accounts"],
  ["mvr","money_moves"], ["tndr","tenders"], ["tgr","tender_guarantees"], ["tsr","tender_services"],
  ["grr","guarantee_returns"], ["ldr","leads"], ["lsr","lead_stages"], ["mcr","mkt_channels"],
  ["mtr","mkt_topups"], ["dofr","tech_days_off"], ["fur","client_followups"], ["qcr","quality_checks"],
  ["cor","service_contracts"], ["cer","client_events"], ["pfr","client_public_feedback"], ["jpr","job_proofs"],
  ["car","cash_adjustments"], ["iar","inventory_adjustments"], ["errr","deferred"], ["jhr","job_helpers"],
  ["plr","price_list"], ["cpr","chemical_purchases"], ["tdr","tech_documents"],
];

function readLoadOrder() {
  const file = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
  const start = file.indexOf("const responses = await Promise.all([");
  const end = file.indexOf("] = responses;");
  if (start < 0 || end < 0) throw new Error("не найден блок загрузки в App.jsx");
  const block = file.slice(start, end);
  const array = block.slice(0, block.indexOf("]);"));

  const tables = [];
  const re = /(?:supabase\.from|fetchAllRows)\("([a-z_]+)"|(Promise\.resolve)/g;
  let m;
  while ((m = re.exec(array))) tables.push(m[1] || "deferred");

  const listEnd = file.indexOf("] = responses;");
  const listStart = file.lastIndexOf("const [", listEnd);
  const names = file
    .slice(listStart + "const [".length, listEnd)
    .replace(/\s+/g, " ")
    .split(",")
    .map((s) => s.trim());

  return { tables, names };
}

describe("порядок запросов в load()", () => {
  const { tables, names } = readLoadOrder();

  it("имён в разборе ровно столько же, сколько запросов", () => {
    expect(names.length).toBe(tables.length);
  });

  it("подписи для сообщений об ошибках покрывают все запросы", () => {
    const file = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
    const labels = /const tableNames = \[(.*?)\];/s.exec(file)[1].match(/"[^"]+"/g);
    expect(labels.length).toBe(tables.length);
  });

  it("каждая переменная держит свою таблицу", () => {
    expect(names.map((n, i) => [n, tables[i]])).toEqual(EXPECTED);
  });
});
