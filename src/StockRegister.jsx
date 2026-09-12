import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownCircle, ArrowRight, ArrowRightLeft, ArrowUpCircle,
  ClipboardCheck, Package, Plus, Search, Trash2, UserRound,
} from "lucide-react";
import { EQUIP_CATEGORIES, chemUnit, fmt, fmtAmount, isoToRu, lineAmount } from "./shared";
import * as calc from "./calc";

const MOVEMENT_LABELS = {
  revision: "Ревизия",
  correction_in: "Корректировка +",
  correction_out: "Корректировка −",
  transfer_out: "Передача",
  transfer_in: "Получение",
  sold_partner: "Продажа партнёру",
};

function eventDate(value) {
  return String(value || "").slice(0, 10);
}

function StockStatus({ item }) {
  if (item.low) return <span className="kd-stock-status danger"><AlertTriangle size={12} />Мало</span>;
  if (item.orderSoon) return <span className="kd-stock-status warning">Заказать</span>;
  return <span className="kd-stock-status ok">В норме</span>;
}

function StockRegister({
  inventory, techs, techLedger, purchases, handouts, adjustments, jobs, sales,
  equipment, equipIssuedQty, totalStockValue, totalEquipValue, selectedId, onSelect,
  canEditStock, canManageTeam, onStockIn, onHandout, onMovement, onRemoveChem,
  onAddEquipment, onEditEquipment, onRemoveEquipment, techEquipment, onIssueEquipment,
  onTransferEquipment, onEquipStatus,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [detailTab, setDetailTab] = useState("locations");
  const [equipmentTechId, setEquipmentTechId] = useState("");

  useEffect(() => setDetailTab("locations"), [selectedId]);

  const balancesByChemical = useMemo(() => {
    const map = new Map();
    techs.forEach((tech) => {
      techLedger(tech.id).forEach((row) => {
        const key = String(row.chem.id);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ tech, ...row });
      });
    });
    return map;
  }, [inventory, techs, handouts, adjustments, jobs]);

  const rows = useMemo(() => inventory.map((item) => {
    const employeeRows = balancesByChemical.get(String(item.id)) || [];
    const withEmployees = employeeRows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    return { ...item, employeeRows, withEmployees, warehouseBalance: item.remaining - withEmployees };
  }), [inventory, balancesByChemical]);

  const visibleRows = rows.filter((item) => {
    if (query && !String(item.name || "").toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (status === "low" && !item.low) return false;
    if (status === "order" && (!item.orderSoon || item.low)) return false;
    return true;
  });
  const selected = rows.find((item) => String(item.id) === String(selectedId));

  const movements = useMemo(() => {
    if (!selected) return [];
    const chemicalId = String(selected.id);
    const result = [];

    purchases.filter((row) => String(row.chemical_id) === chemicalId).forEach((row) => result.push({
      id: `purchase:${row.id}`, date: row.purchase_date, kind: "Приход",
      from: row.supplier || "Поставщик", to: "Основной склад", amount: Number(row.amount) || 0,
      note: [row.batch_no ? `Партия ${row.batch_no}` : "", row.note || ""].filter(Boolean).join(" · "),
    }));
    handouts.filter((row) => String(row.chemical_id) === chemicalId).forEach((row) => result.push({
      id: `handout:${row.id}`, date: eventDate(row.created_at), kind: row.kind === "opening" ? "Начальный остаток" : "Выдача",
      from: row.kind === "opening" ? "Ввод остатков" : "Основной склад", to: techs.find((t) => String(t.id) === String(row.tech_id))?.full_name || "Сотрудник",
      amount: Number(row.amount) || 0, note: row.note || "",
    }));
    adjustments.filter((row) => String(row.chemical_id) === chemicalId && row.kind !== "transfer_in" && row.kind !== "sold_partner").forEach((row) => {
      const tech = techs.find((t) => String(t.id) === String(row.tech_id));
      const counterparty = techs.find((t) => String(t.id) === String(row.counterparty_tech_id));
      result.push({
        id: `adjustment:${row.id}`, date: row.event_date || eventDate(row.created_at), kind: MOVEMENT_LABELS[row.kind] || "Корректировка",
        from: row.kind === "transfer_out" ? (tech?.full_name || "Сотрудник") : "Учётный остаток",
        to: row.kind === "transfer_out" ? (counterparty?.full_name || "Сотрудник") : (tech?.full_name || "Сотрудник"),
        amount: Number(row.amount_delta) || 0, note: [row.reason, row.note].filter(Boolean).join(" · "),
      });
    });
    jobs.forEach((job) => {
      const amount = (job.chemicals || []).filter((line) => String(line.chemical_id) === chemicalId).reduce((sum, line) => sum + lineAmount(line), 0);
      if (!amount) return;
      result.push({
        id: `job:${job.id}`, date: job.scheduled_date || eventDate(job.reported_at), kind: "Расход по заявке",
        from: techs.find((t) => String(t.id) === String(job.assigned_to))?.full_name || "Сотрудник", to: job.address || "Объект клиента",
        amount: -amount, note: job.pest || "Выполненная работа",
      });
    });
    sales.filter((row) => String(row.chemical_id) === chemicalId).forEach((row) => result.push({
      id: `sale:${row.id}`, date: row.sold_on || eventDate(row.created_at), kind: "Продажа партнёру",
      from: row.from_tech_id ? (techs.find((t) => String(t.id) === String(row.from_tech_id))?.full_name || "Сотрудник") : "Основной склад",
      to: "Партнёр", amount: -(Number(row.amount) || 0), note: row.note || "",
    }));
    return result.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [selected, purchases, handouts, adjustments, jobs, sales, techs]);

  const selectedPurchases = selected
    ? purchases.filter((row) => String(row.chemical_id) === String(selected.id)).sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)))
    : [];
  const equipmentAtEmployees = techs.flatMap((tech) => techEquipment(tech.id).map((row) => ({ tech, ...row })));

  return (
    <div className="kd-list kd-stock-register">
      <div className="kd-stock-summary" aria-label="Сводка склада">
        <div><span>Препаратов</span><strong>{inventory.length}</strong></div>
        <div><span>Стоимость остатков</span><strong>{fmt(totalStockValue)} ₸</strong></div>
        <div><span>Требуют внимания</span><strong className={inventory.some((item) => item.low || item.orderSoon) ? "danger" : ""}>{inventory.filter((item) => item.low || item.orderSoon).length}</strong></div>
        <div><span>Оборудование у сотрудников</span><strong>{fmt(totalEquipValue)} ₸</strong></div>
      </div>

      <section className="kd-stock-panel" aria-labelledby="stock-register-title">
        <div className="kd-stock-toolbar">
          <div>
            <h2 id="stock-register-title">Остатки препаратов</h2>
            <p>Одна строка — один препарат. Нажмите на строку, чтобы увидеть весь путь и места хранения.</p>
          </div>
          <div className="kd-stock-filters">
            <label className="kd-stock-search"><Search size={15} /><span className="sr-only">Найти препарат</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти препарат" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Фильтр по состоянию остатка">
              <option value="all">Все состояния</option><option value="low">Мало</option><option value="order">Пора заказать</option>
            </select>
          </div>
        </div>
        {inventory.length === 0 ? <div className="kd-empty">Склад пуст. Добавьте первый препарат кнопкой «+ Препарат».</div> : (
          <div className="kd-stock-table-wrap">
            <table className="kd-stock-table">
              <thead><tr><th>Препарат</th><th>Основной склад</th><th>У сотрудников</th><th>Всего</th><th>Расход / мес.</th><th>Стоимость</th><th>Состояние</th><th aria-label="Открыть" /></tr></thead>
              <tbody>
                {visibleRows.map((item) => (
                  <tr key={item.id} className={String(selectedId) === String(item.id) ? "selected" : ""}>
                    <td><button className="kd-stock-name" onClick={() => onSelect(item.id)} aria-expanded={String(selectedId) === String(item.id)}><Package size={15} /><span><strong>{item.name}</strong><small>{fmt(item.price_per_liter)} ₸/{chemUnit(item.unit_kind).big}</small></span></button></td>
                    <td>{fmtAmount(item.warehouseBalance, item.unit_kind)}</td>
                    <td>{fmtAmount(item.withEmployees, item.unit_kind)}<small>{item.employeeRows.filter((row) => Number(row.balance) !== 0).length ? `у ${item.employeeRows.filter((row) => Number(row.balance) !== 0).length} чел.` : "не выдан"}</small></td>
                    <td><strong>{fmtAmount(item.remaining, item.unit_kind)}</strong></td>
                    <td>{item.forecast?.perMonth ? fmtAmount(Math.round(item.forecast.perMonth), item.unit_kind) : "—"}</td>
                    <td>{fmt(item.stockValue)} ₸</td>
                    <td><StockStatus item={item} /></td>
                    <td><button className="kd-stock-open" onClick={() => onSelect(item.id)} aria-label={`Открыть ${item.name}`}><ArrowRight size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length === 0 && <div className="kd-empty compact">По этому фильтру препаратов нет.</div>}
          </div>
        )}
      </section>

      {selected && (
        <section className="kd-stock-detail" aria-labelledby="stock-detail-title">
          <header>
            <div>
              <div className="kd-stock-detail-title"><h2 id="stock-detail-title">{selected.name}</h2><StockStatus item={selected} /></div>
              <p>Общий остаток {fmtAmount(selected.remaining, selected.unit_kind)} · {fmt(selected.stockValue)} ₸</p>
            </div>
            {canEditStock && <div className="kd-actions"><button className="kd-btn primary sm" onClick={() => onStockIn(selected)}><ArrowDownCircle size={14} />Оформить приход</button><button className="kd-btn ghost danger sm" onClick={() => onRemoveChem(selected)}><Trash2 size={13} />Удалить</button></div>}
          </header>
          <nav className="kd-stock-detail-tabs" aria-label="Разделы карточки препарата">
            {[["locations", "Где находится"], ["moves", `Движение · ${movements.length}`], ["purchases", `Закупки и партии · ${selectedPurchases.length}`]].map(([id, label]) => <button key={id} className={detailTab === id ? "on" : ""} onClick={() => setDetailTab(id)}>{label}</button>)}
          </nav>

          {detailTab === "locations" && <div className="kd-stock-locations">
            <div className="kd-stock-location-row warehouse"><span className="kd-location-icon"><Package size={16} /></span><span><strong>Основной склад</strong><small>Доступно для выдачи сотрудникам</small></span><strong>{fmtAmount(selected.warehouseBalance, selected.unit_kind)}</strong>{canEditStock && <button className="kd-btn ghost sm" onClick={() => onStockIn(selected)}><Plus size={13} />Приход</button>}</div>
            {selected.employeeRows.filter((row) => Number(row.balance) !== 0 || Number(row.received) !== 0).map((row) => <div className="kd-stock-location-row" key={row.tech.id}>
              <span className="kd-location-icon"><UserRound size={16} /></span><span><strong>{row.tech.full_name || "Без имени"}</strong><small>Получено {fmtAmount(row.received, selected.unit_kind)} · расход {fmtAmount(row.consumed, selected.unit_kind)}</small></span><strong className={row.balance < 0 ? "danger" : ""}>{fmtAmount(row.balance, selected.unit_kind)}</strong>{canEditStock && <span className="kd-location-actions"><button className="kd-btn ghost sm" onClick={() => onHandout(row.tech)}>Выдать</button><button className="kd-btn ghost sm" onClick={() => onMovement(row.tech)}><ClipboardCheck size={13} />Движение</button></span>}
            </div>)}
            {selected.employeeRows.every((row) => Number(row.balance) === 0 && Number(row.received) === 0) && <div className="kd-empty compact">У сотрудников этого препарата нет.</div>}
          </div>}

          {detailTab === "moves" && <div className="kd-stock-table-wrap">
            <table className="kd-stock-table kd-movement-table"><thead><tr><th>Дата</th><th>Операция</th><th>Откуда</th><th>Куда</th><th>Количество</th><th>Основание</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td>{isoToRu(row.date) || "—"}</td><td><span className="kd-movement-kind">{row.amount >= 0 ? <ArrowDownCircle size={13} /> : row.kind === "Передача" ? <ArrowRightLeft size={13} /> : <ArrowUpCircle size={13} />}{row.kind}</span></td><td>{row.from}</td><td>{row.to}</td><td><strong className={row.amount < 0 ? "danger" : "positive"}>{row.amount > 0 ? "+" : ""}{fmtAmount(row.amount, selected.unit_kind)}</strong></td><td><span className="kd-table-note">{row.note || "—"}</span></td></tr>)}</tbody></table>
            {movements.length === 0 && <div className="kd-empty compact">Движений по препарату ещё нет.</div>}
          </div>}

          {detailTab === "purchases" && <div className="kd-stock-table-wrap">
            <table className="kd-stock-table"><thead><tr><th>Дата прихода</th><th>Поставщик</th><th>Партия</th><th>Срок годности</th><th>Количество</th><th>Цена</th><th>Осталось по FIFO</th></tr></thead><tbody>{selectedPurchases.map((row) => {
              const batch = selected.batches.find((item) => String(item.purchase.id) === String(row.id));
              const expiry = row.expires_on ? calc.docStatus({ expires_on: row.expires_on }) : null;
              return <tr key={row.id}><td>{isoToRu(row.purchase_date)}</td><td>{row.supplier || "Не указан"}</td><td>{row.batch_no || "—"}</td><td><span className={expiry?.state === "expired" ? "danger" : expiry?.state === "soon" ? "warning-text" : ""}>{row.expires_on ? isoToRu(row.expires_on) : "Не указан"}</span></td><td>{fmtAmount(row.amount, selected.unit_kind)}</td><td>{row.price_per_liter != null ? `${fmt(row.price_per_liter)} ₸` : "—"}</td><td><strong>{fmtAmount(batch?.remaining || 0, selected.unit_kind)}</strong></td></tr>;
            })}</tbody></table>
            {selectedPurchases.length === 0 && <div className="kd-empty compact">История закупок пока пуста.</div>}
          </div>}
        </section>
      )}

      <section className="kd-stock-panel" aria-labelledby="equipment-register-title">
        <div className="kd-stock-toolbar"><div><h2 id="equipment-register-title">Оборудование и СИЗ</h2><p>Компактный реестр имущества и ответственных сотрудников.</p></div>{canManageTeam && <div className="kd-stock-equip-actions"><select value={equipmentTechId} onChange={(event) => setEquipmentTechId(event.target.value)} aria-label="Сотрудник для выдачи оборудования"><option value="">Выбрать сотрудника</option>{techs.map((tech) => <option value={tech.id} key={tech.id}>{tech.full_name || "Без имени"}</option>)}</select><button className="kd-btn ghost sm" disabled={!equipmentTechId} onClick={() => onIssueEquipment(techs.find((tech) => String(tech.id) === String(equipmentTechId)))}><UserRound size={13} />Выдать</button><button className="kd-btn primary sm" onClick={onAddEquipment}><Plus size={14} />Позиция</button></div>}</div>
        {equipment.length === 0 ? <div className="kd-empty compact">Оборудование ещё не заведено.</div> : <div className="kd-stock-table-wrap"><table className="kd-stock-table"><thead><tr><th>Позиция</th><th>Категория</th><th>Единица</th><th>Цена</th><th>У сотрудников</th><th>Стоимость</th><th /></tr></thead><tbody>{equipment.map((item) => { const issued = equipIssuedQty(item.id); return <tr key={item.id}><td><strong>{item.name}</strong></td><td>{EQUIP_CATEGORIES[item.category] || item.category}</td><td>{item.unit}</td><td>{fmt(item.price)} ₸</td><td>{issued} {item.unit}</td><td>{fmt(issued * (Number(item.price) || 0))} ₸</td><td>{canManageTeam && <span className="kd-location-actions"><button className="kd-btn ghost sm" onClick={() => onEditEquipment(item)}>Изменить</button><button className="kd-btn ghost danger sm" onClick={() => onRemoveEquipment(item)}><Trash2 size={13} /></button></span>}</td></tr>; })}</tbody></table></div>}
        <div className="kd-stock-subhead">Где находится оборудование</div>
        {equipmentAtEmployees.length === 0 ? <div className="kd-empty compact">На руках у сотрудников оборудования нет.</div> : <div className="kd-stock-table-wrap"><table className="kd-stock-table"><thead><tr><th>Сотрудник</th><th>Позиция</th><th>Количество</th><th>Выдано</th><th>Стоимость</th><th /></tr></thead><tbody>{equipmentAtEmployees.map((row) => <tr key={row.handout.id}><td><strong>{row.tech.full_name || "Без имени"}</strong></td><td>{row.equip.name}{row.handout.note ? <small>{row.handout.note}</small> : null}</td><td>{row.handout.qty} {row.equip.unit}</td><td>{isoToRu(row.handout.handout_date) || "—"}</td><td>{fmt((Number(row.handout.qty) || 0) * (Number(row.equip.price) || 0))} ₸</td><td>{canManageTeam && <span className="kd-location-actions"><button className="kd-btn ghost sm" onClick={() => onTransferEquipment(row.handout)}>Передать</button><button className="kd-btn ghost sm" onClick={() => onEquipStatus(row.handout, "returned")}>Возврат</button><button className="kd-btn ghost danger sm" onClick={() => onEquipStatus(row.handout, "broken")}>Сломано</button></span>}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

export default StockRegister;
