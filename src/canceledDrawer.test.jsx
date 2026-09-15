// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobCard } from "./modals";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const jobs = Array.from({ length: 3 }, (_, index) => ({
  id: `canceled-${index}`,
  status: "canceled",
  pest: `Отменённая заявка ${index + 1}`,
  address: `Алматы, Абая ${index + 1}`,
  client_phone: "+7 701 234 56 78",
  scheduled_date: "2026-09-15",
  price_options: [{ amount: 25000 }],
}));

function CanceledList() {
  const [expanded, setExpanded] = useState("");
  return jobs.map((job) => <JobCard key={job.id} job={job} compact={expanded !== job.id}
    onExpand={() => setExpanded(job.id)} onCollapse={() => setExpanded("")} onHistory={() => {}} onRestore={() => {}} />);
}

describe("canceled job detail", () => {
  it("keeps the register visible and opens only one closable drawer", async () => {
    await act(async () => root.render(<CanceledList />));
    expect(container.querySelectorAll(".kd-job-row")).toHaveLength(3);
    expect(container.querySelectorAll(".ui-drawer-layer")).toHaveLength(0);

    await act(async () => container.querySelectorAll(".kd-job-row")[1].click());
    expect(container.querySelectorAll(".kd-job-row")).toHaveLength(3);
    expect(container.querySelectorAll(".ui-drawer-layer")).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]').textContent).toContain("Отменённая заявка 2");

    await act(async () => container.querySelector('[aria-label="Закрыть"]').click());
    expect(container.querySelectorAll(".ui-drawer-layer")).toHaveLength(0);
  });

  it("never creates an unclosable drawer for older callers", async () => {
    await act(async () => root.render(<JobCard job={jobs[0]} onHistory={() => {}} onRestore={() => {}} />));
    expect(container.querySelector(".kd-card")).not.toBeNull();
    expect(container.querySelector(".ui-drawer-layer")).toBeNull();
  });
});
