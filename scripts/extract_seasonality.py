"""Build the browser-ready seasonality snapshot from the owner's Excel model.

Usage:
  python scripts/extract_seasonality.py path/to/workbook.xlsx src/seasonalityData.js

The workbook remains the source of truth. The generated module contains only the
values needed by the app, so users do not have to upload or parse Excel in the
browser.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]


def rows_after_header(sheet, header_row=4):
    headers = [cell.value for cell in sheet[header_row]]
    for values in sheet.iter_rows(min_row=header_row + 1, values_only=True):
        if not values[0]:
            continue
        yield dict(zip(headers, values))


def clean(value):
    if value is None:
        return ""
    return str(value).strip()


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Expected input workbook and output module paths")

    workbook_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)

    catalog = {}
    for row in rows_after_header(workbook["Каталог угроз"]):
        name = clean(row["Вредитель / риск / услуга"])
        catalog[name] = {
            "id": clean(row["ID"]),
            "group": clean(row["Группа"]),
            "name": name,
            "seasonality": clean(row["Сезонность"]),
            "leadWeeks": int(row["Lead time, недель"] or 0),
            "weight": float(row["Коммерческий вес, балл"] or 0),
            "confidence": clean(row["Уверенность"]),
            "service": clean(row["Услуга"]),
            "objects": clean(row["Целевые объекты"]),
            "risk": clean(row["Риски / заболевания"]),
            "angle": clean(row["Рекламный угол"]),
            "region": clean(row["Региональные замечания"]),
            "sourceIds": [part.strip() for part in clean(row["Источники ID"]).split(";") if part.strip()],
        }

    buckets = defaultdict(lambda: defaultdict(lambda: {
        "activity": [], "adIndex": [], "budgetShare": [], "phases": Counter(),
    }))
    for row in rows_after_header(workbook["Еженедельный медиаплан"]):
        name = clean(row["Направление"])
        month = clean(row["Месяц"])
        if name not in catalog or month not in MONTHS:
            continue
        bucket = buckets[name][month]
        bucket["activity"].append(float(row["Биоактивность %"] or 0) * 100)
        bucket["adIndex"].append(float(row["Рекламный индекс %"] or 0) * 100)
        bucket["budgetShare"].append(float(row["Доля бюджета %"] or 0) * 100)
        bucket["phases"][clean(row["Фаза"])] += 1

    directions = []
    for name, item in catalog.items():
        months = []
        for month in MONTHS:
            bucket = buckets[name][month]
            average = lambda key: round(sum(bucket[key]) / len(bucket[key]), 1) if bucket[key] else 0
            months.append({
                "activity": average("activity"),
                "adIndex": average("adIndex"),
                "budgetShare": round(sum(bucket["budgetShare"]) / len(bucket["budgetShare"]), 2) if bucket["budgetShare"] else 0,
                "phase": bucket["phases"].most_common(1)[0][0] if bucket["phases"] else "",
            })
        directions.append({**item, "months": months})

    sources = []
    for row in rows_after_header(workbook["Источники"]):
        sources.append({
            "id": clean(row["ID"]),
            "organization": clean(row["Организация"]),
            "topic": clean(row["Тема"]),
            "supports": clean(row["Что подтверждает"]),
            "url": clean(row["URL"]),
            "type": clean(row["Тип"]),
            "checked": clean(row["Проверено"]),
        })

    payload = {
        "meta": {
            "title": "Сезонность вредителей Казахстана",
            "baseRegion": "Алматы и юго-восток Казахстана",
            "directions": len(directions),
            "sources": len(sources),
            "checked": max((source["checked"] for source in sources), default=""),
            "note": "Проценты — нормированные индексы экспертной модели, а не официальная статистика рынка. План нужно уточнять по фактическим заявкам и погоде.",
        },
        "months": MONTHS,
        "directions": directions,
        "sources": sources,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    module = "// Generated from the owner's seasonality workbook. Do not edit by hand.\n"
    module += "export const SEASONALITY_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    output_path.write_text(module, encoding="utf-8")
    print(f"Generated {len(directions)} directions and {len(sources)} sources -> {output_path}")


if __name__ == "__main__":
    main()
