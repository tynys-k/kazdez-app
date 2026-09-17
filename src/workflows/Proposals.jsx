// Раздел «КП»: список коммерческих предложений и редактор с живым
// предпросмотром документа.
//
// Главная мысль экрана: менеджер не верстает КП, он отвечает на вопросы
// «кому», «что» и «сколько». Всё остальное — тексты сегмента, реквизиты,
// лицензии, номер — подставляется. Справа при этом сразу видно страницу,
// которую получит клиент: без предпросмотра правки делались наугад, и
// ошибку замечали уже в отправленном файле.

import React, { useMemo, useRef, useState } from "react";
import { Plus, Printer, Copy, Trash2, Search, FileText, Wand2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fmt, isoToRu } from "../shared";
import { canonicalPestOptions } from "../pestNormalization";
import {
  PROPOSAL_SEGMENTS, PROPOSAL_STATUS, applyPreset, blankItem, blankProposal,
  duplicateProposal, isExpired, itemAmount, nextProposalNumber, prefillFromClient,
  prefillFromObject, proposalCompany, proposalFunnel, proposalIssues, proposalTotal,
  segmentForObjectKind, applyPriceSuggestion, validUntil,
} from "../proposals";
import { proposalFileName, proposalHtml } from "../proposalHtml";
import "./proposals.css";

const today = () => new Date().toLocaleDateString("en-CA");

// Многострочное поле ↔ список строк. Для менеджера это привычный текст с
// переносами, для документа — отдельные пункты списка.
const linesToText = (items = []) => items.join("\n");
const textToLines = (text) => String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
// «Заголовок | текст» — так карточка преимущества правится в одном поле,
// без отдельной формы на каждый пункт.
const cardsToText = (items = []) => items.map((item) => `${item.title || ""} | ${item.text || ""}`).join("\n");
const textToCards = (text) => textToLines(text).map((line) => {
  const [title, ...rest] = line.split("|");
  return { title: title.trim(), text: rest.join("|").trim() };
});

function SectionToggle({ label, section, onChange, children }) {
  const on = section?.on !== false;
  return (
    <div className={`pr-section ${on ? "" : "off"}`}>
      <label className="pr-switch">
        <input type="checkbox" checked={on} onChange={(e) => onChange({ ...section, on: e.target.checked })} />
        <span>{label}</span>
      </label>
      {on && children}
    </div>
  );
}

