function errorText(error) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
}

export function isMissingJobsBranchColumn(error) {
  const text = errorText(error);
  return (error?.code === "PGRST204" || text.includes("schema cache"))
    && text.includes("branch_id")
    && text.includes("jobs");
}

// A missing column is rejected by PostgREST before INSERT reaches PostgreSQL,
// so this one compatibility retry cannot duplicate a successfully created job.
export async function insertJobWithBranchFallback(client, row) {
  const insert = (payload) => client.from("jobs").insert(payload).select("id, client_phone").single();
  const first = await insert(row);
  if (!first.error || !Object.hasOwn(row, "branch_id") || !isMissingJobsBranchColumn(first.error)) {
    return { ...first, branchOmitted: false };
  }

  const { branch_id: _unsupportedBranch, ...compatibleRow } = row;
  const retry = await insert(compatibleRow);
  return { ...retry, branchOmitted: !retry.error };
}
