import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  formatCurrency,
  formatDateLabel,
  formatDateTimeLabel,
  formatDuration,
  formatTimeLabel
} from "../lib/format";
import { getHardRejectReasons } from "../lib/recommendation";
import type {
  Film,
  FestivalDataset,
  FilmVote,
  PreferenceProfile,
  RecommendationResult,
  Screening,
  ScreeningVote,
  UserSelections
} from "../lib/types";

interface TimelineViewProps {
  dataset: FestivalDataset;
  profile: PreferenceProfile;
  selections: UserSelections;
  recommendation: RecommendationResult | null;
  currentItineraryIds: Set<string>;
  onFilmVote: (filmId: string, vote?: FilmVote) => void;
  onScreeningVote: (screeningId: string, vote?: ScreeningVote) => void;
  onToggleItineraryScreening: (screeningId: string) => void;
}

interface TimelineItem {
  screening: Screening;
  laneIndex: number;
  laneCount: number;
  topPx: number;
  heightPx: number;
}

interface TimelineWindow {
  startHour: number;
  endHour: number;
  totalMinutes: number;
  hourMarks: string[];
}

interface DayTransition {
  from: Screening;
  to: Screening;
  gapMinutes: number;
  status: "conflict" | "tight" | "ok";
}

interface FocusedSelectionContext {
  overlaps: Screening[];
  previous: Screening | null;
  next: Screening | null;
  gapBefore: number | null;
  gapAfter: number | null;
}

interface FocusedSelectionFeedback {
  severity: "success" | "warning" | "error";
  title: string;
  lines: string[];
}

interface NearbyScreeningItem {
  screening: Screening;
  relation: "overlap" | "before" | "after";
  gapMinutes: number;
}

type TimelineFilter = "all" | "itinerary" | "recommended" | "boosted" | "blocked";
type TimelineDensity = "compact" | "balanced" | "expanded";

const FILTER_OPTIONS: TimelineFilter[] = [
  "all",
  "itinerary",
  "recommended",
  "boosted",
  "blocked"
];

const FILTER_LABELS: Record<TimelineFilter, string> = {
  all: "全部场次",
  itinerary: "当前片单",
  recommended: "推荐草案",
  boosted: "已优先",
  blocked: "已屏蔽"
};

const DENSITY_OPTIONS: TimelineDensity[] = ["compact", "balanced", "expanded"];

const DENSITY_LABELS: Record<TimelineDensity, string> = {
  compact: "紧凑",
  balanced: "均衡",
  expanded: "展开"
};

const DENSITY_CONFIG: Record<
  TimelineDensity,
  { minHeight: number; pixelsPerHour: number; laneWidth: number }
> = {
  compact: { minHeight: 880, pixelsPerHour: 112, laneWidth: 220 },
  balanced: { minHeight: 1080, pixelsPerHour: 136, laneWidth: 250 },
  expanded: { minHeight: 1320, pixelsPerHour: 164, laneWidth: 280 }
};

const TIMELINE_VIEWPORT_HEIGHT: Record<
  TimelineDensity,
  { xs: number; md: number; xl: number }
> = {
  compact: { xs: 400, md: 460, xl: 520 },
  balanced: { xs: 460, md: 560, xl: 640 },
  expanded: { xs: 520, md: 640, xl: 720 }
};

const TIMELINE_GUTTER_WIDTH = 132;
const TIMELINE_TRAILING_PADDING = 56;
const TIMELINE_CARD_GAP = 14;
const TIMELINE_CARD_MIN_HEIGHT = 34;
const TIMELINE_CARD_VERTICAL_GAP = 6;

function minutesSinceMidnight(dateTime: string) {
  const date = new Date(dateTime);
  return date.getHours() * 60 + date.getMinutes();
}

function minutesFromTimelineStart(dateTime: string, startHour: number) {
  return minutesSinceMidnight(dateTime) - startHour * 60;
}

function screeningStart(screening: Screening) {
  return new Date(screening.startsAt).getTime();
}

function screeningEnd(screening: Screening) {
  return new Date(screening.endsAt).getTime();
}

