// One failing request must not erase another table or its last good value.
export function createSourceLoader() {
  const versions = new Map();
  return async function loadSources(sources) {
    const requests = sources.map((source) => {
      const version = (versions.get(source.key) || 0) + 1;
      versions.set(source.key, version);
      return { source, version };
    });
    const settled = await Promise.allSettled(requests.map(({ source }) => Promise.resolve().then(source.run)));
    const results = {};
    requests.forEach(({ source, version }, index) => {
      // A slower refresh cannot overwrite a newer post-save refresh.
      if (versions.get(source.key) !== version) return;
      const result = settled[index];
      const response = result.status === "fulfilled" ? result.value : { error: result.reason };
      if (response?.error) {
        results[source.key] = { data: null, error: { message: response.error.message || String(response.error) } };
      } else if (!Array.isArray(response?.data)) {
        results[source.key] = { data: null, error: { message: "Сервер не вернул список записей" } };
      } else {
        results[source.key] = { data: response.data, error: null };
      }
    });
    return results;
  };
}

export function mergeLoadWarnings(previous, sources, results) {
  const current = sources.filter((source) => results[source.key]);
  const prefixes = current.map((source) => `${source.label}: `);
  return [
    ...previous.filter((warning) => !prefixes.some((prefix) => warning.startsWith(prefix))),
    ...current.filter((source) => results[source.key].error)
      .map((source) => `${source.label}: ${results[source.key].error.message}`),
  ];
}

export function attachReportChemicals(jobs, chemicals) {
  const byJob = new Map();
  for (const line of chemicals) {
    const key = String(line.job_id);
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key).push(line);
  }
  return jobs.map((job) => ({ ...job, chemicals: byJob.get(String(job.id)) || [] }));
}

export async function fetchAllRows(client, table, order = null, pageSize = 1000, maxRows = 100000) {
  const all = [];
  try {
    for (;;) {
      let query = client.from(table).select("*");
      if (order) query = query.order(order.column, { ascending: !!order.ascending });
      // Offset pagination needs a unique and deterministic tie-breaker.
      if (order?.column !== "id") query = query.order("id", { ascending: true });
      const { data, error } = await query.range(all.length, all.length + pageSize - 1);
      if (error) return { data: null, error };
      if (!Array.isArray(data)) return { data: null, error: { message: "Сервер не вернул список записей" } };
      if (!data.length) return { data: all, error: null };
      all.push(...data);
      if (all.length > maxRows) return { data: null, error: { message: "Слишком много записей для полной загрузки. Данные не обновлены." } };
      // The server may cap pages below pageSize. Continue until an empty page.
    }
  } catch (error) {
    return { data: null, error };
  }
}
