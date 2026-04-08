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
import { formatCurrency, formatDateLabel, formatDuration, formatTimeLabel } from "../lib/format";
import { getHardRejectReasons } from "../lib/recommendation";
import type {
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
}

const HOURS = [
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
  "20:00",
  "22:00"
];

function minutesFromMorning(dateTime: string) {
  const date = new Date(dateTime);
  return date.getHours() * 60 + date.getMinutes() - 8 * 60;
}

function screeningStart(screening: Screening) {
  return new Date(screening.startsAt).getTime();
}

function screeningEnd(screening: Screening) {
  return new Date(screening.endsAt).getTime();
}

function layoutTimeline(screenings: Screening[]) {
  const laneEndTimes: number[] = [];
  const laneAssignments = new Map<string, number>();

  for (const screening of screenings) {
    const start = screeningStart(screening);
    let laneIndex = laneEndTimes.findIndex((endTime) => endTime <= start);
    if (laneIndex === -1) {
      laneIndex = laneEndTimes.length;
      laneEndTimes.push(screeningEnd(screening));
    } else {
      laneEndTimes[laneIndex] = screeningEnd(screening);
    }
    laneAssignments.set(screening.id, laneIndex);
  }

  const laneCount = Math.max(laneEndTimes.length, 1);
  return screenings.map((screening) => ({
    screening,
    laneIndex: laneAssignments.get(screening.id) ?? 0,
    laneCount
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

  useEffect(() => {
    const nextFocusedId = pickDefaultFocusedId(
      activeDate,
      activeScreenings,
      recommendation,
      currentItineraryIds
    );
    if (!nextFocusedId) {
      setFocusedScreeningId(null);
      return;
    }

    const stillExists = activeScreenings.some((screening) => screening.id === focusedScreeningId);
    if (!stillExists) {
      setFocusedScreeningId(nextFocusedId);
    }
  }, [activeDate, activeScreenings, currentItineraryIds, focusedScreeningId, recommendation]);

  const focusedScreening =
    activeScreenings.find((screening) => screening.id === focusedScreeningId) ?? null;
  const focusedRejectReasons = focusedScreening
    ? getHardRejectReasons(focusedScreening, profile, selections)
    : [];
  const focusedScreeningVote = focusedScreening
    ? selections.screeningVotes[focusedScreening.id]
    : undefined;
  const focusedFilmVote = focusedScreening
    ? selections.filmVotes[focusedScreening.filmId]
    : undefined;
  const recommendedIds = new Set(
    (recommendation?.selected ?? []).map((screening) => screening.id)
  );
  const timelineItems = layoutTimeline(activeScreenings);
  const dailyBudget = activeScreenings.reduce((sum, screening) => sum + screening.priceCny, 0);
  const boostedCount = activeScreenings.filter(
    (screening) => selections.screeningVotes[screening.id] === "boost"
  ).length;
  const blockedCount = activeScreenings.filter(
    (screening) => selections.screeningVotes[screening.id] === "block"
  ).length;

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            sx={{ justifyContent: "space-between" }}
          >
            <Box>
              <Typography color="primary" variant="overline">
                时间轴选片
              </Typography>
              <Typography variant="h4">按天挑场次</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                直接在时间轴里点选场次，再用右侧详情卡把它加入当前片单，或者只作为推荐草案参考，不会再自动污染当前片单。
              </Typography>
            </Box>
            <Stack direction={{ xs: "row", md: "column" }} spacing={1}>
              <Chip
                color="primary"
                label={`当前片单 ${currentItineraryIds.size} 场`}
              />
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

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
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
                  xl: "minmax(0, 1.6fr) minmax(320px, 0.9fr)"
                }
              }}
            >
              <Card
                sx={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,248,242,0.98) 100%)"
                }}
              >
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
                          当天共 {activeScreenings.length} 场，全部铺在时间轴里可直接点选
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                        <Chip label={`全日票房 ${formatCurrency(dailyBudget)}`} size="small" />
                        <Chip
                          color="success"
                          label={`在推荐草案 ${
                            activeScreenings.filter((screening) =>
                              recommendedIds.has(screening.id)
                            ).length
                          } 场`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          color="primary"
                          label={`在当前片单 ${
                            activeScreenings.filter((screening) =>
                              currentItineraryIds.has(screening.id)
                            ).length
                          } 场`}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    </Stack>

                    <Box sx={{ overflowX: "auto" }}>
                      <Box
                        sx={{
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                          border: (theme) => `1px solid ${theme.palette.divider}`,
                          borderRadius: 4,
                          minWidth: 560,
                          position: "relative",
                          px: 2,
                          py: 1.5,
                          height: 840
                        }}
                      >
                        {HOURS.map((hour) => {
                          const hourMinutes = Number(hour.slice(0, 2)) * 60 - 8 * 60;
                          return (
                            <Box
                              key={hour}
                              sx={{
                                borderTop: (theme) =>
                                  `1px dashed ${alpha(theme.palette.text.secondary, 0.18)}`,
                                left: 0,
                                position: "absolute",
                                right: 0,
                                top: `${(hourMinutes / 960) * 100}%`
                              }}
                            >
                              <Typography
                                color="text.secondary"
                                sx={{ ml: 1, mt: -1.1 }}
                                variant="caption"
                              >
                                {hour}
                              </Typography>
                            </Box>
                          );
                        })}

                        {timelineItems.map(({ screening, laneIndex, laneCount }) => {
                          const top = (minutesFromMorning(screening.startsAt) / 960) * 100;
                          const height = Math.max(
                            10,
                            (screening.durationMinutes / 960) * 100
                          );
                          const width = 74 / laneCount;
                          const left = 20 + laneIndex * width;
                          const isFocused = screening.id === focusedScreeningId;
                          const isRecommended = recommendedIds.has(screening.id);
                          const isInCurrentItinerary = currentItineraryIds.has(screening.id);
                          const screeningVote = selections.screeningVotes[screening.id];
                          const filmVote = selections.filmVotes[screening.filmId];

                          let accent = "#734E3C";
                          if (isInCurrentItinerary) {
                            accent = "#365C9A";
                          } else if (screeningVote === "block" || filmVote === "avoid") {
                            accent = "#C35454";
                          } else if (screeningVote === "boost" || filmVote === "must") {
                            accent = "#B33A3A";
                          } else if (isRecommended) {
                            accent = "#3D8C6F";
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
                                borderRadius: 3,
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.5,
                                left: `${left}%`,
                                minHeight: 92,
                                overflow: "hidden",
                                p: 1.25,
                                position: "absolute",
                                top: `${top}%`,
                                width: `${Math.max(width - 1.2, 12)}%`,
                                boxShadow: isFocused
                                  ? `0 14px 30px ${alpha(accent, 0.26)}`
                                  : "none"
                              }}
                            >
                              <Typography sx={{ fontWeight: 700 }} variant="body2">
                                {screening.titleZh}
                              </Typography>
                              <Typography color="text.secondary" variant="caption">
                                {formatTimeLabel(screening.startsAt)} -{" "}
                                {formatTimeLabel(screening.endsAt)}
                              </Typography>
                              <Typography color="text.secondary" variant="caption">
                                {screening.venue}
                              </Typography>
                              <Typography color="text.secondary" variant="caption">
                                {formatCurrency(screening.priceCny)}
                              </Typography>
                              {isInCurrentItinerary ? (
                                <Chip
                                  color="primary"
                                  label="当前片单"
                                  size="small"
                                  sx={{ alignSelf: "flex-start", mt: 0.5 }}
                                />
                              ) : null}
                              {isRecommended ? (
                                <Chip
                                  color="success"
                                  label="推荐草案"
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
                </CardContent>
              </Card>

              <Card>
                <CardContent sx={{ p: 2.5 }}>
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
                        <Chip
                          label={String(focusedScreening.year)}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={formatDuration(focusedScreening.durationMinutes)}
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
                          <DetailRow
                            label="票价"
                            value={formatCurrency(focusedScreening.priceCny)}
                          />
                          <DetailRow
                            label="活动"
                            value={focusedScreening.activityInfo || "常规放映"}
                          />
                        </Stack>
                      </Paper>

                      <Stack spacing={1}>
                        <Typography variant="subtitle1">时间轴选片动作</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                          <Button
                            color={currentItineraryIds.has(focusedScreening.id) ? "secondary" : "primary"}
                            onClick={() => onToggleItineraryScreening(focusedScreening.id)}
                            variant="contained"
                          >
                            {currentItineraryIds.has(focusedScreening.id)
                              ? "移出当前片单"
                              : "加入当前片单"}
                          </Button>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                          <Button
                            color="primary"
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
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                          <Button
                            color="primary"
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
                        </Stack>
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

                      {(recommendation?.alternativesByDate[activeDate] ?? []).length > 0 ? (
                        <Stack spacing={1}>
                          <Typography variant="subtitle1">当天推荐候补</Typography>
                          {(recommendation?.alternativesByDate[activeDate] ?? []).map(
                            (screening) => (
                              <Paper
                                key={screening.id}
                                onClick={() => setFocusedScreeningId(screening.id)}
                                sx={{
                                  cursor: "pointer",
                                  p: 1.25
                                }}
                                variant="outlined"
                              >
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  sx={{ justifyContent: "space-between" }}
                                >
                                  <Typography variant="body2">{screening.titleZh}</Typography>
                                  <Typography color="text.secondary" variant="caption">
                                    {formatTimeLabel(screening.startsAt)} ·{" "}
                                    {formatCurrency(screening.priceCny)}
                                  </Typography>
                                </Stack>
                              </Paper>
                            )
                          )}
                        </Stack>
                      ) : null}
                    </Stack>
                  ) : (
                    <Alert severity="info" variant="outlined">
                      从左边时间轴点一场片子，这里会出现详细信息和操作按钮。
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
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, textAlign: "right" }} variant="body2">
        {value}
      </Typography>
    </Stack>
  );
}
