import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import PlaylistAddRounded from "@mui/icons-material/PlaylistAddRounded";
import { formatCurrency, formatDateLabel, formatTimeLabel } from "../lib/format";
import type { RecommendationResult, RecommendationScreening, Screening } from "../lib/types";

interface ItineraryPanelProps {
  currentScreenings: Screening[];
  draftRecommendation: RecommendationResult | null;
  isDesktop: boolean;
  busyAction: "save" | "csv" | "ics" | null;
  statusMessage: string;
  onGenerateDraft: () => void;
  onApplyDraft: () => void;
  onAddDraftScreening: (screeningId: string) => void;
  onClearCurrent: () => void;
  onRemoveScreening: (screeningId: string) => void;
  onSave: () => void;
  onExport: (format: "csv" | "ics") => void;
}

function groupByDate<T extends Screening>(screenings: T[]) {
  const grouped: Record<string, T[]> = {};
  for (const screening of screenings) {
    const bucket = grouped[screening.date] ?? [];
    bucket.push(screening);
    grouped[screening.date] = bucket;
  }
  return grouped;
}

export function ItineraryPanel({
  currentScreenings,
  draftRecommendation,
  isDesktop,
  busyAction,
  statusMessage,
  onGenerateDraft,
  onApplyDraft,
  onAddDraftScreening,
  onClearCurrent,
  onRemoveScreening,
  onSave,
  onExport
}: ItineraryPanelProps) {
  const grouped = groupByDate(currentScreenings);
  const dayEntries = Object.entries(grouped).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const draftEntries = Object.entries(
    groupByDate<RecommendationScreening>(draftRecommendation?.selected ?? [])
  ).sort(([left], [right]) => left.localeCompare(right));
  const currentTotalCost = currentScreenings.reduce(
    (sum, screening) => sum + screening.priceCny,
    0
  );
  const currentIdSet = new Set(currentScreenings.map((screening) => screening.id));

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            sx={{ alignItems: { lg: "flex-start" }, justifyContent: "space-between" }}
          >
            <Box sx={{ maxWidth: 720 }}>
              <Typography color="primary" variant="overline">
                当前片单
              </Typography>
              <Typography variant="h5">手动管理片单</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                可从推荐草案或时间轴挑选并整理当前片单。
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Button
                onClick={onGenerateDraft}
                startIcon={<AutoAwesomeRounded />}
                variant="outlined"
              >
                {draftRecommendation ? "重新生成推荐草案" : "生成推荐草案"}
              </Button>
              <Button
                disabled={!draftRecommendation || draftRecommendation.selected.length === 0}
                onClick={onApplyDraft}
                startIcon={<PlaylistAddRounded />}
                variant="outlined"
              >
                将草案加入当前片单
              </Button>
              <Button
                color="secondary"
                disabled={currentScreenings.length === 0}
                onClick={onClearCurrent}
                variant="outlined"
              >
                清空当前片单
              </Button>
              <Button
                disabled={currentScreenings.length === 0 || busyAction !== null}
                onClick={onSave}
                variant="outlined"
              >
                {busyAction === "save" ? "保存中…" : "保存片单"}
              </Button>
              <Button
                disabled={currentScreenings.length === 0 || busyAction !== null}
                onClick={() => onExport("csv")}
                variant="contained"
              >
                {busyAction === "csv" ? "导出中…" : "导出 CSV"}
              </Button>
              <Button
                color="secondary"
                disabled={currentScreenings.length === 0 || busyAction !== null}
                onClick={() => onExport("ics")}
                variant="outlined"
              >
                {busyAction === "ics" ? "导出中…" : "导出 ICS"}
              </Button>
            </Stack>
          </Stack>

          <Alert
            severity={
              statusMessage
                ? "success"
                : draftRecommendation
                  ? "info"
                  : "warning"
            }
            variant="outlined"
          >
            {statusMessage ||
              (draftRecommendation
                ? `当前有 ${draftRecommendation.selected.length} 场推荐草案。`
                : "还没有推荐草案。")}
          </Alert>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(4, minmax(0, 1fr))"
              }
            }}
          >
            <MetricCard label="当前片单场次" value={String(currentScreenings.length)} />
            <MetricCard label="当前片单预算" value={formatCurrency(currentTotalCost)} />
            <MetricCard
              label="推荐草案场次"
              value={String(draftRecommendation?.selected.length ?? 0)}
            />
            <MetricCard
              label="推荐草案预算"
              value={formatCurrency(draftRecommendation?.totalCostCny ?? 0)}
            />
          </Box>

          {currentScreenings.length === 0 ? (
            <Alert severity="warning" variant="outlined">
              当前片单为空。
            </Alert>
          ) : null}

          <Stack spacing={2}>
            {dayEntries.map(([date, screenings]) => (
              <Card key={date}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ justifyContent: "space-between" }}
                    >
                      <Box>
                        <Typography variant="h6">{formatDateLabel(date)}</Typography>
                        <Typography color="text.secondary" variant="body2">
                          {(screenings ?? []).length} 场
                        </Typography>
                      </Box>
                      <Chip
                        color="primary"
                        label={formatCurrency(
                          (screenings ?? []).reduce(
                            (sum, item) => sum + item.priceCny,
                            0
                          )
                        )}
                      />
                    </Stack>

                    <Stack spacing={1.25}>
                      {(screenings ?? []).map((screening) => (
                        <Paper key={screening.id} sx={{ p: 1.5 }} variant="outlined">
                          <Box
                            sx={{
                              alignItems: "start",
                              display: "grid",
                              gap: 1.25,
                              gridTemplateColumns: {
                                xs: "1fr",
                                lg: "minmax(0, 1.3fr) minmax(220px, 0.95fr) minmax(160px, 0.7fr) auto"
                              }
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 700 }}>
                                {screening.titleZh}
                              </Typography>
                              <Typography color="text.secondary" variant="body2">
                                {screening.unit}
                              </Typography>
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 700 }} variant="body2">
                                {formatTimeLabel(screening.startsAt)} -{" "}
                                {formatTimeLabel(screening.endsAt)}
                              </Typography>
                              <Typography color="text.secondary" variant="body2">
                                {screening.venue} · {screening.hall || "影厅待定"}
                              </Typography>
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 700 }} variant="body2">
                                {formatCurrency(screening.priceCny)}
                              </Typography>
                              <Typography color="text.secondary" variant="body2">
                                {screening.activityInfo || "常规放映"}
                              </Typography>
                            </Box>
                            <Box sx={{ display: "flex", justifyContent: { lg: "flex-end" } }}>
                              <Button
                                color="error"
                                onClick={() => onRemoveScreening(screening.id)}
                                startIcon={<DeleteOutlineRounded />}
                                variant="outlined"
                              >
                                移除
                              </Button>
                            </Box>
                          </Box>
                        </Paper>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {draftRecommendation ? (
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between" }}
                  >
                    <Box>
                      <Typography variant="h6">推荐草案明细</Typography>
                      <Typography color="text.secondary" variant="body2">
                        可按天浏览，再决定逐场加入或整份应用。
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                      <Chip
                        color="success"
                        label={`推荐草案 ${draftRecommendation.selected.length} 场`}
                        size="small"
                      />
                      <Chip
                        label={`预算 ${formatCurrency(draftRecommendation.totalCostCny)}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`进入计算 ${draftRecommendation.consideredCount} 场`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`硬规则淘汰 ${draftRecommendation.filteredOutCount} 场`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  </Stack>

                  {draftRecommendation.selected.length === 0 ? (
                    <Alert severity="info" variant="outlined">
                      当前推荐草案为空。你可以调偏好后重新生成一份新的草案。
                    </Alert>
                  ) : (
                    <Stack spacing={2}>
                      {draftEntries.map(([date, screenings]) => (
                        <Paper key={date} sx={{ p: 1.5 }} variant="outlined">
                          <Stack spacing={1.5}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                              sx={{ justifyContent: "space-between" }}
                            >
                              <Box>
                                <Typography variant="subtitle1">
                                  {formatDateLabel(date)}
                                </Typography>
                                <Typography color="text.secondary" variant="body2">
                                  {screenings.length} 场推荐
                                </Typography>
                              </Box>
                              <Chip
                                color="success"
                                label={formatCurrency(
                                  screenings.reduce(
                                    (sum, screening) => sum + screening.priceCny,
                                    0
                                  )
                                )}
                                size="small"
                              />
                            </Stack>

                            <Stack spacing={1}>
                              {screenings.map((screening) => {
                                const isInCurrent = currentIdSet.has(screening.id);

                                return (
                                  <Paper key={screening.id} sx={{ p: 1.5 }} variant="outlined">
                                    <Stack spacing={1.25}>
                                      <Box
                                        sx={{
                                          alignItems: "start",
                                          display: "grid",
                                          gap: 1.25,
                                          gridTemplateColumns: {
                                            xs: "1fr",
                                            lg: "minmax(0, 1.3fr) minmax(220px, 0.95fr) minmax(160px, 0.7fr) auto"
                                          }
                                        }}
                                      >
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography sx={{ fontWeight: 700 }}>
                                            {screening.titleZh}
                                          </Typography>
                                          <Typography color="text.secondary" variant="body2">
                                            {screening.unit}
                                          </Typography>
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography sx={{ fontWeight: 700 }} variant="body2">
                                            {formatTimeLabel(screening.startsAt)} -{" "}
                                            {formatTimeLabel(screening.endsAt)}
                                          </Typography>
                                          <Typography color="text.secondary" variant="body2">
                                            {screening.venue} · {screening.hall || "影厅待定"}
                                          </Typography>
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography sx={{ fontWeight: 700 }} variant="body2">
                                            {formatCurrency(screening.priceCny)}
                                          </Typography>
                                          <Typography color="text.secondary" variant="body2">
                                            {screening.activityInfo || "常规放映"}
                                          </Typography>
                                        </Box>
                                        <Box
                                          sx={{ display: "flex", justifyContent: { lg: "flex-end" } }}
                                        >
                                          <Button
                                            disabled={isInCurrent}
                                            onClick={() => onAddDraftScreening(screening.id)}
                                            startIcon={<PlaylistAddRounded />}
                                            variant={isInCurrent ? "outlined" : "contained"}
                                          >
                                            {isInCurrent ? "已在当前片单" : "加入当前片单"}
                                          </Button>
                                        </Box>
                                      </Box>

                                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                        {screening.reasons.map((reason) => (
                                          <Chip
                                            key={`${screening.id}-${reason}`}
                                            label={reason}
                                            size="small"
                                            variant="outlined"
                                          />
                                        ))}
                                      </Stack>
                                    </Stack>
                                  </Paper>
                                );
                              })}
                            </Stack>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper sx={{ minHeight: 96, p: 2 }} variant="outlined">
      <Stack spacing={0.5}>
        <Typography color="text.secondary" variant="body2">
          {label}
        </Typography>
        <Typography variant="h5">{value}</Typography>
      </Stack>
    </Paper>
  );
}
