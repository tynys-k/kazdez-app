import React from "react";
import { JOB_OBJECT_TYPES, objectVolume } from "./objectModel";
const Field = ({ label, children }) => <label className="kd-field"><span>{label}</span>{children}</label>;
export default function JobObjectFields({ form, onChange }) {
  const d = form.object_details || {};
  const set = (key, value) => onChange({ ...form, object_details: { ...d, [key]: value } });
  const dimension = (key, label) => <Field label={label}><input type="number" min="0" step="any" value={d[key] ?? ""} onChange={(e) => set(key, e.target.value)} /></Field>;
  const land = form.object_kind === "land" || (form.object_kind === "commercial" && d.commercial_kind === "land");
  return <section className="wf-section"><Field label="Тип объекта"><select value={form.object_kind || ""} onChange={(e) => onChange({ ...form, object_kind: e.target.value, object_details: {}, area: "", floor: "" })}><option value="">Не указан</option>{Object.entries(JOB_OBJECT_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
    {form.object_kind === "commercial" && <Field label="Коммерческий объект"><select value={d.commercial_kind || "building"} onChange={(e) => { onChange({ ...form, area: "", object_details: { ...d, commercial_kind: e.target.value, land_area: "" } }); }}><option value="building">Помещение</option><option value="land">Участок</option></select></Field>}
    <div className="kd-grid2">{land ? <>{dimension("land_area", "Площадь участка")}<Field label="Единица площади"><select value={d.land_unit || "sotka"} onChange={(e) => set("land_unit", e.target.value)}><option value="sotka">Сотки</option><option value="ha">Гектары</option></select></Field></> : (form.object_kind || form.area) && <Field label="Площадь помещения, м²"><input type="number" min="0" step="any" value={form.area ?? ""} onChange={(e) => onChange({ ...form, area: e.target.value })} /></Field>}
      {["apartment", "house"].includes(form.object_kind) && dimension("rooms", "Количество комнат")}
      {(form.object_kind === "apartment" || (!form.object_kind && form.floor)) && <Field label="Этаж"><input value={form.floor || ""} onChange={(e) => onChange({ ...form, floor: e.target.value })} /></Field>}
      {form.object_kind === "apartment" && <><Field label="Подъезд"><input value={d.entrance || ""} onChange={(e) => set("entrance", e.target.value)} /></Field><Field label="Домофон"><input value={d.intercom || ""} onChange={(e) => set("intercom", e.target.value)} /></Field></>}
    </div>
    <Field label="Особый замер услуги"><select value={d.measurement || "standard"} onChange={(e) => set("measurement", e.target.value)}><option value="standard">Обычный</option><option value="mold">Площадь плесени</option><option value="fumigation">Фумигация</option></select></Field>
    {d.measurement === "mold" && dimension("mold_area_m2", "Площадь самой плесени, м²")}
    {d.measurement === "fumigation" && <><Field label="Расчёт объёма"><select value={d.volume_method || "area"} onChange={(e) => set("volume_method", e.target.value)}><option value="area">Площадь × высота</option><option value="dimensions">Длина × ширина × высота</option><option value="manual">Объём известен</option></select></Field><div className="kd-grid2">{d.volume_method === "dimensions" ? <>{dimension("length_m", "Длина, м")}{dimension("width_m", "Ширина, м")}</> : dimension("floor_area_m2", "Площадь обработки, м²")}{d.volume_method === "manual" ? dimension("volume_m3", "Объём, м³") : dimension("height_m", "Высота, м")}</div><p className="kd-notebox">Объём: {objectVolume(d) ?? "Заполните размеры"}{objectVolume(d) != null ? " м³" : ""}</p></>}
  </section>;
}
