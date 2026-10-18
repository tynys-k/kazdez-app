import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, ExternalLink, ImagePlus, Plus, Target, Trash2 } from "lucide-react";
import { fmt } from "../shared";
import { PLATFORM_LABELS, PROMOTION_LABELS } from "./adsIntelligenceModel";
import { buildOlxReport, olxIdFromUrl, planOlxBudget, promotionEndDate, summarizeOlxReport } from "./olxAdsModel";
import "./adsIntelligence.css";

const today = () => new Date().toISOString().slice(0, 10);
const monthRange = (offset = 0) => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset + 1, 0));
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
};
const ru = (date) => date ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : "—";
const hour = (value) => value == null || value === "" ? "" : `${String(value).padStart(2, "0")}:00`;
const COUNTERS = [["views", "Просмотры"], ["favorites", "Избранное"], ["phone_views", "Телефон"]];
const FILTERS = [["all", "Все"], ["paid", "С рекламой"], ["free", "Без рекламы"], ["nodata", "Нет замеров"]];
const blankPromo = () => ({ asset_id: "", promotion_type: "top_30", started_on: today(), ended_on: promotionEndDate(today(), "top_30"), activated_hour: "", cost: "" });
const blankAsset = () => ({ account_id: "", name: "", landing_url: "", external_id: "" });

// Картинку из OLX приводим к 800px JPEG: на 50 объявлений превью грузятся
// быстро, а различить креативы этого хватает.
async function shrinkImage(file, maxSide = 800, quality = 0.8) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return out || file;
  } catch { return file; }
}

function ImagePicker({ file, previewUrl, onFile }) {
  const local = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  const shown = local || previewUrl;
  const pick = (candidate) => { if (candidate && candidate.type.startsWith("image/")) onFile(candidate); };
  return <label className="kd-ads-image-pick" tabIndex={0} onPaste={(event) => pick(event.clipboardData?.files?.[0])}>
    {shown ? <img src={shown} alt="" /> : <ImagePlus size={22} />}
    <span>{shown ? "Заменить: файл или Ctrl+V" : "Картинка объявления: файл или скрин через Ctrl+V"}</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pick(event.target.files?.[0])} />
  </label>;
}

function Thumb({ url, name }) {
  return url ? <img className="kd-ads-thumb" src={url} alt={name} loading="lazy" /> : <span className="kd-ads-thumb empty"><ImagePlus size={15} /></span>;
}

function Delta({ row, field, label }) {
  if (!row.deltas) return <span className="kd-ads-num muted" data-label={label}>{row.end ? row.end[field] : "—"}</span>;
  const value = row.deltas[field];
  return <span className="kd-ads-num" data-label={label}><b className={value > 0 ? "good" : ""}>+{fmt(value)}</b><small>{fmt(row.start[field])} → {fmt(row.end[field])}</small></span>;
}