function formatHourMark(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildTimelineWindow(screenings: Screening[]): TimelineWindow {
  if (screenings.length === 0) {
    return {
      startHour: 8,
      endHour: 23,
      totalMinutes: 15 * 60,
      hourMarks: Array.from({ length: 16 }, (_, index) => formatHourMark(8 + index))
    };
  }

  const earliestStart = Math.min(...screenings.map((screening) => minutesSinceMidnight(screening.startsAt)));
  const latestEnd = Math.max(...screenings.map((screening) => minutesSinceMidnight(screening.endsAt)));

  let startHour = Math.max(6, Math.floor(earliestStart / 60) - 1);
  let endHour = Math.min(24, Math.ceil(latestEnd / 60) + 1);
  if (endHour - startHour < 6) {
    endHour = Math.min(24, startHour + 6);
    startHour = Math.max(6, endHour - 6);
  }

  return {
    startHour,
    endHour,
    totalMinutes: Math.max((endHour - startHour) * 60, 60),
    hourMarks: Array.from(
      { length: endHour - startHour + 1 },
      (_, index) => formatHourMark(startHour + index)
    )
  };
}

function screeningPriority(screening: Screening, selections: UserSelections) {
  if (selections.screeningVotes[screening.id] === "boost") {
    return 2;
  }
  if (selections.filmVotes[screening.filmId] === "must") {
    return 1;
  }
  return 0;
}

function isBlockedScreening(screening: Screening, selections: UserSelections) {
  return (
    selections.screeningVotes[screening.id] === "block" ||
    selections.filmVotes[screening.filmId] === "avoid"
  );
}

function screeningLaneBucket(
  screening: Screening,
  selections: UserSelections,
  currentItineraryIds: Set<string>
) {
  if (currentItineraryIds.has(screening.id)) {
    return 0;
  }
  if (isBlockedScreening(screening, selections)) {
    return 3;
  }
  if (screeningPriority(screening, selections) > 0) {
    return 1;
  }
  return 2;
}

function layoutTimeline(
  screenings: Screening[],
  selections: UserSelections,
  currentItineraryIds: Set<string>,
  timelineWindow: TimelineWindow,
  timelineCanvasHeight: number
) {
  const ordered = [...screenings].sort((left, right) => {
    const startDifference = screeningStart(left) - screeningStart(right);
    if (startDifference !== 0) {
      return startDifference;
    }

    const bucketDifference =
      screeningLaneBucket(left, selections, currentItineraryIds) -
      screeningLaneBucket(right, selections, currentItineraryIds);
    if (bucketDifference !== 0) {
      return bucketDifference;
    }

    const priorityDifference =
      screeningPriority(right, selections) - screeningPriority(left, selections);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const endDifference = screeningEnd(right) - screeningEnd(left);
    if (endDifference !== 0) {
      return endDifference;
    }

    return left.id.localeCompare(right.id);
  });

  const laneAssignments = new Map<string, number>();
  const positions = new Map<string, { topPx: number; heightPx: number }>();
  const activeLanes: Array<{ id: string; bottomPx: number; bucket: number }> = [];
  let laneCount = 1;

  for (const screening of ordered) {
    const topPx =
      (minutesFromTimelineStart(screening.startsAt, timelineWindow.startHour) /
        timelineWindow.totalMinutes) *
      timelineCanvasHeight;
    const actualHeight =
      (Math.max(screening.durationMinutes, 0) / timelineWindow.totalMinutes) *
      timelineCanvasHeight;
    const heightPx = Math.max(TIMELINE_CARD_MIN_HEIGHT, actualHeight);
    const bottomPx = topPx + heightPx + TIMELINE_CARD_VERTICAL_GAP;
    const bucket = screeningLaneBucket(screening, selections, currentItineraryIds);

    for (let index = activeLanes.length - 1; index >= 0; index -= 1) {
      if (activeLanes[index].bottomPx <= topPx) {
        activeLanes.splice(index, 1);
      }
    }

    const firstLowerPriorityIndex = activeLanes.findIndex((item) => item.bucket > bucket);
    const insertIndex =
      firstLowerPriorityIndex === -1 ? activeLanes.length : firstLowerPriorityIndex;

    activeLanes.splice(insertIndex, 0, {
      id: screening.id,
      bottomPx,
      bucket
    });

    activeLanes.forEach((item, index) => {
      laneAssignments.set(item.id, index);
    });
    positions.set(screening.id, { topPx, heightPx });
    laneCount = Math.max(laneCount, activeLanes.length);
  }

  return ordered.map((screening) => ({
    screening,
    laneIndex: laneAssignments.get(screening.id) ?? 0,
    laneCount,
    topPx: positions.get(screening.id)?.topPx ?? 0,
    heightPx: positions.get(screening.id)?.heightPx ?? TIMELINE_CARD_MIN_HEIGHT
  }));
}

function pickDefaultFocusedId(
  date: string,
  screenings: Screening[],
  recommendation: RecommendationResult | null,
  currentItineraryIds: Set<string>
) {
  const currentItem = screenings.find((screening) => currentItineraryIds.has(screening.id));
  if (currentItem) {
    return currentItem.id;
  }
  const recommended = recommendation?.selected.find((screening) => screening.date === date);
  return recommended?.id ?? screenings[0]?.id ?? null;
}

function analyzeDayTransitions(screenings: Screening[], bufferMinutes: number) {
  const sorted = [...screenings].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const transitions: DayTransition[] = [];
  let conflictCount = 0;
  let tightCount = 0;
  let minGapMinutes: number | null = null;

  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1];
    const to = sorted[index];
    const gapMinutes = Math.round((screeningStart(to) - screeningEnd(from)) / 60000);
    const status =
      gapMinutes < 0 ? "conflict" : gapMinutes < bufferMinutes ? "tight" : "ok";

    if (status === "conflict") {
      conflictCount += 1;
    } else if (status === "tight") {
      tightCount += 1;
    }

    minGapMinutes = minGapMinutes === null ? gapMinutes : Math.min(minGapMinutes, gapMinutes);
    transitions.push({ from, to, gapMinutes, status });
  }

  return {
    sorted,
    transitions,
    conflictCount,
    tightCount,
    minGapMinutes
  };
}

function analyzeFocusedSelection(
  screening: Screening,
  dayCurrentItinerary: Screening[]
): FocusedSelectionContext {
  const others = dayCurrentItinerary
    .filter((item) => item.id !== screening.id)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const screeningStartsAt = screeningStart(screening);
  const screeningEndsAt = screeningEnd(screening);

  const overlaps = others.filter(
    (item) =>
      screeningStartsAt < screeningEnd(item) && screeningEndsAt > screeningStart(item)
  );

  let previous: Screening | null = null;
  let next: Screening | null = null;

  for (const item of others) {
    const itemEndsAt = screeningEnd(item);
    const itemStartsAt = screeningStart(item);

    if (itemEndsAt <= screeningStartsAt) {
      previous = item;
      continue;
    }

    if (!next && itemStartsAt >= screeningEndsAt) {
      next = item;
      break;
    }
  }

  return {
    overlaps,
    previous,
    next,
    gapBefore: previous
      ? Math.round((screeningStartsAt - screeningEnd(previous)) / 60000)
      : null,
    gapAfter: next ? Math.round((screeningStart(next) - screeningEndsAt) / 60000) : null
  };
}

function buildFocusedSelectionFeedback(
  context: FocusedSelectionContext,
  bufferMinutes: number
): FocusedSelectionFeedback {
  if (context.overlaps.length > 0) {
    return {
      severity: "error",
      title: "和当前片单存在直接冲突",
      lines: context.overlaps.map(
        (screening) =>
          `会和《${screening.titleZh}》时间重叠，后者是 ${formatTimeLabel(
            screening.startsAt
          )} - ${formatTimeLabel(screening.endsAt)}。`
      )
    };
  }

  const warnings: string[] = [];
  if (context.previous && context.gapBefore !== null && context.gapBefore < bufferMinutes) {
    warnings.push(
      `和上一场《${context.previous.titleZh}》之间只有 ${context.gapBefore} 分钟，低于你设定的 ${bufferMinutes} 分钟缓冲。`
    );
  }
  if (context.next && context.gapAfter !== null && context.gapAfter < bufferMinutes) {
    warnings.push(
      `到下一场《${context.next.titleZh}》开场前只有 ${context.gapAfter} 分钟，低于你设定的 ${bufferMinutes} 分钟缓冲。`
    );
  }

  if (warnings.length > 0) {
    return {
      severity: "warning",
      title: "和当前片单的切换偏紧",
      lines: warnings
    };
  }

  const lines: string[] = [];
  if (context.previous && context.gapBefore !== null) {
    lines.push(
      `上一场《${context.previous.titleZh}》结束后，有 ${context.gapBefore} 分钟缓冲再接这场。`
    );
  }
  if (context.next && context.gapAfter !== null) {
    lines.push(
      `这场结束后，到《${context.next.titleZh}》开场前还有 ${context.gapAfter} 分钟。`
    );
  }

  return {
    severity: "success",
    title: "和当前片单可以顺畅衔接",
    lines:
      lines.length > 0 ? lines : ["当天当前片单里还没有冲突场次。"]
  };
}

function formatGapSummary(gapMinutes: number | null) {
  if (gapMinutes === null) {
    return "等待排入第 2 场";
  }
  if (gapMinutes < 0) {
    return `重叠 ${Math.abs(gapMinutes)} 分`;
  }
  if (gapMinutes === 0) {
    return "无缝衔接";
  }
  return `最短 ${gapMinutes} 分`;
}

