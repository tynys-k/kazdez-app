function searchKey(value) {
  return String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

export function findContractClients(clients, query, limit = 20) {
  const words = searchKey(query).split(" ").filter((word) => word && !/^\d+$/.test(word));
  const digits = String(query || "").replace(/\D/g, "");
  return clients.filter((client) => {
    if (!words.length && !digits) return true;
    const values = [client.name, client.legal_name, client.phone, client.bin_iin, client.email].filter(Boolean).join(" ");
    const haystack = searchKey(values);
    const clientDigits = values.replace(/\D/g, "");
    return words.every((word) => haystack.includes(word)) && (!digits || clientDigits.includes(digits));
  }).slice(0, limit);
}
