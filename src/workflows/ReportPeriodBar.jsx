import React, { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { datePresetRange, isoToRu } from "../shared";
import "./reportPeriodBar.css";

const PERIODS = [
  { id: "today", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "quarter", label: "Квартал" },
  { id: "half", label: "Полугодие" },
  { id: "year", label: "Год" },
  { id: "all", label: "Всё время" },
];

function periodLabel(filter) {
  if (filter.preset === "all") return "Всё время";
  if (filter.preset === "custom") {
    if (!filter.from) return "Выберите даты";
    return filter.to && filter.to !== filter.from ? `${isoToRu(filter.from)} — ${isoToRu(filter.to)}` : isoToRu(filter.from);
  }
  const range = datePresetRange(filter.preset, Number(filter.offset) || 0);
  if (!range) return "";
  return range.from === range.to ? isoToRu(range.from) : `${isoToRu(range.from)} — ${isoToRu(range.to)}`;
}

export default function ReportPeriodBar({ filter, onChange }) {
  const [customOpen, setCustomOpen] = useState(filter.preset === "custom");
  const hasNavigation = !["all", "custom"].includes(filter.preset);
  const offset = Number(filter.offset) || 0;
  const pick = (preset) => { setCustomOpen(false); onChange({ preset, offset: 0 }); };
  return <section className="rp-bar" aria-label="Период отчёта">
    <div className="rp-presets">
      {PERIODS.map((period) => <button type="button" key={period.id} className={filter.preset === period.id ? "active" : ""} aria-pressed={filter.preset === period.id} onClick={() => pick(period.id)}>{period.label}</button>)}
      <button type="button" className={filter.preset === "custom" ? "active" : ""} aria-pressed={filter.preset === "custom"} onClick={() => { setCustomOpen(true); onChange({ preset: "custom", from: filter.from || "", to: filter.to || "" }); }}><Calendar size={13} />Период</button>
    </div>
    <div className="rp-current">
      {hasNavigation && <button type="button" aria-label="Предыдущий период" onClick={() => onChange({ ...filter, offset: offset - 1 })}><ChevronLeft size={17} /></button>}
      <strong>{periodLabel(filter)}</strong>
      {hasNavigation && <button type="button" aria-label="Следующий период" disabled={offset >= 0} onClick={() => onChange({ ...filter, offset: offset + 1 })}><ChevronRight size={17} /></button>}
    </div>
    {(customOpen || filter.preset === "custom") && <div className="rp-custom">
      <label>С даты<input type="date" value={filter.from || ""} onChange={(event) => onChange({ preset: "custom", from: event.target.value, to: filter.to || "" })} /></label>
      <span>—</span>
      <label>По дату<input type="date" value={filter.to || ""} onChange={(event) => onChange({ preset: "custom", from: filter.from || "", to: event.target.value })} /></label>
    </div>}
  </section>;
}