function describeTransition(transition: DayTransition, bufferMinutes: number) {
  if (transition.gapMinutes < 0) {
    return `《${transition.from.titleZh}》和《${transition.to.titleZh}》重叠 ${Math.abs(
      transition.gapMinutes
    )} 分钟`;
  }
  if (transition.gapMinutes < bufferMinutes) {
    return `《${transition.from.titleZh}》到《${transition.to.titleZh}》只有 ${transition.gapMinutes} 分钟缓冲`;
  }
  return `《${transition.from.titleZh}》到《${transition.to.titleZh}》相隔 ${transition.gapMinutes} 分钟`;
}

function buildNearbyScreenings(
  focusedScreening: Screening,
  screenings: Screening[]
): NearbyScreeningItem[] {
  return screenings
    .filter((screening) => screening.id !== focusedScreening.id)
    .map((screening) => {
      const focusedStartsAt = screeningStart(focusedScreening);
      const focusedEndsAt = screeningEnd(focusedScreening);
      const screeningStartsAt = screeningStart(screening);
      const screeningEndsAt = screeningEnd(screening);

      if (screeningStartsAt < focusedEndsAt && screeningEndsAt > focusedStartsAt) {
        return {
          screening,
          relation: "overlap" as const,
          gapMinutes: Math.round(
            (Math.min(screeningEndsAt, focusedEndsAt) -
              Math.max(screeningStartsAt, focusedStartsAt)) /
              60000
          )
        };
      }

      if (screeningEndsAt <= focusedStartsAt) {
        return {
          screening,
          relation: "before" as const,
          gapMinutes: Math.round((focusedStartsAt - screeningEndsAt) / 60000)
        };
      }

      return {
        screening,
        relation: "after" as const,
        gapMinutes: Math.round((screeningStartsAt - focusedEndsAt) / 60000)
      };
    })
    .sort((left, right) => left.gapMinutes - right.gapMinutes)
    .slice(0, 6);
}

function describeNearbyScreening(item: NearbyScreeningItem) {
  if (item.relation === "overlap") {
    return `重叠 ${item.gapMinutes} 分`;
  }
  if (item.relation === "before") {
    return `前一场后隔 ${item.gapMinutes} 分`;
  }
  return `后一场前隔 ${item.gapMinutes} 分`;
}

