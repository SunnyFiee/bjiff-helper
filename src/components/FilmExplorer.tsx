import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { formatCurrency, formatDateTimeLabel, formatDuration } from "../lib/format";
import {
  buildDoubanSearchUrl,
  buildFilmDoubanKey,
  formatDoubanRatingCount
} from "../lib/douban";
import type {
  DoubanSubject,
  Film,
  FilmVote,
  Screening,
  ScreeningFilters,
  ScreeningVote
} from "../lib/types";

interface VisibleFilm {
  film: Film;
  screenings: Screening[];
}

interface FilmExplorerProps {
  cards: VisibleFilm[];
  dates: string[];
  units: string[];
  venues: string[];
  filters: ScreeningFilters;
  recommendedIds: Set<string>;
  currentItineraryIds: Set<string>;
  filmVotes: Record<string, FilmVote | undefined>;
  screeningVotes: Record<string, ScreeningVote | undefined>;
  markedFilmCount: number;
  markedScreeningCount: number;
  doubanMatches: Record<string, DoubanSubject | undefined>;
  isDesktop: boolean;
  onFiltersChange: (next: ScreeningFilters) => void;
  onClearFilters: () => void;
  onFilmVote: (filmId: string, vote?: FilmVote) => void;
  onScreeningVote: (screeningId: string, vote?: ScreeningVote) => void;
  onSearchDouban: (film: Film) => void;
  onOpenDoubanSubject: (match: DoubanSubject) => void;
  onClearDoubanMatch: (filmKey: string) => void;
  onManualBindDouban: (film: Film, input: string) => boolean;
}

