export const JOB_OBJECT_TYPES = { apartment: "Квартира", house: "Частный дом", land: "Участок", commercial: "Коммерческий объект", other: "Другой объект" };
export function positiveNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Размеры должны быть положительными числами.");
  return n;
}
export function objectVolume(details = {}) {
  const number = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
  const height = number(details.height_m);
  const base = details.volume_method === "dimensions" ? number(details.length_m) * number(details.width_m) : number(details.floor_area_m2);
  const result = details.volume_method === "manual" ? number(details.volume_m3) : height && base ? height * base : null;
  return result == null ? null : Math.round(result * 1000) / 1000;
}
export function objectPayload(form) {
  const kind = form.object_kind || null;
  const raw = form.object_details || {};
  const land = kind === "land" || (kind === "commercial" && raw.commercial_kind === "land");
  const details = {};
  if (kind === "commercial") details.commercial_kind = land ? "land" : "building";
  if (land) { details.land_area = positiveNumber(raw.land_area); details.land_unit = raw.land_unit === "ha" ? "ha" : "sotka"; }
  if (kind === "apartment" || kind === "house") details.rooms = positiveNumber(raw.rooms);
  if (details.rooms && !Number.isInteger(details.rooms)) throw new Error("Количество комнат должно быть целым.");
  if (kind === "apartment") { details.entrance = String(raw.entrance || "").trim(); details.intercom = String(raw.intercom || "").trim(); }
  details.measurement = raw.measurement || "standard";
  if (details.measurement === "mold") details.mold_area_m2 = positiveNumber(raw.mold_area_m2);
  if (details.measurement === "fumigation") {
    details.volume_method = raw.volume_method || "area";
    for (const key of details.volume_method === "dimensions" ? ["length_m", "width_m", "height_m"] : details.volume_method === "manual" ? ["volume_m3", "floor_area_m2"] : ["height_m", "floor_area_m2"]) details[key] = positiveNumber(raw[key]);
    details.volume_m3 = objectVolume(details);
  }
  return { object_kind: kind, object_details: details, area: land ? null : positiveNumber(form.area), floor: kind && kind !== "apartment" ? "" : form.floor || "" };
}
export function objectDescription(job) {
  const d = job.object_details || {};
  return [JOB_OBJECT_TYPES[job.object_kind], job.area ? `${job.area} м²` : "", d.rooms ? `${d.rooms} комн.` : "", d.land_area ? `${d.land_area} ${d.land_unit === "ha" ? "га" : "соток"}` : "", d.mold_area_m2 ? `Плесень: ${d.mold_area_m2} м²` : "", d.volume_m3 ? `Фумигация: ${d.volume_m3} м³` : "", job.floor ? `Этаж ${job.floor}` : "", d.entrance ? `Подъезд ${d.entrance}` : "", d.intercom ? `Домофон ${d.intercom}` : ""].filter(Boolean).join(" · ");
}
