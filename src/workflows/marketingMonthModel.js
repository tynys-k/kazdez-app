import { isoOf } from "../shared";
import { sourceNamesMatch } from "../sourceNormalization";

function asDate(value) {
  if (value instanceof Date) return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function marketingMonthRange(offset = 0, now = new Date()) {
  const base = asDate(now);
  const start = new Date(base.getFullYear(), base.getMonth() + Number(offset || 0), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {
    key: isoOf(start).slice(0, 7),
    from: isoOf(start),
    to: isoOf(end),
    label: start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
  };
}

function dateInRange(value, range) {
  const day = String(value || "").slice(0, 10);
  return Boolean(day && day >= range.from && day <= range.to);
}

export function buildMarketingMonthReport({ jobs = [], channels = [], topups = [], offset = 0, now = new Date() } = {}) {
  const range = marketingMonthRange(offset, now);
  const completed = jobs.filter((job) => job.status === "done" && dateInRange(job.scheduled_date, range));
  const monthTopups = topups.filter((topup) => dateInRange(topup.topup_date, range));
  const sourceKeys = channels.map((channel) => channel.source_key).filter(Boolean);
  const attributedJobs = completed.filter((job) => sourceKeys.some((sourceKey) => sourceNamesMatch(job.source, sourceKey)));
  const channelRows = channels.map((channel) => {
    const channelTopups = monthTopups.filter((topup) => String(topup.channel_id) === String(channel.id));
    const spent = channelTopups.reduce((sum, topup) => sum + (Number(topup.amount) || 0), 0);
    const revenue = channel.source_key
      ? completed.filter((job) => sourceNamesMatch(job.source, channel.source_key)).reduce((sum, job) => sum + (Number(job.report_paid) || 0), 0)
      : 0;
    const plan = Number(channel.monthly_plan) || 0;
    return {
      ...channel,
      plan,
      spent,
      revenue,
      roi: spent > 0 ? revenue / spent : null,
      filled: plan > 0 ? Math.min(100, Math.round(spent / plan * 100)) : 0,
      topups: channelTopups,
    };
  });
  return {
    ...range,
    channels: channelRows,
    totalPlan: channelRows.reduce((sum, channel) => sum + channel.plan, 0),
    totalSpent: channelRows.reduce((sum, channel) => sum + channel.spent, 0),
    totalRevenue: attributedJobs.reduce((sum, job) => sum + (Number(job.report_paid) || 0), 0),
    completedJobs: completed.length,
    attributedJobs: attributedJobs.length,
  };
}

export function buildMarketingMonthHistory({ months = 6, ...input } = {}) {
  return Array.from({ length: Math.max(1, months) }, (_, index) => buildMarketingMonthReport({ ...input, offset: -index }));
}
