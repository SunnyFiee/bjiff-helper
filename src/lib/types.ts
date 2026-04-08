export interface FestivalDataset {
  festival: string;
  sourceFile: string;
  importedAt: string;
  summary: {
    screeningCount: number;
    filmCount: number;
    venueCount: number;
    dateCount: number;
    unitCount: number;
    priceRange: [number, number];
  };
  dates: string[];
  units: string[];
  venues: string[];
  films: Film[];
  screenings: Screening[];
}

export interface Film {
  id: string;
  titleZh: string;
  titleEn: string;
  year: number;
  durationMinutes: number;
  unit: string;
  screeningIds: string[];
}

export interface Screening {
  id: string;
  filmId: string;
  unit: string;
  titleZh: string;
  titleEn: string;
  year: number;
  durationMinutes: number;
  priceCny: number;
  startsAt: string;
  endsAt: string;
  date: string;
  time: string;
  venue: string;
  hall: string;
  activityInfo: string;
}

export interface PreferenceProfile {
  activeDates: string[];
  totalBudgetCny: number;
  maxPricePerScreening: number;
  maxScreeningsPerDay: number;
  latestEndTime: string;
  bufferMinutes: number;
  preferredUnits: string[];
  preferredVenues: string[];
  preferredYearRange: [number, number];
  preferredDurationRange: [number, number];
  preferWithActivity: boolean;
}

export interface ScreeningFilters {
  query: string;
  date: string;
  unit: string;
  venue: string;
  maxPrice: string;
}

export type FilmVote = "must" | "avoid";
export type ScreeningVote = "boost" | "block";

export interface UserSelections {
  filmVotes: Record<string, FilmVote | undefined>;
  screeningVotes: Record<string, ScreeningVote | undefined>;
}

export interface RecommendationScreening extends Screening {
  score: number;
  reasons: string[];
}

export interface RecommendationResult {
  selected: RecommendationScreening[];
  alternativesByDate: Record<string, RecommendationScreening[]>;
  consideredCount: number;
  filteredOutCount: number;
  conflictRejectCount: number;
  totalCostCny: number;
}

export interface ImportSummary {
  sourceFile: string;
  importerKind: string;
  status: string;
  message: string;
  screeningCount: number;
  filmCount: number;
  venueCount: number;
  importedAt: string;
  skippedRows: number;
}

export interface StoredItinerary {
  id: string;
  screeningIds: string[];
  totalCostCny: number;
  createdAt: string;
}

export interface ExportResult {
  status: string;
  format: string;
  message: string;
  filePath: string;
}

export interface SavedItinerarySummary {
  id: string;
  screeningIds: string[];
  totalCostCny: number;
  createdAt: string;
  screeningCount: number;
  titlePreview: string;
  firstDate: string;
}

export interface ActionResult {
  status: string;
  message: string;
  affectedCount?: number;
}
