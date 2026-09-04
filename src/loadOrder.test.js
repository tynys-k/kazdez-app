import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Раньше загрузка была массивом из сорока с лишним запросов, результат которого
// разбирался по позициям, и этот тест держал соответствие «имя переменной →
// таблица». Позиционного разбора больше нет: запрос, подпись и обработчик
// стоят в одной строке реестра SOURCES, и перепутать их местами невозможно.
//
// Проверять теперь надо другое — что реестр остался связным: у каждой записи
// свой ключ, ключ совпадает с таблицей запроса, есть человеческая подпись для
// сообщений об ошибках, а редко нужные таблицы в общую загрузку не вернулись.

function readSources() {
  const file = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
  const start = file.indexOf("const SOURCES = [");
  const end = file.indexOf("\n  ];", start);
  if (start < 0 || end < 0) throw new Error("реестр SOURCES не найден в App.jsx");
  const block = file.slice(start, end);

  // Запись реестра может занимать несколько строк, поэтому режем по началу
  // записи, а не по переводам строки.
  // Запись реестра может занимать несколько строк, поэтому режем по началу
  // записи, а не по переводам строки.
  return block
    .split("{ key: ")
    .slice(1)
    .map((chunk) => {
      const line = `{ key: ${chunk}`;
      const key = /key: "([a-z_]+)"/.exec(line);
      const label = /label: "([^"]+)"/.exec(line);
      const table = /(?:from|fetchAllRows)\("([a-z_]+)"/.exec(line);
      return { key: key && key[1], label: label && label[1], table: table && table[1], line };
    });
}

describe("реестр источников данных", () => {
  const sources = readSources();

  it("в реестре есть записи", () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it("ключ каждой записи совпадает с таблицей её запроса", () => {
    // именно это расхождение раньше приводило к тому, что переменная молча
    // держала чужую таблицу
    const mismatched = sources.filter((s) => s.key !== s.table);
    expect(mismatched.map((s) => `${s.key} ≠ ${s.table}`)).toEqual([]);
  });

  it("ключи не повторяются", () => {
    const keys = sources.map((s) => s.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("у каждой записи есть подпись для сообщений об ошибках", () => {
    expect(sources.filter((s) => !s.label).map((s) => s.key)).toEqual([]);
  });

  it("редкие таблицы в общую загрузку не возвращены", () => {
    // журнал, корзина, сбои и хронология клиентов грузятся при открытии
    // раздела: вместе они весят больше, чем всё остальное
    const deferred = ["audit_log", "trash", "client_errors", "client_events"];
    const leaked = sources.filter((s) => deferred.includes(s.key));
    expect(leaked.map((s) => s.key)).toEqual([]);
  });

  it("тяжёлые картинки компании не попадают в общую загрузку", () => {
    const settings = sources.find((s) => s.key === "app_settings");
    expect(settings.line).toContain("COMPANY_IMAGE_KEYS");
  });
});