export function FilmExplorer({
  cards,
  dates,
  units,
  venues,
  filters,
  recommendedIds,
  currentItineraryIds,
  filmVotes,
  screeningVotes,
  markedFilmCount,
  markedScreeningCount,
  doubanMatches,
  isDesktop,
  onFiltersChange,
  onClearFilters,
  onFilmVote,
  onScreeningVote,
  onSearchDouban,
  onOpenDoubanSubject,
  onClearDoubanMatch,
  onManualBindDouban
}: FilmExplorerProps) {
  const visibleCards = cards.slice(0, 36);
  const [manualDoubanInputs, setManualDoubanInputs] = useState<Record<string, string>>({});

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
                选片
              </Typography>
              <Typography variant="h4">场次浏览</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                用筛选快速收窄范围，再通过“必看 / 不考虑 / 优先这场 / 屏蔽”给推荐器更明确的信号。
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "row", md: "column" }}
              spacing={1}
              sx={{ minWidth: { lg: 200 } }}
            >
              <Chip
                color="primary"
                label={`命中 ${cards.length} 部影片`}
                variant="filled"
              />
              <Chip
                label={`标记 ${markedFilmCount} 部 / ${markedScreeningCount} 场`}
                variant="outlined"
              />
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(0, 2fr) repeat(4, minmax(0, 1fr))"
              }
            }}
          >
            <TextField
              label="搜索"
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  query: event.target.value
                })
              }
              placeholder="片名 / 单元 / 影院 / 活动信息"
              value={filters.query}
            />
            <TextField
              label="日期"
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  date: event.target.value
                })
              }
              select
              value={filters.date}
            >
              <MenuItem value="all">全部日期</MenuItem>
              {dates.map((date) => (
                <MenuItem key={date} value={date}>
                  {date}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="单元"
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  unit: event.target.value
                })
              }
              select
              value={filters.unit}
            >
              <MenuItem value="all">全部单元</MenuItem>
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="影院"
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  venue: event.target.value
                })
              }
              select
              value={filters.venue}
            >
              <MenuItem value="all">全部影院</MenuItem>
              {venues.map((venue) => (
                <MenuItem key={venue} value={venue}>
                  {venue}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="最高票价"
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  maxPrice: event.target.value
                })
              }
              placeholder="不限"
              slotProps={{ htmlInput: { min: 0 } }}
              type="number"
              value={filters.maxPrice}
            />
            <Button onClick={onClearFilters} variant="outlined">
              清空筛选
            </Button>
          </Stack>

          {cards.length === 0 ? (
            <Alert severity="warning" variant="outlined">
              当前筛选没有命中场次，建议放宽价格、影院或日期条件。
            </Alert>
          ) : null}

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                xl: "repeat(2, minmax(0, 1fr))"
              }
            }}
          >
            {visibleCards.map(({ film, screenings }) => {
              const filmVote = filmVotes[film.id];
              const recommendedCount = screenings.filter((screening) =>
                recommendedIds.has(screening.id)
              ).length;
              const itineraryCount = screenings.filter((screening) =>
                currentItineraryIds.has(screening.id)
              ).length;
              const filmKey = buildFilmDoubanKey(film);
              const selectedDoubanMatch = doubanMatches[filmKey];

              return (
                <Card
                  key={film.id}
                  sx={{
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,250,245,0.96) 100%)"
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={2}
                        sx={{ justifyContent: "space-between" }}
                      >
                        <Box>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ flexWrap: "wrap", mb: 1 }}
                          >
                            <Chip label={film.unit} size="small" variant="outlined" />
                            <Chip label={String(film.year)} size="small" variant="outlined" />
                            <Chip
                              label={formatDuration(film.durationMinutes)}
                              size="small"
                              variant="outlined"
                            />
                          </Stack>
                          <Typography variant="h6">{film.titleZh}</Typography>
                          <Typography color="text.secondary" variant="body2">
                            {film.titleEn || "暂无英文片名"}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            color="primary"
                            onClick={() =>
                              onFilmVote(
                                film.id,
                                filmVote === "must" ? undefined : "must"
                              )
                            }
                            size="small"
                            variant={filmVote === "must" ? "contained" : "outlined"}
                          >
                            必看
                          </Button>
                          <Button
                            color="error"
                            onClick={() =>
                              onFilmVote(
                                film.id,
                                filmVote === "avoid" ? undefined : "avoid"
                              )
                            }
                            size="small"
                            variant={filmVote === "avoid" ? "contained" : "outlined"}
                          >
                            不考虑
                          </Button>
                        </Stack>
                      </Stack>

                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                        <Chip label={`${screenings.length} 场符合当前筛选`} size="small" />
                        <Chip
                          color="success"
                          label={`${recommendedCount} 场在推荐草案`}
                          size="small"
                          variant={recommendedCount > 0 ? "filled" : "outlined"}
                        />
                        <Chip
                          color="primary"
                          label={`${itineraryCount} 场在当前片单`}
                          size="small"
                          variant={itineraryCount > 0 ? "filled" : "outlined"}
                        />
                      </Stack>

                      <Paper
                        sx={{
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                          border: (theme) =>
                            `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                          p: 1.5
                        }}
                        variant="outlined"
                      >
                        <Stack spacing={1.5}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <Box>
                              <Typography variant="subtitle2">豆瓣条目</Typography>
                              <Typography color="text.secondary" variant="body2">
                                {selectedDoubanMatch
                                  ? "已匹配豆瓣条目。"
                                  : "按片名搜索豆瓣条目。"}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1}>
                              <Button
                                onClick={() => onSearchDouban(film)}
                                size="small"
                                variant="outlined"
                              >
                                {selectedDoubanMatch
                                  ? "重新搜索"
                                  : isDesktop
                                    ? "打开豆瓣"
                                    : "网页搜索"}
                              </Button>
                              {selectedDoubanMatch ? (
                                <Button
                                  onClick={() => onOpenDoubanSubject(selectedDoubanMatch)}
                                  size="small"
                                  variant="text"
                                >
                                  打开条目
                                </Button>
                              ) : null}
                              {selectedDoubanMatch ? (
                                <Button
                                  color="secondary"
                                  onClick={() => onClearDoubanMatch(filmKey)}
                                  size="small"
                                  variant="text"
                                >
                                  清除
                                </Button>
                              ) : null}
                            </Stack>
                          </Stack>

                          {selectedDoubanMatch ? (
                            <DoubanResultCard
                              match={selectedDoubanMatch}
                              onOpen={() => onOpenDoubanSubject(selectedDoubanMatch)}
                            />
                          ) : (
                            <Typography color="text.secondary" variant="body2">
                              还没有锁定豆瓣条目。建议先打开豆瓣搜索页，确认影片后把条目链接粘到下面完成绑定。
                            </Typography>
                          )}

                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            sx={{ alignItems: { sm: "center" } }}
                          >
                            <TextField
                              label="手动绑定"
                              onChange={(event) =>
                                setManualDoubanInputs((current) => ({
                                  ...current,
                                  [filmKey]: event.target.value
                                }))
                              }
                              placeholder="粘贴豆瓣条目 URL 或 subject id"
                              size="small"
                              value={manualDoubanInputs[filmKey] ?? ""}
                            />
                            <Button
                              onClick={() => {
                                const success = onManualBindDouban(
                                  film,
                                  manualDoubanInputs[filmKey] ?? ""
                                );
                                if (success) {
                                  setManualDoubanInputs((current) => ({
                                    ...current,
                                    [filmKey]: ""
                                  }));
                                }
                              }}
                              size="small"
                              variant="outlined"
                            >
                              手动绑定
                            </Button>
                          </Stack>

                          {!isDesktop ? (
                            <Typography color="text.secondary" variant="caption">
                              当前会直接打开豆瓣搜索页：
                              {" "}{buildDoubanSearchUrl(film)}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Paper>

                      <Stack spacing={1.25}>
                        {screenings.slice(0, 5).map((screening) => {
                          const screeningVote = screeningVotes[screening.id];
                          const isRecommended = recommendedIds.has(screening.id);

                          return (
                            <Paper
                              key={screening.id}
                              sx={{
                                backgroundColor: (theme) =>
                                  isRecommended
                                    ? alpha(theme.palette.success.main, 0.08)
                                    : alpha(theme.palette.common.white, 0.72),
                                border: (theme) =>
                                  `1px solid ${
                                    isRecommended
                                      ? alpha(theme.palette.success.main, 0.28)
                                      : theme.palette.divider
                                  }`,
                                p: 1.5
                              }}
                              variant="outlined"
                            >
                              <Stack spacing={1.25}>
                                <Stack
                                  direction={{ xs: "column", md: "row" }}
                                  spacing={1}
                                  sx={{ justifyContent: "space-between" }}
                                >
                                  <Box>
                                    <Typography sx={{ fontWeight: 700 }} variant="body1">
                                      {formatDateTimeLabel(screening.startsAt)}
                                    </Typography>
                                    <Typography color="text.secondary" variant="body2">
                                      {screening.venue} · {screening.hall || "影厅待定"}
                                    </Typography>
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                      flexWrap: "wrap",
                                      justifyContent: "flex-end"
                                    }}
                                  >
                                    {isRecommended ? (
                                      <Chip color="success" label="推荐草案" size="small" />
                                    ) : null}
                                    {currentItineraryIds.has(screening.id) ? (
                                      <Chip color="primary" label="当前片单" size="small" />
                                    ) : null}
                                    {screening.activityInfo ? (
                                      <Chip
                                        color="secondary"
                                        label={screening.activityInfo}
                                        size="small"
                                        variant="outlined"
                                      />
                                    ) : null}
                                  </Stack>
                                </Stack>

                                <Typography color="text.secondary" variant="body2">
                                  {formatCurrency(screening.priceCny)}
                                </Typography>

                                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                  <Button
                                    color="primary"
                                    onClick={() =>
                                      onScreeningVote(
                                        screening.id,
                                        screeningVote === "boost"
                                          ? undefined
                                          : "boost"
                                      )
                                    }
                                    size="small"
                                    variant={
                                      screeningVote === "boost"
                                        ? "contained"
                                        : "outlined"
                                    }
                                  >
                                    优先这场
                                  </Button>
                                  <Button
                                    color="error"
                                    onClick={() =>
                                      onScreeningVote(
                                        screening.id,
                                        screeningVote === "block"
                                          ? undefined
                                          : "block"
                                      )
                                    }
                                    size="small"
                                    variant={
                                      screeningVote === "block"
                                        ? "contained"
                                        : "outlined"
                                    }
                                  >
                                    屏蔽
                                  </Button>
                                </Stack>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {cards.length > 36 ? (
            <Alert severity="info" variant="outlined">
              当前仅展示前 36 部影片。继续缩小筛选条件，浏览体验会更顺手。
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function DoubanResultCard({
  match,
  onOpen
}: {
  match: DoubanSubject;
  onOpen: () => void;
}) {
  return (
    <Paper
      sx={{
        backgroundColor: (theme) =>
          alpha(theme.palette.success.main, 0.08),
        border: (theme) =>
          `1px solid ${alpha(theme.palette.success.main, 0.28)}`,
        p: 1.25
      }}
      variant="outlined"
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        {match.coverUrl ? (
          <Box
            alt={match.title}
            component="img"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={match.coverUrl}
            sx={{
              borderRadius: 1.5,
              height: 112,
              objectFit: "cover",
              width: 80
            }}
          />
        ) : (
          <Box
            sx={{
              alignItems: "center",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
              borderRadius: 1.5,
              color: "text.secondary",
              display: "flex",
              fontSize: 12,
              height: 112,
              justifyContent: "center",
              px: 1,
              textAlign: "center",
              width: 80
            }}
          >
            豆瓣条目
          </Box>
        )}

        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ justifyContent: "space-between" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }} variant="body1">
                {match.title}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {match.year || "年份待补充"} · 匹配分 {match.matchScore}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Chip
                color={match.ratingValue > 0 ? "primary" : "default"}
                label={
                  match.ratingValue > 0
                    ? `豆瓣 ${match.ratingValue.toFixed(1)}`
                    : "暂无评分"
                }
                size="small"
                variant="outlined"
              />
              <Chip
                label={`${formatDoubanRatingCount(match.ratingCount)} 人评价`}
                size="small"
                variant="outlined"
              />
            </Stack>
          </Stack>

          {match.summary ? (
            <Typography color="text.secondary" variant="body2">
              {match.summary}
            </Typography>
          ) : null}

          {match.credits ? (
            <Typography color="text.secondary" variant="body2">
              主创：{match.credits}
            </Typography>
          ) : null}

          {match.labels.length > 0 ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {match.labels.map((label) => (
                <Chip key={label} label={label} size="small" variant="outlined" />
              ))}
            </Stack>
          ) : null}

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button onClick={onOpen} size="small" variant="contained">
              打开豆瓣
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
