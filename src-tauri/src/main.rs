use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use calamine::{open_workbook_auto, Data, Reader};
use chrono::{Duration, Local, NaiveDateTime};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

const TARGET_SHEET: &str = "北京展映";
const DATASET_KEY: &str = "festival_dataset";
const PREFERENCE_PROFILE_KEY: &str = "preference_profile";
const UI_STATE_KEY: &str = "ui_state";
const DB_FILENAME: &str = "bjiff-helper.sqlite3";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    screening_count: usize,
    film_count: usize,
    venue_count: usize,
    date_count: usize,
    unit_count: usize,
    price_range: [i32; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Film {
    id: String,
    title_zh: String,
    title_en: String,
    year: i32,
    duration_minutes: i32,
    unit: String,
    screening_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Screening {
    id: String,
    film_id: String,
    unit: String,
    title_zh: String,
    title_en: String,
    year: i32,
    duration_minutes: i32,
    price_cny: i32,
    starts_at: String,
    ends_at: String,
    date: String,
    time: String,
    venue: String,
    hall: String,
    activity_info: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FestivalDataset {
    festival: String,
    source_file: String,
    imported_at: String,
    summary: Summary,
    dates: Vec<String>,
    units: Vec<String>,
    venues: Vec<String>,
    films: Vec<Film>,
    screenings: Vec<Screening>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportSummary {
    source_file: String,
    importer_kind: String,
    status: String,
    message: String,
    screening_count: usize,
    film_count: usize,
    venue_count: usize,
    imported_at: String,
    skipped_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ScreeningFilters {
    #[serde(default)]
    query: String,
    #[serde(default)]
    date: String,
    #[serde(default)]
    unit: String,
    #[serde(default)]
    venue: String,
    #[serde(default)]
    max_price: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferenceProfile {
    active_dates: Vec<String>,
    total_budget_cny: i32,
    max_price_per_screening: i32,
    max_screenings_per_day: i32,
    latest_end_time: String,
    buffer_minutes: i32,
    preferred_units: Vec<String>,
    preferred_venues: Vec<String>,
    preferred_year_range: [i32; 2],
    preferred_duration_range: [i32; 2],
    prefer_with_activity: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UserSelections {
    #[serde(default)]
    film_votes: BTreeMap<String, String>,
    #[serde(default)]
    screening_votes: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiState {
    profile: PreferenceProfile,
    selections: UserSelections,
    active_section: String,
    #[serde(default)]
    current_itinerary_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecommendationScreening {
    #[serde(flatten)]
    screening: Screening,
    score: i32,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecommendationResult {
    selected: Vec<RecommendationScreening>,
    alternatives_by_date: BTreeMap<String, Vec<RecommendationScreening>>,
    considered_count: usize,
    filtered_out_count: usize,
    conflict_reject_count: usize,
    total_cost_cny: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredItinerary {
    id: String,
    screening_ids: Vec<String>,
    total_cost_cny: i32,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedItinerarySummary {
    id: String,
    screening_ids: Vec<String>,
    total_cost_cny: i32,
    created_at: String,
    screening_count: usize,
    title_preview: String,
    first_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionResult {
    status: String,
    message: String,
    affected_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    status: String,
    format: String,
    message: String,
    file_path: String,
}

fn now_text() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;
    Ok(path)
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(DB_FILENAME))
}

fn exports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app_data_dir(app)?.join("exports");
    fs::create_dir_all(&path)
        .map_err(|error| format!("failed to create export directory: {error}"))?;
    Ok(path)
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let connection =
        Connection::open(path).map_err(|error| format!("failed to open sqlite database: {error}"))?;
    init_db(&connection)?;
    Ok(connection)
}

fn init_db(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS app_kv (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS itineraries (
              id TEXT PRIMARY KEY,
              screening_ids_json TEXT NOT NULL,
              total_cost_cny INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| format!("failed to initialize sqlite schema: {error}"))
}

fn write_json_value<T: Serialize>(
    connection: &Connection,
    key: &str,
    value: &T,
) -> Result<(), String> {
    let payload =
        serde_json::to_string(value).map_err(|error| format!("failed to serialize json value: {error}"))?;
    connection
        .execute(
            "
            INSERT INTO app_kv (key, value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE
            SET value = excluded.value,
                updated_at = excluded.updated_at
            ",
            params![key, payload, now_text()],
        )
        .map_err(|error| format!("failed to write sqlite value for key `{key}`: {error}"))?;
    Ok(())
}

fn delete_key(connection: &Connection, key: &str) -> Result<usize, String> {
    connection
        .execute("DELETE FROM app_kv WHERE key = ?1", params![key])
        .map_err(|error| format!("failed to delete sqlite value for key `{key}`: {error}"))
}

fn read_json_value<T: DeserializeOwned>(
    connection: &Connection,
    key: &str,
) -> Result<Option<T>, String> {
    let payload: Option<String> = connection
        .query_row(
            "SELECT value FROM app_kv WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("failed to read sqlite value for key `{key}`: {error}"))?;

    payload
        .map(|value| {
            serde_json::from_str::<T>(&value)
                .map_err(|error| format!("failed to parse sqlite json for key `{key}`: {error}"))
        })
        .transpose()
}

fn bundled_dataset() -> Result<FestivalDataset, String> {
    serde_json::from_str(include_str!("../../src/data/bjiff-schedule.json"))
        .map_err(|error| format!("failed to parse bundled dataset: {error}"))
}

fn default_profile() -> PreferenceProfile {
    PreferenceProfile {
        active_dates: Vec::new(),
        total_budget_cny: 900,
        max_price_per_screening: 120,
        max_screenings_per_day: 3,
        latest_end_time: "23:30".to_string(),
        buffer_minutes: 45,
        preferred_units: Vec::new(),
        preferred_venues: Vec::new(),
        preferred_year_range: [1980, 2026],
        preferred_duration_range: [80, 190],
        prefer_with_activity: true,
    }
}

fn load_cached_or_bundled_dataset(app: &AppHandle) -> Result<FestivalDataset, String> {
    let connection = open_connection(app)?;
    if let Some(dataset) = read_json_value::<FestivalDataset>(&connection, DATASET_KEY)? {
        return Ok(dataset);
    }

    bundled_dataset()
}

fn parse_number(text: &str) -> i32 {
    let digits: String = text.chars().filter(|char| char.is_ascii_digit()).collect();
    digits.parse::<i32>().unwrap_or(0)
}

fn cell_text(cell: Option<&Data>) -> String {
    match cell {
        Some(Data::String(value)) => value.trim().to_string(),
        Some(Data::DateTimeIso(value)) => value.trim().to_string(),
        Some(Data::DurationIso(value)) => value.trim().to_string(),
        Some(Data::Float(value)) => {
            if value.fract() == 0.0 {
                format!("{value:.0}")
            } else {
                value.to_string()
            }
        }
        Some(Data::Int(value)) => value.to_string(),
        Some(Data::Bool(value)) => value.to_string(),
        Some(Data::DateTime(value)) => value.to_string(),
        Some(Data::Error(_)) | Some(Data::Empty) | None => String::new(),
    }
}

fn parse_start_datetime(text: &str) -> Option<NaiveDateTime> {
    [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ]
    .iter()
    .find_map(|pattern| NaiveDateTime::parse_from_str(text, pattern).ok())
}

fn format_naive_date_time(date_time: &NaiveDateTime) -> String {
    date_time.format("%Y-%m-%dT%H:%M").to_string()
}

fn parse_excel_schedule(path: &Path) -> Result<(FestivalDataset, usize), String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|error| format!("failed to open workbook: {error}"))?;
    let range = workbook
        .worksheet_range(TARGET_SHEET)
        .map_err(|error| format!("failed to read worksheet `{TARGET_SHEET}`: {error}"))?;

    let mut films: Vec<Film> = Vec::new();
    let mut film_index_by_key: HashMap<(String, i32, String), usize> = HashMap::new();
    let mut screenings: Vec<Screening> = Vec::new();
    let mut dates = BTreeSet::new();
    let mut units = BTreeSet::new();
    let mut venues = BTreeSet::new();
    let mut skipped_rows = 0usize;
    let mut screening_sequence = 0usize;
    let mut film_sequence = 0usize;

    for row in range.rows().skip(3) {
        let title_zh = cell_text(row.get(1));
        if title_zh.is_empty() {
            continue;
        }

        let starts_at_text = cell_text(row.get(6));
        let Some(starts_at) = parse_start_datetime(&starts_at_text) else {
            skipped_rows += 1;
            continue;
        };

        let unit = cell_text(row.get(0));
        let title_en = cell_text(row.get(2));
        let year = parse_number(&cell_text(row.get(3)));
        let duration_minutes = parse_number(&cell_text(row.get(4)));
        let price_cny = parse_number(&cell_text(row.get(5)));
        let venue = cell_text(row.get(7));
        let hall = cell_text(row.get(8));
        let activity_info = cell_text(row.get(9));

        let film_key = (title_zh.clone(), year, unit.clone());
        let film_id = if let Some(index) = film_index_by_key.get(&film_key) {
            films[*index].id.clone()
        } else {
            film_sequence += 1;
            let id = format!("film-{film_sequence:04}");
            film_index_by_key.insert(film_key.clone(), films.len());
            films.push(Film {
                id: id.clone(),
                title_zh: title_zh.clone(),
                title_en: title_en.clone(),
                year,
                duration_minutes,
                unit: unit.clone(),
                screening_ids: Vec::new(),
            });
            id
        };

        screening_sequence += 1;
        let screening_id = format!("screening-{screening_sequence:04}");
        if let Some(index) = film_index_by_key.get(&film_key) {
            films[*index].screening_ids.push(screening_id.clone());
        }

        let ends_at = starts_at + Duration::minutes(i64::from(duration_minutes.max(0)));
        dates.insert(starts_at.format("%Y-%m-%d").to_string());
        units.insert(unit.clone());
        venues.insert(venue.clone());

        screenings.push(Screening {
            id: screening_id,
            film_id,
            unit,
            title_zh,
            title_en,
            year,
            duration_minutes,
            price_cny,
            starts_at: format_naive_date_time(&starts_at),
            ends_at: format_naive_date_time(&ends_at),
            date: starts_at.format("%Y-%m-%d").to_string(),
            time: starts_at.format("%H:%M").to_string(),
            venue,
            hall,
            activity_info,
        });
    }

    screenings.sort_by(|left, right| left.starts_at.cmp(&right.starts_at));
    films.sort_by(|left, right| left.title_zh.cmp(&right.title_zh));

    let mut prices = screenings.iter().map(|screening| screening.price_cny);
    let first_price = prices.next().unwrap_or(0);
    let (min_price, max_price) =
        prices.fold((first_price, first_price), |(min, max), price| (min.min(price), max.max(price)));

    let dataset = FestivalDataset {
        festival: "第十六届北京国际电影节·北京展映".to_string(),
        source_file: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown.xlsx")
            .to_string(),
        imported_at: now_text(),
        summary: Summary {
            screening_count: screenings.len(),
            film_count: films.len(),
            venue_count: venues.len(),
            date_count: dates.len(),
            unit_count: units.len(),
            price_range: [min_price, max_price],
        },
        dates: dates.into_iter().collect(),
        units: units.into_iter().collect(),
        venues: venues.into_iter().collect(),
        films,
        screenings,
    };

    Ok((dataset, skipped_rows))
}

fn parse_command_payload<T: DeserializeOwned>(value: Value, label: &str) -> Result<T, String> {
    serde_json::from_value(value).map_err(|error| format!("failed to parse {label}: {error}"))
}

fn screening_matches_filters(screening: &Screening, filters: &ScreeningFilters) -> bool {
    let query = filters.query.trim().to_lowercase();
    let haystack = [
        screening.title_zh.as_str(),
        screening.title_en.as_str(),
        screening.unit.as_str(),
        screening.venue.as_str(),
        screening.hall.as_str(),
        screening.activity_info.as_str(),
    ]
    .join(" ")
    .to_lowercase();

    if !query.is_empty() && !haystack.contains(&query) {
        return false;
    }
    if !filters.date.is_empty() && filters.date != "all" && screening.date != filters.date {
        return false;
    }
    if !filters.unit.is_empty() && filters.unit != "all" && !screening.unit.contains(&filters.unit) {
        return false;
    }
    if !filters.venue.is_empty()
        && filters.venue != "all"
        && !screening.venue.contains(&filters.venue)
    {
        return false;
    }
    if !filters.max_price.is_empty() && screening.price_cny > parse_number(&filters.max_price) {
        return false;
    }

    true
}

fn end_time_text(screening: &Screening) -> String {
    screening.ends_at.get(11..16).unwrap_or("").to_string()
}

fn overlaps(left: &Screening, right: &Screening, buffer_minutes: i32) -> bool {
    let left_start = NaiveDateTime::parse_from_str(&left.starts_at, "%Y-%m-%dT%H:%M");
    let left_end = NaiveDateTime::parse_from_str(&left.ends_at, "%Y-%m-%dT%H:%M");
    let right_start = NaiveDateTime::parse_from_str(&right.starts_at, "%Y-%m-%dT%H:%M");
    let right_end = NaiveDateTime::parse_from_str(&right.ends_at, "%Y-%m-%dT%H:%M");

    let (Ok(left_start), Ok(left_end), Ok(right_start), Ok(right_end)) =
        (left_start, left_end, right_start, right_end)
    else {
        return false;
    };

    let left_end_with_buffer = left_end + Duration::minutes(i64::from(buffer_minutes.max(0)));
    let right_end_with_buffer = right_end + Duration::minutes(i64::from(buffer_minutes.max(0)));
    left_start < right_end_with_buffer && right_start < left_end_with_buffer
}

fn score_screening(screening: &Screening, profile: &PreferenceProfile) -> RecommendationScreening {
    let mut score = 48;
    let mut reasons = vec!["满足基础筛选".to_string()];

    if profile.preferred_units.contains(&screening.unit) {
        score += 9;
        reasons.push("命中偏好单元".to_string());
    }
    if profile.preferred_venues.contains(&screening.venue) {
        score += 7;
        reasons.push("命中偏好影院".to_string());
    }
    if profile.prefer_with_activity && !screening.activity_info.is_empty() {
        score += 8;
        reasons.push("含映后或特别活动".to_string());
    }
    if screening.year >= profile.preferred_year_range[0]
        && screening.year <= profile.preferred_year_range[1]
    {
        score += 5;
        reasons.push("年份落在偏好区间".to_string());
    }
    if screening.duration_minutes >= profile.preferred_duration_range[0]
        && screening.duration_minutes <= profile.preferred_duration_range[1]
    {
        score += 4;
        reasons.push("片长落在偏好区间".to_string());
    }

    let price_bonus = (6 - (screening.price_cny / 30)).max(0);
    if price_bonus > 0 {
        score += price_bonus;
        reasons.push("票价相对友好".to_string());
    }

    RecommendationScreening {
        screening: screening.clone(),
        score,
        reasons,
    }
}

fn generate_recommendations_inner(
    dataset: &FestivalDataset,
    profile: &PreferenceProfile,
) -> RecommendationResult {
    let mut scored = Vec::new();
    let mut filtered_out_count = 0usize;

    for screening in &dataset.screenings {
        if !profile.active_dates.is_empty() && !profile.active_dates.contains(&screening.date) {
            filtered_out_count += 1;
            continue;
        }
        if screening.price_cny > profile.max_price_per_screening {
            filtered_out_count += 1;
            continue;
        }
        if !profile.latest_end_time.is_empty() && end_time_text(screening) > profile.latest_end_time {
            filtered_out_count += 1;
            continue;
        }

        scored.push(score_screening(screening, profile));
    }

    let considered_count = scored.len();

    scored.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.screening.starts_at.cmp(&right.screening.starts_at))
    });

    let mut selected = Vec::new();
    let mut daily_counts: HashMap<String, i32> = HashMap::new();
    let mut remaining_budget = profile.total_budget_cny.max(0);
    let mut conflict_reject_count = 0usize;

    for candidate in scored.iter().cloned() {
        if candidate.screening.price_cny > remaining_budget {
            continue;
        }

        let next_daily_count = daily_counts
            .get(&candidate.screening.date)
            .copied()
            .unwrap_or(0)
            + 1;
        if next_daily_count > profile.max_screenings_per_day.max(1) {
            continue;
        }

        if selected
            .iter()
            .any(|picked: &RecommendationScreening| overlaps(&picked.screening, &candidate.screening, profile.buffer_minutes))
        {
            conflict_reject_count += 1;
            continue;
        }

        remaining_budget -= candidate.screening.price_cny;
        daily_counts.insert(candidate.screening.date.clone(), next_daily_count);
        selected.push(candidate);
    }

    selected.sort_by(|left, right| left.screening.starts_at.cmp(&right.screening.starts_at));

    let selected_ids: BTreeSet<String> = selected
        .iter()
        .map(|item| item.screening.id.clone())
        .collect();
    let mut alternatives_by_date: BTreeMap<String, Vec<RecommendationScreening>> = BTreeMap::new();

    for candidate in scored {
        if selected_ids.contains(&candidate.screening.id) {
            continue;
        }
        let bucket = alternatives_by_date
            .entry(candidate.screening.date.clone())
            .or_default();
        if bucket.len() < 3 {
            bucket.push(candidate);
        }
    }

    RecommendationResult {
        total_cost_cny: selected.iter().map(|item| item.screening.price_cny).sum(),
        considered_count,
        filtered_out_count,
        conflict_reject_count,
        alternatives_by_date,
        selected,
    }
}

fn screening_lookup(dataset: &FestivalDataset) -> HashMap<String, Screening> {
    dataset
        .screenings
        .iter()
        .cloned()
        .map(|screening| (screening.id.clone(), screening))
        .collect()
}

fn csv_escape(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn itinerary_csv(screenings: &[Screening]) -> String {
    let mut rows = vec![
        ["影片", "单元", "开始时间", "结束时间", "影院", "影厅", "票价", "活动信息"]
            .join(","),
    ];

    for screening in screenings {
        rows.push(
            [
                csv_escape(&screening.title_zh),
                csv_escape(&screening.unit),
                csv_escape(&screening.starts_at),
                csv_escape(&screening.ends_at),
                csv_escape(&screening.venue),
                csv_escape(&screening.hall),
                csv_escape(&screening.price_cny.to_string()),
                csv_escape(&screening.activity_info),
            ]
            .join(","),
        );
    }

    rows.join("\n")
}

fn parse_starts_at(screening: &Screening) -> Result<NaiveDateTime, String> {
    NaiveDateTime::parse_from_str(&screening.starts_at, "%Y-%m-%dT%H:%M")
        .map_err(|error| format!("failed to parse screening start time `{}`: {error}", screening.starts_at))
}

fn parse_ends_at(screening: &Screening) -> Result<NaiveDateTime, String> {
    NaiveDateTime::parse_from_str(&screening.ends_at, "%Y-%m-%dT%H:%M")
        .map_err(|error| format!("failed to parse screening end time `{}`: {error}", screening.ends_at))
}

fn itinerary_ics(screenings: &[Screening]) -> Result<String, String> {
    let mut lines = vec![
        "BEGIN:VCALENDAR".to_string(),
        "VERSION:2.0".to_string(),
        "PRODID:-//BJIFF Helper//Festival Scheduler//CN".to_string(),
    ];

    for screening in screenings {
        let starts_at = parse_starts_at(screening)?;
        let ends_at = parse_ends_at(screening)?;
        lines.push("BEGIN:VEVENT".to_string());
        lines.push(format!("UID:{}@bjiff-helper", screening.id));
        lines.push(format!(
            "DTSTAMP:{}",
            Local::now().format("%Y%m%dT%H%M%S")
        ));
        lines.push(format!("DTSTART:{}", starts_at.format("%Y%m%dT%H%M%S")));
        lines.push(format!("DTEND:{}", ends_at.format("%Y%m%dT%H%M%S")));
        lines.push(format!("SUMMARY:{}", screening.title_zh));
        lines.push(format!(
            "LOCATION:{} {}",
            screening.venue,
            screening.hall
        ));
        let description = [
            format!("单元：{}", screening.unit),
            format!("票价：{} 元", screening.price_cny),
            if screening.activity_info.is_empty() {
                String::new()
            } else {
                format!("活动：{}", screening.activity_info)
            },
        ]
        .into_iter()
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join("\\n");
        lines.push(format!("DESCRIPTION:{description}"));
        lines.push("END:VEVENT".to_string());
    }

    lines.push("END:VCALENDAR".to_string());
    Ok(lines.join("\r\n"))
}

fn choose_excel_file() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"try
set selectedFile to choose file with prompt "选择要导入的电影节排片 Excel" of type {"org.openxmlformats.spreadsheetml.sheet","org.openxmlformats.spreadsheetml.template","com.microsoft.excel.xlsx"}
POSIX path of selectedFile
on error number -128
return ""
end try"#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|error| format!("failed to open macOS file picker: {error}"))?;

        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if message.is_empty() {
                "failed to select file".to_string()
            } else {
                message
            });
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            return Ok(None);
        }

        return Ok(Some(selected));
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("native file picker is not implemented for this platform yet".to_string())
    }
}

fn list_saved_itineraries_inner(
    connection: &Connection,
    dataset: &FestivalDataset,
) -> Result<Vec<SavedItinerarySummary>, String> {
    let lookup = screening_lookup(dataset);
    let mut statement = connection
        .prepare(
            "
            SELECT id, screening_ids_json, total_cost_cny, created_at
            FROM itineraries
            ORDER BY created_at DESC
            LIMIT 8
            ",
        )
        .map_err(|error| format!("failed to prepare itinerary listing query: {error}"))?;

    let mapped = statement
        .query_map([], |row| {
            Ok(StoredItinerary {
                id: row.get(0)?,
                screening_ids: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(1)?)
                    .unwrap_or_default(),
                total_cost_cny: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|error| format!("failed to query saved itineraries: {error}"))?;

    let mut summaries = Vec::new();
    for item in mapped {
        let itinerary = item.map_err(|error| format!("failed to read saved itinerary row: {error}"))?;
        let screenings = itinerary
            .screening_ids
            .iter()
            .filter_map(|id| lookup.get(id))
            .collect::<Vec<_>>();
        let title_preview = screenings
            .iter()
            .take(2)
            .map(|screening| screening.title_zh.clone())
            .collect::<Vec<_>>()
            .join(" / ");
        let first_date = screenings
            .iter()
            .map(|screening| screening.date.clone())
            .min()
            .unwrap_or_default();

        summaries.push(SavedItinerarySummary {
            id: itinerary.id,
            screening_ids: itinerary.screening_ids,
            total_cost_cny: itinerary.total_cost_cny,
            created_at: itinerary.created_at,
            screening_count: screenings.len(),
            title_preview: if title_preview.is_empty() {
                "暂无场次摘要".to_string()
            } else {
                title_preview
            },
            first_date,
        });
    }

    Ok(summaries)
}

fn make_action_result(message: String, affected_count: Option<usize>) -> ActionResult {
    ActionResult {
        status: "ok".to_string(),
        message,
        affected_count,
    }
}

#[tauri::command]
fn load_dataset(app: AppHandle) -> Result<Value, String> {
    let dataset = load_cached_or_bundled_dataset(&app)?;
    serde_json::to_value(dataset).map_err(|error| format!("failed to serialize dataset: {error}"))
}

#[tauri::command]
fn ping() -> String {
    "bjiff-helper-tauri-ready".to_string()
}

#[tauri::command]
fn pick_import_file() -> Result<Option<String>, String> {
    choose_excel_file()
}

#[tauri::command]
fn reset_dataset(app: AppHandle) -> Result<Value, String> {
    let connection = open_connection(&app)?;
    let deleted = delete_key(&connection, DATASET_KEY)?;
    serde_json::to_value(make_action_result(
        if deleted > 0 {
            "已清空导入数据，当前会回退到内置样本。".to_string()
        } else {
            "当前没有额外导入数据，仍使用内置样本。".to_string()
        },
        Some(deleted),
    ))
    .map_err(|error| format!("failed to serialize dataset reset result: {error}"))
}

#[tauri::command]
fn load_ui_state(app: AppHandle) -> Result<Value, String> {
    let connection = open_connection(&app)?;
    let state = read_json_value::<UiState>(&connection, UI_STATE_KEY)?;
    serde_json::to_value(state).map_err(|error| format!("failed to serialize ui state: {error}"))
}

#[tauri::command]
fn save_ui_state(app: AppHandle, state: Value) -> Result<Value, String> {
    let state = parse_command_payload::<UiState>(state, "ui state")?;
    let connection = open_connection(&app)?;
    write_json_value(&connection, UI_STATE_KEY, &state)?;
    write_json_value(&connection, PREFERENCE_PROFILE_KEY, &state.profile)?;
    serde_json::to_value(state).map_err(|error| format!("failed to serialize stored ui state: {error}"))
}

#[tauri::command]
fn list_itineraries(app: AppHandle) -> Result<Value, String> {
    let connection = open_connection(&app)?;
    let dataset = load_cached_or_bundled_dataset(&app)?;
    let itineraries = list_saved_itineraries_inner(&connection, &dataset)?;
    serde_json::to_value(itineraries)
        .map_err(|error| format!("failed to serialize saved itineraries: {error}"))
}

#[tauri::command]
fn delete_itinerary(app: AppHandle, itinerary_id: String) -> Result<Value, String> {
    let connection = open_connection(&app)?;
    let deleted = connection
        .execute("DELETE FROM itineraries WHERE id = ?1", params![itinerary_id])
        .map_err(|error| format!("failed to delete itinerary: {error}"))?;

    serde_json::to_value(make_action_result(
        if deleted > 0 {
            "已删除该历史片单。".to_string()
        } else {
            "未找到对应的历史片单。".to_string()
        },
        Some(deleted),
    ))
    .map_err(|error| format!("failed to serialize itinerary deletion result: {error}"))
}

#[tauri::command]
fn clear_itineraries(app: AppHandle) -> Result<Value, String> {
    let connection = open_connection(&app)?;
    let deleted = connection
        .execute("DELETE FROM itineraries", [])
        .map_err(|error| format!("failed to clear itineraries: {error}"))?;

    serde_json::to_value(make_action_result(
        if deleted > 0 {
            format!("已清空 {deleted} 条历史片单。")
        } else {
            "当前没有历史片单可清空。".to_string()
        },
        Some(deleted),
    ))
    .map_err(|error| format!("failed to serialize itinerary clear result: {error}"))
}

#[tauri::command]
fn import_schedule(app: AppHandle, file_path: String) -> Result<ImportSummary, String> {
    let path = Path::new(&file_path);
    let (dataset, skipped_rows) = parse_excel_schedule(path)?;
    let imported_at = dataset.imported_at.clone();
    let connection = open_connection(&app)?;
    write_json_value(&connection, DATASET_KEY, &dataset)?;

    Ok(ImportSummary {
        source_file: dataset.source_file.clone(),
        importer_kind: "bjiff_beijing_screenings".to_string(),
        status: "imported".to_string(),
        message: format!(
            "已导入 {} 场、{} 部影片，跳过 {} 行无法解析的记录。",
            dataset.summary.screening_count, dataset.summary.film_count, skipped_rows
        ),
        screening_count: dataset.summary.screening_count,
        film_count: dataset.summary.film_count,
        venue_count: dataset.summary.venue_count,
        imported_at,
        skipped_rows,
    })
}

#[tauri::command]
fn list_screenings(app: AppHandle, filters: Value) -> Result<Value, String> {
    let filters = parse_command_payload::<ScreeningFilters>(filters, "screening filters")?;
    let dataset = load_cached_or_bundled_dataset(&app)?;
    let screenings = dataset
        .screenings
        .into_iter()
        .filter(|screening| screening_matches_filters(screening, &filters))
        .collect::<Vec<_>>();

    serde_json::to_value(screenings)
        .map_err(|error| format!("failed to serialize screening list: {error}"))
}

#[tauri::command]
fn save_preferences(app: AppHandle, profile: Value) -> Result<Value, String> {
    let profile = parse_command_payload::<PreferenceProfile>(profile, "preference profile")?;
    let connection = open_connection(&app)?;
    write_json_value(&connection, PREFERENCE_PROFILE_KEY, &profile)?;
    let next_ui_state = read_json_value::<UiState>(&connection, UI_STATE_KEY)?.unwrap_or(UiState {
        profile: default_profile(),
        selections: UserSelections::default(),
        active_section: "overview".to_string(),
        current_itinerary_ids: Vec::new(),
    });
    write_json_value(
        &connection,
        UI_STATE_KEY,
        &UiState {
            profile: profile.clone(),
            ..next_ui_state
        },
    )?;
    serde_json::to_value(profile)
        .map_err(|error| format!("failed to serialize stored preference profile: {error}"))
}

#[tauri::command]
fn generate_recommendations(app: AppHandle, profile: Value) -> Result<Value, String> {
    let profile = parse_command_payload::<PreferenceProfile>(profile, "preference profile")?;
    let connection = open_connection(&app)?;
    write_json_value(&connection, PREFERENCE_PROFILE_KEY, &profile)?;
    let dataset = load_cached_or_bundled_dataset(&app)?;
    let recommendations = generate_recommendations_inner(&dataset, &profile);
    serde_json::to_value(recommendations)
        .map_err(|error| format!("failed to serialize recommendation result: {error}"))
}

#[tauri::command]
fn save_itinerary(app: AppHandle, screening_ids: Vec<String>) -> Result<Value, String> {
    let dataset = load_cached_or_bundled_dataset(&app)?;
    let lookup = screening_lookup(&dataset);
    let mut unique_ids = BTreeSet::new();
    let mut ordered_ids = Vec::new();
    let mut total_cost_cny = 0;

    for screening_id in screening_ids {
        if unique_ids.insert(screening_id.clone()) {
            if let Some(screening) = lookup.get(&screening_id) {
                total_cost_cny += screening.price_cny;
                ordered_ids.push(screening_id);
            }
        }
    }

    let itinerary = StoredItinerary {
        id: format!("itinerary-{}", Local::now().timestamp_millis()),
        screening_ids: ordered_ids,
        total_cost_cny,
        created_at: now_text(),
    };

    let connection = open_connection(&app)?;
    connection
        .execute(
            "
            INSERT INTO itineraries (id, screening_ids_json, total_cost_cny, created_at)
            VALUES (?1, ?2, ?3, ?4)
            ",
            params![
                itinerary.id,
                serde_json::to_string(&itinerary.screening_ids)
                    .map_err(|error| format!("failed to serialize itinerary ids: {error}"))?,
                itinerary.total_cost_cny,
                itinerary.created_at
            ],
        )
        .map_err(|error| format!("failed to save itinerary: {error}"))?;

    serde_json::to_value(itinerary).map_err(|error| format!("failed to serialize itinerary: {error}"))
}

#[tauri::command]
fn export_itinerary(app: AppHandle, itinerary_id: String, format: String) -> Result<ExportResult, String> {
    let connection = open_connection(&app)?;
    let stored = connection
        .query_row(
            "
            SELECT screening_ids_json, total_cost_cny, created_at
            FROM itineraries
            WHERE id = ?1
            ",
            params![itinerary_id],
            |row| {
                let screening_ids_json: String = row.get(0)?;
                let screening_ids = serde_json::from_str::<Vec<String>>(&screening_ids_json).map_err(
                    |error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            screening_ids_json.len(),
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    },
                )?;
                Ok(StoredItinerary {
                    id: itinerary_id.clone(),
                    screening_ids,
                    total_cost_cny: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("failed to load itinerary for export: {error}"))?
        .ok_or_else(|| "itinerary not found".to_string())?;

    let dataset = load_cached_or_bundled_dataset(&app)?;
    let lookup = screening_lookup(&dataset);
    let mut screenings = stored
        .screening_ids
        .iter()
        .filter_map(|screening_id| lookup.get(screening_id).cloned())
        .collect::<Vec<_>>();
    screenings.sort_by(|left, right| left.starts_at.cmp(&right.starts_at));

    let normalized_format = format.to_lowercase();
    let (file_name, content) = match normalized_format.as_str() {
        "csv" => (
            format!("{}.csv", stored.id),
            itinerary_csv(&screenings),
        ),
        "ics" => (
            format!("{}.ics", stored.id),
            itinerary_ics(&screenings)?,
        ),
        other => return Err(format!("unsupported export format: {other}")),
    };

    let path = exports_dir(&app)?.join(file_name);
    fs::write(&path, content).map_err(|error| format!("failed to write export file: {error}"))?;

    Ok(ExportResult {
        status: "exported".to_string(),
        format: normalized_format,
        message: format!(
            "已导出 {} 场影片到 {}。",
            screenings.len(),
            path.display()
        ),
        file_path: path.to_string_lossy().to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_dataset,
            ping,
            pick_import_file,
            reset_dataset,
            load_ui_state,
            save_ui_state,
            list_itineraries,
            delete_itinerary,
            clear_itineraries,
            import_schedule,
            list_screenings,
            save_preferences,
            generate_recommendations,
            save_itinerary,
            export_itinerary
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
