const LOCALITY_MARKER = /(?:^|[,\s])(?:г(?:ород)?\.?|с(?:ело)?\.?|пос(?:е|ё)лок|п\.?|аул|ауыл|обл(?:асть)?\.?|район)\s+[\p{L}\d]/iu;
const ALMATY = /(?:^|[,\s])(?:алматы|алма-ата)(?:$|[,\s])/iu;

export function normalizeRouteAddress(address, defaultCity = "Алматы") {
  const clean = String(address || "").replace(/\s+/g, " ").trim();
  if (!clean || /^https?:\/\//i.test(clean) || /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(clean)) return clean;
  if (ALMATY.test(` ${clean} `) || LOCALITY_MARKER.test(` ${clean} `)) return clean;
  return `${defaultCity}, Казахстан, ${clean}`;
}

export function yandexRouteUrl(addresses, defaultCity = "Алматы") {
  const points = (addresses || []).filter(Boolean).slice(0, 8).map((address) => normalizeRouteAddress(address, defaultCity));
  if (!points.length) return "https://yandex.com/maps/routes/";
  const rtext = points.length === 1 ? `~${points[0]}` : points.join("~");
  return `https://yandex.com/maps/?rtext=${encodeURIComponent(rtext)}&rtt=auto`;
}
