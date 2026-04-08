import { formatCurrency } from "./format";
import type { RecommendationScreening, Screening } from "./types";

type ExportScreening = Screening | RecommendationScreening;

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatUtcStamp(dateTime: string) {
  return new Date(dateTime)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function exportItineraryCsv(screenings: ExportScreening[]) {
  const header = [
    "影片",
    "单元",
    "开始时间",
    "结束时间",
    "影院",
    "影厅",
    "票价",
    "活动信息",
    "推荐理由"
  ];

  const rows = screenings.map((screening) =>
    [
      screening.titleZh,
      screening.unit,
      screening.startsAt,
      screening.endsAt,
      screening.venue,
      screening.hall,
      formatCurrency(screening.priceCny),
      screening.activityInfo,
      "reasons" in screening ? screening.reasons.join(" / ") : ""
    ]
      .map((cell) => `"${String(cell).split('"').join('""')}"`)
      .join(",")
  );

  downloadText(
    [header.join(","), ...rows].join("\n"),
    "bjiff-itinerary.csv",
    "text/csv;charset=utf-8"
  );
}

export function exportItineraryIcs(screenings: ExportScreening[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BJIFF Helper//Festival Scheduler//CN"
  ];

  for (const screening of screenings) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${screening.id}@bjiff-helper`);
    lines.push(`DTSTAMP:${formatUtcStamp(new Date().toISOString())}`);
    lines.push(`DTSTART:${formatUtcStamp(screening.startsAt)}`);
    lines.push(`DTEND:${formatUtcStamp(screening.endsAt)}`);
    lines.push(`SUMMARY:${screening.titleZh}`);
    lines.push(`LOCATION:${screening.venue} ${screening.hall}`.trim());
    lines.push(
      `DESCRIPTION:${[
        `单元：${screening.unit}`,
        `票价：${formatCurrency(screening.priceCny)}`,
        screening.activityInfo ? `活动：${screening.activityInfo}` : "",
        "reasons" in screening ? `推荐：${screening.reasons.join(" / ")}` : ""
      ]
        .filter(Boolean)
        .join("\\n")}`
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  downloadText(
    lines.join("\r\n"),
    "bjiff-itinerary.ics",
    "text/calendar;charset=utf-8"
  );
}
