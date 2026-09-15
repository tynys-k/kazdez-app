import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, X } from "lucide-react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

function Button({ variant = "secondary", size = "md", iconOnly = false, className, type = "button", ...props }) {
  return <button type={type} className={cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, iconOnly && "ui-button--icon", className)} {...props} />;
}

function Card({ as: Element = "section", className, ...props }) {
  return <Element className={cx("ui-card", className)} {...props} />;
}

function KpiCard({ label, value, trend, trendDirection = "neutral", description, className, onClick }) {
  return (
    <Card as={onClick ? "button" : "article"} type={onClick ? "button" : undefined} onClick={onClick} className={cx("ui-kpi", onClick && "ui-kpi--interactive", className)}>
      <span className="ui-label">{label}</span>
      <strong>{value}</strong>
      {trend && <Badge tone={trendDirection === "up" ? "positive" : trendDirection === "down" ? "danger" : "neutral"}>{trend}</Badge>}
      {description && <small>{description}</small>}
    </Card>
  );
}

function Hero({ eyebrow, title, subtitle, action, className }) {
  return (
    <section className={cx("ui-hero", className)}>
      <div><span className="ui-hero__eyebrow">{eyebrow}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {action && <div className="ui-hero__action">{action}</div>}
    </section>
  );
}

function SegmentedControl({ label, value, options, onChange, className }) {
  return (
    <div className={cx("ui-segmented", className)} role="group" aria-label={label}>
      {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  );
}

function Badge({ tone = "neutral", className, ...props }) {
  return <span className={cx("ui-badge", `ui-badge--${tone}`, className)} {...props} />;
}

function ListRow({ title, meta, aside, status, actions, onClick, className, children }) {
  const keyboard = (event) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };
  return (
    <article className={cx("ui-list-row", onClick && "ui-list-row--interactive", className)} onClick={onClick} onKeyDown={keyboard} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="ui-list-row__main"><strong title={title}>{title || "—"}</strong>{meta && <span title={meta}>{meta}</span>}</div>
      {children && <div className="ui-list-row__details">{children}</div>}
      {status && <div className="ui-list-row__status">{status}</div>}
      {aside && <div className="ui-list-row__aside">{aside}</div>}
      {actions && <div className="ui-list-row__actions" onClick={(event) => event.stopPropagation()}>{actions}</div>}
    </article>
  );
}

function DataTable({ columns, rows, rowKey = "id", onRowClick, emptyMessage = "Данных пока нет", pageSize = 25 }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  if (!rows.length) return <EmptyState title={emptyMessage} />;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <><div className="ui-table-wrap"><table className="ui-table"><thead><tr>{columns.map((column) => <th key={column.key} className={column.numeric ? "is-numeric" : ""}>{column.label}</th>)}</tr></thead><tbody>
      {visible.map((row) => <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={onRowClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); } } : undefined} tabIndex={onRowClick ? 0 : undefined}>{columns.map((column) => <td key={column.key} className={column.numeric ? "is-numeric" : ""} title={column.title?.(row) || undefined}>{column.render ? column.render(row) : row[column.key] ?? "—"}</td>)}</tr>)}
    </tbody></table></div><Pagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} /></>
  );
}

function Field({ label, hint, className, children }) {
  return <label className={cx("ui-field", className)}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Textarea({ className, rows = 3, ...props }) {
  return <textarea rows={rows} className={cx("ui-textarea", className)} {...props} />;
}

function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return <div className="ui-empty" role="status"><Icon aria-hidden="true" /><strong>{title}</strong>{description && <span>{description}</span>}{action}</div>;
}

function Pagination({ page, pageSize, total, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav className="ui-pagination" aria-label="Страницы списка"><span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total}</span><Button size="sm" iconOnly aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /></Button><strong>{page} / {pages}</strong><Button size="sm" iconOnly aria-label="Следующая страница" disabled={page >= pages} onClick={() => onPageChange(page + 1)}><ChevronRight /></Button></nav>;
}

function DetailDrawer({ open, title, onClose, children, footer, placement = "right" }) {
  const titleId = useId();
  const drawerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    drawerRef.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); previous?.focus?.(); };
  }, [open, onClose]);
  const trapFocus = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...drawerRef.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
    if (!focusable.length) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  };
  if (!open) return null;
  return <div className={`ui-drawer-layer ${placement === "center" ? "ui-drawer-layer--center" : ""}`} role="presentation" onMouseDown={onClose}><aside ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`ui-drawer ${placement === "center" ? "ui-drawer--center" : ""}`} onKeyDown={trapFocus} onMouseDown={(event) => event.stopPropagation()}><header><h2 id={titleId}>{title}</h2><Button variant="ghost" size="sm" iconOnly aria-label="Закрыть" onClick={onClose}><X /></Button></header><div className="ui-drawer__body">{children}</div>{footer && <footer>{footer}</footer>}</aside></div>;
}

export { Badge, Button, Card, DataTable, DetailDrawer, EmptyState, Field, Hero, KpiCard, ListRow, Pagination, SegmentedControl, Textarea };
