import React from "react";
import { DEAL_STAGES, FREQUENCIES, LOST_REASONS, OBJECT_TYPES, frequencyLabel, lostReasonLabel, missingText, objectPriority, objectTypeLabel, stageIndex, suggestedMrr } from "./hunterFunnelModel";
import { formatMoney } from "../ui/formatters";

// Поля карточки сделки, которые заполняет Хантер по ходу воронки.
export const DEAL_FIELDS = [
  "object_type", "area_m2", "pests", "current_provider", "desired_frequency",
  "lpr_name", "lpr_position", "lpr_phone",
  "quoted_price", "agreed_frequency", "expected_mrr",
  "company_id", "signer_name", "first_service_at", "contract_signed_at",
  "next_service_at", "keeper_id", "snooze_until", "snooze_reason",
];
const NUMERIC = new Set(["area_m2", "quoted_price", "expected_mrr"]);

export function dealFormFrom(lead) {
  const form = {};
  for (const key of DEAL_FIELDS) {
    const value = lead?.[key];
    form[key] = key === "pests" ? (Array.isArray(value) ? value : []) : value ?? "";
  }
  return form;
}

// Форма → строка для базы: пустое — null, числа — числа.
export function dealPayload(form) {
  const row = {};
  for (const key of DEAL_FIELDS) {
    const value = form[key];
    if (key === "pests") { row.pests = (value || []).map((item) => String(item).trim()).filter(Boolean); continue; }
    const text = String(value ?? "").trim();
    if (!text) { row[key] = null; continue; }
    row[key] = NUMERIC.has(key) ? Number(text.replace(/\s/g, "").replace(",", ".")) : text;
  }
  return row;
}

function Section({ title, children }) {
  return <div className="kd-deal-section"><div className="kd-section">{title}</div>{children}</div>;
}

