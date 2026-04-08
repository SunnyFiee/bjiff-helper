import type {
  FestivalDataset,
  PreferenceProfile,
  RecommendationResult,
  RecommendationScreening,
  Screening,
  UserSelections
} from "./types";

function timePart(dateTime: string) {
  return new Date(dateTime).toTimeString().slice(0, 5);
}

export function getHardRejectReasons(
  screening: Screening,
  profile: PreferenceProfile,
  selections: UserSelections
) {
  const reasons: string[] = [];
  const screeningVote = selections.screeningVotes[screening.id];
  const filmVote = selections.filmVotes[screening.filmId];

  if (screeningVote === "block") {
    reasons.push("已手动屏蔽该场");
  }
  if (filmVote === "avoid") {
    reasons.push("影片已标记为不考虑");
  }
  if (
    profile.activeDates.length > 0 &&
    !profile.activeDates.includes(screening.date)
  ) {
    reasons.push("不在可看片日内");
  }
  if (screening.priceCny > profile.maxPricePerScreening) {
    reasons.push("超过单场票价上限");
  }
  if (timePart(screening.endsAt) > profile.latestEndTime) {
    reasons.push("结束时间晚于设定上限");
  }

  return reasons;
}

export function scoreScreening(
  screening: Screening,
  profile: PreferenceProfile,
  selections: UserSelections
) {
  const reasons: string[] = ["满足基础筛选"];
  let score = 48;

  if (selections.filmVotes[screening.filmId] === "must") {
    score += 26;
    reasons.push("影片已标记为必看");
  }
  if (selections.screeningVotes[screening.id] === "boost") {
    score += 16;
    reasons.push("手动优先该场");
  }
  if (profile.preferredUnits.includes(screening.unit)) {
    score += 9;
    reasons.push("命中偏好单元");
  }
  if (profile.preferredVenues.includes(screening.venue)) {
    score += 7;
    reasons.push("命中偏好影院");
  }
  if (profile.preferWithActivity && screening.activityInfo) {
    score += 8;
    reasons.push("含映后或特别活动");
  }
  if (
    screening.year >= profile.preferredYearRange[0] &&
    screening.year <= profile.preferredYearRange[1]
  ) {
    score += 5;
    reasons.push("年份落在偏好区间");
  }
  if (
    screening.durationMinutes >= profile.preferredDurationRange[0] &&
    screening.durationMinutes <= profile.preferredDurationRange[1]
  ) {
    score += 4;
    reasons.push("片长落在偏好区间");
  }

  const priceBonus = Math.max(0, 6 - Math.floor(screening.priceCny / 30));
  if (priceBonus > 0) {
    score += priceBonus;
    reasons.push("票价相对友好");
  }

  return { score, reasons };
}

export function screeningOverlaps(
  left: Screening,
  right: Screening,
  bufferMinutes: number
) {
  const leftStart = new Date(left.startsAt).getTime();
  const leftEnd = new Date(left.endsAt).getTime() + bufferMinutes * 60 * 1000;
  const rightStart = new Date(right.startsAt).getTime();
  const rightEnd =
    new Date(right.endsAt).getTime() + bufferMinutes * 60 * 1000;
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function generateRecommendations(
  dataset: FestivalDataset,
  profile: PreferenceProfile,
  selections: UserSelections
): RecommendationResult {
  const scored: RecommendationScreening[] = [];
  let filteredOutCount = 0;

  for (const screening of dataset.screenings) {
    const rejectReasons = getHardRejectReasons(screening, profile, selections);
    if (rejectReasons.length > 0) {
      filteredOutCount += 1;
      continue;
    }

    const { score, reasons } = scoreScreening(screening, profile, selections);
    scored.push({ ...screening, score, reasons });
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.startsAt.localeCompare(right.startsAt);
  });

  const selected: RecommendationScreening[] = [];
  const dailyCounts: Record<string, number> = {};
  let remainingBudget = profile.totalBudgetCny;
  let conflictRejectCount = 0;

  for (const screening of scored) {
    if (screening.priceCny > remainingBudget) {
      continue;
    }

    const nextCount = (dailyCounts[screening.date] ?? 0) + 1;
    if (nextCount > profile.maxScreeningsPerDay) {
      continue;
    }

    const hasConflict = selected.some((picked) =>
      screeningOverlaps(picked, screening, profile.bufferMinutes)
    );
    if (hasConflict) {
      conflictRejectCount += 1;
      continue;
    }

    selected.push(screening);
    dailyCounts[screening.date] = nextCount;
    remainingBudget -= screening.priceCny;
  }

  const selectedIds = new Set(selected.map((item) => item.id));
  const alternativesByDate: Record<string, RecommendationScreening[]> = {};
  for (const screening of scored) {
    if (selectedIds.has(screening.id)) {
      continue;
    }

    const bucket = alternativesByDate[screening.date] ?? [];
    if (bucket.length < 3) {
      bucket.push(screening);
      alternativesByDate[screening.date] = bucket;
    }
  }

  return {
    selected: selected.sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt)
    ),
    alternativesByDate,
    consideredCount: scored.length,
    filteredOutCount,
    conflictRejectCount,
    totalCostCny: selected.reduce((sum, item) => sum + item.priceCny, 0)
  };
}
