import { describe, expect, it } from "vitest";
import {
  applyPreset, blankItem, blankProposal, duplicateProposal, isExpired, itemAmount,
  itemPerTreatment, nextProposalNumber, prefillFromClient, prefillFromObject,
  proposalCompany, proposalFunnel, proposalIssues, proposalNumber, proposalTotal,
  segmentForObjectKind, segmentPreset, suggestPrice, validUntil, formatArea,
  applyPriceSuggestion, PROPOSAL_SEGMENTS,
} from "./proposals";

const priceList = [
  { pest: "Крысы", area_from: 0, area_to: 500, price: 45000 },
  { pest: "Крысы", area_from: 500, area_to: null, price: 105000 },
];

describe("строки стоимости", () => {
  it("считает сумму целиком, когда цена названа одним числом", () => {
    expect(itemAmount(blankItem({ mode: "flat", amount: "105000" }))).toBe(105000);
  });

  it("умножает количество на цену и на кратность обработок", () => {
    const item = blankItem({ mode: "unit", qty: 46, unit_price: 3000 });
    expect(itemAmount(item)).toBe(138000);
    expect(itemAmount({ ...item, times: 4 })).toBe(552000);
  });

  it("не теряет сумму из-за пробелов и запятой: цена приходит из поля ввода", () => {
    expect(itemAmount(blankItem({ mode: "flat", amount: "1 655 400" }))).toBe(1655400);
    expect(itemAmount(blankItem({ mode: "unit", qty: "4412,25", unit_price: "30" }))).toBeCloseTo(132367.5, 1);
  });

  it("отдельно показывает стоимость одной обработки: в официальном КП печатаются обе", () => {
    expect(itemPerTreatment(blankItem({ mode: "unit", qty: 100, unit_price: 30, times: 4 }))).toBe(3000);
    // Для суммы целиком за год цена одной обработки выводится обратным счётом.
    expect(itemPerTreatment(blankItem({ mode: "flat", amount: "120000", times: 4 }))).toBe(30000);
  });

  it("складывает итог по всем строкам", () => {
    expect(proposalTotal([
      blankItem({ amount: 105000 }),
      blankItem({ amount: 140000 }),
      blankItem({ mode: "unit", qty: 46, unit_price: 3000 }),
    ])).toBe(383000);
  });

  it("пустая строка не ломает итог", () => {
    expect(proposalTotal([blankItem(), blankItem({ amount: 1000 })])).toBe(1000);
  });
});

describe("номер КП", () => {
  it("собирается из года, счётчика и кода филиала", () => {
    expect(proposalNumber(2026, "ala", 52)).toBe("КП-2026-№52-ALA");
  });

  it("продолжает нумерацию внутри года и филиала, а не сквозную", () => {
    const rows = [
      { year: 2026, branch_code: "ALA", seq: 51 },
      { year: 2026, branch_code: "ALA", seq: 52 },
      { year: 2026, branch_code: "AST", seq: 7 },
      { year: 2025, branch_code: "ALA", seq: 140 },
    ];
    expect(nextProposalNumber(rows, 2026, "ALA")).toBe("КП-2026-№53-ALA");
    expect(nextProposalNumber(rows, 2026, "AST")).toBe("КП-2026-№8-AST");
    expect(nextProposalNumber(rows, 2027, "ALA")).toBe("КП-2027-№1-ALA");
  });
});

describe("срок действия", () => {
  it("считает дату «действительно до»", () => {
    expect(validUntil("2026-08-13", 30)).toBe("2026-09-12");
  });

  it("истёкшим считает только то, по чему ещё нет ответа", () => {
    const base = { issue_date: "2026-08-01", validity_days: 30 };
    expect(isExpired({ ...base, status: "sent" }, "2026-09-15")).toBe(true);
    expect(isExpired({ ...base, status: "sent" }, "2026-08-20")).toBe(false);
    // Согласованное КП не «истекает»: работы уже в договоре.
    expect(isExpired({ ...base, status: "accepted" }, "2026-09-15")).toBe(false);
    expect(isExpired({ ...base, status: "declined" }, "2026-09-15")).toBe(false);
  });
});

