export function createReportRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function buildAtomicReportPayload(job, report, chems, docs) {
  return {
    job_id: job.id,
    payment: {
      cash: Number(report.cash) || 0,
      qr: Number(report.qr) || 0,
      transfer: Number(report.transfer) || 0,
      method: report.method || "",
    },
    note: report.note || "",
    chemicals: Array.isArray(chems) ? chems : [],
    follow_up: {
      wanted: !!report.followUp?.wanted,
      date: report.followUp?.date || null,
      note: report.followUp?.note || "",
    },
    documents: {
      needed: !!docs?.needed,
      avr: !!docs?.avr,
      dogovor: !!docs?.dogovor,
      note: docs?.note || "",
    },
    checks: Array.isArray(report.checks) ? report.checks : [],
    chemical_details: Array.isArray(report.chemDetails) ? report.chemDetails : [],
    equipment: Array.isArray(report.equipment) ? report.equipment : [],
    debt: report.debt?.amount > 0 ? {
      amount: Number(report.debt.amount) || 0,
      due_on: report.debt.dueOn || null,
      note: report.debt.note || null,
    } : null,
    discount: report.discountReason && report.discountReason !== "debt" ? {
      quoted: Number(job.quoted_price) || 0,
      charged: (Number(report.cash) || 0) + (Number(report.qr) || 0) + (Number(report.transfer) || 0),
      reason: report.discountReason,
      note: report.discountNote || null,
    } : null,
  };
}

export function atomicReportRpcUnavailable(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202"
    || (message.includes("submit_report_atomic") && (message.includes("schema cache") || message.includes("could not find")));
}