export default function AdsIntelligence({ accounts = [], assets = [], metrics = [], promotions = [], snapshots = [], settings = {}, canEdit = false, onReload }) {
  const [[from, to], setRange] = useState(() => monthRange(0));
  const [budget, setBudget] = useState(() => Number(settings.ads_olx_budget) || 50000);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageUrls, setImageUrls] = useState({});
  const [assetForm, setAssetForm] = useState(blankAsset);
  const [assetImage, setAssetImage] = useState(null);
  const [accountName, setAccountName] = useState("");
  const [promoForm, setPromoForm] = useState(blankPromo);
  const [snapDate, setSnapDate] = useState(today());
  const [snapValues, setSnapValues] = useState({});

  const report = useMemo(() => buildOlxReport({ accounts, assets, snapshots, promotions, from, to }), [accounts, assets, snapshots, promotions, from, to]);
  const totals = useMemo(() => summarizeOlxReport(report), [report]);
  const plan = useMemo(() => planOlxBudget(report, budget), [report, budget]);
  const shown = report.filter((row) => filter === "all" || (filter === "paid" && row.spend > 0) || (filter === "free" && !row.spend) || (filter === "nodata" && !row.deltas));
  const activeAssets = useMemo(() => assets.filter((asset) => asset.is_active !== false).sort((a, b) => a.name.localeCompare(b.name, "ru")), [assets]);
  const hiddenAssets = assets.filter((asset) => asset.is_active === false);
  const accountLabel = (id) => { const account = accounts.find((item) => String(item.id) === String(id)); return account ? `${PLATFORM_LABELS[account.platform] || account.platform} · ${account.name}` : "без аккаунта"; };
  const lastSnapshot = useMemo(() => {
    const map = new Map();
    for (const row of snapshots) {
      const prev = map.get(String(row.asset_id));
      if (row.snapshot_date <= snapDate && (!prev || row.snapshot_date > prev.snapshot_date)) map.set(String(row.asset_id), row);
    }
    return map;
  }, [snapshots, snapDate]);

  const imagePaths = assets.map((asset) => asset.image_path).filter(Boolean).join("|");
  useEffect(() => {
    if (!imagePaths) { setImageUrls({}); return; }
    let cancelled = false;
    (async () => {
      const { supabase } = await import("../supabaseClient");
      const { data } = await supabase.storage.from("ad-images").createSignedUrls(imagePaths.split("|"), 3600);
      if (!cancelled && Array.isArray(data)) setImageUrls(Object.fromEntries(data.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl])));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [imagePaths]);

  async function mutate(action, reloadKeys, done = "Сохранено.") {
    setBusy(true); setNotice("");
    try {
      const { supabase } = await import("../supabaseClient");
      const result = await action(supabase);
      if (result?.error) throw result.error;
      await onReload?.(reloadKeys);
      setNotice(done);
      return true;
    } catch (error) { setNotice(`Ошибка: ${error.message}`); return false; }
    finally { setBusy(false); }
  }

  async function uploadImage(db, assetId, file, previousPath) {
    const payload = await shrinkImage(file);
    const path = `${assetId}/${Date.now()}.jpg`;
    const uploaded = await db.storage.from("ad-images").upload(path, payload, { contentType: "image/jpeg", upsert: false });
    if (uploaded.error) throw uploaded.error;
    const saved = await db.from("ad_assets").update({ image_path: path }).eq("id", assetId);
    if (saved.error) { await db.storage.from("ad-images").remove([path]); throw saved.error; }
    if (previousPath) await db.storage.from("ad-images").remove([previousPath]);
  }

  const addAccount = () => mutate((db) => db.from("ad_accounts").insert({ platform: "olx", name: accountName.trim() }), ["ad_accounts"], "Аккаунт добавлен.")
    .then((ok) => ok && setAccountName(""));

  const addAsset = () => mutate(async (db) => {
    const external = assetForm.external_id.trim() || olxIdFromUrl(assetForm.landing_url) || null;
    const { data, error } = await db.from("ad_assets").insert({ account_id: assetForm.account_id, name: assetForm.name.trim(), landing_url: assetForm.landing_url.trim() || null, external_id: external }).select("id").single();
    if (error) return { error };
    if (assetImage) await uploadImage(db, data.id, assetImage, null);
    return null;
  }, ["ad_assets"], "Объявление добавлено.").then((ok) => { if (ok) { setAssetForm(blankAsset()); setAssetImage(null); } });

  const addPromotion = () => mutate((db) => db.from("ad_promotions").insert({
    ...promoForm, activated_hour: promoForm.activated_hour === "" ? null : Number(promoForm.activated_hour), cost: Number(promoForm.cost) || 0,
    ended_on: promoForm.ended_on < promoForm.started_on ? promoForm.started_on : promoForm.ended_on,
  }), ["ad_promotions"], "Покупка записана. В кассу не идёт.").then((ok) => ok && setPromoForm({ ...blankPromo(), asset_id: promoForm.asset_id }));

  const filledSnapshots = activeAssets.filter((asset) => COUNTERS.some(([key]) => String(snapValues[asset.id]?.[key] ?? "") !== ""));
  const saveSnapshots = () => {
    const payload = filledSnapshots.map((asset) => {
      const prev = lastSnapshot.get(String(asset.id));
      const value = (key) => { const raw = snapValues[asset.id]?.[key]; return raw === undefined || raw === "" ? Number(prev?.[key]) || 0 : Math.max(0, Number(raw) || 0); };
      return { asset_id: asset.id, snapshot_date: snapDate, views: value("views"), favorites: value("favorites"), phone_views: value("phone_views") };
    });
    return mutate((db) => db.from("ad_snapshots").upsert(payload, { onConflict: "asset_id,snapshot_date" }), ["ad_snapshots"], `Снимок на ${ru(snapDate)} сохранён: ${payload.length} объявл.`)
      .then((ok) => ok && setSnapValues({}));
  };

  const remove = (table, id, reloadKey, question) => {
    if (!window.confirm(question)) return;
    mutate((db) => db.from(table).delete().eq("id", id), [reloadKey], "Удалено.");
  };
  const removeAsset = (asset) => {
    if (!window.confirm(`Удалить объявление «${asset.name}» вместе со всеми снимками и покупками продвижения? Отменить нельзя.`)) return;
    mutate(async (db) => {
      const result = await db.from("ad_assets").delete().eq("id", asset.id);
      if (!result.error && asset.image_path) await db.storage.from("ad-images").remove([asset.image_path]);
      return result;
    }, ["ad_assets", "ad_snapshots", "ad_promotions", "ad_metrics"], "Объявление удалено.").then((ok) => ok && setOpenId(""));
  };

  return <div className="kd-ads360">
    <div className="kd-ads-hero kd-card">
      <div><span>РЕКЛАМА OLX</span><h2>Сколько вложили в каждое объявление и что это дало</h2><p>Вложения в продвижение здесь — только аналитика окупаемости, в кассу они не попадают. Прирост считается по снимкам счётчиков OLX.</p></div>
      <label>Бюджет на продвижение, ₸<input type="number" min="0" step="1000" value={budget} onChange={(event) => setBudget(Number(event.target.value) || 0)} /></label>
    </div>

    <div className="kd-ads-toolbar kd-card">
      <label>С<input type="date" value={from} onChange={(event) => setRange([event.target.value, to])} /></label>
      <label>По<input type="date" value={to} onChange={(event) => setRange([from, event.target.value])} /></label>
      <button className="kd-btn ghost sm" onClick={() => setRange(monthRange(0))}>Этот месяц</button>
      <button className="kd-btn ghost sm" onClick={() => setRange(monthRange(-1))}>Прошлый месяц</button>
    </div>

    <div className="kd-ads-kpis">
      <div><span>Вложено в продвижение</span><strong>{fmt(totals.spend)} ₸</strong><small>{totals.purchases} покупок</small></div>
      <div><span>Показов телефона</span><strong>+{fmt(totals.phones)}</strong><small>{totals.paidPhones && totals.spend ? `${fmt(totals.spend / totals.paidPhones)} ₸ за 1 у рекламируемых` : "у рекламируемых пока нет"}</small></div>
      <div><span>Просмотры / избранное</span><strong>+{fmt(totals.views)}</strong><small>+{fmt(totals.favorites)} в избранном</small></div>
      <div><span>Без рекламы в периоде</span><strong>{totals.withoutAds} из {report.length}</strong><small>{totals.withoutData ? `${totals.withoutData} без замеров` : "замеры есть у всех"}</small></div>
    </div>

    <section className="kd-card">
      <div className="kd-stage2head"><div><div className="kd-title">Объявления за {ru(from)}–{ru(to)}</div><div className="kd-muted">Нажмите на строку — откроются покупки, снимки, правка и удаление.</div></div><Target size={20} /></div>
      <div className="kd-ads-filters">{FILTERS.map(([key, label]) => <button key={key} className={`kd-btn sm ${filter === key ? "primary" : "ghost"}`} onClick={() => setFilter(key)}>{label}</button>)}</div>
      {!report.length ? <div className="kd-empty">Добавьте объявления OLX ниже: название, ссылку и картинку.</div> :
        <div className="kd-ads-report">
          <div className="head"><span /><span>Объявление</span><span>Вложено</span>{COUNTERS.map(([, label]) => <span key={label}>{label}</span>)}<span>₸ за телефон</span><span>Решение</span><span>В план</span></div>
          {shown.map((row) => <React.Fragment key={row.id}>
            <div className={`row ${openId === row.id ? "open" : ""}`} role="button" tabIndex={0} onClick={() => setOpenId(openId === row.id ? "" : row.id)} onKeyDown={(event) => event.key === "Enter" && setOpenId(openId === row.id ? "" : row.id)}>
              <Thumb url={imageUrls[row.image_path]} name={row.name} />
              <span className="name"><b>{row.name}</b><small>{row.account.name || "без аккаунта"}{row.activeOnEnd ? " · реклама идёт" : ""}</small></span>
              <span className="kd-ads-num spend"><b>{row.spend ? `${fmt(row.spend)} ₸` : "—"}</b><small>{row.promotions.map((promo) => `${PROMOTION_LABELS[promo.promotion_type] || promo.promotion_type} ${ru(promo.started_on)}${promo.activated_hour != null ? ` ${hour(promo.activated_hour)}` : ""}`).join(", ") || "без продвижения"}</small></span>
              {COUNTERS.map(([key, label]) => <Delta key={key} row={row} field={key} label={label} />)}
              <span className="kd-ads-num" data-label="₸ за телефон"><b>{row.costPerPhone == null ? "—" : `${fmt(row.costPerPhone)} ₸`}</b>{row.dropped && <small className="bad">счётчик уменьшился</small>}</span>
              <span className="verdict"><em className={row.verdict.tone}>{row.verdict.label}</em><small>{row.verdict.reason}</small></span>
              <strong className="kd-ads-num plan" data-label="В план">{plan.get(row.id) ? `${fmt(plan.get(row.id))} ₸` : "—"}</strong>
            </div>
            {openId === row.id && <AssetDetails asset={row} imageUrl={imageUrls[row.image_path]} accounts={accounts} accountLabel={accountLabel}
              promotions={promotions.filter((item) => String(item.asset_id) === String(row.id))}
              snapshots={snapshots.filter((item) => String(item.asset_id) === String(row.id))}
              metrics={metrics.filter((item) => String(item.asset_id) === String(row.id))}
              canEdit={canEdit} busy={busy} mutate={mutate} uploadImage={uploadImage} remove={remove} removeAsset={removeAsset} />}
          </React.Fragment>)}
        </div>}
      {hiddenAssets.length > 0 && <details className="kd-ads-hidden"><summary>Скрытые объявления ({hiddenAssets.length})</summary>{hiddenAssets.map((asset) => <div key={asset.id}><span>{asset.name}</span>{canEdit && <button className="kd-btn ghost sm" disabled={busy} onClick={() => mutate((db) => db.from("ad_assets").update({ is_active: true }).eq("id", asset.id), ["ad_assets"], "Объявление снова в отчёте.")}>Вернуть</button>}</div>)}</details>}
      <p className="kd-muted kd-ads-rule">План: 80% бюджета — объявлениям, где телефон обходится дешевле, 20% — на пробу тем, кто и без рекламы собирает телефоны. Не больше 35% в одно объявление.</p>
    </section>

    {canEdit && <>
      <details className="kd-card kd-ads-entry" open={activeAssets.length > 0}>
        <summary><BarChart3 size={16} />Снимок счётчиков OLX</summary>
        <div>
          <p className="kd-muted">Перепишите из кабинета OLX цифры «всего» по каждому объявлению — раз в неделю и в последний день месяца. Пустое поле = без изменений.</p>
          <label className="kd-ads-date">Дата снимка<input type="date" value={snapDate} onChange={(event) => setSnapDate(event.target.value)} /></label>
          <div className="kd-ads-snap">
            <div className="head"><span /><span>Объявление</span>{COUNTERS.map(([, label]) => <span key={label}>{label}</span>)}</div>
            {activeAssets.map((asset) => {
              const prev = lastSnapshot.get(String(asset.id));
              return <div key={asset.id}>
                <Thumb url={imageUrls[asset.image_path]} name={asset.name} />
                <span className="name"><b>{asset.name}</b><small>{prev ? `было на ${ru(prev.snapshot_date)}` : "первый снимок"}</small></span>
                {COUNTERS.map(([key, label]) => {
                  const raw = snapValues[asset.id]?.[key] ?? "";
                  const lower = raw !== "" && prev && Number(raw) < Number(prev[key]);
                  return <input key={key} aria-label={`${label}: ${asset.name}`} type="number" min="0" inputMode="numeric" className={lower ? "bad" : ""} placeholder={prev ? String(prev[key]) : "0"} value={raw}
                    onChange={(event) => setSnapValues({ ...snapValues, [asset.id]: { ...snapValues[asset.id], [key]: event.target.value } })} />;
                })}
              </div>;
            })}
          </div>
          <button className="kd-btn primary" disabled={busy || !filledSnapshots.length} onClick={saveSnapshots}>Сохранить снимок{filledSnapshots.length ? ` (${filledSnapshots.length})` : ""}</button>
        </div>
      </details>

      <div className="kd-ads-inputs">
        <details className="kd-card kd-ads-entry" open>
          <summary><Target size={16} />Покупка продвижения</summary>
          <div>
            <div className="kd-grid2">
              <label className="wide">Объявление<select value={promoForm.asset_id} onChange={(event) => setPromoForm({ ...promoForm, asset_id: event.target.value })}><option value="">Выберите</option>{activeAssets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Услуга<select value={promoForm.promotion_type} onChange={(event) => setPromoForm({ ...promoForm, promotion_type: event.target.value, ended_on: promotionEndDate(promoForm.started_on, event.target.value) })}>{Object.entries(PROMOTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Стоимость, ₸<input type="number" min="0" value={promoForm.cost} onChange={(event) => setPromoForm({ ...promoForm, cost: event.target.value })} /></label>
              <label>Дата покупки<input type="date" value={promoForm.started_on} onChange={(event) => setPromoForm({ ...promoForm, started_on: event.target.value, ended_on: promotionEndDate(event.target.value, promoForm.promotion_type) })} /></label>
              <label>Время<select value={promoForm.activated_hour} onChange={(event) => setPromoForm({ ...promoForm, activated_hour: event.target.value })}><option value="">не важно</option>{Array.from({ length: 24 }, (_, value) => <option key={value} value={value}>{hour(value)}</option>)}</select></label>
              <label>Действует до<input type="date" value={promoForm.ended_on} onChange={(event) => setPromoForm({ ...promoForm, ended_on: event.target.value })} /></label>
            </div>
            <button className="kd-btn primary sm" disabled={busy || !promoForm.asset_id || !(Number(promoForm.cost) > 0)} onClick={addPromotion}>Записать покупку</button>
          </div>
        </details>

        <details className="kd-card kd-ads-entry" open={!activeAssets.length}>
          <summary><Plus size={16} />Новое объявление</summary>
          <div>
            <div className="kd-grid2">
              <label>Аккаунт OLX<select value={assetForm.account_id} onChange={(event) => setAssetForm({ ...assetForm, account_id: event.target.value })}><option value="">Выберите</option>{accounts.map((item) => <option key={item.id} value={item.id}>{accountLabel(item.id)}</option>)}</select></label>
              <label>Название<input value={assetForm.name} onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })} placeholder="Как в OLX или своё, чтобы отличать" /></label>
              <label className="wide">Ссылка на объявление<input type="url" value={assetForm.landing_url} onChange={(event) => setAssetForm({ ...assetForm, landing_url: event.target.value })} placeholder="https://www.olx.kz/d/obyavlenie/…" /></label>
            </div>
            <ImagePicker file={assetImage} onFile={setAssetImage} />
            <button className="kd-btn primary sm" disabled={busy || !assetForm.account_id || !assetForm.name.trim()} onClick={addAsset}>Добавить объявление</button>
            <div className="kd-ads-inline">
              <input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Новый аккаунт OLX, например Dezline" />
              <button className="kd-btn ghost sm" disabled={busy || !accountName.trim()} onClick={addAccount}>Добавить аккаунт</button>
            </div>
          </div>
        </details>
      </div>
    </>}

    {notice && <div className={`kd-ads-notice ${notice.startsWith("Ошибка") ? "bad" : ""}`} role="status">{notice.startsWith("Ошибка") && <AlertTriangle size={15} />}{notice}</div>}
  </div>;
}

