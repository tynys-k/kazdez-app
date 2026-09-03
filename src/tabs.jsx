// Самостоятельные разделы, вынесенные из App.jsx.
//
// App.jsx разросся до четырёх тысяч строк, и это не абстрактная проблема:
// именно из-за размера файла механические правки при слияниях трижды ломали
// код — терялись закрывающие скобки, пропадали целые функции.
//
// Сюда переезжают разделы, которые ничего не считают и зависят только от
// переданных данных. Полное разделение — включая слой загрузки — требует
// разбора позиционного массива из сорока одного ответа, и делать это надо
// отдельно и осторожно, а не заодно.

import React from "react";
import { AddressText, DRIVE_LINKS, DriveLinkCard, fmt, fmtTs, isoToRu } from "./shared";
import { lastAcknowledgement } from "./calc";

// Отметка «ознакомлен» под материалом, с которым надо ознакомиться под подпись.
//
// Раньше ТБ и обучение были просто ссылками на Диск: кто открывал и кто
// прочитал — нигде, а при несчастном случае подтвердить инструктаж нечем.
// Отметку ставит сам человек за себя: чужая подпись ничего не подтверждает.
function AckLine({ link, acks, myId, onAcknowledge }) {
  const mine = lastAcknowledgement(acks, myId, link.key);
  if (mine) {
    return (
      <div className="kd-ackline done">
        Вы ознакомились {isoToRu(String(mine.acknowledged_at).slice(0, 10))}.
        <button className="kd-btn ghost sm" onClick={() => onAcknowledge(link.key)}>Ознакомиться заново</button>
      </div>
    );
  }
  return (
    <div className="kd-ackline">
      Отметка об ознакомлении не поставлена.
      <button className="kd-btn primary sm" onClick={() => onAcknowledge(link.key)}>Я ознакомился</button>
    </div>
  );
}

function LinkList({ place, settings, isAdmin, acks, myId, onAcknowledge }) {
  return DRIVE_LINKS.filter((l) => l.place === place).map((l) => (
    <div key={l.key}>
      <DriveLinkCard link={l} url={settings[l.key]} isAdmin={isAdmin} />
      {l.ack && onAcknowledge && <AckLine link={l} acks={acks} myId={myId} onAcknowledge={onAcknowledge} />}
    </div>
  ));
}

export function MaterialsTab({ settings, isAdmin, acks = [], myId, onAcknowledge }) {
  return (
    <div className="kd-list">
      <div className="kd-title" style={{ fontSize: 18, marginBottom: 4 }}>Материалы компании</div>
      <div className="kd-muted" style={{ marginBottom: 8 }}>Маркетинг и техника безопасности.{isAdmin ? " Ссылки меняются в Настройках." : ""}</div>
      <LinkList place="materials" settings={settings} isAdmin={isAdmin} acks={acks} myId={myId} onAcknowledge={onAcknowledge} />
    </div>
  );
}

export function KnowledgeTab({ settings, isAdmin, acks = [], myId, onAcknowledge }) {
  return (
    <div className="kd-list">
      <div className="kd-title" style={{ fontSize: 18, marginBottom: 4 }}>База знаний</div>
      <div className="kd-muted" style={{ marginBottom: 8 }}>Обучение: скрипты продаж и разговора с клиентами.{isAdmin ? " Ссылки меняются в Настройках." : ""}</div>
      <LinkList place="knowledge" settings={settings} isAdmin={isAdmin} acks={acks} myId={myId} onAcknowledge={onAcknowledge} />
    </div>
  );
}

// Сбои приложения показываем только админу: в тексте ошибок попадаются
// телефоны клиентов и суммы.
export function ErrorsPanel({ errors = [] }) {
  return (
    <div className="kd-card" style={{ marginBottom: 14 }}>
      <div className="kd-section" style={{ marginTop: 0 }}>Сбои приложения{errors.length ? ` · ${errors.length}` : ""}</div>
      {errors.length === 0 && <div className="kd-muted">Сбоев не зафиксировано. Здесь появятся ошибки, которые раньше просто мелькали сообщением и исчезали.</div>}
      {errors.slice(0, 30).map((e) => (
        <div className="kd-ledgerrow" key={e.id} style={{ gridTemplateColumns: "150px 1fr" }}>
          <span className="kd-muted" style={{ textAlign: "left" }}>{fmtTs(e.occurred_at)}<br />{e.user_name || "—"}</span>
          <span style={{ textAlign: "left", minWidth: 0 }}>
            <strong style={{ display: "block", color: e.kind === "crash" ? "var(--rust)" : "var(--ink)" }}>{e.message}</strong>
            <span className="kd-muted">{e.kind === "crash" ? "падение интерфейса" : e.place || "—"}</span>
          </span>
        </div>
      ))}
      {errors.length > 30 && <div className="kd-muted" style={{ marginTop: 8 }}>Показаны последние 30 из {errors.length}.</div>}
    </div>
  );
}

export function TrashTab({ trash = [], onRestore, onPurge }) {
  return (
    <div className="kd-list">
      {trash.length === 0 && <div className="kd-empty">Корзина пуста. Удалённые заявки можно восстановить отсюда.</div>}
      {trash.map((row) => (
        <div key={row.id} className="kd-card">
          <div className="kd-card-head"><div className="kd-pest">{row.job.pest}</div><span className="kd-muted">удалено {fmtTs(row.deleted_at)}</span></div>
          <div className="kd-addr"><AddressText text={row.job.address} /></div>
          <div className="kd-card-foot"><span className="kd-muted">Удалил: {row.deleted_by}</span>
            {row.job.report_paid != null && <span className="kd-muted">Было оплачено: {fmt(row.job.report_paid)} ₸</span>}</div>
          <div className="kd-actions">
            <button className="kd-btn primary sm" onClick={() => onRestore(row)}>Восстановить</button>
            <button className="kd-btn ghost danger sm" onClick={() => onPurge(row)}>Удалить навсегда</button>
          </div>
        </div>
      ))}
    </div>
  );
}
