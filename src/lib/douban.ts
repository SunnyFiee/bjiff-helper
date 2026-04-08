import type { DoubanSubject, Film } from "./types";

const TRAILING_MARKERS = [
  "IMAX LASERSQ",
  "IMAX",
  "LASERSQ",
  "CINITY",
  "DOLBY",
  "杜比",
  "4K",
  "3D",
  "2D",
  "导演剪辑版",
  "最终剪辑版",
  "终极剪辑版",
  "加长版"
];

export function normalizeDoubanSearchText(text: string) {
  let next = text.trim();
  next = next.replace(/[（(][^()（）]*[)）]/g, " ");
  for (const marker of TRAILING_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\s*${escaped}\\s*`, "gi"), " ");
  }
  return next.replace(/\s+/g, " ").trim();
}

export function buildFilmDoubanKey(
  film: Pick<Film, "titleZh" | "titleEn" | "year" | "unit">
) {
  return [film.titleZh.trim(), film.titleEn.trim(), String(film.year), film.unit.trim()].join(
    "::"
  );
}

export function buildDoubanSearchUrl(
  filmOrQuery: Pick<Film, "titleZh" | "titleEn"> | string
) {
  const rawQuery =
    typeof filmOrQuery === "string"
      ? filmOrQuery
      : normalizeDoubanSearchText(filmOrQuery.titleZh) ||
        filmOrQuery.titleZh.trim() ||
        normalizeDoubanSearchText(filmOrQuery.titleEn) ||
        filmOrQuery.titleEn.trim();

  return `https://search.douban.com/movie/subject_search?cat=1002&search_text=${encodeURIComponent(
    rawQuery
  )}`;
}

export function buildDoubanSubjectUrl(subjectId: string) {
  return `https://movie.douban.com/subject/${subjectId}/`;
}

export function formatDoubanRatingCount(count: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
    notation: count >= 10_000 ? "compact" : "standard"
  }).format(count);
}

export function parseDoubanSubjectInput(
  input: string,
  film: Pick<Film, "titleZh" | "titleEn" | "year">
) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const matchedId =
    trimmed.match(/subject\/(\d+)/)?.[1] ?? trimmed.match(/^(\d{5,})$/)?.[1] ?? null;
  if (!matchedId) {
    return null;
  }

  return {
    id: matchedId,
    title: film.titleZh || film.titleEn || "豆瓣条目",
    year: String(film.year || ""),
    url: buildDoubanSubjectUrl(matchedId),
    coverUrl: "",
    ratingValue: 0,
    ratingCount: 0,
    summary: "手动绑定",
    credits: "",
    labels: ["手动绑定"],
    matchScore: 100,
    query: "manual"
  } satisfies DoubanSubject;
}
