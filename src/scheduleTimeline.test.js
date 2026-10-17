import { describe, it, expect } from "vitest";
import { DAY_END, DAY_START, hourLabel, nowOnScale, scheduleDay, scheduleRange } from "./scheduleTimeline";

const job = (id, date, time, extra = {}) => ({ id, scheduled_date: date, scheduled_time: time, status: "assigned", ...extra });

describe("временная шкала графика", () => {
  it("без заявок вне окна остаётся 07:00–23:00", () => {
    const day = scheduleDay([job(1, "2026-10-17", "09:00"), job(2, "2026-10-17", "21:00–22:00")], "2026-10-17");
    expect(day.start).toBe(DAY_START);
    expect(day.end).toBe(DAY_END);
    expect(day.hours[0]).toBe(7);
    expect(day.hours.at(-1)).toBe(23);
  });

  it("ночная заявка 02:00 следующей даты продлевает шкалу только до конца её слота", () => {
    const day = scheduleDay([job(1, "2026-10-17", "10:00"), job(2, "2026-10-18", "02:00")], "2026-10-17");
    expect(day.end).toBe(27 * 60);
    expect(day.start).toBe(DAY_START);
    const night = day.items.find((x) => x.job.id === 2);
    expect(night).toMatchObject({ from: 26 * 60, to: 27 * 60, nextDay: true });
    expect(day.hours.map(hourLabel).slice(-4)).toEqual(["00:00", "01:00", "02:00", "03:00"]);
  });

  it("учитывает «время до» у ночной заявки", () => {
    const day = scheduleDay([job(1, "2026-10-18", "05:00–05:20")], "2026-10-17");
    expect(day.items[0]).toMatchObject({ from: 29 * 60, to: 29 * 60 + 30 });
    expect(day.end).toBe(30 * 60);
  });

  it("ночная заявка не дублируется в своём календарном дне, а считается для подсказки", () => {
    const day = scheduleDay([job(2, "2026-10-18", "02:00"), job(3, "2026-10-18", "09:00")], "2026-10-18");
    expect(day.items.map((x) => x.job.id)).toEqual([3]);
    expect(day.nightOnPrevDay).toBe(1);
    expect(day.start).toBe(DAY_START);
  });

  it("ранняя утренняя заявка сдвигает начало шкалы к своему часу", () => {
    const day = scheduleDay([job(1, "2026-10-17", "05:30")], "2026-10-17");
    expect(day.start).toBe(5 * 60);
    expect(day.end).toBe(DAY_END);
    expect(day.items[0]).toMatchObject({ from: 330, nextDay: false });
  });

  it("поздняя заявка через полночь (23:00–01:00) тянет шкалу до 01:00", () => {
    expect(scheduleRange("23:00–01:00")).toEqual({ from: 1380, to: 25 * 60 });
    const day = scheduleDay([job(1, "2026-10-17", "23:00–01:00")], "2026-10-17");
    expect(day.end).toBe(25 * 60);
  });

  it("пропускает отменённые и выносит заявки без времени отдельно", () => {
    const day = scheduleDay([job(1, "2026-10-17", "", {}), job(2, "2026-10-18", "01:00", { status: "canceled" })], "2026-10-17");
    expect(day.untimed.map((j) => j.id)).toEqual([1]);
    expect(day.items).toEqual([]);
    expect(day.end).toBe(DAY_END);
  });

  it("линия «сейчас» попадает в ночной хвост вчерашнего дня", () => {
    const window = { start: DAY_START, end: 27 * 60 };
    expect(nowOnScale("2026-10-17", window, new Date(2026, 9, 18, 1, 30))).toBe(25 * 60 + 30);
    expect(nowOnScale("2026-10-17", window, new Date(2026, 9, 17, 16, 0))).toBe(16 * 60);
    expect(nowOnScale("2026-10-17", window, new Date(2026, 9, 18, 4, 0))).toBeNull();
    expect(nowOnScale("2026-10-17", window, new Date(2026, 9, 17, 6, 0))).toBeNull();
  });
});