describe("сегменты", () => {
  it("у каждого сегмента есть заголовок, обращение и стиль", () => {
    for (const segment of PROPOSAL_SEGMENTS) {
      const preset = segmentPreset(segment.code);
      expect(preset.subject.length).toBeGreaterThan(0);
      expect(["sales", "official"]).toContain(preset.style);
    }
  });

  it("неизвестный сегмент отдаёт пустую заготовку, а не падает", () => {
    expect(segmentPreset("нет-такого").code).toBe("custom");
  });

  it("смена сегмента меняет тексты, но не стирает введённые цены", () => {
    const draft = {
      ...blankProposal({ segment: "custom" }),
      client_title: "ТОО «Тест»",
      object_address: "ул. Абая, 1",
      items: [blankItem({ name: "Дератизация", amount: 90000 })],
    };
    const next = applyPreset(draft, "medical");
    expect(next.segment).toBe("medical");
    expect(next.style).toBe("official");
    expect(next.intro).toContain("KazDez");
    expect(next.client_title).toBe("ТОО «Тест»");
    expect(next.object_address).toBe("ул. Абая, 1");
    expect(proposalTotal(next.items)).toBe(90000);
  });

  it("на пустой таблице подставляет заготовки работ сегмента", () => {
    const next = applyPreset(blankProposal({ segment: "custom" }), "warehouse");
    expect(next.items.length).toBeGreaterThan(0);
    expect(next.items[0].name).toContain("Дератизация");
  });

  it("выбирает сегмент по типу объекта из справочника", () => {
    expect(segmentForObjectKind("warehouse")).toBe("warehouse");
    expect(segmentForObjectKind("apartment")).toBe("residential");
    expect(segmentForObjectKind("land")).toBe("territory");
    expect(segmentForObjectKind("other")).toBe("custom");
  });
});

describe("подстановка данных", () => {
  it("берёт из карточки клиента юрлицо, БИН и контактное лицо", () => {
    const client = { id: "c1", client_type: "company", legal_name: "ТОО «Альфа»", bin_iin: "123456789012" };
    const contacts = [{ client_id: "c1", name: "Дмитрий Николаевич", role: "Директор" }];
    const next = prefillFromClient(blankProposal(), client, contacts);
    expect(next.client_id).toBe("c1");
    expect(next.client_title).toBe("ТОО «Альфа»");
    expect(next.client_bin).toBe("123456789012");
    expect(next.recipient).toBe("Директор, Дмитрий Николаевич");
  });

  it("без контактного лица обращается к руководителю организации", () => {
    const next = prefillFromClient(blankProposal(), { id: "c2", legal_name: "ТОО «Бета»" }, []);
    expect(next.recipient).toBe("Руководителю ТОО «Бета»");
  });

  it("подставляет адрес и площадь объекта в строки стоимости", () => {
    const draft = { ...blankProposal({ segment: "warehouse" }), items: [blankItem({ name: "Дератизация" })] };
    const next = prefillFromObject(draft, { id: "o1", address: "ул. Саина, 1", area: 3900, kind: "warehouse" });
    expect(next.object_address).toBe("ул. Саина, 1");
    expect(next.object_area).toBe("3900");
    // В подписи объёма площадь уже отформатирована: её видно и в форме, и в КП.
    expect(next.items[0].volume).toBe("3 900 м²");
  });

  it("не перетирает объём, если он уже вписан руками", () => {
    const draft = { ...blankProposal(), items: [blankItem({ volume: "16 подв. · 800 м²" })] };
    const next = prefillFromObject(draft, { id: "o2", address: "ул. Абая", area: 800 });
    expect(next.items[0].volume).toBe("16 подв. · 800 м²");
  });
});

describe("цены из прайса", () => {
  it("находит ступень по площади", () => {
    expect(suggestPrice("Крысы", 3900, priceList).price).toBe(105000);
    expect(suggestPrice("крысы", 300, priceList).price).toBe(45000);
  });

  it("без площади отдаёт нижнюю ступень как ориентир, а не как точную цену", () => {
    const hit = suggestPrice("Крысы", "", priceList);
    expect(hit.price).toBe(45000);
    expect(hit.exact).toBe(false);
  });

  it("отсутствие строки в прайсе возвращает null, а не ноль", () => {
    expect(suggestPrice("Змеи", 100, priceList)).toBeNull();
  });

  it("подставленная цена ложится суммой целиком и подписывает объём", () => {
    const item = applyPriceSuggestion(blankItem({ name: "Дератизация" }), "Крысы", 3900, priceList);
    expect(item.mode).toBe("flat");
    expect(item.amount).toBe("105000");
    expect(item.volume).toBe("3 900 м²");
  });

  it("если строки в прайсе нет, строка стоимости остаётся как была", () => {
    const item = blankItem({ name: "Обработка от змей" });
    expect(applyPriceSuggestion(item, "Змеи", 100, priceList)).toBe(item);
  });

  it("площадь пишется по-русски и в форме, и в документе", () => {
    expect(formatArea(3900)).toBe("3 900");
    expect(formatArea("4412,25")).toBe("4 412,25");
    expect(formatArea("")).toBe("");
  });
});