function AssetDetails({ asset, imageUrl, accounts, accountLabel, promotions, snapshots, metrics, canEdit, busy, mutate, uploadImage, remove, removeAsset }) {
  const [form, setForm] = useState({ name: asset.name, landing_url: asset.landing_url || "", account_id: asset.account_id });
  const [file, setFile] = useState(null);
  const save = () => mutate(async (db) => {
    const result = await db.from("ad_assets").update({ name: form.name.trim(), landing_url: form.landing_url.trim() || null, account_id: form.account_id, external_id: asset.external_id || olxIdFromUrl(form.landing_url) || null }).eq("id", asset.id);
    if (result.error) return result;
    if (file) await uploadImage(db, asset.id, file, asset.image_path);
    return null;
  }, ["ad_assets"], "Объявление обновлено.").then((ok) => ok && setFile(null));
  const archive = () => mutate((db) => db.from("ad_assets").update({ is_active: false }).eq("id", asset.id), ["ad_assets"], "Объявление скрыто из отчёта. История сохранена.");
  const sortedPromos = [...promotions].sort((a, b) => String(b.started_on).localeCompare(String(a.started_on)));
  const sortedSnaps = [...snapshots].sort((a, b) => String(b.snapshot_date).localeCompare(String(a.snapshot_date)));
  const sortedMetrics = [...metrics].sort((a, b) => String(b.metric_date).localeCompare(String(a.metric_date)));

  return <div className="kd-ads-details">
    <div className="kd-ads-details-main">
      {imageUrl ? <img src={imageUrl} alt={asset.name} /> : <div className="kd-ads-thumb empty big"><ImagePlus size={26} /></div>}
      <div>
        <b>{asset.name}</b>
        <small>{accountLabel(asset.account_id)}{asset.external_id ? ` · ID ${asset.external_id}` : ""}</small>
        {asset.landing_url && <a className="kd-btn ghost sm" href={asset.landing_url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Открыть в OLX</a>}
      </div>
    </div>

    <div className="kd-ads-history">
      <div><div className="kd-title sm">Покупки продвижения</div>
        {sortedPromos.length ? sortedPromos.map((promo) => <div key={promo.id} className="item">
          <span><b>{PROMOTION_LABELS[promo.promotion_type] || promo.promotion_type}</b><small>{ru(promo.started_on)}{promo.activated_hour != null ? ` в ${hour(promo.activated_hour)}` : ""} → {ru(promo.ended_on)}</small></span>
          <strong>{fmt(promo.cost)} ₸</strong>
          {canEdit && <button className="kd-btn ghost sm" aria-label="Удалить покупку" disabled={busy} onClick={() => remove("ad_promotions", promo.id, "ad_promotions", `Удалить покупку «${PROMOTION_LABELS[promo.promotion_type] || promo.promotion_type}» от ${ru(promo.started_on)} на ${fmt(promo.cost)} ₸?`)}><Trash2 size={13} /></button>}
        </div>) : <div className="kd-muted">Не покупали.</div>}
      </div>
      <div><div className="kd-title sm">Снимки счётчиков</div>
        {sortedSnaps.length ? sortedSnaps.map((snap) => <div key={snap.id} className="item">
          <span><b>{ru(snap.snapshot_date)}</b><small>{fmt(snap.views)} просм. · {fmt(snap.favorites)} избр. · {fmt(snap.phone_views)} тел.</small></span>
          {canEdit && <button className="kd-btn ghost sm" aria-label="Удалить снимок" disabled={busy} onClick={() => remove("ad_snapshots", snap.id, "ad_snapshots", `Удалить снимок на ${ru(snap.snapshot_date)}?`)}><Trash2 size={13} /></button>}
        </div>) : <div className="kd-muted">Снимков нет.</div>}
        {sortedMetrics.length > 0 && <>
          <div className="kd-title sm">Старые дневные замеры</div>
          {sortedMetrics.map((metric) => <div key={metric.id} className="item">
            <span><b>{ru(metric.metric_date)}{metric.hour_slot >= 0 ? ` ${hour(metric.hour_slot)}` : ""}</b><small>{fmt(metric.views)} просм. · {fmt(metric.favorites)} избр. · {fmt(metric.phone_views)} тел.</small></span>
            {canEdit && <button className="kd-btn ghost sm" aria-label="Удалить замер" disabled={busy} onClick={() => remove("ad_metrics", metric.id, "ad_metrics", `Удалить старый замер от ${ru(metric.metric_date)}?`)}><Trash2 size={13} /></button>}
          </div>)}
        </>}
      </div>
    </div>

    {canEdit && <div className="kd-ads-edit">
      <div className="kd-grid2">
        <label>Название<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Аккаунт<select value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })}>{accounts.map((item) => <option key={item.id} value={item.id}>{accountLabel(item.id)}</option>)}</select></label>
        <label className="wide">Ссылка на объявление<input type="url" value={form.landing_url} onChange={(event) => setForm({ ...form, landing_url: event.target.value })} placeholder="https://www.olx.kz/d/obyavlenie/…" /></label>
      </div>
      <ImagePicker file={file} previewUrl={imageUrl} onFile={setFile} />
      <div className="kd-ads-actions">
        <button className="kd-btn primary sm" disabled={busy || !form.name.trim()} onClick={save}>Сохранить</button>
        <button className="kd-btn ghost sm" disabled={busy} onClick={archive}>Скрыть (снято с OLX)</button>
        <button className="kd-btn ghost sm danger" disabled={busy} onClick={() => removeAsset(asset)}><Trash2 size={13} />Удалить совсем</button>
      </div>
    </div>}
  </div>;
}