export default function Proposals({
  proposals = [], clients = [], clientContacts = [], objects = [], leads = [],
  priceList = [], pestTypes = [], settings = {}, branches = [],
  canEdit = false, isAdmin = false, userName = "", onReload = () => {},
}) {
  const [draft, setDraft] = useState(null);       // открытое КП: черновик формы
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [priceSeed, setPriceSeed] = useState({ pest: "", area: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(null);
  const frame = useRef(null);

  const company = useMemo(() => ({
    ...proposalCompany(settings),
    company_stamp: settings.company_stamp || "",
    company_signature: settings.company_signature || "",
  }), [settings]);

  const branchCode = draft?.branch_code
    || (branches.find((b) => b.is_default)?.code)
    || "ALA";

  // Номер показываем ещё в черновике: менеджер диктует его клиенту по
  // телефону до отправки файла. Окончательный номер выдаёт база.
  const previewNumber = editingId
    ? (proposals.find((p) => p.id === editingId)?.number || "")
    : nextProposalNumber(proposals, Number(String(draft?.issue_date || today()).slice(0, 4)), branchCode);

  const previewDoc = useMemo(() => {
    if (!draft) return "";
    return proposalHtml({ ...draft, number: previewNumber, total: proposalTotal(draft.items) }, company);
  }, [draft, previewNumber, company]);

  const funnel = useMemo(() => proposalFunnel(proposals), [proposals]);
  const pestOptions = useMemo(() => canonicalPestOptions(pestTypes, priceSeed.pest), [pestTypes, priceSeed.pest]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    return proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!needle) return true;
      return [p.number, p.client_title, p.recipient, p.subject, p.object_address]
        .some((field) => String(field || "").toLocaleLowerCase("ru-RU").includes(needle));
    });
  }, [proposals, statusFilter, search]);

  const clientMatches = useMemo(() => {
    const needle = clientQuery.trim().toLocaleLowerCase("ru-RU");
    if (needle.length < 2) return [];
    return clients.filter((c) => [c.legal_name, c.name, c.phone, c.bin_iin]
      .some((field) => String(field || "").toLocaleLowerCase("ru-RU").includes(needle))).slice(0, 6);
  }, [clients, clientQuery]);

  const clientObjects = useMemo(() => {
    if (!draft?.client_id) return objects.slice(0, 30);
    // Объекты клиента вычисляются по адресам из его карточки: отдельной
    // связи «клиент → объект» в базе нет, а адреса есть.
    const addresses = leads.filter((l) => l.client_id === draft.client_id).map((l) => l.address);
    const own = objects.filter((o) => addresses.some((a) => String(a || "").trim() && o.address.includes(String(a).trim())));
    return own.length ? own : objects.slice(0, 30);
  }, [objects, leads, draft?.client_id]);

  function startNew(seed = {}) {
    setError("");
    setEditingId(null);
    setRequestId(crypto.randomUUID());
    setDraft({ ...blankProposal({ branch_code: branchCode, ...seed }) });
    setClientQuery("");
  }

  // Запись из базы → черновик формы. Блоки у старых КП могут быть пустым
  // объектом: тогда берём набор блоков сегмента, иначе форма покажет
  // выключенными разделы, которых в записи просто нет.
  function toDraft(proposal) {
    const fallback = blankProposal({ segment: proposal.segment });
    const sections = proposal.sections && Object.keys(proposal.sections).length ? proposal.sections : fallback.sections;
    return {
      ...proposal,
      object_area: proposal.object_area ?? "",
      items: (proposal.items || []).map((item) => blankItem(item)),
      sections,
    };
  }

  function openExisting(proposal) {
    setError("");
    setEditingId(proposal.id);
    setRequestId(null);
    setDraft(toDraft(proposal));
    setClientQuery("");
  }

  // Повтор КП для постоянной фирмы: та же структура, цены и тексты, новая
  // дата. Номер выдаст база при сохранении.
  function repeat(proposal) {
    setError("");
    setEditingId(null);
    setRequestId(crypto.randomUUID());
    setDraft(toDraft(duplicateProposal(proposal, today())));
    setClientQuery("");
  }

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const patchSection = (key, value) => setDraft((current) => ({ ...current, sections: { ...current.sections, [key]: value } }));
  const patchItem = (id, changes) => setDraft((current) => ({
    ...current,
    items: current.items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  }));

  function addPriceRow() {
    const areaValue = priceSeed.area || draft.object_area;
    const seed = blankItem({ name: priceSeed.pest ? `Обработка от «${priceSeed.pest}»` : "" });
    const row = applyPriceSuggestion(seed, priceSeed.pest, areaValue, priceList);
    setDraft((current) => ({ ...current, items: [...current.items, row] }));
    // Молча добавить строку с нулём — худший вариант: КП уйдёт с нулевой
    // ценой. Говорим прямо, что в прайсе такой строки нет.
    setError(row === seed && priceSeed.pest
      ? `В прайсе нет цены для «${priceSeed.pest}»${areaValue ? ` на ${areaValue} м²` : ""}. Впишите сумму руками или добавьте строку в прайс.`
      : "");
  }

  async function save() {
    if (saving || !draft) return;
    setError(""); setSaving(true);
    const payload = {
      style: draft.style, segment: draft.segment, issue_date: draft.issue_date,
      client_id: draft.client_id, lead_id: draft.lead_id, object_id: draft.object_id,
      recipient: draft.recipient, client_title: draft.client_title, client_bin: draft.client_bin,
      city: draft.city, object_label: draft.object_label, object_address: draft.object_address,
      object_area: draft.object_area === "" ? null : Number(draft.object_area),
      subject: draft.subject, intro: draft.intro,
      items: draft.items, sections: draft.sections,
      total: proposalTotal(draft.items),
      validity_days: Number(draft.validity_days) || 30,
      payment_terms: draft.payment_terms,
      status: draft.status || "draft",
    };

    if (editingId) {
      const { error: requestError } = await supabase.from("proposals").update({
        ...payload,
        sent_at: payload.status !== "draft" ? (draft.sent_at || new Date().toISOString()) : null,
        decided_at: ["accepted", "declined"].includes(payload.status) ? (draft.decided_at || new Date().toISOString()) : null,
        decline_reason: payload.status === "declined" ? (draft.decline_reason || null) : null,
      }).eq("id", editingId);
      setSaving(false);
      if (requestError) { setError(requestError.message); return; }
      onReload();
      return;
    }

    const { data, error: requestError } = await supabase.rpc("create_proposal", {
      p_request_id: requestId,
      p_branch_code: branchCode,
      p_payload: { ...payload, total: String(payload.total), author_name: userName || null },
    });
    setSaving(false);
    if (requestError) {
      setError(requestError.code === "PGRST202"
        ? "Сначала выполните SQL 2026-09-17_proposals.sql в базе."
        : requestError.message);
      return;
    }
    setEditingId(data);
    setRequestId(null);
    onReload();
  }

  // Печать идёт из того же кадра, что показан на экране: печатать
  // отдельно собранный документ — верный способ однажды отправить
  // клиенту не то, что видел менеджер.
  function printDoc() {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  async function removeProposal(proposal) {
    if (!isAdmin) return;
    if (!window.confirm(`Удалить ${proposal.number}? Отменить это нельзя.`)) return;
    const { error: requestError } = await supabase.from("proposals").delete().eq("id", proposal.id);
    if (requestError) { setError(requestError.message); return; }
    if (editingId === proposal.id) { setDraft(null); setEditingId(null); }
    onReload();
  }

  const issues = draft ? proposalIssues(draft) : [];

  return <div className="proposals">
    <div className="kd-tabbar" style={{ marginBottom: 14 }}>
      <div>
        <div className="kd-title" style={{ fontSize: 18 }}>Коммерческие предложения</div>
        <div className="kd-muted">Реквизиты — из карточки клиента, цены — из прайса, номер выдаёт база.</div>
      </div>
      {canEdit && <button className="kd-btn primary" onClick={() => startNew()}><Plus size={15} />Новое КП</button>}
    </div>

    <div className="kd-card pr-funnel">
      <button type="button" onClick={() => setStatusFilter("draft")}><span>Черновики</span><strong>{funnel.drafts}</strong></button>
      <button type="button" onClick={() => setStatusFilter("sent")}><span>Ждут ответа</span><strong>{funnel.waiting}</strong></button>
      <button type="button" onClick={() => setStatusFilter("accepted")}><span>Согласовано</span><strong>{funnel.accepted}</strong><small>{fmt(funnel.acceptedAmount)} ₸</small></button>
      <button type="button" onClick={() => setStatusFilter("declined")}><span>Отказ</span><strong>{funnel.declined}</strong></button>
      <button type="button" onClick={() => setStatusFilter("all")}><span>Конверсия</span><strong>{funnel.conversion}%</strong><small>из {funnel.sent} отправленных</small></button>
    </div>

    {error && <div className="kd-flag danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

    {draft ? (
      <div className="pr-editor">
        <div className="pr-form">
          <div className="kd-tabbar">
            <div><div className="kd-title" style={{ fontSize: 16 }}>{editingId ? previewNumber : `Новое КП · ${previewNumber}`}</div>
              <div className="kd-muted">{editingId ? "Правки сохраняются по кнопке" : "Номер закрепится при сохранении"}</div></div>
            <button className="kd-btn ghost sm" onClick={() => { setDraft(null); setEditingId(null); }}>Закрыть</button>
          </div>

          <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Оформление</div>
            <div className="pr-styles">
              {[["sales", "Продающее", "Бизнес, ЖК, ОСИ, склады"], ["official", "Официальное", "Госструктуры, больницы, тендеры"]].map(([code, label, hint]) => (
                // Подпись директора и М.П. — принадлежность официального
                // бланка: в продающем КП её не ставят, а в официальном без
                // неё документ не принимают. Поэтому переключатель стиля
                // ведёт этот блок за собой.
                <button key={code} type="button" className={draft.style === code ? "on" : ""}
                  onClick={() => setDraft((current) => ({
                    ...current, style: code,
                    sections: { ...current.sections, signature: { ...current.sections.signature, on: code === "official" } },
                  }))}>
                  <strong>{label}</strong><span>{hint}</span>
                </button>
              ))}
            </div>
            <label>Сегмент клиента — от него зависят тексты КП
              <select value={draft.segment} onChange={(e) => setDraft(applyPreset(draft, e.target.value))}>
                {PROPOSAL_SEGMENTS.map((s) => <option key={s.code} value={s.code}>{s.label} — {s.hint}</option>)}
              </select>
            </label>
            <label>Услуга в заголовке<input value={draft.subject} onChange={(e) => patch({ subject: e.target.value })} /></label>
            <div className="kd-formgrid">
              <label>Дата КП<input type="date" value={draft.issue_date} onChange={(e) => patch({ issue_date: e.target.value })} /></label>
              <label>Срок действия, дней<input type="number" min="1" max="365" value={draft.validity_days} onChange={(e) => patch({ validity_days: e.target.value })} /></label>
            </div>
            <div className="kd-muted">Действительно до {isoToRu(validUntil(draft.issue_date, draft.validity_days))}.</div>
          </div>

          <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Кому</div>
            <label>Найти клиента в справочнике
              <span className="pr-search"><Search size={14} />
                <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Название, БИН или телефон" />
              </span>
            </label>
            {clientMatches.length > 0 && <div className="pr-matches">
              {clientMatches.map((c) => <button key={c.id} type="button" onClick={() => {
                setDraft((current) => prefillFromClient(current, c, clientContacts));
                setClientQuery("");
              }}>
                <strong>{c.legal_name || c.name || "Без названия"}</strong>
                <span>{[c.bin_iin && `БИН ${c.bin_iin}`, c.phone].filter(Boolean).join(" · ")}</span>
              </button>)}
            </div>}
            <label>Обращение («Кому»)<input value={draft.recipient || ""} onChange={(e) => patch({ recipient: e.target.value })} /></label>
            <div className="kd-formgrid">
              <label>Заказчик (как в документах)<input value={draft.client_title || ""} onChange={(e) => patch({ client_title: e.target.value })} /></label>
              <label>БИН заказчика<input value={draft.client_bin || ""} onChange={(e) => patch({ client_bin: e.target.value })} /></label>
            </div>
          </div>

          <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Объект</div>
            <label>Взять объект из базы
              <select value={draft.object_id || ""} onChange={(e) => {
                const object = objects.find((o) => o.id === e.target.value);
                setDraft((current) => {
                  const next = prefillFromObject(current, object);
                  const segment = segmentForObjectKind(object?.kind);
                  return segment !== "custom" && current.segment === "custom" ? applyPreset(next, segment) : next;
                });
              }}>
                <option value="">Не выбран — вписать руками</option>
                {clientObjects.map((o) => <option key={o.id} value={o.id}>{o.address}{o.area ? ` · ${o.area} м²` : ""}</option>)}
              </select>
            </label>
            <div className="kd-formgrid">
              <label>Объект (как назвать в КП)<input value={draft.object_label || ""} onChange={(e) => patch({ object_label: e.target.value })} /></label>
              <label>Город<input value={draft.city || ""} onChange={(e) => patch({ city: e.target.value })} /></label>
              <label>Адрес<input value={draft.object_address || ""} onChange={(e) => patch({ object_address: e.target.value })} /></label>
              <label>Площадь, м²<input inputMode="decimal" value={draft.object_area} onChange={(e) => patch({ object_area: e.target.value })} /></label>
            </div>
          </div>

          <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Вступление</div>
            <textarea rows={6} value={draft.intro || ""} onChange={(e) => patch({ intro: e.target.value })}
              placeholder="Абзац, с которого клиент начинает читать. Пустая строка — новый абзац." />
          </div>

          <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Стоимость</div>
            <div className="kd-muted" style={{ marginBottom: 8 }}>
              «Сумма целиком» — когда клиенту называется готовая цена. «Цена × количество» — когда в КП надо
              показать расчёт: 46 контейнеров × 3 000 ₸. Последнее поле — сколько обработок в год: при 4 в таблице
              появятся цена одной обработки и сумма за год.
            </div>
            <div className="pr-fromprice">
              <select value={priceSeed.pest} onChange={(e) => setPriceSeed({ ...priceSeed, pest: e.target.value })}>
                <option value="">Вид работ из прайса…</option>
                {pestOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <input inputMode="decimal" placeholder="площадь" value={priceSeed.area} onChange={(e) => setPriceSeed({ ...priceSeed, area: e.target.value })} />
              <button type="button" className="kd-btn ghost sm" onClick={addPriceRow} disabled={!priceSeed.pest}><Wand2 size={14} />Из прайса</button>
              <button type="button" className="kd-btn ghost sm" onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })}><Plus size={14} />Строка</button>
            </div>
            {draft.items.map((item) => (
              <div className="pr-item" key={item.id}>
                <input className="pr-item-name" value={item.name} placeholder="Наименование услуги" onChange={(e) => patchItem(item.id, { name: e.target.value })} />
                <input className="pr-item-note" value={item.note} placeholder="Пояснение под названием — что именно делаем" onChange={(e) => patchItem(item.id, { note: e.target.value })} />
                <div className="pr-item-nums">
                  <select value={item.mode} onChange={(e) => patchItem(item.id, { mode: e.target.value })}>
                    <option value="flat">Сумма целиком</option>
                    <option value="unit">Цена × количество</option>
                  </select>
                  <input placeholder="объём (3 900 м²)" value={item.volume} onChange={(e) => patchItem(item.id, { volume: e.target.value })} />
                  {item.mode === "unit" ? <>
                    <input inputMode="decimal" placeholder="кол-во" value={item.qty} onChange={(e) => patchItem(item.id, { qty: e.target.value })} />
                    <input inputMode="decimal" placeholder="цена за ед." value={item.unit_price} onChange={(e) => patchItem(item.id, { unit_price: e.target.value })} />
                  </> : (
                    <input inputMode="decimal" placeholder="сумма, ₸" value={item.amount} onChange={(e) => patchItem(item.id, { amount: e.target.value })} />
                  )}
                  <input inputMode="numeric" title="Кратность обработок" placeholder="обр./год" value={item.times} onChange={(e) => patchItem(item.id, { times: e.target.value })} />
                  <strong>{fmt(itemAmount(item))} ₸</strong>
                  <button type="button" className="kd-btn ghost sm danger" onClick={() => setDraft({ ...draft, items: draft.items.filter((i) => i.id !== item.id) })}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <div className="pr-total"><span>Итого</span><strong>{fmt(proposalTotal(draft.items))} ₸</strong></div>
            <label>Условия оплаты<input value={draft.payment_terms || ""} onChange={(e) => patch({ payment_terms: e.target.value })} /></label>
          </div>

          <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Блоки документа</div>
            <div className="kd-muted" style={{ marginBottom: 8 }}>Выключенный блок не печатается. Каждая строка — отдельный пункт.</div>

            <SectionToggle label="Риски: чем это заканчивается" section={draft.sections.risks} onChange={(v) => patchSection("risks", v)}>
              <textarea rows={4} value={linesToText(draft.sections.risks?.items)} onChange={(e) => patchSection("risks", { ...draft.sections.risks, items: textToLines(e.target.value) })} />
            </SectionToggle>

            <SectionToggle label="Почему выбирают нас" section={draft.sections.advantages} onChange={(v) => patchSection("advantages", v)}>
              <textarea rows={5} value={cardsToText(draft.sections.advantages?.items)} onChange={(e) => patchSection("advantages", { ...draft.sections.advantages, items: textToCards(e.target.value) })} />
              <div className="kd-muted">Формат строки: <code>Заголовок | текст карточки</code></div>
            </SectionToggle>

            <SectionToggle label="Что входит в стоимость" section={draft.sections.included} onChange={(v) => patchSection("included", v)}>
              <textarea rows={5} value={linesToText(draft.sections.included?.items)} onChange={(e) => patchSection("included", { ...draft.sections.included, items: textToLines(e.target.value) })} />
            </SectionToggle>

            <SectionToggle label="Документы, которые получает клиент" section={draft.sections.documents} onChange={(v) => patchSection("documents", v)}>
              <textarea rows={4} value={linesToText(draft.sections.documents?.items)} onChange={(e) => patchSection("documents", { ...draft.sections.documents, items: textToLines(e.target.value) })} />
            </SectionToggle>

            <SectionToggle label="Гарантии" section={draft.sections.guarantees} onChange={(v) => patchSection("guarantees", v)}>
              <textarea rows={3} value={linesToText(draft.sections.guarantees?.items)} onChange={(e) => patchSection("guarantees", { ...draft.sections.guarantees, items: textToLines(e.target.value) })} />
            </SectionToggle>

            <SectionToggle label="Условия сотрудничества" section={draft.sections.conditions} onChange={(v) => patchSection("conditions", v)}>
              <textarea rows={3} value={linesToText(draft.sections.conditions?.items)} onChange={(e) => patchSection("conditions", { ...draft.sections.conditions, items: textToLines(e.target.value) })} />
            </SectionToggle>

            <SectionToggle label="Рекомендации на время обработки" section={draft.sections.recommendations} onChange={(v) => patchSection("recommendations", v)}>
              <textarea rows={4} value={linesToText(draft.sections.recommendations?.items)} onChange={(e) => patchSection("recommendations", { ...draft.sections.recommendations, items: textToLines(e.target.value) })} />
            </SectionToggle>

            <SectionToggle label="Лицензии и членство в СРО" section={draft.sections.licenses} onChange={(v) => patchSection("licenses", v)}>
              <div className="kd-muted">Номера и органы выдачи берутся из Настроек → Реквизиты компании.</div>
            </SectionToggle>

            <SectionToggle label="Призыв к действию" section={draft.sections.cta} onChange={(v) => patchSection("cta", v)}>
              <input value={draft.sections.cta?.title || ""} placeholder="Заголовок" onChange={(e) => patchSection("cta", { ...draft.sections.cta, title: e.target.value })} />
              <textarea rows={3} value={draft.sections.cta?.text || ""} placeholder="Что сделать клиенту" onChange={(e) => patchSection("cta", { ...draft.sections.cta, text: e.target.value })} />
            </SectionToggle>

            <SectionToggle label="Подпись директора и М.П." section={draft.sections.signature} onChange={(v) => patchSection("signature", v)}>
              <div className="kd-muted">Печать и подпись — картинки из Настроек. Если их нет, останется строка для ручной подписи.</div>
            </SectionToggle>
          </div>

          {editingId && <div className="pr-group">
            <div className="kd-section" style={{ marginTop: 0 }}>Что с этим КП</div>
            <label>Статус
              <select value={draft.status} onChange={(e) => patch({ status: e.target.value })}>
                {Object.entries(PROPOSAL_STATUS).map(([code, meta]) => <option key={code} value={code}>{meta.label}</option>)}
              </select>
            </label>
            {draft.status === "declined" && <label>Причина отказа<input value={draft.decline_reason || ""} onChange={(e) => patch({ decline_reason: e.target.value })} placeholder="Дорого, выбрали другого, отложили" /></label>}
          </div>}

          {issues.length > 0 && <div className="kd-flag warn" style={{ marginBottom: 10 }}>
            {issues.map((text) => <div key={text}>{text}</div>)}
          </div>}

          <div className="kd-actions pr-actions">
            {canEdit && <button className="kd-btn primary" onClick={save} disabled={saving}>{editingId ? "Сохранить" : "Создать и закрепить номер"}</button>}
            <button className="kd-btn ghost" onClick={printDoc}><Printer size={15} />Скачать PDF</button>
            {editingId && canEdit && <button className="kd-btn ghost" onClick={() => repeat({ ...draft, id: undefined })}><Copy size={15} />Дублировать</button>}
          </div>
          <div className="kd-muted">PDF: в диалоге печати выберите принтер «Сохранить как PDF». Имя файла — {proposalFileName({ ...draft, number: previewNumber })}.</div>
        </div>

        <div className="pr-preview">
          <div className="pr-preview-head">Так КП увидит клиент</div>
          <iframe ref={frame} title="Предпросмотр КП" srcDoc={previewDoc} />
        </div>
      </div>
    ) : (
      <>
        <div className="pr-filters">
          <span className="pr-search"><Search size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Номер, клиент, объект" />
          </span>
          {[["all", "Все"], ...Object.entries(PROPOSAL_STATUS).map(([code, meta]) => [code, meta.label])].map(([code, label]) => (
            <button key={code} type="button" className={`kd-chip ${statusFilter === code ? "on" : ""}`} onClick={() => setStatusFilter(code)}>{label}</button>
          ))}
        </div>

        <div className="kd-list">
          {visible.length === 0 && <div className="kd-empty">
            {proposals.length ? "По этому фильтру КП нет." : "КП ещё не создавали. Нажмите «Новое КП» — реквизиты и тексты подставятся, останется указать цены."}
          </div>}
          {visible.map((proposal) => {
            const meta = PROPOSAL_STATUS[proposal.status] || PROPOSAL_STATUS.draft;
            const expired = isExpired(proposal);
            return <div className="kd-card pr-row" key={proposal.id}>
              <button type="button" className="pr-row-main" onClick={() => openExisting(proposal)}>
                <div className="pr-row-head">
                  <strong><FileText size={14} />{proposal.number}</strong>
                  <span className="kd-badge" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                  {expired && <span className="kd-badge" style={{ color: "#B4650B", background: "#FBEDD9" }}>срок истёк</span>}
                </div>
                <div className="pr-row-title">{proposal.client_title || proposal.recipient || "Без заказчика"}</div>
                <div className="kd-meta">
                  <span>{isoToRu(proposal.issue_date)}</span>
                  <span>· {proposal.subject}</span>
                  {proposal.object_address && <span>· {proposal.object_address}</span>}
                  {proposal.author_name && <span>· {proposal.author_name}</span>}
                </div>
              </button>
              <div className="pr-row-side">
                <strong>{fmt(proposal.total)} ₸</strong>
                {canEdit && <button className="kd-btn ghost sm" title="Сделать такое же КП с новой датой" onClick={() => repeat(proposal)}><Copy size={13} />Повторить</button>}
                {isAdmin && <button className="kd-btn ghost sm danger" onClick={() => removeProposal(proposal)}><Trash2 size={13} /></button>}
              </div>
            </div>;
          })}
        </div>
      </>
    )}
  </div>;
}
