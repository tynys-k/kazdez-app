import { describe, expect, it } from "vitest";
import { clientTimelineItems, composerBlockers, feedCounts, groupFeed, leadActivityItems, proposalItems } from "./crmFeed";

const now = new Date("2026-10-22T20:00:00");

describe("лента карточки CRM", () => {
  const items = [
    ...leadActivityItems([
      { id: 1, kind: "call", outcome: "no_answer", comment: "", occurred_at: "2026-10-22T18:10:00", created_by: "u1" },
      { id: 2, kind: "note", outcome: "note", comment: "админ занят", occurred_at: "2026-10-22T14:30:00", created_by: "u1" },
      { id: 3, kind: "system", outcome: "created", comment: "Карточка лида создана", occurred_at: "2026-10-22T14:19:00" },
      { id: 4, kind: "stage_change", outcome: "stage_changed", comment: "«Новый» → «ЛПР найден»", occurred_at: "2026-10-21T10:00:00", created_by: "u1" },
    ], (id) => (id === "u1" ? "Сейлжан" : "")),
    ...clientTimelineItems([
      { kind: "job", ref_id: "j1", happened_at: "2026-08-18T00:00:00", status: "done", title: "Насекомые", details: "с. Байкент", amount: "25000" },
      { kind: "call", ref_id: "c1", happened_at: "2026-08-25T12:00:00", status: "all_good", title: "after_primary", details: "Довольны", rating: 5 },
    ]),
    ...proposalItems([{ id: "k1", number: "КП-2026-№3-ALA", status: "sent", total: 120000, sent_at: "2026-10-21T15:00:00", subject: "Дезинсекция кафе" }]),
  ];

  it("собирает касания, комментарии, заявки, обзвон и КП в одну ленту", () => {
    expect(items.find((i) => i.id === "act-1")).toMatchObject({ group: "touch", title: "Звонок · Не ответил", meta: "Сейлжан", tone: "warning" });
    expect(items.find((i) => i.id === "act-2")).toMatchObject({ group: "touch", title: "Комментарий", body: "админ занят" });
    expect(items.find((i) => i.id === "act-3")).toMatchObject({ group: "system", meta: "Система" });
    expect(items.find((i) => i.id === "job-j1")).toMatchObject({ group: "job", title: "Заявка: Насекомые", meta: "выполнена · 25 000 ₸" });
    expect(items.find((i) => i.id === "call-c1").title).toBe("Обзвон · после первичной: Всё хорошо, повтор не нужен · 5/5");
    expect(items.find((i) => i.id === "kp-k1").meta).toBe("отправлено, ждём ответ · 120 000 ₸");
  });

  it("группирует по дням, свежие сверху, и фильтрует", () => {
    const days = groupFeed(items, { now });
    expect(days.map((d) => d.label)).toEqual(["Сегодня", "Вчера", "25.08.2026", "18.08.2026"]);
    expect(days[0].items.map((i) => i.id)).toEqual(["act-1", "act-2", "act-3"]);
    expect(groupFeed(items, { filter: "job", now }).flatMap((d) => d.items).map((i) => i.id)).toEqual(["job-j1"]);
    expect(feedCounts(items)).toMatchObject({ all: 7, touch: 2, system: 3, job: 1, call: 1 });
  });

  it("объясняет, почему касание нельзя сохранить", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    expect(composerBlockers({ kind: "note", comment: "" })).toEqual(["Напиши комментарий."]);
    expect(composerBlockers({ kind: "call", outcome: "connected", comment: "", nextAction: "Перезвонить", nextActionAt: future })).toEqual(["Напиши, что сказал клиент."]);
    expect(composerBlockers({ kind: "call", outcome: "no_answer", comment: "", nextAction: "Перезвонить", nextActionAt: future })).toEqual([]);
    expect(composerBlockers({ kind: "call", outcome: "connected", comment: "ок", nextAction: "", nextActionAt: "2020-01-01T10:00" }))
      .toEqual(["Укажи следующий шаг.", "Срок следующего шага должен быть в будущем."]);
    expect(composerBlockers({ kind: "call", outcome: "connected", comment: "ок", closed: true })).toEqual([]);
  });
});
