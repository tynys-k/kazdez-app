import { describe, expect, it } from "vitest";
import { area, dateShort, money, proposalFileName, proposalHtml } from "./proposalHtml";
import { blankItem, blankProposal, proposalCompany } from "./proposals";

const company = proposalCompany({});

const draft = (overrides = {}) => ({
  ...blankProposal({ segment: "warehouse" }),
  number: "КП-2026-№52-ALA",
  issue_date: "2026-08-13",
  client_title: "ТОО «Логистическая компания»",
  client_bin: "221240015875",
  recipient: "Директор, Дмитрий Николаевич",
  object_address: "г. Алматы, ул. Саина — Райымбека",
  object_area: 3900,
  items: [
    blankItem({ name: "Дератизация", note: "Уничтожение крыс и мышей", volume: "3 900 м²", amount: 105000 }),
    blankItem({ name: "Контейнеры от крыс", mode: "unit", volume: "46 шт", qty: 46, unit_price: 3000 }),
  ],
  ...overrides,
});

describe("форматы", () => {
  it("суммы разделяются неразрывным пробелом: в PDF обычный пробел рвёт число", () => {
    expect(money(1655400)).toBe("1 655 400");
    expect(money(0)).toBe("0");
    expect(money("383000")).toBe("383 000");
  });

  it("площадь пишется по-русски: пробел в тысячах, запятая в дробной части", () => {
    expect(area(3900)).toBe("3 900");
    expect(area(4412.25)).toBe("4 412,25");
    expect(area("800.00")).toBe("800");
    expect(area("")).toBe("");
    expect(area(0)).toBe("");
  });

  it("дата печатается как в документах", () => {
    expect(dateShort("2026-08-13")).toBe("13.08.2026 г.");
  });
});

describe("продающее КП", () => {
  const html = proposalHtml(draft(), company);

  it("содержит номер, дату, заказчика и объект", () => {
    expect(html).toContain("КП-2026-№52-ALA");
    expect(html).toContain("13.08.2026");
    expect(html).toContain("Логистическая компания");
    expect(html).toContain("221240015875");
    expect(html).toContain("3 900 м²");
  });

  it("считает итог и показывает расчёт по строке «цена × количество»", () => {
    expect(html).toContain("243 000");        // 105 000 + 138 000
    expect(html).toContain("138 000");
    expect(html).toContain("46 × 3 000 ₸");
  });

  it("печатает лицензии из реквизитов компании", () => {
    expect(html).toContain("KZ30LAM00001599");
    expect(html).toContain("Казахстанский Союз Санитарной Безопасности");
  });

  it("срок действия считается от даты КП", () => {
    expect(html).toContain("12.09.2026");
  });

  it("не оставляет в документе технических следов вместо данных", () => {
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("[object Object]");
  });

  it("задаёт заголовок документа: из него браузер берёт имя PDF-файла", () => {
    expect(html).toContain("<title>КП-2026-№52-ALA — ТОО «Логистическая компания»</title>");
  });
});

describe("официальное КП", () => {
  // Официальный бланк берётся от сегмента с официальным стилем: у него
  // включён блок подписи, которого в продающем КП нет.
  const officialDraft = (overrides = {}) => ({
    ...draft(),
    ...blankProposal({ segment: "medical" }),
    number: "КП-2026-№52-ALA",
    issue_date: "2026-08-13",
    client_title: "ТОО «Логистическая компания»",
    ...overrides,
  });
  const periodic = proposalHtml(officialDraft({
    items: [blankItem({ name: "Дератизация помещений", unit: "кв. м", volume: "4 412,25 м²", mode: "unit", qty: 4412.25, unit_price: 30, times: 4 })],
  }), company);

  it("печатает исходящий номер без второго знака №", () => {
    expect(periodic).toContain("Исх. КП-2026-№52-ALA от 13.08.2026 г.");
    expect(periodic).not.toContain("Исх. № КП");
  });

  it("при кратности показывает и цену обработки, и сумму за период", () => {
    expect(periodic).toContain("Кратность");
    expect(periodic).toContain("4 раза");
    expect(periodic).toContain("132 368");   // 4412,25 × 30
    expect(periodic).toContain("529 470");   // × 4 обработки
    expect(periodic).toContain("ИТОГО за период");
  });

  it("для разовой обработки колонки кратности нет — она путает заказчика", () => {
    const once = proposalHtml(officialDraft({
      items: [blankItem({ name: "Дератизация", volume: "3 900 м²", amount: 105000 })],
    }), company);
    expect(once).not.toContain("Кратность");
    expect(once).toContain("Указана стоимость за одну разовую обработку");
  });

  it("содержит блок подписи директора", () => {
    expect(periodic).toContain("Қадылқұмаров Т.Қ.");
    expect(periodic).toContain("(подпись, М.П.)");
  });

  it("адресат печатается один раз, без дубля названия заказчика", () => {
    expect(periodic.match(/Логистическая компания/g).length).toBeLessThan(3);
  });
});

describe("блоки документа", () => {
  it("выключенный блок не оставляет пустой заголовок", () => {
    const base = draft();
    const html = proposalHtml({
      ...base,
      sections: { ...base.sections, guarantees: { on: false, items: ["Гарантия 3 месяца"] } },
    }, company);
    expect(html).not.toContain("Гарантия 3 месяца");
    expect(html).not.toContain(">Гарантии<");
  });

  it("блок из пустых строк тоже не печатается", () => {
    const base = draft();
    const html = proposalHtml({
      ...base,
      sections: { ...base.sections, recommendations: { on: true, items: ["", "   "] } },
    }, company);
    expect(html).not.toContain("Рекомендации на время обработки");
  });

  it("карточка преимущества печатает и заголовок, и текст", () => {
    const base = draft();
    const html = proposalHtml({
      ...base,
      sections: { ...base.sections, advantages: { on: true, items: [{ title: "Без простоя", text: "Работаем ночью" }] } },
    }, company);
    expect(html).toContain("Без простоя");
    expect(html).toContain("Работаем ночью");
  });

  it("многострочное вступление становится абзацами, а не одной простынёй", () => {
    const html = proposalHtml(draft({ intro: "Первый абзац.\nВторой абзац." }), company);
    expect(html).toContain("<p>Первый абзац.</p>");
    expect(html).toContain("<p>Второй абзац.</p>");
  });
});

describe("безопасность разметки", () => {
  it("кавычки и угловые скобки из полей не ломают документ", () => {
    const html = proposalHtml(draft({
      client_title: 'ТОО "Альфа & Омега" <script>alert(1)</script>',
      subject: "Обработка <b>склада</b>",
    }), company);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("Обработка &lt;b&gt;склада&lt;/b&gt;");
  });
});

describe("имя файла", () => {
  it("склеивается из номера и заказчика", () => {
    expect(proposalFileName({ number: "КП-2026-№52-ALA", client_title: "ТОО «Альфа»" }))
      .toBe("КП-2026-№52-ALA ТОО «Альфа»");
  });

  it("выбрасывает символы, запрещённые в именах файлов Windows", () => {
    expect(proposalFileName({ number: "КП-1", client_title: 'ТОО "А/Б: В?"' })).toBe("КП-1 ТОО АБ В");
  });

  it("без заказчика остаётся осмысленным", () => {
    expect(proposalFileName({ number: "КП-1" })).toBe("КП-1 клиент");
  });
});
