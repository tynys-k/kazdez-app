export function payrollEmployees(profiles = []) {
  return profiles.filter((profile) => profile?.is_active !== false || profile?.role === "tech");
}

export function employeePosition(profile) {
  return String(profile?.job_title || "").trim() || "Должность не указана";
}
