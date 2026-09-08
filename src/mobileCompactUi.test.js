import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");
const modals = fs.readFileSync(path.join(process.cwd(), "src", "modals.jsx"), "utf8");
const css = fs.readFileSync(path.join(process.cwd(), "src", "styles.css"), "utf8");

describe("compact operational UI", () => {
  it("uses a phone agenda instead of the tall desktop timeline", () => {
    expect(app).toContain('className="kd-schedule-mobile"');
    expect(app).toContain('className="kd-timeline kd-schedule-desktop"');
    expect(css).toMatch(/@media \(max-width:720px\)[\s\S]*\.kd-schedule-desktop\{display:none;\}/);
  });

  it("shrinks the days-off calendar on phones", () => {
    expect(modals).toContain("kd-offcalendar-cell");
    expect(css).toMatch(/\.kd-offcalendar-cell\{min-height:48px!important/);
  });

  it("provides direct medicine and employee pickers", () => {
    expect(app).toContain("stockChemFilter");
    expect(app).toContain("teamTechFilter");
    expect(app).toContain('className="kd-stock-index"');
    expect(app).toContain('className="kd-team-index"');
  });

  it("renders completed jobs compact until explicitly expanded", () => {
    expect(app).toMatch(/compact=\{expandedDoneId !== j\.id\}/);
    expect(modals).toContain('className="kd-done-row"');
    expect(modals).toContain("Адрес не указан");
    expect(modals).toContain("job.client_phone");
  });

  it("adds brand, employee, date and text filters to completed jobs", () => {
    expect(app).toContain("doneBrandFilter");
    expect(app).toContain("doneDateFilter");
    expect(app).toContain("techFilter");
    expect(app).toMatch(/doneJobs\s*\.filter\(matchSearch\)/);
  });
});
