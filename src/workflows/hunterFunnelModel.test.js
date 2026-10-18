import { describe, expect, it } from "vitest";
import { lostReasonLabel, missingForStage, nextStageHint, stageTransition, suggestedMrr } from "./hunterFunnelModel";

const company = { client_type: "company" };
const scouted = { ...company, object_type: "catering", address: "Алматы, Абая 1", area_m2: 120 };
const qualified = { ...scouted, lpr_name: "Аскар Б.", lpr_phone: "+7 701 123 45 67", pests: ["Тараканы"], current_provider: "нет", desired_frequency: "monthly" };
const keys = (list) => list.map((item) => item.key);

describe("воронка Хантера", () => {
  it("на разведку пускает пустую сделку, на «ЛПР найден» — только с объектом", () => {
    expect(missingForStage(company, "new")).toEqual([]);
    expect(keys(missingForStage(company, "lpr_found"))).toEqual(["object_type", "address", "area_m2"]);
    expect(missingForStage(scouted, "lpr_found")).toEqual([]);
  });

  it("требования копятся: перепрыгнуть стадию с пустыми полями нельзя", () => {
    const result = stageTransition(scouted, "new", "negotiation");
    expect(result.ok).toBe(false);
    expect(keys(result.missing)).toEqual(["lpr_name", "lpr_phone", "pests", "current_provider", "desired_frequency", "kp"]);
  });

  it("КП засчитывается ссылкой или КП из реестра", () => {
    expect(keys(missingForStage(qualified, "kp_sent"))).toEqual(["kp"]);
    expect(missingForStage({ ...qualified, kp_url: "https://drive" }, "kp_sent")).toEqual([]);
    expect(missingForStage(qualified, "kp_sent", { hasProposal: true })).toEqual([]);
  });

  it("телефон ЛПР должен быть настоящим номером, площадь и цена — больше нуля", () => {
    expect(keys(missingForStage({ ...qualified, lpr_phone: "+7 " }, "kp_sent", { hasProposal: true }))).toEqual(["lpr_phone"]);
    expect(keys(missingForStage({ ...scouted, area_m2: "0" }, "lpr_found"))).toEqual(["area_m2"]);
  });

  it("«Абонент» — только с выполненной первой обработкой и датой следующего выезда", () => {
    const deal = { ...qualified, kp_url: "x", quoted_price: 30000, agreed_frequency: "monthly", expected_mrr: 30000,
      company_id: "c1", signer_name: "Директор", first_service_at: "2026-10-20", contract_signed_at: "2026-10-19", keeper_id: "u1" };
    expect(keys(missingForStage(deal, "subscriber"))).toEqual(["job_done", "next_service_at"]);
    expect(missingForStage({ ...deal, next_service_at: "2026-11-20" }, "subscriber", { jobDone: true })).toEqual([]);
  });

  it("назад двигать можно всегда, физлицо — свободно, но отказ требует причину", () => {
    expect(stageTransition(company, "contract", "lpr_found").ok).toBe(true);
    expect(stageTransition({ client_type: "person" }, "new", "subscriber").ok).toBe(true);
    expect(keys(stageTransition({ client_type: "person" }, "new", "lost").missing)).toEqual(["lost_reason"]);
    expect(keys(stageTransition(company, "kp_sent", "snoozed").missing)).toEqual(["snooze_until", "snooze_reason"]);
  });

  it("подсказывает, чего не хватает до следующей стадии", () => {
    const hint = nextStageHint(scouted, "lpr_found");
    expect(hint.stage.code).toBe("kp_sent");
    expect(hint.missing.length).toBe(6);
    expect(nextStageHint(scouted, "subscriber")).toBeNull();
  });

  it("считает выручку в месяц и показывает старые причины отказа", () => {
    expect(suggestedMrr(45000, "quarterly")).toBe(15000);
    expect(suggestedMrr(45000, "one_time")).toBeNull();
    expect(lostReasonLabel("price")).toBe("Дорого");
    expect(lostReasonLabel("передумал")).toBe("передумал");
  });
});
