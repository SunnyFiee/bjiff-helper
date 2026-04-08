#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILE = ROOT / "16th BJIFF 影片信息（截至04.08）.xlsx"
OUTPUT_FILE = ROOT / "src" / "data" / "bjiff-film-metadata.json"
RAW_SHEET = "原始表-包含所有字段"
AWARDS_SHEET = "获奖情况"

XML_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}

MISSING_TEXT = {"", "N/A", "None", "暂无评分"}


@dataclass
class FilmMetadataRecord:
    title_zh: str
    year: int
    countries: list[str]
    mainland_release_date: str | None
    languages: list[str]
    genres: list[str]
    cast: list[str]
    cast_collect_count: int | None
    director: str | None
    director_collect_count: int | None
    combined_collect_count: int | None
    douban_rating_value: float | None
    douban_rating_count: int | None
    imdb_id: str | None
    imdb_rating_value: float | None
    imdb_rating_count: int | None
    awards: list[str]


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


def parse_sheet_rows(archive: zipfile.ZipFile, sheet_path: str) -> list[list[str]]:
    shared_strings = read_shared_strings(archive)
    root = ET.fromstring(archive.read(sheet_path))
    rows: list[list[str]] = []
    for row in root.findall(".//a:sheetData/a:row", XML_NS):
        rows.append([cell_value(cell, shared_strings) for cell in row.findall("a:c", XML_NS)])
    return rows


def clean_text(value: str) -> str | None:
    text = (value or "").strip()
    return None if text in MISSING_TEXT else text


def parse_int(value: str) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"\d[\d,]*", text)
    if not match:
        return None
    return int(match.group(0).replace(",", ""))


def parse_float(value: str) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return None
    return float(match.group(0))


def parse_year(value: str) -> int:
    year = parse_int(value)
    return year or 0


def split_text(value: str, separators: list[str]) -> list[str]:
    text = clean_text(value)
    if not text:
        return []

    pattern = "|".join(re.escape(item) for item in separators)
    return [item.strip() for item in re.split(pattern, text) if item.strip()]


def metadata_key(title_zh: str, year: int) -> tuple[str, int]:
    return (title_zh.strip(), year)


def parse_raw_metadata(rows: list[list[str]]) -> dict[tuple[str, int], FilmMetadataRecord]:
    header = rows[0]
    records: dict[tuple[str, int], FilmMetadataRecord] = {}

    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue
        payload = dict(zip(header, row + [""] * (len(header) - len(row))))
        title_zh = (payload.get("中文名") or "").strip()
        year = parse_year(payload.get("年份") or "")
        if not title_zh or year == 0:
            continue

        record = FilmMetadataRecord(
            title_zh=title_zh,
            year=year,
            countries=split_text(payload.get("国家") or "", ["/", "／", "、"]),
            mainland_release_date=clean_text(payload.get("上映日期(中国大陆)") or ""),
            languages=split_text(payload.get("语言") or "", ["/", "／", "、"]),
            genres=split_text(payload.get("类型") or "", ["/", "／"]),
            cast=split_text(payload.get("主演") or "", ["/", "／", "、"]),
            cast_collect_count=parse_int(payload.get("主演收藏数") or ""),
            director=clean_text(payload.get("导演") or ""),
            director_collect_count=parse_int(payload.get("导演收藏数") or ""),
            combined_collect_count=parse_int(payload.get("导演+主演收藏数") or ""),
            douban_rating_value=parse_float(payload.get("评分") or ""),
            douban_rating_count=parse_int(payload.get("评价人数") or ""),
            imdb_id=clean_text(payload.get("IMDB编号") or ""),
            imdb_rating_value=parse_float(payload.get("IMDB评分") or ""),
            imdb_rating_count=parse_int(payload.get("IMDB评价人数") or ""),
            awards=[],
        )
        records[metadata_key(title_zh, year)] = record

    return records


def merge_awards(
    rows: list[list[str]],
    records: dict[tuple[str, int], FilmMetadataRecord],
) -> None:
    header = rows[1]
    for row in rows[2:]:
        if not any(cell.strip() for cell in row):
            continue
        payload = dict(zip(header, row + [""] * (len(header) - len(row))))
        title_zh = (payload.get("中文名") or "").strip()
        year = parse_year(payload.get("年份") or "")
        awards = split_text(payload.get("获奖情况") or "", ["\n"])
        if not title_zh or year == 0 or not awards:
            continue

        key = metadata_key(title_zh, year)
        record = records.get(key)
        if not record:
            continue

        deduped = []
        seen: set[str] = set(record.awards)
        for award in awards:
            if award not in seen:
                deduped.append(award)
                seen.add(award)
        record.awards.extend(deduped)


def main() -> None:
    if not SOURCE_FILE.exists():
        raise SystemExit(f"source file not found: {SOURCE_FILE}")

    with zipfile.ZipFile(SOURCE_FILE) as archive:
        sheets = workbook_sheets(archive)
        raw_rows = parse_sheet_rows(archive, sheets[RAW_SHEET])
        awards_rows = parse_sheet_rows(archive, sheets[AWARDS_SHEET])

    records = parse_raw_metadata(raw_rows)
    merge_awards(awards_rows, records)

    payload = [
        {
            "titleZh": record.title_zh,
            "year": record.year,
            "countries": record.countries,
            "mainlandReleaseDate": record.mainland_release_date,
            "languages": record.languages,
            "genres": record.genres,
            "cast": record.cast,
            "castCollectCount": record.cast_collect_count,
            "director": record.director,
            "directorCollectCount": record.director_collect_count,
            "combinedCollectCount": record.combined_collect_count,
            "doubanRatingValue": record.douban_rating_value,
            "doubanRatingCount": record.douban_rating_count,
            "imdbId": record.imdb_id,
            "imdbRatingValue": record.imdb_rating_value,
            "imdbRatingCount": record.imdb_rating_count,
            "awards": record.awards,
        }
        for record in sorted(records.values(), key=lambda item: (item.title_zh, item.year))
    ]

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