describe("реквизиты компании", () => {
  it("пустое поле в настройках заменяется запасным значением", () => {
    const company = proposalCompany({ company_name: "  ", company_phone: "+7 777 000 0000" });
    expect(company.company_name).toBe("ТОО «Служба дезинфекции KAZDEZ»");
    expect(company.company_phone).toBe("+7 777 000 0000");
    expect(company.company_license_ddd).toContain("KZ30LAM00001599");
  });
});

describe("повтор КП для постоянной фирмы", () => {
  it("копия получает новую дату и возвращается в черновик без номера", () => {
    const source = {
      id: "p1", number: "КП-2026-№52-ALA", seq: 52, year: 2026, request_id: "r1",
      status: "accepted", sent_at: "2026-08-13T10:00:00Z", decided_at: "2026-08-20T10:00:00Z",
      decline_reason: null, client_title: "ТОО «Альфа»", items: [blankItem({ amount: 105000 })],
      created_at: "2026-08-13T09:00:00Z",
    };
    const copy = duplicateProposal(source, "2027-01-15");
    expect(copy.id).toBeUndefined();
    expect(copy.number).toBeUndefined();
    expect(copy.seq).toBeUndefined();
    expect(copy.request_id).toBeUndefined();
    expect(copy.issue_date).toBe("2027-01-15");
    expect(copy.status).toBe("draft");
    expect(copy.sent_at).toBeNull();
    expect(copy.client_title).toBe("ТОО «Альфа»");
    expect(proposalTotal(copy.items)).toBe(105000);
  });

  it("строки копии получают новые идентификаторы: иначе правка одной меняла бы обе", () => {
    const source = { items: [blankItem({ id: "fixed", amount: 1000 })] };
    expect(duplicateProposal(source).items[0].id).not.toBe("fixed");
  });
});

describe("воронка КП", () => {
  it("считает конверсию по отправленным, а не по всем", () => {
    const rows = [
      { status: "draft", total: 100000 },
      { status: "sent", total: 200000 },
      { status: "accepted", total: 300000 },
      { status: "declined", total: 400000 },
    ];
    const funnel = proposalFunnel(rows);
    expect(funnel.drafts).toBe(1);
    expect(funnel.sent).toBe(3);
    expect(funnel.accepted).toBe(1);
    expect(funnel.acceptedAmount).toBe(300000);
    expect(funnel.conversion).toBe(33);
  });

  it("без отправленных КП конверсия ноль, а не деление на ноль", () => {
    expect(proposalFunnel([{ status: "draft" }]).conversion).toBe(0);
    expect(proposalFunnel([]).conversion).toBe(0);
  });
});

describe("проверка перед отправкой", () => {
  it("ловит пустую таблицу и нулевую сумму", () => {
    const empty = proposalIssues({ subject: "Дератизация", client_title: "ТОО «Альфа»", items: [] });
    expect(empty).toContain("В таблице стоимости нет ни одной строки.");

    const zero = proposalIssues({ subject: "Дератизация", client_title: "ТОО «Альфа»", items: [blankItem({ name: "Работы" })] });
    expect(zero).toContain("Итоговая сумма равна нулю.");
  });

  it("ловит безымянную строку и отсутствие адресата", () => {
    const issues = proposalIssues({ subject: "Дератизация", items: [blankItem({ amount: 1000 })] });
    expect(issues).toContain("У строки стоимости нет названия услуги.");
    expect(issues).toContain("Не указано, кому адресовано КП.");
  });

  it("на заполненном КП замечаний нет", () => {
    expect(proposalIssues({
      subject: "Дератизация склада", client_title: "ТОО «Альфа»",
      items: [blankItem({ name: "Дератизация", amount: 105000 })],
    })).toEqual([]);
  });
});
