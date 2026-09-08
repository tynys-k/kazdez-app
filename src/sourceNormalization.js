const normalize = (value) => String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[._-]+/g, " ").replace(/\s+/g, " ");

const SOURCE_ALIASES = new Map([
  ["instagram", "Instagram"], ["instagram ads", "Instagram"], ["insta", "Instagram"], ["инста", "Instagram"], ["инстаграм", "Instagram"],
  ["facebook", "Facebook"], ["facebook ads", "Facebook"], ["fb", "Facebook"], ["фейсбук", "Facebook"],
  ["google", "Google Ads"], ["google ads", "Google Ads"], ["гугл", "Google Ads"], ["гугл реклама", "Google Ads"],
  ["google maps", "Google Карты"], ["google карта", "Google Карты"], ["google карты", "Google Карты"], ["гугл карты", "Google Карты"],
  ["yandex", "Яндекс"], ["yandex direct", "Яндекс"], ["яндекс", "Яндекс"], ["яндекс директ", "Яндекс"],
  ["yandex maps", "Яндекс Карты"], ["яндекс карта", "Яндекс Карты"], ["яндекс карты", "Яндекс Карты"],
  ["2gis", "2ГИС"], ["2 gis", "2ГИС"], ["2гис", "2ГИС"], ["двагис", "2ГИС"],
  ["olx", "OLX"], ["олх", "OLX"],
  ["tiktok", "TikTok"], ["tik tok", "TikTok"], ["тикток", "TikTok"],
  ["whatsapp", "WhatsApp"], ["what's app", "WhatsApp"], ["ватсап", "WhatsApp"], ["вацап", "WhatsApp"],
  ["сайт", "Сайт"], ["website", "Сайт"], ["web site", "Сайт"],
  ["рекомендация", "Рекомендация"], ["рекомендации", "Рекомендация"], ["сарафан", "Рекомендация"], ["сарафанное радио", "Рекомендация"],
  ["партнер", "Партнёр"], ["партнеры", "Партнёр"], ["партнерская", "Партнёр"], ["партнёр", "Партнёр"], ["партнёры", "Партнёр"], ["партнёрская", "Партнёр"],
]);

export function canonicalSourceName(value) {
  const original = String(value || "").trim().replace(/\s+/g, " ");
  if (!original) return "";
  return SOURCE_ALIASES.get(normalize(original)) || (original.charAt(0).toLocaleUpperCase("ru-RU") + original.slice(1));
}

export function canonicalSourceKey(value) {
  return normalize(canonicalSourceName(value));
}

export function sourceNamesMatch(left, right) {
  const a = canonicalSourceKey(left);
  const b = canonicalSourceKey(right);
  return !!a && a === b;
}

export function canonicalSourceOptions(sources = [], current = "") {
  const unique = new Map();
  for (const item of [...sources.map((row) => row?.name), current]) {
    const name = canonicalSourceName(item);
    const key = canonicalSourceKey(name);
    if (key && !unique.has(key)) unique.set(key, name);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, "ru"));
}
