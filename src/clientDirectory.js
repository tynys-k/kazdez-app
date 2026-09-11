const keyOf = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};

const byNewest = (a, b) => String(b?.scheduled_date || b?.created_at || "").localeCompare(String(a?.scheduled_date || a?.created_at || ""));

export function belongsToClient(row, client, phoneField = "client_phone") {
  if (!row || !client) return false;
  if (row.client_id) return String(row.client_id) === String(client.id);
  const clientKey = client.phone_key || keyOf(client.phone);
  return !!clientKey && keyOf(row[phoneField]) === clientKey;
}
export function clientJobs(client, jobs = []) {
  return jobs.filter((row) => belongsToClient(row, client)).sort(byNewest);
}

export function clientContracts(client, contracts = []) {
  return contracts.filter((row) => belongsToClient(row, client, "phone")).sort(byNewest);
}

export function clientAddresses(client, saved = [], jobs = []) {
  const result = [];
  const seen = new Set();
  const add = (row) => {
    const address = String(row?.address || "").trim();
    const key = address.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key); result.push({ ...row, address, fromHistory: !row?.client_id });
  };
  saved.filter((row) => String(row.client_id) === String(client?.id)).forEach(add);
  clientJobs(client, jobs).forEach((job) => add({ address: job.address, label: "Из заявок", contact_name: job.contact_name, contact_phone: job.client_phone }));
  return result;
}

export function clientSummary(client, jobs = [], contracts = [], followups = []) {
  const rows = clientJobs(client, jobs);
  const done = rows.filter((row) => row.status === "done");
  const revenue = done.reduce((sum, row) => sum + (Number(row.report_paid) || 0), 0);
  const linkedContracts = clientContracts(client, contracts);
  const openFollowups = followups.filter((row) => belongsToClient(row, client, "phone") && row.status !== "done");
  return {
    jobs: rows.length,
    done: done.length,
    revenue,
    lastJob: rows[0] || null,
    activeContracts: linkedContracts.filter((row) => row.active !== false).length,
    openFollowups: openFollowups.length,
  };
}

export function searchClients(clients = [], query = "", context = {}) {
  const q = String(query || "").trim().toLocaleLowerCase("ru");
  const digits = q.replace(/\D/g, "");
  if (!q) return clients;
  return clients.filter((client) => {
    const jobs = clientJobs(client, context.jobs || []);
    const contacts = (context.contacts || []).filter((row) => String(row.client_id) === String(client.id));
    const addresses = clientAddresses(client, context.addresses || [], context.jobs || []);
    const haystack = [client.name, client.legal_name, client.bin_iin, client.email, client.phone,
      ...contacts.flatMap((row) => [row.name, row.role, row.phone, row.email]),
      ...addresses.map((row) => row.address), ...jobs.map((row) => row.pest)].filter(Boolean).join(" ").toLocaleLowerCase("ru");
    return haystack.includes(q) || (!!digits && haystack.replace(/\D/g, "").includes(digits));
  });
}
