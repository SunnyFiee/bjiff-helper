import metadataJson from "../data/bjiff-film-metadata.json";
import type { FestivalDataset, Film, FilmMetadata } from "./types";

interface FilmMetadataRecord extends FilmMetadata {
  titleZh: string;
  year: number;
}

const bundledMetadata = metadataJson as FilmMetadataRecord[];

const metadataByTitleYear = new Map<string, FilmMetadataRecord>();
const metadataByTitle = new Map<string, FilmMetadataRecord[]>();

for (const record of bundledMetadata) {
  const normalizedTitle = normalizeFilmMetadataTitle(record.titleZh);
  metadataByTitleYear.set(buildMetadataKey(normalizedTitle, record.year), record);
  const bucket = metadataByTitle.get(normalizedTitle) ?? [];
  bucket.push(record);
  metadataByTitle.set(normalizedTitle, bucket);
}

const MANUAL_TITLE_ALIASES: Record<string, string[]> = {
  [normalizeFilmMetadataTitle("2m²")]: ["2平方米"],
  [normalizeFilmMetadataTitle("阿戈")]: ["AGO"],
  [normalizeFilmMetadataTitle("哗变")]: ["哗变 人艺现场"],
  [normalizeFilmMetadataTitle("张居正")]: ["张居正（舞台纪录电影·话剧）"],
  [normalizeFilmMetadataTitle("滚石乐队：至臻现场")]: ["滚石乐队"],
  [normalizeFilmMetadataTitle("现代启示录：最终剪辑版")]: ["现代启示录"],
  [normalizeFilmMetadataTitle("茜茜公主2：年轻的皇后")]: ["茜茜公主2"],
  [normalizeFilmMetadataTitle("茜茜公主3：皇后的命运")]: ["茜茜公主3"],
  [normalizeFilmMetadataTitle("茶馆 人艺现场")]: ["茶馆"]
};

function buildMetadataKey(normalizedTitle: string, year: number) {
  return `${normalizedTitle}::${year}`;
}

export function normalizeFilmMetadataTitle(title: string) {
  return title
    .normalize("NFKC")
    .trim()
    .replace(/：/g, ":")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/—/g, "-")
    .replace(/\s+/g, "");
}

export function candidateMetadataTitleKeys(title: string) {
  const variants = new Set<string>();
  const queue = [title.trim()];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    const normalized = normalizeFilmMetadataTitle(current);
    if (normalized && !variants.has(normalized)) {
      variants.add(normalized);
      const aliases = MANUAL_TITLE_ALIASES[normalized] ?? [];
      for (const alias of aliases) {
        queue.push(alias);
      }
    }

    const nextVariants = [
      current.replace(/[（(]露天专场[）)]/g, "").trim(),
      current.replace(/[（(]人艺舞台4K戏剧电影[）)]/g, "").trim(),
      current.replace(/\s+Dolby\s*Vision\+Atmos$/i, "").trim(),
      current.replace(/\s+IMAX(?:\s+LaserSq)?$/i, "").trim(),
      current.replace(/\s+CINITY$/i, "").trim(),
      current.replace(/\s+4K$/i, "").trim(),
      current.replace(/\s+3D$/i, "").trim(),
      current.replace(/\s+加长版(?:\s+4K)?$/i, "").trim(),
      current.replace(/\s+导演剪辑版(?:\s+4K)?$/i, "").trim(),
      current.replace(/[:：]最终剪辑版(?:\s+4K)?$/i, "").trim(),
      current.replace(/[（(].*露天专场.*[）)]/g, "").trim()
    ];

    for (const variant of nextVariants) {
      if (variant && variant !== current) {
        queue.push(variant);
      }
    }
  }

  return Array.from(variants);
}

function pickFilmMetadata(film: Pick<Film, "titleZh" | "year">) {
  for (const normalizedTitle of candidateMetadataTitleKeys(film.titleZh)) {
    const exact = metadataByTitleYear.get(buildMetadataKey(normalizedTitle, film.year));
    if (exact) {
      return exact;
    }
  }

  let bestTitleOnly: FilmMetadataRecord | null = null;
  let bestYearDistance = Number.POSITIVE_INFINITY;

  for (const normalizedTitle of candidateMetadataTitleKeys(film.titleZh)) {
    const candidates = metadataByTitle.get(normalizedTitle) ?? [];
    for (const candidate of candidates) {
      const yearDistance = Math.abs(candidate.year - film.year);
      if (yearDistance < bestYearDistance) {
        bestTitleOnly = candidate;
        bestYearDistance = yearDistance;
      }
    }
  }

  return bestTitleOnly;
}

function cloneFilmMetadata(record: FilmMetadataRecord): FilmMetadata {
  return {
    countries: [...record.countries],
    mainlandReleaseDate: record.mainlandReleaseDate,
    languages: [...record.languages],
    genres: [...record.genres],
    cast: [...record.cast],
    castCollectCount: record.castCollectCount,
    director: record.director,
    directorCollectCount: record.directorCollectCount,
    combinedCollectCount: record.combinedCollectCount,
    doubanRatingValue: record.doubanRatingValue,
    doubanRatingCount: record.doubanRatingCount,
    imdbId: record.imdbId,
    imdbRatingValue: record.imdbRatingValue,
    imdbRatingCount: record.imdbRatingCount,
    awards: [...record.awards]
  };
}

export function enrichFestivalDataset(dataset: FestivalDataset): FestivalDataset {
  return {
    ...dataset,
    films: dataset.films.map((film) => {
      const metadata = pickFilmMetadata(film);
      return metadata
        ? {
            ...film,
            metadata: cloneFilmMetadata(metadata)
          }
        : film;
    })
  };
}
