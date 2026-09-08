const normalize = (value) => String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ");

const PEST_ALIASES = new Map([
  ["клоп", "Постельные клопы"], ["клопы", "Постельные клопы"],
  ["постельный клоп", "Постельные клопы"], ["постельные клопы", "Постельные клопы"],
  ["таракан", "Тараканы"], ["тараканы", "Тараканы"],
  ["муравей", "Муравьи"], ["муравьи", "Муравьи"],
  ["блоха", "Блохи"], ["блохи", "Блохи"],
  ["оса", "Осы"], ["осы", "Осы"],
  ["крыса", "Крысы"], ["крысы", "Крысы"],
  ["мышь", "Мыши"], ["мыши", "Мыши"],
  ["грызун", "Грызуны"], ["грызуны", "Грызуны"],
  ["комар", "Комары"], ["комары", "Комары"],
  ["муха", "Мухи"], ["мухи", "Мухи"],
  ["голубиный клещ", "Голубиные клещи"], ["голубиные клещи", "Голубиные клещи"],
  ["насекомое", "Насекомые"], ["насекомые", "Насекомые"],
]);

export function canonicalPestName(value) {
  const original = String(value || "").trim().replace(/\s+/g, " ");
  if (!original) return "";
  const key = normalize(original);
  if (PEST_ALIASES.has(key)) return PEST_ALIASES.get(key);
  const parts = key.split(/\s*(?:\+|\/|,|\sи\s)\s*/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => PEST_ALIASES.has(part))) {
    return [...new Set(parts.map((part) => PEST_ALIASES.get(part)))].join(" + ");
  }
  return original.charAt(0).toLocaleUpperCase("ru-RU") + original.slice(1);
}

export function canonicalPestOptions(pestTypes = [], current = "") {
  const unique = new Map();
  for (const item of [...pestTypes.map((row) => row?.name), current]) {
    const name = canonicalPestName(item);
    if (name && !unique.has(normalize(name))) unique.set(normalize(name), name);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, "ru"));
}

export function pestNamesMatch(left, right) {
  const a = canonicalPestName(left);
  const b = canonicalPestName(right);
  return !!a && a === b;
}