export function TimelineView({
  dataset,
  profile,
  selections,
  recommendation,
  currentItineraryIds,
  onFilmVote,
  onScreeningVote,
  onToggleItineraryScreening
}: TimelineViewProps) {
  const dateOptions = profile.activeDates.length > 0 ? profile.activeDates : dataset.dates;
  const [activeDate, setActiveDate] = useState<string>(dateOptions[0] ?? dataset.dates[0] ?? "");
  const [focusedScreeningId, setFocusedScreeningId] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [timelineDensity, setTimelineDensity] = useState<TimelineDensity>("balanced");
  const screeningsById = useMemo(
    () => new Map(dataset.screenings.map((screening) => [screening.id, screening])),
    [dataset.screenings]
  );
  const filmsById = useMemo(
    () => new Map(dataset.films.map((film) => [film.id, film])),
    [dataset.films]
  );

  useEffect(() => {
    if (dateOptions.length === 0) {
      return;
    }
    if (!dateOptions.includes(activeDate)) {
      setActiveDate(dateOptions[0]);
    }
  }, [activeDate, dateOptions]);

  const screeningsByDate = useMemo(() => {
    const grouped = new Map<string, Screening[]>();
    for (const screening of dataset.screenings) {
      const bucket = grouped.get(screening.date) ?? [];
      bucket.push(screening);
      grouped.set(screening.date, bucket);
    }
    for (const screenings of grouped.values()) {
      screenings.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    }
    return grouped;
  }, [dataset.screenings]);

  const activeScreenings = screeningsByDate.get(activeDate) ?? [];
  const recommendedIds = useMemo(
    () => new Set((recommendation?.selected ?? []).map((screening) => screening.id)),
    [recommendation]
  );

  const filterCounts = useMemo(
    () => ({
      all: activeScreenings.length,
      itinerary: activeScreenings.filter((screening) => currentItineraryIds.has(screening.id))
        .length,
      recommended: activeScreenings.filter((screening) => recommendedIds.has(screening.id)).length,
      boosted: activeScreenings.filter(
        (screening) => selections.screeningVotes[screening.id] === "boost"
      ).length,
      blocked: activeScreenings.filter(
        (screening) => selections.screeningVotes[screening.id] === "block"
      ).length
    }),
    [activeScreenings, currentItineraryIds, recommendedIds, selections.screeningVotes]
  );

  const visibleScreenings = useMemo(() => {
    return activeScreenings.filter((screening) => {
      if (timelineFilter === "itinerary") {
        return currentItineraryIds.has(screening.id);
      }
      if (timelineFilter === "recommended") {
        return recommendedIds.has(screening.id);
      }
      if (timelineFilter === "boosted") {
        return selections.screeningVotes[screening.id] === "boost";
      }
      if (timelineFilter === "blocked") {
        return selections.screeningVotes[screening.id] === "block";
      }
      return true;
    });
  }, [
    activeScreenings,
    currentItineraryIds,
    recommendedIds,
    selections.screeningVotes,
    timelineFilter
  ]);

  useEffect(() => {
    if (visibleScreenings.length === 0) {
      setFocusedScreeningId(null);
      return;
    }

    const stillExists = visibleScreenings.some((screening) => screening.id === focusedScreeningId);
    if (!stillExists) {
      setFocusedScreeningId(
        pickDefaultFocusedId(activeDate, visibleScreenings, recommendation, currentItineraryIds)
      );
    }
  }, [activeDate, currentItineraryIds, focusedScreeningId, recommendation, visibleScreenings]);

  const focusedScreening =
    visibleScreenings.find((screening) => screening.id === focusedScreeningId) ?? null;
  const focusedRejectReasons = focusedScreening
    ? getHardRejectReasons(focusedScreening, profile, selections)
    : [];
  const focusedScreeningVote = focusedScreening
    ? selections.screeningVotes[focusedScreening.id]
    : undefined;
  const focusedFilmVote = focusedScreening
    ? selections.filmVotes[focusedScreening.filmId]
    : undefined;
  const focusedFilm = focusedScreening
    ? (filmsById.get(focusedScreening.filmId) ?? null)
    : null;
  const focusedMetadata = focusedFilm?.metadata;
  const activeAlternatives = recommendation?.alternativesByDate[activeDate] ?? [];

  const densityConfig = DENSITY_CONFIG[timelineDensity];
  const timelineWindow = useMemo(
    () => buildTimelineWindow(visibleScreenings.length > 0 ? visibleScreenings : activeScreenings),
    [activeScreenings, visibleScreenings]
  );
  const timelineCanvasHeight = Math.max(
    densityConfig.minHeight,
    (timelineWindow.totalMinutes / 60) * densityConfig.pixelsPerHour
  );
  const timelineItems = useMemo(
    () =>
      layoutTimeline(
        visibleScreenings,
        selections,
        currentItineraryIds,
        timelineWindow,
        timelineCanvasHeight
      ),
    [
      currentItineraryIds,
      selections,
      timelineCanvasHeight,
      timelineWindow,
      visibleScreenings
    ]
  );
  const visibleLaneCount = timelineItems[0]?.laneCount ?? 1;
  const activeLaneCount = useMemo(
    () =>
      layoutTimeline(
        activeScreenings,
        selections,
        currentItineraryIds,
        timelineWindow,
        timelineCanvasHeight
      )[0]?.laneCount ?? 1,
    [
      activeScreenings,
      currentItineraryIds,
      selections,
      timelineCanvasHeight,
      timelineWindow
    ]
  );

  const dayCurrentItinerary = useMemo(
    () =>
      activeScreenings
        .filter((screening) => currentItineraryIds.has(screening.id))
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    [activeScreenings, currentItineraryIds]
  );
  const dayTransitionAnalysis = useMemo(
    () => analyzeDayTransitions(dayCurrentItinerary, profile.bufferMinutes),
    [dayCurrentItinerary, profile.bufferMinutes]
  );
  const focusedSelectionFeedback = useMemo(() => {
    if (!focusedScreening) {
      return null;
    }
    return buildFocusedSelectionFeedback(
      analyzeFocusedSelection(focusedScreening, dayCurrentItinerary),
      profile.bufferMinutes
    );
  }, [dayCurrentItinerary, focusedScreening, profile.bufferMinutes]);

  const dailyBudget = activeScreenings.reduce((sum, screening) => sum + screening.priceCny, 0);
  const visibleBudget = visibleScreenings.reduce((sum, screening) => sum + screening.priceCny, 0);
  const boostedCount = filterCounts.boosted;
  const blockedCount = filterCounts.blocked;
  const earliestScreening = activeScreenings[0] ?? null;
  const latestScreening = activeScreenings.reduce<Screening | null>(
    (latest, screening) => {
      if (!latest) {
        return screening;
      }
      return screeningEnd(screening) > screeningEnd(latest) ? screening : latest;
    },
    null
  );
  const totalRuntimeMinutes = activeScreenings.reduce(
    (sum, screening) => sum + screening.durationMinutes,
    0
  );
  const riskyTransitions = dayTransitionAnalysis.transitions.filter(
    (transition) => transition.status !== "ok"
  );
  const transitionSeverity =
    dayTransitionAnalysis.conflictCount > 0
      ? "error"
      : dayTransitionAnalysis.tightCount > 0
        ? "warning"
        : "success";
  const timelineCanvasWidth = Math.max(
    720,
    TIMELINE_GUTTER_WIDTH +
      visibleLaneCount * densityConfig.laneWidth +
      TIMELINE_TRAILING_PADDING
  );
  const sameFilmScreenings = useMemo(() => {
    if (!focusedFilm || !focusedScreening) {
      return [] as Screening[];
    }

    return focusedFilm.screeningIds
      .map((screeningId) => screeningsById.get(screeningId))
      .filter((item): item is Screening => Boolean(item))
      .filter((screening) => screening.id !== focusedScreening.id)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }, [focusedFilm, focusedScreening, screeningsById]);
  const nearbyScreenings = useMemo(() => {
    if (!focusedScreening) {
      return [] as NearbyScreeningItem[];
    }
    return buildNearbyScreenings(focusedScreening, activeScreenings);
  }, [activeScreenings, focusedScreening]);

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            sx={{ alignItems: { lg: "flex-start" }, justifyContent: "space-between" }}
          >
            <Box sx={{ maxWidth: 760 }}>
              <Typography color="primary" variant="overline">
                时间轴选片
              </Typography>
              <Typography variant="h5">按天看节奏，再决定拿哪场</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                按时间重叠和间隔查看当天场次。
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Chip color="primary" label={`当前片单 ${currentItineraryIds.size} 场`} />
              <Chip
                color="success"
                label={`推荐草案 ${recommendation?.selected.length ?? 0} 场`}
                variant="outlined"
              />
              <Chip label={`当天已优先 ${boostedCount} 场`} variant="outlined" />
              <Chip label={`当天已屏蔽 ${blockedCount} 场`} variant="outlined" />
            </Stack>
          </Stack>

          {dateOptions.length === 0 ? (
            <Alert severity="warning" variant="outlined">
              当前没有可用日期。先在偏好设置里放开可看片日后，再回到时间轴选片。
            </Alert>
          ) : null}

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
            {dateOptions.map((date) => {
              const count = screeningsByDate.get(date)?.length ?? 0;
              return (
                <Chip
                  key={date}
                  clickable
                  color={date === activeDate ? "primary" : "default"}
                  label={`${formatDateLabel(date)} · ${count} 场`}
                  onClick={() => setActiveDate(date)}
                  variant={date === activeDate ? "filled" : "outlined"}
                />
              );
            })}
          </Stack>

          {activeScreenings.length > 0 ? (
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", xl: "row" }}
                spacing={1.5}
                sx={{ justifyContent: "space-between" }}
              >
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {FILTER_OPTIONS.map((filter) => (
                    <Chip
                      key={filter}
                      clickable
                      color={timelineFilter === filter ? "primary" : "default"}
                      label={`${FILTER_LABELS[filter]} ${filterCounts[filter]}`}
                      onClick={() => setTimelineFilter(filter)}
                      variant={timelineFilter === filter ? "filled" : "outlined"}
                    />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {DENSITY_OPTIONS.map((density) => (
                    <Chip
                      key={density}
                      clickable
                      color={timelineDensity === density ? "secondary" : "default"}
                      label={DENSITY_LABELS[density]}
                      onClick={() => setTimelineDensity(density)}
                      variant={timelineDensity === density ? "filled" : "outlined"}
                    />
                  ))}
                </Stack>
              </Stack>

              <Box
                sx={{
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(5, minmax(0, 1fr))"
                  }
                }}
              >
                <SummaryMetric
                  label="首场"
                  value={earliestScreening ? formatTimeLabel(earliestScreening.startsAt) : "暂无"}
                />
                <SummaryMetric
                  label="末场"
                  value={latestScreening ? formatTimeLabel(latestScreening.endsAt) : "暂无"}
                />
                <SummaryMetric label="片长合计" value={formatDuration(totalRuntimeMinutes)} />
                <SummaryMetric label="并行轨道" value={`${activeLaneCount} 条`} />
                <SummaryMetric
                  label="当前片单节奏"
                  tone={transitionSeverity}
                  value={formatGapSummary(dayTransitionAnalysis.minGapMinutes)}
                />
              </Box>
            </Stack>
          ) : null}

          {activeScreenings.length === 0 ? (
            <Alert severity="info" variant="outlined">
              {activeDate ? `${formatDateLabel(activeDate)} 暂无场次。` : "请选择一天开始。"}
            </Alert>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  xl: "minmax(0, 1.7fr) minmax(320px, 0.95fr)"
                }
              }}
            >
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ justifyContent: "space-between" }}
                    >
                      <Box>
                        <Typography variant="h6">{formatDateLabel(activeDate)}</Typography>
                        <Typography color="text.secondary" variant="body2">
                          当天共 {activeScreenings.length} 场，当前视图 {visibleScreenings.length} 场，时间范围{" "}
                          {formatHourMark(timelineWindow.startHour)} - {formatHourMark(timelineWindow.endHour)}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                        <Chip label={`全日票价 ${formatCurrency(dailyBudget)}`} size="small" />
                        <Chip
                          label={`当前视图 ${formatCurrency(visibleBudget)}`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          color="success"
                          label={`推荐草案 ${filterCounts.recommended} 场`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          color="primary"
                          label={`当前片单 ${filterCounts.itinerary} 场`}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    </Stack>

                    {dayCurrentItinerary.length > 0 ? (
                      <Paper sx={{ maxHeight: { xs: 230, xl: 280 }, overflowY: "auto", p: 1.25 }} variant="outlined">
                        <Stack spacing={1}>
                          <Stack
                            direction={{ xs: "column", md: "row" }}
                            spacing={1}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <Typography variant="subtitle2">当天当前片单</Typography>
                            <Typography color="text.secondary" variant="caption">
                              缓冲目标 {profile.bufferMinutes} 分钟
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                            {dayCurrentItinerary.map((screening) => (
                              <Chip
                                key={screening.id}
                                clickable
                                color={screening.id === focusedScreeningId ? "primary" : "default"}
                                label={`${formatTimeLabel(screening.startsAt)} ${screening.titleZh}`}
                                onClick={() => {
                                  setTimelineFilter("all");
                                  setFocusedScreeningId(screening.id);
                                }}
                                variant={screening.id === focusedScreeningId ? "filled" : "outlined"}
                              />
                            ))}
                          </Stack>
                          <Alert severity={transitionSeverity} variant="outlined">
                            {dayCurrentItinerary.length === 1
                              ? "当天当前片单里只有 1 场，还没有时间衔接压力。"
                              : dayTransitionAnalysis.conflictCount > 0
                                ? `当前片单里有 ${dayTransitionAnalysis.conflictCount} 处时间重叠，建议先处理。`
                                : dayTransitionAnalysis.tightCount > 0
                                  ? `当前片单里有 ${dayTransitionAnalysis.tightCount} 处缓冲少于 ${profile.bufferMinutes} 分钟。`
                                  : "当天当前片单的衔接都满足缓冲要求。"}
                          </Alert>
                          {riskyTransitions.length > 0 ? (
                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                              {riskyTransitions.map((transition) => (
                                <Paper
                                  key={`${transition.from.id}-${transition.to.id}`}
                                  onClick={() => {
                                    setTimelineFilter("all");
                                    setFocusedScreeningId(transition.to.id);
                                  }}
                                  sx={{
                                    border: (theme) =>
                                      `1px solid ${
                                        transition.status === "conflict"
                                          ? alpha(theme.palette.error.main, 0.3)
                                          : alpha(theme.palette.warning.main, 0.3)
                                      }`,
                                    cursor: "pointer",
                                    p: 1.25
                                  }}
                                  variant="outlined"
                                >
                                  <Stack spacing={0.5}>
                                    <Chip
                                      color={transition.status === "conflict" ? "error" : "warning"}
                                      label={
                                        transition.status === "conflict"
                                          ? `重叠 ${Math.abs(transition.gapMinutes)} 分`
                                          : `缓冲 ${transition.gapMinutes} 分`
                                      }
                                      size="small"
                                      sx={{ alignSelf: "flex-start" }}
                                    />
                                    <Typography variant="caption">
                                      {describeTransition(transition, profile.bufferMinutes)}
                                    </Typography>
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          ) : null}
                        </Stack>
                      </Paper>
                    ) : (
                      <Alert severity="info" variant="outlined">
                        当天还没有加入当前片单的场次。可以先从时间轴里挑一场当锚点。
                      </Alert>
                    )}

                    {visibleScreenings.length === 0 ? (
                      <Alert severity="info" variant="outlined">
                        当前筛选条件下没有场次。切回“全部场次”或换一天，会更容易继续排。
                      </Alert>
                    ) : (
                      <Paper sx={{ p: 1.25 }} variant="outlined">
                        <Stack spacing={1}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <Box>
                              <Typography variant="subtitle2">时间轴视窗</Typography>
                              <Typography color="text.secondary" variant="caption">
                                左侧视窗固定高度，内部滚动查看全天排布。
                              </Typography>
                            </Box>
                            <Chip
                              label={`可视轨道 ${visibleLaneCount} 条`}
                              size="small"
                              variant="outlined"
                            />
                          </Stack>
                          <Box
                            sx={{
                              borderRadius: 2.5,
                              height: TIMELINE_VIEWPORT_HEIGHT[timelineDensity],
                              overflow: "auto"
                            }}
                          >
                            <Box
                              sx={{
                                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                                border: (theme) => `1px solid ${theme.palette.divider}`,
                                borderRadius: "12px",
                                position: "relative",
                                width: timelineCanvasWidth,
                                px: 2,
                                py: 1.5,
                                height: timelineCanvasHeight
                              }}
                            >
                          {timelineWindow.hourMarks.map((hour) => {
                            const hourMinutes =
                              (Number(hour.slice(0, 2)) - timelineWindow.startHour) * 60;
                            return (
                              <Box
                                key={hour}
                                sx={{
                                  borderTop: (theme) =>
                                    `1px dashed ${alpha(theme.palette.text.secondary, 0.18)}`,
                                  left: 0,
                                  position: "absolute",
                                  right: 0,
                                  top: `${(hourMinutes / timelineWindow.totalMinutes) * 100}%`
                                }}
                              >
                                <Typography
                                  color="text.secondary"
                                  sx={{ ml: 1.5, mt: -1.1 }}
                                  variant="caption"
                                >
                                  {hour}
                                </Typography>
                              </Box>
                            );
                          })}

                          {timelineItems.map(({ screening, laneIndex, topPx, heightPx }) => {
                            const top = topPx;
                            const cardHeight = heightPx;
                            const isCompactCard = cardHeight < 78;
                            const isTinyCard = cardHeight < 52;
                            const width = densityConfig.laneWidth - TIMELINE_CARD_GAP;
                            const left =
                              TIMELINE_GUTTER_WIDTH + laneIndex * densityConfig.laneWidth;
                            const isFocused = screening.id === focusedScreeningId;
                            const isRecommended = recommendedIds.has(screening.id);
                            const isInCurrentItinerary = currentItineraryIds.has(screening.id);
                            const screeningVote = selections.screeningVotes[screening.id];
                            const filmVote = selections.filmVotes[screening.filmId];

                            let accent = "#734E3C";
                            let statusLabel: string | null = null;
                            let statusColor:
                              | "default"
                              | "primary"
                              | "success"
                              | "warning"
                              | "error" = "default";

                            if (isInCurrentItinerary) {
                              accent = "#365C9A";
                              statusLabel = "当前片单";
                              statusColor = "primary";
                            } else if (screeningVote === "block" || filmVote === "avoid") {
                              accent = "#C35454";
                              statusLabel = "已屏蔽";
                              statusColor = "error";
                            } else if (screeningVote === "boost" || filmVote === "must") {
                              accent = "#B33A3A";
                              statusLabel = "已优先";
                              statusColor = "warning";
                            } else if (isRecommended) {
                              accent = "#3D8C6F";
                              statusLabel = "推荐草案";
                              statusColor = "success";
                            }

                            return (
                              <Paper
                                key={screening.id}
                                onClick={() => setFocusedScreeningId(screening.id)}
                                sx={{
                                  background: `linear-gradient(180deg, ${alpha(
                                    accent,
                                    0.16
                                  )} 0%, ${alpha(accent, 0.22)} 100%)`,
                                  border: (theme) =>
                                    `2px solid ${
                                      isFocused
                                        ? accent
                                        : alpha(theme.palette.common.black, 0.08)
                                    }`,
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 0.5,
                                  left,
                                  height: cardHeight,
                                  overflow: "hidden",
                                  p: isTinyCard ? 0.75 : isCompactCard ? 1 : 1.25,
                                  position: "absolute",
                                  top,
                                  width,
                                  boxShadow: isFocused
                                    ? `0 14px 30px ${alpha(accent, 0.26)}`
                                    : "none"
                                }}
                              >
                                <Typography
                                  sx={{
                                    display: "-webkit-box",
                                    fontWeight: 700,
                                    overflow: "hidden",
                                    WebkitBoxOrient: "vertical",
                                    WebkitLineClamp: isTinyCard
                                      ? 1
                                      : timelineDensity === "compact"
                                        ? 2
                                        : 3
                                  }}
                                  variant="body2"
                                >
                                  {screening.titleZh}
                                </Typography>
                                <Typography color="text.secondary" variant="caption">
                                  {formatTimeLabel(screening.startsAt)} -{" "}
                                  {formatTimeLabel(screening.endsAt)}
                                </Typography>
                                {!isTinyCard ? (
                                  <Typography color="text.secondary" variant="caption">
                                    {screening.venue}
                                    {screening.hall ? ` · ${screening.hall}` : ""}
                                  </Typography>
                                ) : null}
                                {!isCompactCard && timelineDensity !== "compact" ? (
                                  <Typography color="text.secondary" variant="caption">
                                    {formatCurrency(screening.priceCny)} ·{" "}
                                    {formatDuration(screening.durationMinutes)}
                                  </Typography>
                                ) : null}
                                {statusLabel && !isTinyCard ? (
                                  <Chip
                                    color={statusColor}
                                    label={statusLabel}
                                    size="small"
                                    sx={{ alignSelf: "flex-start", mt: 0.5 }}
                                  />
                                ) : null}
                              </Paper>
                            );
                          })}
                            </Box>
                          </Box>
                        </Stack>
                      </Paper>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card
                sx={{
                  alignSelf: "start",
                  overflow: "hidden",
                  position: { xl: "sticky" },
                  top: { xl: 24 }
                }}
              >
                <CardContent
                  sx={{
                    maxHeight: { xl: "calc(100vh - 112px)" },
                    overflowY: { xl: "auto" },
                    p: 2.5
                  }}
                >
                  {focusedScreening ? (
                    <Stack spacing={2}>
                      <Box>
                        <Typography color="primary" variant="overline">
                          当前聚焦场次
                        </Typography>
                        <Typography variant="h6">{focusedScreening.titleZh}</Typography>
                        <Typography color="text.secondary" variant="body2">
                          {focusedScreening.titleEn || "暂无英文片名"}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                        <Chip label={focusedScreening.unit} size="small" variant="outlined" />
                        <Chip label={String(focusedScreening.year)} size="small" variant="outlined" />
                        <Chip
                          label={formatDuration(focusedScreening.durationMinutes)}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`同片其他 ${sameFilmScreenings.length} 场`}
                          size="small"
                          variant="outlined"
                        />
                        {currentItineraryIds.has(focusedScreening.id) ? (
                          <Chip color="primary" label="已在当前片单" size="small" />
                        ) : null}
                        {recommendedIds.has(focusedScreening.id) ? (
                          <Chip color="success" label="在推荐草案中" size="small" />
                        ) : null}
                      </Stack>

                      <Paper sx={{ p: 1.5 }} variant="outlined">
                        <Stack spacing={1}>
                          <DetailRow
                            label="时间"
                            value={`${formatTimeLabel(focusedScreening.startsAt)} - ${formatTimeLabel(
                              focusedScreening.endsAt
                            )}`}
                          />
                          <DetailRow
                            label="影院"
                            value={`${focusedScreening.venue} · ${
                              focusedScreening.hall || "影厅待定"
                            }`}
                          />
                          <DetailRow label="票价" value={formatCurrency(focusedScreening.priceCny)} />
                          <DetailRow
                            label="活动"
                            value={focusedScreening.activityInfo || "常规放映"}
                          />
                        </Stack>
                      </Paper>

                      {focusedSelectionFeedback ? (
                        <Alert severity={focusedSelectionFeedback.severity} variant="outlined">
                          <Stack spacing={0.75}>
                            <Typography variant="body2">{focusedSelectionFeedback.title}</Typography>
                            {focusedSelectionFeedback.lines.map((line) => (
                              <Typography key={line} variant="body2">
                                - {line}
                              </Typography>
                            ))}
                          </Stack>
                        </Alert>
                      ) : null}

                      <Stack spacing={1}>
                        <Typography variant="subtitle1">时间轴选片动作</Typography>
                        <Button
                          color={currentItineraryIds.has(focusedScreening.id) ? "secondary" : "primary"}
                          fullWidth
                          onClick={() => onToggleItineraryScreening(focusedScreening.id)}
                          variant="contained"
                        >
                          {currentItineraryIds.has(focusedScreening.id)
                            ? "移出当前片单"
                            : "加入当前片单"}
                        </Button>
                        <Box
                          sx={{
                            display: "grid",
                            gap: 1,
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
                          }}
                        >
                          <Button
                            color="primary"
                            fullWidth
                            onClick={() =>
                              onScreeningVote(
                                focusedScreening.id,
                                focusedScreeningVote === "boost" ? undefined : "boost"
                              )
                            }
                            variant={
                              focusedScreeningVote === "boost" ? "contained" : "outlined"
                            }
                          >
                            {focusedScreeningVote === "boost" ? "取消优先这场" : "优先这场"}
                          </Button>
                          <Button
                            color="error"
                            fullWidth
                            onClick={() =>
                              onScreeningVote(
                                focusedScreening.id,
                                focusedScreeningVote === "block" ? undefined : "block"
                              )
                            }
                            variant={
                              focusedScreeningVote === "block" ? "contained" : "outlined"
                            }
                          >
                            {focusedScreeningVote === "block" ? "取消屏蔽" : "屏蔽这场"}
                          </Button>
                          <Button
                            color="primary"
                            fullWidth
                            onClick={() =>
                              onFilmVote(
                                focusedScreening.filmId,
                                focusedFilmVote === "must" ? undefined : "must"
                              )
                            }
                            variant={focusedFilmVote === "must" ? "contained" : "outlined"}
                          >
                            {focusedFilmVote === "must" ? "取消必看影片" : "影片设为必看"}
                          </Button>
                          <Button
                            color="error"
                            fullWidth
                            onClick={() =>
                              onFilmVote(
                                focusedScreening.filmId,
                                focusedFilmVote === "avoid" ? undefined : "avoid"
                              )
                            }
                            variant={focusedFilmVote === "avoid" ? "contained" : "outlined"}
                          >
                            {focusedFilmVote === "avoid" ? "取消不考虑" : "影片不考虑"}
                          </Button>
                        </Box>
                      </Stack>

                      <Divider />

                      <Stack spacing={1}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          sx={{ justifyContent: "space-between" }}
                        >
                          <Typography variant="subtitle1">影片资料</Typography>
                          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                            <SelectionScoreTile
                              hint={
                                focusedMetadata?.doubanRatingCount
                                  ? `${formatCompactCount(focusedMetadata.doubanRatingCount)} 人评价`
                                  : "暂无评分"
                              }
                              label="Douban"
                              tone="primary"
                              value={
                                focusedMetadata?.doubanRatingValue !== null &&
                                focusedMetadata?.doubanRatingValue !== undefined
                                  ? focusedMetadata.doubanRatingValue.toFixed(1)
                                  : "待补"
                              }
                            />
                            <SelectionScoreTile
                              hint={
                                focusedMetadata?.imdbRatingCount
                                  ? `${formatCompactCount(focusedMetadata.imdbRatingCount)} 人评价`
                                  : "暂无评分"
                              }
                              label="IMDb"
                              tone="default"
                              value={
                                focusedMetadata?.imdbRatingValue !== null &&
                                focusedMetadata?.imdbRatingValue !== undefined
                                  ? focusedMetadata.imdbRatingValue.toFixed(1)
                                  : "待补"
                              }
                            />
                          </Stack>
                        </Stack>

                        {focusedMetadata ? (
                          <>
                            <Box
                              sx={{
                                display: "grid",
                                gap: 1,
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  sm: "repeat(2, minmax(0, 1fr))"
                                }
                              }}
                            >
                              <SelectionMetaBlock
                                label="导演"
                                value={focusedMetadata.director || "待补充"}
                              />
                              <SelectionMetaBlock
                                label="主演"
                                value={
                                  focusedMetadata.cast.length
                                    ? focusedMetadata.cast.slice(0, 4).join(" / ")
                                    : "待补充"
                                }
                              />
                              <SelectionMetaBlock
                                label="地区 / 语种"
                                value={
                                  [
                                    focusedMetadata.countries.length
                                      ? focusedMetadata.countries.join(" / ")
                                      : "",
                                    focusedMetadata.languages.length
                                      ? focusedMetadata.languages.join(" / ")
                                      : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "待补充"
                                }
                              />
                              <SelectionMetaBlock
                                label="类型"
                                value={
                                  focusedMetadata.genres.length
                                    ? focusedMetadata.genres.join(" / ")
                                    : "待补充"
                                }
                              />
                            </Box>

                            {focusedMetadata.awards.length > 0 ? (
                              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                                {focusedMetadata.awards.slice(0, 4).map((award) => (
                                  <Chip
                                    key={award}
                                    color="secondary"
                                    label={award}
                                    size="small"
                                    variant="outlined"
                                  />
                                ))}
                              </Stack>
                            ) : null}
                          </>
                        ) : (
                          <Alert severity="info" variant="outlined">
                            这部影片还没有补充影片资料，先结合时间、影院和相关场次做决定。
                          </Alert>
                        )}
                      </Stack>

                      <Stack spacing={1}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          sx={{ justifyContent: "space-between" }}
                        >
                          <Typography variant="subtitle1">同片其他场次</Typography>
                          <Typography color="text.secondary" variant="caption">
                            共 {sameFilmScreenings.length} 场
                          </Typography>
                        </Stack>
                        {sameFilmScreenings.length > 0 ? (
                          sameFilmScreenings.slice(0, 6).map((screening) => (
                            <Paper
                              key={screening.id}
                              onClick={() => {
                                setTimelineFilter("all");
                                setActiveDate(screening.date);
                                setFocusedScreeningId(screening.id);
                              }}
                              sx={{ cursor: "pointer", p: 1.25 }}
                              variant="outlined"
                            >
                              <Stack spacing={1}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  sx={{ justifyContent: "space-between" }}
                                >
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700 }} variant="body2">
                                      {formatDateTimeLabel(screening.startsAt)}
                                    </Typography>
                                    <Typography color="text.secondary" variant="caption">
                                      {screening.venue} · {screening.hall || "影厅待定"}
                                    </Typography>
                                  </Box>
                                  <Typography sx={{ fontWeight: 700 }} variant="caption">
                                    {formatCurrency(screening.priceCny)}
                                  </Typography>
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                                  <Chip
                                    label={screening.date === activeDate ? "当前日期" : formatDateLabel(screening.date)}
                                    size="small"
                                    variant="outlined"
                                  />
                                  {screening.activityInfo ? (
                                    <Chip
                                      color="secondary"
                                      label={screening.activityInfo}
                                      size="small"
                                      variant="outlined"
                                    />
                                  ) : null}
                                  {currentItineraryIds.has(screening.id) ? (
                                    <Chip color="primary" label="当前片单" size="small" />
                                  ) : null}
                                  {recommendedIds.has(screening.id) ? (
                                    <Chip color="success" label="推荐草案" size="small" />
                                  ) : null}
                                  {selections.screeningVotes[screening.id] === "boost" ? (
                                    <Chip color="warning" label="已优先" size="small" />
                                  ) : null}
                                  {selections.screeningVotes[screening.id] === "block" ? (
                                    <Chip color="error" label="已屏蔽" size="small" />
                                  ) : null}
                                </Stack>
                              </Stack>
                            </Paper>
                          ))
                        ) : (
                          <Alert severity="info" variant="outlined">
                            这部片目前只有这一场。
                          </Alert>
                        )}
                      </Stack>

                      <Stack spacing={1}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          sx={{ justifyContent: "space-between" }}
                        >
                          <Typography variant="subtitle1">附近相关场次</Typography>
                          <Typography color="text.secondary" variant="caption">
                            同日最近 6 场
                          </Typography>
                        </Stack>
                        {nearbyScreenings.length > 0 ? (
                          nearbyScreenings.map((item) => (
                            <Paper
                              key={item.screening.id}
                              onClick={() => {
                                setTimelineFilter("all");
                                setFocusedScreeningId(item.screening.id);
                              }}
                              sx={{ cursor: "pointer", p: 1.25 }}
                              variant="outlined"
                            >
                              <Stack spacing={1}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  sx={{ justifyContent: "space-between" }}
                                >
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700 }} variant="body2">
                                      {item.screening.titleZh}
                                    </Typography>
                                    <Typography color="text.secondary" variant="caption">
                                      {formatTimeLabel(item.screening.startsAt)} -{" "}
                                      {formatTimeLabel(item.screening.endsAt)} · {item.screening.venue}
                                    </Typography>
                                  </Box>
                                  <Chip
                                    color={item.relation === "overlap" ? "error" : "default"}
                                    label={describeNearbyScreening(item)}
                                    size="small"
                                    variant={item.relation === "overlap" ? "filled" : "outlined"}
                                  />
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                                  <Chip
                                    label={formatCurrency(item.screening.priceCny)}
                                    size="small"
                                    variant="outlined"
                                  />
                                  {currentItineraryIds.has(item.screening.id) ? (
                                    <Chip color="primary" label="当前片单" size="small" />
                                  ) : null}
                                  {recommendedIds.has(item.screening.id) ? (
                                    <Chip color="success" label="推荐草案" size="small" />
                                  ) : null}
                                  {item.screening.activityInfo ? (
                                    <Chip
                                      color="secondary"
                                      label={item.screening.activityInfo}
                                      size="small"
                                      variant="outlined"
                                    />
                                  ) : null}
                                </Stack>
                              </Stack>
                            </Paper>
                          ))
                        ) : (
                          <Alert severity="info" variant="outlined">
                            当前日期里没有更多可对照的相关场次。
                          </Alert>
                        )}
                      </Stack>

                      <Divider />

                      {focusedRejectReasons.length > 0 ? (
                        <Alert severity="warning" variant="outlined">
                          <Stack spacing={1}>
                            <Typography variant="body2">
                              这场当前仍会被硬约束排除，哪怕你已经标记了优先，也需要调整规则：
                            </Typography>
                            <Stack spacing={0.5}>
                              {focusedRejectReasons.map((reason) => (
                                <Typography key={reason} variant="body2">
                                  - {reason}
                                </Typography>
                              ))}
                            </Stack>
                          </Stack>
                        </Alert>
                      ) : (
                        <Alert severity="success" variant="outlined">
                          这场目前满足硬约束。你可以直接加入当前片单，或者先标记优先，等待下次生成推荐草案。
                        </Alert>
                      )}

                      {activeAlternatives.length > 0 ? (
                        <Stack spacing={1}>
                          <Typography variant="subtitle1">当天推荐候补</Typography>
                          {activeAlternatives
                            .filter((screening) => screening.id !== focusedScreening.id)
                            .slice(0, 4)
                            .map((screening) => (
                              <Paper
                                key={screening.id}
                                onClick={() => {
                                  setTimelineFilter("all");
                                  setFocusedScreeningId(screening.id);
                                }}
                                sx={{
                                  cursor: "pointer",
                                  p: 1.25
                                }}
                                variant="outlined"
                              >
                                <Stack spacing={0.65}>
                                  <Typography variant="body2">{screening.titleZh}</Typography>
                                  <Typography color="text.secondary" variant="caption">
                                    {formatTimeLabel(screening.startsAt)} · {screening.venue} ·{" "}
                                    {formatCurrency(screening.priceCny)}
                                  </Typography>
                                </Stack>
                              </Paper>
                            ))}
                        </Stack>
                      ) : null}
                    </Stack>
                  ) : (
                    <Alert severity="info" variant="outlined">
                      {visibleScreenings.length === 0
                        ? "当前筛选下没有场次可聚焦，先放宽筛选或换一天。"
                        : "从左边时间轴点一场片子，这里会出现详细信息和操作按钮。"}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
    >
      <Typography color="text.secondary" sx={{ flex: 1, minWidth: 0 }} variant="body2">
        {label}
      </Typography>
      <Typography
        sx={{ flex: 1, fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
        variant="body2"
      >
        {value}
      </Typography>
    </Stack>
  );
}

function SelectionMetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <Paper
      sx={{
        backgroundColor: (theme) => alpha(theme.palette.common.white, 0.72),
        minHeight: 74,
        p: 1.25
      }}
      variant="outlined"
    >
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography
        sx={{
          display: "-webkit-box",
          fontWeight: 700,
          mt: 0.5,
          overflow: "hidden",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2
        }}
        variant="body2"
      >
        {value}
      </Typography>
    </Paper>
  );
}

function SelectionScoreTile({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: string;
  hint: string;
  tone: "default" | "primary";
}) {
  const accent = tone === "primary" ? "#B33A3A" : "#734E3C";

  return (
    <Paper
      sx={{
        backgroundColor: alpha(accent, 0.08),
        border: `1px solid ${alpha(accent, 0.18)}`,
        minWidth: 120,
        overflow: "hidden",
        p: 1.1,
        position: "relative"
      }}
      variant="outlined"
    >
      <Box
        sx={{
          backgroundColor: alpha(accent, 0.18),
          height: "100%",
          left: 0,
          position: "absolute",
          top: 0,
          width: 4
        }}
      />
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1, mt: 0.35 }}>
        {value}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.35 }} variant="caption">
        {hint}
      </Typography>
    </Paper>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const accentMap = {
    default: "#734E3C",
    success: "#3D8C6F",
    warning: "#B46B17",
    error: "#C35454"
  } as const;

  return (
    <Paper
      sx={{
        border: `1px solid ${alpha(accentMap[tone], 0.18)}`,
        minHeight: 84,
        minWidth: 0,
        p: 1.25
      }}
      variant="outlined"
    >
      <Stack spacing={0.4}>
        <Typography color="text.secondary" variant="caption">
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 700 }} variant="body2">
          {value}
        </Typography>
      </Stack>
    </Paper>
  );
}

function formatCompactCount(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  }
  return value.toLocaleString("zh-CN");
}
