const EMPTY_VALUE = "—";

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  const number = Number(value);
  if (!Number.isFinite(number)) return EMPTY_VALUE;
  return `${new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(number)} ₸`;
}

function formatDate(value, options = {}) {
  if (!value) return EMPTY_VALUE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat("ru-KZ", { day: "2-digit", month: "2-digit", year: "numeric", ...options }).format(date);
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length >= 10 ? digits.slice(-10) : "";
  if (!local) return EMPTY_VALUE;
  return `+7 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
}

function buildMapUrl({ url, latitude, longitude, address } = {}) {
  if (url) {
    try {
      const decoded = decodeURIComponent(String(url));
      const parsed = new URL(decoded);
      if (["http:", "https:"].includes(parsed.protocol)) return parsed.href;
    } catch { /* fall through to coordinates or address */ }
  }
  if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) return `https://yandex.kz/maps/?pt=${Number(longitude)},${Number(latitude)}&z=16&l=map`;
  if (String(address || "").trim()) return `https://yandex.kz/maps/?text=${encodeURIComponent(String(address).trim())}`;
  return "";
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  return String(value);
}

export { EMPTY_VALUE, buildMapUrl, displayValue, formatDate, formatMoney, formatPhone };
