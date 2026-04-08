#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILE = ROOT / "第十六届北京国际电影节“北京展映”排片表.xlsx"
OUTPUT_FILE = ROOT / "src" / "data" / "bjiff-schedule.json"
TARGET_SHEET = "北京展映"

XML_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}

DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")


@dataclass
class FilmRecord:
    id: str
    title_zh: str
    title_en: str
    year: int
    duration_minutes: int
    unit: str
    screening_ids: list[str]


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("a:si", XML_NS):
        strings.append(
            "".join(text.text or "" for text in item.iterfind(".//a:t", XML_NS))
        )
    return strings


def workbook_sheets(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map: Dict[str, str] = {}
    for rel in relations.findall("pr:Relationship", XML_NS):
        rel_map[rel.attrib["Id"]] = rel.attrib["Target"]

    sheets: dict[str, str] = {}
    for sheet in workbook.find("a:sheets", XML_NS):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        sheets[name] = "xl/" + rel_map[rel_id]
    return sheets


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value = cell.find("a:v", XML_NS)
    if value is None:
        inline_string = cell.find("a:is", XML_NS)
        if inline_string is not None:
            return "".join(
                text.text or "" for text in inline_string.iterfind(".//a:t", XML_NS)
            ).strip()
        return ""

    raw = (value.text or "").strip()
    if cell_type == "s":
        try:
            return shared_strings[int(raw)].strip()
        except (ValueError, IndexError):
            return raw
    return raw


def parse_rows(sheet_xml: bytes, shared_strings: list[str]) -> list[dict[str, str]]:
    root = ET.fromstring(sheet_xml)
    rows: list[dict[str, str]] = []
    for row in root.findall(".//a:sheetData/a:row", XML_NS):
        current: dict[str, str] = {}
        for cell in row.findall("a:c", XML_NS):
            ref = cell.attrib.get("r", "")
            column = "".join(ch for ch in ref if ch.isalpha())
            current[column] = cell_value(cell, shared_strings)
        rows.append(current)
    return rows


def parse_int(value: str) -> int:
    match = re.search(r"\d+", value or "")
    return int(match.group(0)) if match else 0


def main() -> None:
    if not SOURCE_FILE.exists():
        raise SystemExit(f"source file not found: {SOURCE_FILE}")

    with zipfile.ZipFile(SOURCE_FILE) as archive:
        shared_strings = read_shared_strings(archive)
        sheets = workbook_sheets(archive)
        target = sheets.get(TARGET_SHEET)
        if target is None:
            raise SystemExit(f"sheet not found: {TARGET_SHEET}")

        rows = parse_rows(archive.read(target), shared_strings)

    films: dict[tuple[str, int, str], FilmRecord] = {}
    screenings: list[dict[str, object]] = []
    venues: set[str] = set()
    units: set[str] = set()
    dates: set[str] = set()

    screening_index = 0
    film_index = 0

    for row in rows[3:]:
        title_zh = row.get("B", "").strip()
        starts_at = row.get("G", "").strip()
        if not title_zh or not DATETIME_RE.match(starts_at):
            continue

        title_en = row.get("C", "").strip()
        unit = row.get("A", "").strip()
        year = parse_int(row.get("D", ""))
        duration_minutes = parse_int(row.get("E", ""))
        price_cny = parse_int(row.get("F", ""))
        venue = row.get("H", "").strip()
        hall = row.get("I", "").strip()
        activity_info = row.get("J", "").strip()

        screening_index += 1
        film_key = (title_zh, year, unit)
        if film_key not in films:
            film_index += 1
            films[film_key] = FilmRecord(
                id=f"film-{film_index:04d}",
                title_zh=title_zh,
                title_en=title_en,
                year=year,
                duration_minutes=duration_minutes,
                unit=unit,
                screening_ids=[],
            )

        film = films[film_key]
        screening_id = f"screening-{screening_index:04d}"
        film.screening_ids.append(screening_id)

        start_dt = datetime.strptime(starts_at, "%Y-%m-%d %H:%M")
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        dates.add(start_dt.strftime("%Y-%m-%d"))
        venues.add(venue)
        units.add(unit)

        screenings.append(
            {
                "id": screening_id,
                "filmId": film.id,
                "unit": unit,
                "titleZh": title_zh,
                "titleEn": title_en,
                "year": year,
                "durationMinutes": duration_minutes,
                "priceCny": price_cny,
                "startsAt": start_dt.isoformat(timespec="minutes"),
                "endsAt": end_dt.isoformat(timespec="minutes"),
                "date": start_dt.strftime("%Y-%m-%d"),
                "time": start_dt.strftime("%H:%M"),
                "venue": venue,
                "hall": hall,
                "activityInfo": activity_info,
            }
        )

    price_values = [screening["priceCny"] for screening in screenings]

    payload = {
        "festival": "第十六届北京国际电影节·北京展映",
        "sourceFile": SOURCE_FILE.name,
        "importedAt": datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "screeningCount": len(screenings),
            "filmCount": len(films),
            "venueCount": len(venues),
            "dateCount": len(dates),
            "unitCount": len(units),
            "priceRange": [min(price_values), max(price_values)] if price_values else [0, 0],
        },
        "dates": sorted(dates),
        "units": sorted(units),
        "venues": sorted(venues),
        "films": [
            {
                "id": film.id,
                "titleZh": film.title_zh,
                "titleEn": film.title_en,
                "year": film.year,
                "durationMinutes": film.duration_minutes,
                "unit": film.unit,
                "screeningIds": film.screening_ids,
            }
            for film in sorted(films.values(), key=lambda item: item.title_zh)
        ],
        "screenings": screenings,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