// Блоки карточки появляются по мере продвижения: видно текущую стадию и
// следующую, чтобы Хантер заранее знал, что спросить у клиента.
export function DealFields({ form, onChange, stageCode, Field, pestOptions = [], companies = [], keepers = [] }) {
  const shown = Math.max(stageIndex(stageCode), 0) + 1;
  const visible = (code) => stageCode === "lost" || stageCode === "snoozed" || stageIndex(code) <= shown;
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const togglePest = (name) => onChange({ pests: form.pests.includes(name) ? form.pests.filter((item) => item !== name) : [...form.pests, name] });
  const setTerms = (patch) => {
    const next = { ...form, ...patch };
    const mrr = suggestedMrr(next.quoted_price, next.agreed_frequency);
    onChange(mrr ? { ...patch, expected_mrr: String(mrr) } : patch);
  };
  const priority = objectPriority(form.object_type);
  return <>
    <Section title="Объект">
      <div className="kd-grid2">
        <Field label={`Тип объекта${priority ? ` · приоритет ${priority}` : ""}`}><select value={form.object_type} onChange={set("object_type")}>
          <option value="">— выбери —</option>{OBJECT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.priority})</option>)}
        </select></Field>
        <Field label="Площадь, м² (оценочно)"><input value={form.area_m2} onChange={set("area_m2")} inputMode="decimal" placeholder="150" /></Field>
      </div>
    </Section>
    {visible("lpr_found") && <Section title="ЛПР — кто принимает решение">
      <Field label="ФИО"><input value={form.lpr_name} onChange={set("lpr_name")} placeholder="Аскар Бекович" /></Field>
      <div className="kd-grid2">
        <Field label="Должность"><input value={form.lpr_position} onChange={set("lpr_position")} placeholder="Управляющий" /></Field>
        <Field label="Телефон ЛПР"><input value={form.lpr_phone} onChange={set("lpr_phone")} placeholder="+7 701 ..." /></Field>
      </div>
      <Field label="Какие вредители беспокоят"><div className="kd-datechips">
        {[...new Set([...pestOptions, ...form.pests])].map((name) => <button type="button" key={name} className={`kd-datechip ${form.pests.includes(name) ? "on" : ""}`} onClick={() => togglePest(name)}>{name}</button>)}
      </div></Field>
      <div className="kd-grid2">
        <Field label="Договор сейчас — с кем"><input value={form.current_provider} onChange={set("current_provider")} placeholder="нет / СЭС-сервис" /></Field>
        <Field label="Нужная периодичность"><select value={form.desired_frequency} onChange={set("desired_frequency")}>
          <option value="">— выбери —</option>{FREQUENCIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></Field>
      </div>
    </Section>}
    {visible("negotiation") && <Section title="Согласованные условия">
      <div className="kd-grid2">
        <Field label="Цена за выезд, ₸"><input value={form.quoted_price} onChange={(e) => setTerms({ quoted_price: e.target.value })} inputMode="numeric" placeholder="30000" /></Field>
        <Field label="Периодичность"><select value={form.agreed_frequency} onChange={(e) => setTerms({ agreed_frequency: e.target.value })}>
          <option value="">— выбери —</option>{FREQUENCIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></Field>
      </div>
      <Field label="Ожидаемая выручка в месяц, ₸"><input value={form.expected_mrr} onChange={set("expected_mrr")} inputMode="numeric" placeholder="считается из цены и периодичности" /></Field>
    </Section>}
    {visible("contract") && <Section title="Договор">
      <Field label="Юрлицо (карточка клиента)"><select value={form.company_id} onChange={set("company_id")}>
        <option value="">— выбери юрлицо —</option>{companies.map((client) => <option key={client.id} value={client.id}>{client.legal_name || client.name}{client.bin_iin ? ` · БИН ${client.bin_iin}` : ""}</option>)}
      </select></Field>
      {companies.length === 0 && <div className="kd-muted" style={{ marginTop: -6, marginBottom: 10 }}>Юрлиц пока нет — заведи карточку с БИН во вкладке «Клиенты».</div>}
      <div className="kd-grid2">
        <Field label="Подписант"><input value={form.signer_name} onChange={set("signer_name")} placeholder="Директор Иванов И. И." /></Field>
        <Field label="Дата первой обработки"><input type="date" value={form.first_service_at} onChange={set("first_service_at")} /></Field>
      </div>
    </Section>}
    {visible("first_service") && <Section title="Абонентское обслуживание">
      <div className="kd-grid2">
        <Field label="Договор подписан"><input type="date" value={form.contract_signed_at} onChange={set("contract_signed_at")} /></Field>
        <Field label="Следующий регулярный выезд"><input type="date" value={form.next_service_at} onChange={set("next_service_at")} /></Field>
      </div>
      <Field label="Ответственный за удержание"><select value={form.keeper_id} onChange={set("keeper_id")}>
        <option value="">— выбери —</option>{keepers.map((person) => <option key={person.id} value={person.id}>{person.full_name || "Без имени"}</option>)}
      </select></Field>
    </Section>}
  </>;
}

// Поля выхода из воронки: причина отказа или дата возврата.
export function ExitFields({ stageCode, lostReason, onLostReason, form, onChange, Field }) {
  if (stageCode === "lost") {
    const legacy = lostReason && !LOST_REASONS.some((item) => item.id === lostReason);
    return <Field label="Причина отказа"><select value={lostReason} onChange={(e) => onLostReason(e.target.value)}>
      <option value="">— выбери причину —</option>
      {legacy && <option value={lostReason}>{lostReason}</option>}
      {LOST_REASONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></Field>;
  }
  if (stageCode === "snoozed") {
    return <div className="kd-grid2">
      <Field label="Когда вернуться"><input type="date" value={form.snooze_until} onChange={(e) => onChange({ snooze_until: e.target.value })} /></Field>
      <Field label="Почему отложили"><input value={form.snooze_reason} onChange={(e) => onChange({ snooze_reason: e.target.value })} placeholder="бюджет весной / сменят управляющего" /></Field>
    </div>;
  }
  return null;
}

export function MissingHint({ stageName, missing }) {
  if (!missing?.length) return null;
  return <div className="kd-err" style={{ marginTop: 10 }}>Чтобы перевести на «{stageName}», заполни: {missingText(missing)}.</div>;
}

// Короткая сводка сделки для карточки в списке.
export function DealSummary({ lead, hint }) {
  const facts = [
    objectTypeLabel(lead.object_type) && `${objectTypeLabel(lead.object_type)}${objectPriority(lead.object_type) ? ` (${objectPriority(lead.object_type)})` : ""}`,
    lead.area_m2 && `${lead.area_m2} м²`,
    lead.lpr_name && `ЛПР: ${lead.lpr_name}${lead.lpr_position ? `, ${lead.lpr_position}` : ""}`,
    lead.expected_mrr && `${formatMoney(lead.expected_mrr)} / мес`,
    lead.agreed_frequency ? frequencyLabel(lead.agreed_frequency) : lead.desired_frequency && `хочет: ${frequencyLabel(lead.desired_frequency)}`,
    lead.next_service_at && `след. выезд ${lead.next_service_at}`,
  ].filter(Boolean);
  return <>
    {facts.length > 0 && <div className="kd-meta">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div>}
    {lead.snooze_until && lead.snooze_reason && <div className="kd-muted">Отложено до {lead.snooze_until}: {lead.snooze_reason}</div>}
    {hint?.missing?.length > 0 && <div className="kd-hint" style={{ marginTop: 6 }}>До «{hint.stage.label}» не хватает: {missingText(hint.missing)}</div>}
  </>;
}

export { lostReasonLabel, DEAL_STAGES };
