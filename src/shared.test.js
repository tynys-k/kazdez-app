import { describe, it, expect } from "vitest";
import { clientMemoFor, describeChange, monthLabel, phoneKey, samePhone, waLink, winbackMsg } from "./shared";

describe("phoneKey", () => {
  it("склеивает записи одного номера в разных формах", () => {
    // реальный случай из базы: один клиент, две заявки, две формы записи
    expect(phoneKey("+7 701 382 1617")).toBe("7013821617");
    expect(phoneKey("8701 382 16 17")).toBe("7013821617");
    expect(samePhone("+7 701 382 1617", "8701 382 16 17")).toBe(true);
  });

  it("не зависит от пробелов, скобок и дефисов", () => {
    expect(samePhone("+7 (777) 442-33-84", "87774423384")).toBe(true);
  });

  it("разные номера остаются разными", () => {
    expect(samePhone("+7 701 382 1617", "+7 701 382 1618")).toBe(false);
  });

  it("короткий или пустой номер не склеивает никого", () => {
    expect(phoneKey("")).toBe("");
    expect(phoneKey(null)).toBe("");
    expect(phoneKey("12345")).toBe("");
    // иначе две заявки без телефона стали бы «одним клиентом»
    expect(samePhone("", "")).toBe(false);
    expect(samePhone(null, "12345")).toBe(false);
  });

  it("международная запись с длинным кодом тоже сходится", () => {
    expect(samePhone("007 701 382 1617", "7013821617")).toBe(true);
  });
});

describe("памятка клиенту", () => {
  it("общая часть есть всегда", () => {
    const memo = clientMemoFor("");
    expect(memo.before.length).toBeGreaterThan(0);
    expect(memo.after.join(" ")).toContain("две недели");
  });

  it("добавляет уточнения по виду вредителя", () => {
    // в базе пишут по-разному: «Клопы», «клоп постельный»
    expect(clientMemoFor("Клопы").before.join(" ")).toContain("кровати");
    expect(clientMemoFor("клоп постельный").before.join(" ")).toContain("кровати");
    expect(clientMemoFor("Тараканы").after.join(" ")).toContain("крошки");
    expect(clientMemoFor("Мыши").after.join(" ")).toContain("приманочные");
  });

  it("незнакомый вредитель не ломает памятку", () => {
    const memo = clientMemoFor("Осы");
    expect(memo.before.length).toBeGreaterThan(0);
    expect(memo.after.length).toBeGreaterThan(0);
  });
});

describe("ссылка в WhatsApp", () => {
  it("приводит казахстанский номер через 8 к коду страны", () => {
    expect(waLink("8 701 382 1617")).toBe("https://wa.me/77013821617");
    expect(waLink("+7 701 382 1617")).toBe("https://wa.me/77013821617");
  });

  it("без номера ссылки нет", () => {
    expect(waLink("")).toBeNull();
    expect(waLink(null)).toBeNull();
  });

  it("текст уходит в ссылку закодированным", () => {
    const link = waLink("87013821617", "Привет, это KazDez");
    expect(link).toContain("?text=");
    expect(link).not.toContain(" ");
  });
});

describe("текст для возврата клиента", () => {
  it("обращается по имени, если оно известно", () => {
    expect(winbackMsg({ name: "Айгуль", monthsSince: 14, pest: "Тараканы" })).toContain("Айгуль, здравствуйте!");
  });

  it("без имени остаётся вежливым", () => {
    const msg = winbackMsg({ monthsSince: 8 });
    expect(msg).toContain("Здравствуйте!");
    expect(msg).toContain("8 мес. назад");
  });

  it("год и больше не считает месяцами", () => {
    expect(winbackMsg({ monthsSince: 20 })).toContain("больше года назад");
  });
});

describe("подпись месяца", () => {
  it("показывает год — иначе два августа подряд не различить", () => {
    expect(monthLabel("2026-08")).toBe("авг 26");
    expect(monthLabel("2025-08")).toBe("авг 25");
  });

  it("мусор возвращает как есть, а не падает", () => {
    expect(monthLabel("")).toBe("");
    expect(monthLabel("что-то")).toBe("что-то");
  });
});

describe("журнал изменений", () => {
  it("переводит таблицу и поле на человеческий язык", () => {
    const d = describeChange({ entity: "jobs", action: "update", field: "report_paid", before: "40000", after: "15000" });
    expect(d.entity).toBe("Заявка");
    expect(d.title).toBe("Сумма оплаты");
    expect(d.before).toContain("40");
    expect(d.after).toContain("15");
  });

  it("идентификатор человека показывает именем", () => {
    const d = describeChange(
      { entity: "jobs", action: "update", field: "assigned_to", before: "u1", after: "u2" },
      { nameOf: (id) => ({ u1: "Байсеит", u2: "Егинбай" })[id] },
    );
    expect(d.before).toBe("Байсеит");
    expect(d.after).toBe("Егинбай");
  });

  it("пустое значение называется пустым, а не превращается в ноль", () => {
    const d = describeChange({ entity: "jobs", action: "update", field: "tech_bonus", before: null, after: "5000" });
    expect(d.before).toBe("пусто");
  });

  it("даты и флаги читаются по-человечески", () => {
    expect(describeChange({ entity: "jobs", action: "update", field: "scheduled_date", before: "2026-08-01", after: "2026-08-05" }).before).toBe("01.08.2026");
    expect(describeChange({ entity: "profiles", action: "update", field: "is_active", before: "true", after: "false" }).after).toBe("нет");
  });

  it("создание и удаление не показывают несуществующее «было»", () => {
    expect(describeChange({ entity: "jobs", action: "insert" }).before).toBeNull();
    expect(describeChange({ entity: "jobs", action: "delete" }).title).toBe("удалено");
  });

  it("длинное значение обрезается, а не ломает строку", () => {
    const long = "я".repeat(200);
    expect(describeChange({ entity: "app_settings", action: "update", field: "value", before: long, after: "x" }).before.length).toBeLessThan(100);
  });

  it("незнакомая таблица не роняет журнал", () => {
    const d = describeChange({ entity: "чего_то_новое", action: "update", field: "какое_то_поле", before: "1", after: "2" });
    expect(d.entity).toBe("чего_то_новое");
    expect(d.title).toBe("какое_то_поле");
  });
});
