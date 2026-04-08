import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { formatCurrency } from "../lib/format";
import type { PreferenceProfile, RecommendationResult } from "../lib/types";

interface PreferencePanelProps {
  dates: string[];
  units: string[];
  venues: string[];
  profile: PreferenceProfile;
  recommendation: RecommendationResult;
  markedFilmCount: number;
  markedScreeningCount: number;
  onChange: (next: PreferenceProfile) => void;
  onResetProfile: () => void;
  onClearSelections: () => void;
}

interface ChipGroupProps {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (value: string) => void;
  dense?: boolean;
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function SelectableChipGroup({
  title,
  items,
  selected,
  onToggle,
  dense = false
}: ChipGroupProps) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1">{title}</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <Chip
              key={item}
              clickable
              color={active ? "primary" : "default"}
              label={item}
              onClick={() => onToggle(item)}
              size={dense ? "small" : "medium"}
              variant={active ? "filled" : "outlined"}
            />
          );
        })}
      </Box>
    </Stack>
  );
}

export function PreferencePanel({
  dates,
  units,
  venues,
  profile,
  recommendation,
  markedFilmCount,
  markedScreeningCount,
  onChange,
  onResetProfile,
  onClearSelections
}: PreferencePanelProps) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{ justifyContent: "space-between" }}
          >
            <Box>
              <Typography color="primary" variant="overline">
                排片策略
              </Typography>
              <Typography variant="h4">偏好与约束</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }} variant="body1">
                这里决定推荐引擎怎么选片。预算、时间、缓冲和偏好都会直接影响最终片单。
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "row", md: "column" }}
              spacing={1}
              sx={{ minWidth: { md: 180 } }}
            >
              <Chip
                color="primary"
                label={`推荐草案 ${recommendation.selected.length} 场`}
              />
              <Chip
                color="secondary"
                label={`草案预算 ${formatCurrency(recommendation.totalCostCny)}`}
              />
            </Stack>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button onClick={onResetProfile} variant="outlined">
              恢复默认偏好
            </Button>
            <Button color="secondary" onClick={onClearSelections} variant="outlined">
              清空手动标记
            </Button>
          </Stack>

          <Alert severity="info" variant="outlined">
            已标记 {markedFilmCount} 部影片，手动优先或屏蔽 {markedScreeningCount} 个场次。
          </Alert>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(3, minmax(0, 1fr))"
              }
            }}
          >
            <TextField
              label="总预算"
              onChange={(event) =>
                onChange({
                  ...profile,
                  totalBudgetCny: Number(event.target.value) || 0
                })
              }
              slotProps={{ htmlInput: { min: 0 } }}
              type="number"
              value={profile.totalBudgetCny}
            />
            <TextField
              label="单场上限"
              onChange={(event) =>
                onChange({
                  ...profile,
                  maxPricePerScreening: Number(event.target.value) || 0
                })
              }
              slotProps={{ htmlInput: { min: 0 } }}
              type="number"
              value={profile.maxPricePerScreening}
            />
            <TextField
              label="每日最多"
              onChange={(event) =>
                onChange({
                  ...profile,
                  maxScreeningsPerDay: Number(event.target.value) || 1
                })
              }
              slotProps={{ htmlInput: { max: 8, min: 1 } }}
              type="number"
              value={profile.maxScreeningsPerDay}
            />
            <TextField
              label="最晚结束"
              onChange={(event) =>
                onChange({
                  ...profile,
                  latestEndTime: event.target.value
                })
              }
              slotProps={{ inputLabel: { shrink: true } }}
              type="time"
              value={profile.latestEndTime}
            />
            <TextField
              label="赶场缓冲"
              onChange={(event) =>
                onChange({
                  ...profile,
                  bufferMinutes: Number(event.target.value) || 0
                })
              }
              slotProps={{ htmlInput: { min: 0, step: 5 } }}
              type="number"
              value={profile.bufferMinutes}
            />
            <Box
              sx={{
                alignItems: "center",
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderRadius: 3,
                display: "flex",
                minHeight: 56,
                px: 1.5
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={profile.preferWithActivity}
                    onChange={(event) =>
                      onChange({
                        ...profile,
                        preferWithActivity: event.target.checked
                      })
                    }
                  />
                }
                label="优先带活动场次"
                sx={{ m: 0 }}
              />
            </Box>
          </Box>

          <Divider />

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))"
              }
            }}
          >
            <TextField
              label="偏好年份起点"
              onChange={(event) =>
                onChange({
                  ...profile,
                  preferredYearRange: [
                    Number(event.target.value) || 0,
                    profile.preferredYearRange[1]
                  ]
                })
              }
              type="number"
              value={profile.preferredYearRange[0]}
            />
            <TextField
              label="偏好年份终点"
              onChange={(event) =>
                onChange({
                  ...profile,
                  preferredYearRange: [
                    profile.preferredYearRange[0],
                    Number(event.target.value) || 0
                  ]
                })
              }
              type="number"
              value={profile.preferredYearRange[1]}
            />
            <TextField
              label="片长下限"
              onChange={(event) =>
                onChange({
                  ...profile,
                  preferredDurationRange: [
                    Number(event.target.value) || 0,
                    profile.preferredDurationRange[1]
                  ]
                })
              }
              type="number"
              value={profile.preferredDurationRange[0]}
            />
            <TextField
              label="片长上限"
              onChange={(event) =>
                onChange({
                  ...profile,
                  preferredDurationRange: [
                    profile.preferredDurationRange[0],
                    Number(event.target.value) || 0
                  ]
                })
              }
              type="number"
              value={profile.preferredDurationRange[1]}
            />
          </Box>

          <Divider />

          <SelectableChipGroup
            items={dates.map((date) => date.slice(5))}
            onToggle={(value) => {
              const fullDate = dates.find((date) => date.slice(5) === value);
              if (!fullDate) {
                return;
              }
              onChange({
                ...profile,
                activeDates: toggleListValue(profile.activeDates, fullDate)
              });
            }}
            selected={profile.activeDates.map((date) => date.slice(5))}
            title="可看片日"
          />
          <SelectableChipGroup
            items={units}
            onToggle={(value) =>
              onChange({
                ...profile,
                preferredUnits: toggleListValue(profile.preferredUnits, value)
              })
            }
            selected={profile.preferredUnits}
            title="偏好单元"
          />
          <SelectableChipGroup
            dense
            items={venues}
            onToggle={(value) =>
              onChange({
                ...profile,
                preferredVenues: toggleListValue(profile.preferredVenues, value)
              })
            }
            selected={profile.preferredVenues}
            title="偏好影院"
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
