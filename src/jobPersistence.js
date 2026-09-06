function errorText(error) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
}

export function missingJobsColumn(error) {
  const text = errorText(error);
  if (error?.code !== "PGRST204" && !text.toLowerCase().includes("schema cache")) return null;
  const match = text.match(/could not find the ['"]([^'"]+)['"] column of ['"](?:public\.)?jobs['"] in the schema cache/i);
  return match?.[1] || null;
}

// Unknown columns are rejected by PostgREST before INSERT reaches PostgreSQL.
// Removing only the column named by that exact error is therefore safe from
// duplicate inserts. Network, permission and SQL errors are never retried.
export async function insertCompatibleJob(client, row) {
  const insert = (payload) => client.from("jobs").insert(payload).select("id, client_phone").single();
  let compatibleRow = { ...row };
  const omittedColumns = [];

  for (let attempt = 0; attempt <= Object.keys(row).length; attempt += 1) {
    const result = await insert(compatibleRow);
    if (!result.error) return { ...result, omittedColumns };

    const column = missingJobsColumn(result.error);
    if (!column || !Object.hasOwn(compatibleRow, column)) return { ...result, omittedColumns };
    compatibleRow = Object.fromEntries(Object.entries(compatibleRow).filter(([key]) => key !== column));
    omittedColumns.push(column);
  }

  return { data: null, error: { message: "Не удалось подобрать совместимый формат заявки" }, omittedColumns };
}
