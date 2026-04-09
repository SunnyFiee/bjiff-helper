import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type ElementType
} from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  GlobalStyles,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import ChecklistRounded from "@mui/icons-material/ChecklistRounded";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import DeleteSweepRounded from "@mui/icons-material/DeleteSweepRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import MovieRounded from "@mui/icons-material/MovieRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import StorageRounded from "@mui/icons-material/StorageRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import ViewTimelineRounded from "@mui/icons-material/ViewTimelineRounded";
import { FilmExplorer } from "./components/FilmExplorer";
import { ItineraryPanel } from "./components/ItineraryPanel";
import { PreferencePanel } from "./components/PreferencePanel";
import { StatCard } from "./components/StatCard";
import { TimelineView } from "./components/TimelineView";
import {
  buildDoubanSearchUrl,
  buildFilmDoubanKey,
  parseDoubanSubjectInput
} from "./lib/douban";
import {
  clearSavedItineraries,
  deleteSavedItinerary,
  exportItineraryFromDesktop,
  importSchedule,
  listSavedItinerariesFromDesktop,
  openExternalUrlFromDesktop,
  pickImportFileFromDesktop,
  resetDatasetToBundled,
  saveItineraryToDesktop,
  savePreferencesToDesktop
} from "./lib/desktop-api";
import { loadFestivalDataset } from "./lib/data-source";
import { exportItineraryCsv, exportItineraryIcs } from "./lib/exporters";
import { formatCurrency, formatDateLabel } from "./lib/format";
import { loadPersistedState, savePersistedState } from "./lib/persistence";
import { generateRecommendations } from "./lib/recommendation";
import { isTauriRuntime } from "./lib/tauri-runtime";
import type {
  DoubanSubject,
  FestivalDataset,
  Film,
  PreferenceProfile,
  RecommendationResult,
  SavedItinerarySummary,
  Screening,
  ScreeningFilters,
  UserSelections
} from "./lib/types";

type SectionKey =
  | "overview"
  | "preferences"
  | "screenings"
  | "timeline"
  | "itinerary";

const DRAWER_WIDTH = 320;
const CONTENT_MAX_WIDTH = 1440;
const EMPTY_FILTERS: ScreeningFilters = {
  query: "",
  date: "all",
  unit: "all",
  venue: "all",
  maxPrice: ""
};

const SECTION_ITEMS: Array<{
  key: SectionKey;
  label: string;
  title: string;
  description: string;
  icon: ElementType;
}> = [
  {
    key: "overview",
    label: "总览",
    title: "数据与推荐总览",
    description: "先看导入状态、推荐摘要和历史片单。",
    icon: DashboardRounded
  },
  {
    key: "preferences",
    label: "偏好与约束",
    title: "排片规则控制台",
    description: "集中调整预算、时间、影院和人工标记。",
    icon: TuneRounded
  },
  {
    key: "screenings",
    label: "场次浏览",
    title: "影片与场次筛选",
    description: "按单元、影院、时间和票价快速筛选。",
    icon: MovieRounded
  },
  {
    key: "timeline",
    label: "时间轴",
    title: "按天检查排片密度",
    description: "直接看冲突、空档和赶场压力。",
    icon: ViewTimelineRounded
  },
  {
    key: "itinerary",
    label: "我的片单",
    title: "保存与导出片单",
    description: "确认、保存并导出当前片单。",
    icon: ChecklistRounded
  }
];

function defaultProfile(): PreferenceProfile {
  return {
    activeDates: [],
    totalBudgetCny: 900,
    maxPricePerScreening: 120,
    maxScreeningsPerDay: 3,
    latestEndTime: "23:30",
    bufferMinutes: 45,
    preferredUnits: [],
    preferredVenues: [],
    preferredYearRange: [1980, 2026],
    preferredDurationRange: [80, 190],
    preferWithActivity: true
  };
}

function defaultSelections(): UserSelections {
  return {
    filmVotes: {},
    screeningVotes: {}
  };
}

function profileForDataset(dataset: FestivalDataset | null): PreferenceProfile {
  return {
    ...defaultProfile(),
    activeDates: dataset?.dates.slice(0, 4) ?? []
  };
}

function emptyRecommendation(): RecommendationResult {
  return {
    selected: [],
    alternativesByDate: {},
    consideredCount: 0,
    filteredOutCount: 0,
    conflictRejectCount: 0,
    totalCostCny: 0
  };
}

function matchesFilters(
  film: Film,
  screening: Screening,
  query: string,
  filters: ScreeningFilters
) {
  const filmMetadata = film.metadata;
  const haystack = [
    film.titleZh,
    film.titleEn,
    screening.titleZh,
    screening.titleEn,
    screening.unit,
    screening.venue,
    screening.hall,
    screening.activityInfo,
    filmMetadata?.director ?? "",
    ...(filmMetadata?.cast ?? []),
    ...(filmMetadata?.countries ?? []),
    ...(filmMetadata?.languages ?? []),
    ...(filmMetadata?.genres ?? []),
    ...(filmMetadata?.awards ?? [])
  ]
    .join(" ")
    .toLowerCase();

  if (query && !haystack.includes(query)) {
    return false;
  }
  if (filters.date && filters.date !== "all" && screening.date !== filters.date) {
    return false;
  }
  if (filters.unit && filters.unit !== "all" && !screening.unit.includes(filters.unit)) {
    return false;
  }
  if (filters.venue && filters.venue !== "all" && !screening.venue.includes(filters.venue)) {
    return false;
  }
  if (filters.maxPrice && screening.priceCny > Number(filters.maxPrice)) {
    return false;
  }
  return true;
}

function buildVisibleFilms(
  dataset: FestivalDataset,
  query: string,
  filters: ScreeningFilters,
  selections: UserSelections
) {
  const screeningsById = new Map<string, Screening>();
  for (const screening of dataset.screenings) {
    screeningsById.set(screening.id, screening);
  }

  const cards: Array<{ film: Film; screenings: Screening[] }> = [];
  for (const film of dataset.films) {
    const screenings = film.screeningIds
      .map((screeningId) => screeningsById.get(screeningId))
      .filter((item): item is Screening => Boolean(item))
      .filter((screening) => matchesFilters(film, screening, query, filters))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    if (screenings.length === 0) {
      continue;
    }

    cards.push({ film, screenings });
  }

  cards.sort((left, right) => {
    const leftMust = selections.filmVotes[left.film.id] === "must" ? -1 : 0;
    const rightMust = selections.filmVotes[right.film.id] === "must" ? -1 : 0;
    if (leftMust !== rightMust) {
      return leftMust - rightMust;
    }
    return left.screenings[0].startsAt.localeCompare(right.screenings[0].startsAt);
  });

  return cards;
}

function sectionMetaFor(key: SectionKey) {
  return SECTION_ITEMS.find((item) => item.key === key) ?? SECTION_ITEMS[0];
}

export default function App() {
  const theme = useTheme();
  const desktopSidebar = useMediaQuery(theme.breakpoints.up("md"));
  const [dataset, setDataset] = useState<FestivalDataset | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [profile, setProfile] = useState<PreferenceProfile>(defaultProfile());
  const [selections, setSelections] = useState<UserSelections>(defaultSelections());
  const [filters, setFilters] = useState<ScreeningFilters>(EMPTY_FILTERS);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [itineraryMessage, setItineraryMessage] = useState("");
  const [itineraryBusyAction, setItineraryBusyAction] = useState<
    "save" | "csv" | "ics" | null
  >(null);
  const [currentItineraryIds, setCurrentItineraryIds] = useState<string[]>([]);
  const [doubanMatches, setDoubanMatches] = useState<
    Record<string, DoubanSubject | undefined>
  >({});
  const [draftRecommendation, setDraftRecommendation] =
    useState<RecommendationResult | null>(null);
  const [savedItineraries, setSavedItineraries] = useState<SavedItinerarySummary[]>([]);
  const [isResettingDataset, setIsResettingDataset] = useState(false);
  const [deletingItineraryId, setDeletingItineraryId] = useState<string | null>(null);
  const [isClearingItineraries, setIsClearingItineraries] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const deferredQuery = useDeferredValue(filters.query.trim().toLowerCase());
  const desktopMode = isTauriRuntime();

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadFestivalDataset(), loadPersistedState()])
      .then(([nextDataset, persisted]) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setDataset(nextDataset);
          if (persisted) {
            setActiveSection(
              ["overview", "preferences", "screenings", "timeline", "itinerary"].includes(
                persisted.activeSection
              )
                ? (persisted.activeSection as SectionKey)
                : "overview"
            );
            setProfile(persisted.profile);
            setSelections(persisted.selections);
            setCurrentItineraryIds(persisted.currentItineraryIds ?? []);
            setDoubanMatches(persisted.doubanMatches ?? {});
          }
          setIsHydrated(true);
        });

        setSyncMessage(
          desktopMode
            ? "桌面端状态已恢复，后续修改会自动写入本地数据库。"
            : "当前使用浏览器本地状态。"
        );

        if (desktopMode) {
          listSavedItinerariesFromDesktop()
            .then((items) => {
              if (!cancelled) {
                setSavedItineraries(items);
              }
            })
            .catch((error) => {
              if (!cancelled) {
                console.warn("Failed to load saved itineraries", error);
              }
            });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "数据加载失败");
      });

    return () => {
      cancelled = true;
    };
  }, [desktopMode]);

  useEffect(() => {
    if (!dataset) {
      return;
    }

    setProfile((current) => {
      const retainedDates = current.activeDates.filter((date) =>
        dataset.dates.includes(date)
      );
      if (retainedDates.length > 0) {
        if (retainedDates.length === current.activeDates.length) {
          return current;
        }
        return {
          ...current,
          activeDates: retainedDates
        };
      }

      return {
        ...current,
        activeDates: dataset.dates.slice(0, 4)
      };
    });
  }, [dataset]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        await savePersistedState({
          profile,
          selections,
          activeSection,
          currentItineraryIds,
          doubanMatches
        });
        if (desktopMode) {
          await savePreferencesToDesktop(profile);
        }
        if (!cancelled) {
          setSyncMessage(
            desktopMode ? "已同步到桌面端数据库。" : "已保存到浏览器本地状态。"
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSyncMessage(
            error instanceof Error ? `保存失败：${error.message}` : "保存失败"
          );
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeSection,
    currentItineraryIds,
    desktopMode,
    doubanMatches,
    isHydrated,
    profile,
    selections
  ]);

  useEffect(() => {
    if (desktopSidebar) {
      setMobileDrawerOpen(false);
    }
  }, [desktopSidebar]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    setDraftRecommendation(null);
  }, [dataset, isHydrated, profile, selections]);

  if (errorMessage) {
    return (
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          justifyContent: "center",
          minHeight: "100vh",
          p: 3
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 560, width: "100%" }}>
          {errorMessage}
        </Alert>
      </Box>
    );
  }

  if (!dataset || !isHydrated) {
    return (
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          justifyContent: "center",
          minHeight: "100vh"
        }}
      >
        <CircularProgress color="primary" />
        <Typography color="text.secondary">正在载入排片数据…</Typography>
      </Box>
    );
  }

  const visibleFilms = buildVisibleFilms(dataset, deferredQuery, filters, selections);
  const previewRecommendation = draftRecommendation ?? emptyRecommendation();
  const recommendedIds = new Set(previewRecommendation.selected.map((item) => item.id));
  const screeningsById = new Map<string, Screening>();
  for (const screening of dataset.screenings) {
    screeningsById.set(screening.id, screening);
  }
  const currentItineraryScreenings = currentItineraryIds
    .map((screeningId) => screeningsById.get(screeningId))
    .filter((item): item is Screening => Boolean(item))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const currentItineraryTotal = currentItineraryScreenings.reduce(
    (sum, screening) => sum + screening.priceCny,
    0
  );
  const currentItineraryIdSet = new Set(currentItineraryIds);
  const activeMeta = sectionMetaFor(activeSection);
  const activeDataset = dataset;

  const screeningsByDate: Record<string, number> = {};
  const unitsByCount: Record<string, number> = {};
  const venuesByCount: Record<string, number> = {};
  for (const screening of dataset.screenings) {
    screeningsByDate[screening.date] = (screeningsByDate[screening.date] ?? 0) + 1;
    unitsByCount[screening.unit] = (unitsByCount[screening.unit] ?? 0) + 1;
    venuesByCount[screening.venue] = (venuesByCount[screening.venue] ?? 0) + 1;
  }

  const topUnits = Object.entries(unitsByCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const topVenues = Object.entries(venuesByCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const markedFilmCount = Object.values(selections.filmVotes).filter(Boolean).length;
  const markedScreeningCount = Object.values(selections.screeningVotes).filter(Boolean)
    .length;
  const linkedDoubanCount = dataset.films.reduce((count, film) => {
    const filmKey = buildFilmDoubanKey(film);
    return count + (doubanMatches[filmKey] ? 1 : 0);
  }, 0);
  const filmsWithMetadata = dataset.films.filter((film) => film.metadata).length;
  const doubanRatedFilmCount = dataset.films.filter(
    (film) => film.metadata?.doubanRatingValue !== null && film.metadata?.doubanRatingValue !== undefined
  ).length;
  const imdbRatedFilmCount = dataset.films.filter(
    (film) => film.metadata?.imdbRatingValue !== null && film.metadata?.imdbRatingValue !== undefined
  ).length;
  const awardFilmCount = dataset.films.filter(
    (film) => (film.metadata?.awards.length ?? 0) > 0
  ).length;
  const highRatedFilmCount = dataset.films.filter(
    (film) => (film.metadata?.doubanRatingValue ?? 0) >= 8
  ).length;
  const metadataCoverage = dataset.summary.filmCount
    ? Math.round((filmsWithMetadata / dataset.summary.filmCount) * 100)
    : 0;
  const averageDoubanRating = doubanRatedFilmCount
    ? (
        dataset.films.reduce(
          (sum, film) => sum + (film.metadata?.doubanRatingValue ?? 0),
          0
        ) / doubanRatedFilmCount
      ).toFixed(1)
    : null;

  async function refreshSavedItineraries() {
    if (!desktopMode) {
      return;
    }
    const recent = await listSavedItinerariesFromDesktop();
    setSavedItineraries(recent);
  }

  function handleSectionChange(nextSection: SectionKey) {
    setActiveSection(nextSection);
    if (!desktopSidebar) {
      setMobileDrawerOpen(false);
    }
  }

  function setFilmVote(filmId: string, vote?: "must" | "avoid") {
    setSelections((current) => ({
      ...current,
      filmVotes: {
        ...current.filmVotes,
        [filmId]: vote
      }
    }));
  }

  function handleResetProfile() {
    setProfile(profileForDataset(dataset));
    setSyncMessage("已恢复默认偏好。");
  }

  function handleClearSelections() {
    setSelections(defaultSelections());
    setSyncMessage("已清空手动标记。");
  }

  function handleClearFilters() {
    setFilters({ ...EMPTY_FILTERS });
  }

  function handleGenerateRecommendationDraft() {
    const nextDraft = generateRecommendations(activeDataset, profile, selections);
    setDraftRecommendation(nextDraft);
    setItineraryMessage(
      nextDraft.selected.length > 0
        ? `已生成推荐草案，共 ${nextDraft.selected.length} 场；尚未加入当前片单。`
        : "已生成推荐草案，但当前没有满足条件的推荐场次。"
    );
  }

  function handleApplyDraftToCurrentItinerary() {
    if (previewRecommendation.selected.length === 0) {
      setItineraryMessage("当前没有可加入的推荐草案。");
      return;
    }

    const mergedIds = new Set(currentItineraryIds);
    let addedCount = 0;
    for (const screening of previewRecommendation.selected) {
      if (!mergedIds.has(screening.id)) {
        mergedIds.add(screening.id);
        addedCount += 1;
      }
    }

    setCurrentItineraryIds(Array.from(mergedIds));
    setItineraryMessage(
      addedCount > 0
        ? `已从推荐草案加入 ${addedCount} 场到当前片单。`
        : "推荐草案中的场次已全部存在于当前片单。"
    );
  }

  function handleAddDraftScreening(screeningId: string) {
    if (currentItineraryIdSet.has(screeningId)) {
      setItineraryMessage("这场已经在当前片单里了。");
      return;
    }

    setCurrentItineraryIds((current) => [...current, screeningId]);
    setItineraryMessage("已将该推荐场次加入当前片单。");
  }

  function handleClearCurrentItinerary() {
    if (currentItineraryIds.length === 0) {
      setItineraryMessage("当前片单已经是空的。");
      return;
    }

    setCurrentItineraryIds([]);
    setItineraryMessage("已清空当前片单。");
  }

  function handleToggleCurrentItinerary(screeningId: string) {
    setCurrentItineraryIds((current) => {
      if (current.includes(screeningId)) {
        return current.filter((item) => item !== screeningId);
      }
      return [...current, screeningId];
    });
  }

  function handleRemoveFromCurrentItinerary(screeningId: string) {
    setCurrentItineraryIds((current) => current.filter((item) => item !== screeningId));
    setItineraryMessage("已从当前片单移除该场次。");
  }

  function setScreeningVote(screeningId: string, vote?: "boost" | "block") {
    setSelections((current) => ({
      ...current,
      screeningVotes: {
        ...current.screeningVotes,
        [screeningId]: vote
      }
    }));
  }

  function handleClearDoubanMatch(filmKey: string) {
    setDoubanMatches((current) => {
      const next = { ...current };
      delete next[filmKey];
      return next;
    });
    setSyncMessage("已清除这部影片的豆瓣匹配。");
  }

  function handleManualDoubanBind(film: Film, input: string) {
    const parsed = parseDoubanSubjectInput(input, film);
    if (!parsed) {
      setSyncMessage("手动绑定失败：请输入豆瓣条目 URL，或直接输入数字 subject id。");
      return false;
    }

    const filmKey = buildFilmDoubanKey(film);
    setDoubanMatches((current) => ({
      ...current,
      [filmKey]: parsed
    }));
    setSyncMessage(`已手动绑定《${film.titleZh}》的豆瓣条目。`);
    return true;
  }

  async function openDoubanUrl(url: string, successMessage: string) {
    if (!desktopMode) {
      window.open(url, "_blank", "noopener,noreferrer");
      setSyncMessage(successMessage);
      return;
    }

    try {
      await openExternalUrlFromDesktop(url);
      setSyncMessage(successMessage);
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? `打开豆瓣失败：${error.message}` : "打开豆瓣失败"
      );
    }
  }

  async function handleSearchDouban(film: Film) {
    await openDoubanUrl(buildDoubanSearchUrl(film), "已打开豆瓣搜索页。");
  }

  async function handleOpenDoubanSubject(match: DoubanSubject) {
    await openDoubanUrl(match.url, `已打开《${match.title}》的豆瓣条目。`);
  }

  async function handleImportSchedule() {
    if (!desktopMode) {
      setImportMessage("当前是浏览器预演模式，导入 Excel 需要在 Tauri 桌面端运行。");
      return;
    }

    if (!importPath.trim()) {
      setImportMessage("请输入 Excel 的绝对路径后再导入。");
      return;
    }

    setIsImporting(true);
    setImportMessage("");

    try {
      const summary = await importSchedule(importPath.trim());
      const nextDataset = await loadFestivalDataset();
      startTransition(() => {
        setDataset(nextDataset);
      });
      await refreshSavedItineraries();
      setImportMessage(summary.message);
      setSyncMessage("已从桌面端重新加载导入数据。");
      setActiveSection("overview");
    } catch (error) {
      setImportMessage(
        error instanceof Error ? `导入失败：${error.message}` : "导入失败"
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handlePickImportFile() {
    if (!desktopMode) {
      setImportMessage("当前是浏览器预演模式，原生文件选择器仅在 Tauri 桌面端可用。");
      return;
    }

    try {
      const selectedPath = await pickImportFileFromDesktop();
      if (selectedPath) {
        setImportPath(selectedPath);
        setImportMessage("已选择 Excel 文件，确认后可直接导入。");
      }
    } catch (error) {
      setImportMessage(
        error instanceof Error ? `打开文件选择器失败：${error.message}` : "打开文件选择器失败"
      );
    }
  }

  async function handleResetDataset() {
    if (!desktopMode) {
      setImportMessage("浏览器预演模式本来就使用内置样本数据。");
      return;
    }

    if (!window.confirm("确认恢复到内置样本数据吗？这不会删除已保存的历史片单。")) {
      return;
    }

    setIsResettingDataset(true);
    try {
      const result = await resetDatasetToBundled();
      const nextDataset = await loadFestivalDataset();
      startTransition(() => {
        setDataset(nextDataset);
      });
      setImportPath("");
      setImportMessage(result.message);
      setSyncMessage("已恢复为内置样本数据。");
    } catch (error) {
      setImportMessage(
        error instanceof Error ? `恢复样本失败：${error.message}` : "恢复样本失败"
      );
    } finally {
      setIsResettingDataset(false);
    }
  }

  async function handleSaveItinerary() {
    if (!desktopMode) {
      setItineraryMessage("当前是浏览器预演模式，片单不会写入桌面端数据库。");
      return;
    }
    if (currentItineraryIds.length === 0) {
      setItineraryMessage("当前没有可保存的片单。");
      return;
    }

    setItineraryBusyAction("save");
    try {
      const itinerary = await saveItineraryToDesktop(currentItineraryIds);
      await refreshSavedItineraries();
      setItineraryMessage(
        `片单已保存，共 ${itinerary.screeningIds.length} 场，总预算 ${formatCurrency(
          itinerary.totalCostCny
        )}。`
      );
    } catch (error) {
      setItineraryMessage(
        error instanceof Error ? `保存片单失败：${error.message}` : "保存片单失败"
      );
    } finally {
      setItineraryBusyAction(null);
    }
  }

  async function handleExportItinerary(format: "csv" | "ics") {
    if (currentItineraryIds.length === 0) {
      setItineraryMessage("当前没有可导出的片单。");
      return;
    }

    setItineraryBusyAction(format);
    try {
      if (desktopMode) {
        const itinerary = await saveItineraryToDesktop(currentItineraryIds);
        await refreshSavedItineraries();
        const result = await exportItineraryFromDesktop(itinerary.id, format);
        setItineraryMessage(result.message);
      } else {
        if (format === "csv") {
          exportItineraryCsv(currentItineraryScreenings);
        } else {
          exportItineraryIcs(currentItineraryScreenings);
        }
        setItineraryMessage(`已在浏览器中触发 ${format.toUpperCase()} 下载。`);
      }
    } catch (error) {
      setItineraryMessage(
        error instanceof Error ? `导出失败：${error.message}` : "导出失败"
      );
    } finally {
      setItineraryBusyAction(null);
    }
  }

  async function handleDeleteSavedItinerary(itineraryId: string) {
    if (!desktopMode) {
      return;
    }
    if (!window.confirm("确认删除这条历史片单吗？")) {
      return;
    }

    setDeletingItineraryId(itineraryId);
    try {
      const result = await deleteSavedItinerary(itineraryId);
      await refreshSavedItineraries();
      setItineraryMessage(result.message);
    } catch (error) {
      setItineraryMessage(
        error instanceof Error ? `删除历史片单失败：${error.message}` : "删除历史片单失败"
      );
    } finally {
      setDeletingItineraryId(null);
    }
  }

  async function handleClearSavedItineraries() {
    if (!desktopMode) {
      return;
    }
    if (!window.confirm("确认清空全部历史片单吗？此操作不可撤销。")) {
      return;
    }

    setIsClearingItineraries(true);
    try {
      const result = await clearSavedItineraries();
      await refreshSavedItineraries();
      setItineraryMessage(result.message);
    } catch (error) {
      setItineraryMessage(
        error instanceof Error ? `清空历史片单失败：${error.message}` : "清空历史片单失败"
      );
    } finally {
      setIsClearingItineraries(false);
    }
  }

  const drawerContent = (
    <Box
      sx={{
        minHeight: "100%"
      }}
    >
      <Toolbar sx={{ minHeight: 72 }} />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2.25,
          pb: 3,
          px: 2.25,
          pt: 2.25
        }}
      >
        <Paper
          sx={{
            background:
              "linear-gradient(180deg, rgba(179,58,58,0.08) 0%, rgba(255,255,255,0.9) 100%)",
            p: 2.25
          }}
          variant="outlined"
        >
          <Stack spacing={2}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", minWidth: 0 }}
            >
              <Avatar
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  color: "primary.main",
                  fontSize: 22,
                  fontWeight: 800,
                  height: 48,
                  width: 48
                }}
              >
                B
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography color="primary" variant="overline">
                  BJIFF Scheduler
                </Typography>
                <Typography noWrap variant="h6">
                  BJIFF 排片助手
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  导入、筛选、排时间轴
                </Typography>
              </Box>
            </Stack>
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
              }}
            >
              <SidebarStatusTile
                label="当前片单"
                value={`${currentItineraryScreenings.length} 场`}
              />
              <SidebarStatusTile
                label="豆瓣接入"
                value={`${linkedDoubanCount} 部`}
              />
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Chip
                color="primary"
                label={desktopMode ? "桌面端" : "预演模式"}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`草案 ${previewRecommendation.selected.length} 场`}
                size="small"
                variant="outlined"
              />
            </Stack>
          </Stack>
        </Paper>

        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ mb: 1.25 }} variant="subtitle2">
              功能区
            </Typography>
            <List disablePadding>
              {SECTION_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <ListItemButton
                    key={item.key}
                    onClick={() => handleSectionChange(item.key)}
                    selected={activeSection === item.key}
                    sx={{
                      alignItems: "center",
                      borderRadius: 3,
                      mb: 0.75,
                      minHeight: 48,
                      px: 1.25,
                      py: 0.75,
                      transition: "background-color 140ms ease, transform 140ms ease",
                      "& .MuiListItemText-primary": {
                        fontWeight: activeSection === item.key ? 700 : 600
                      },
                      "& .MuiListItemIcon-root": {
                        alignItems: "center",
                        backgroundColor:
                          activeSection === item.key
                            ? alpha(theme.palette.primary.main, 0.12)
                            : alpha(theme.palette.common.black, 0.03),
                        borderRadius: 2.25,
                        display: "flex",
                        height: 34,
                        justifyContent: "center",
                        minWidth: 34,
                        width: 34
                      },
                      "&.Mui-selected": {
                        backgroundColor: alpha(theme.palette.primary.main, 0.08)
                      },
                      "&.Mui-selected:hover": {
                        backgroundColor: alpha(theme.palette.primary.main, 0.12)
                      },
                      "&:hover": {
                        transform: "translateX(1px)"
                      }
                    }}
                  >
                    <ListItemIcon sx={{ color: "inherit", minWidth: 44 }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                );
              })}
            </List>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2.25 }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">快速状态</Typography>
              <Box
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
                }}
              >
                <SidebarStatusTile label="缓冲" value={`${profile.bufferMinutes} 分钟`} />
                <SidebarStatusTile
                  label="标记"
                  value={`${markedFilmCount}/${markedScreeningCount}`}
                />
                <SidebarStatusTile label="豆瓣" value={`${linkedDoubanCount} 部`} />
                <SidebarStatusTile label="日期" value={`${profile.activeDates.length} 天`} />
              </Box>
              <Paper sx={{ p: 1.25 }} variant="outlined">
                <Typography color="text.secondary" variant="caption">
                  当前数据源
                </Typography>
                <Typography
                  sx={{
                    display: "-webkit-box",
                    fontWeight: 600,
                    overflow: "hidden",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    wordBreak: "break-all"
                  }}
                  variant="body2"
                >
                  {dataset.sourceFile}
                </Typography>
              </Paper>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2.25 }}>
            <Stack spacing={1.75}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <StorageRounded color="primary" fontSize="small" />
                <Typography variant="subtitle2">导入与数据源</Typography>
              </Stack>
              <TextField
                label="Excel 路径"
                onChange={(event) => setImportPath(event.target.value)}
                placeholder="例如 /Users/you/Downloads/bjiff.xlsx"
                size="small"
                value={importPath}
              />
              <Stack spacing={1}>
                <Button
                  disabled={isImporting || isResettingDataset}
                  fullWidth
                  onClick={handlePickImportFile}
                  startIcon={<UploadFileRounded />}
                  variant="outlined"
                >
                  选择文件
                </Button>
                <Button
                  disabled={isImporting || isResettingDataset}
                  fullWidth
                  onClick={handleImportSchedule}
                  startIcon={<UploadFileRounded />}
                  variant="contained"
                >
                  {isImporting ? "导入中…" : "导入 Excel"}
                </Button>
                <Button
                  color="secondary"
                  disabled={isImporting || isResettingDataset}
                  fullWidth
                  onClick={handleResetDataset}
                  startIcon={<RestartAltRounded />}
                  variant="outlined"
                >
                  {isResettingDataset ? "恢复中…" : "恢复样本"}
                </Button>
              </Stack>
              <Paper sx={{ p: 1.25 }} variant="outlined">
                <Typography color="text.secondary" variant="caption">
                  当前状态
                </Typography>
                <Typography variant="body2">
                  {importMessage ||
                    (desktopMode
                      ? `当前数据：${dataset.sourceFile} · 更新时间 ${dataset.importedAt}`
                      : "浏览器模式仅查看内置样本数据。")}
                </Typography>
              </Paper>
            </Stack>
          </CardContent>
        </Card>

        <Paper sx={{ p: 1.5 }} variant="outlined">
          <Typography color="text.secondary" variant="caption">
            同步状态
          </Typography>
          <Typography sx={{ mt: 0.5 }} variant="body2">
            {syncMessage || "状态等待同步"}
          </Typography>
        </Paper>

        <Card>
          <CardContent sx={{ p: 2.25 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <AutoAwesomeRounded color="primary" fontSize="small" />
                <Typography variant="subtitle2">高频操作</Typography>
              </Stack>
              <Button
                fullWidth
                onClick={handleResetProfile}
                sx={{ justifyContent: "flex-start" }}
                variant="outlined"
              >
                恢复默认偏好
              </Button>
              <Button
                color="secondary"
                fullWidth
                onClick={handleClearSelections}
                sx={{ justifyContent: "flex-start" }}
                variant="outlined"
              >
                清空手动标记
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );

  return (
    <>
      <GlobalStyles
        styles={{
          html: {
            backgroundColor: theme.palette.background.default
          },
          "#root": {
            background:
              "linear-gradient(180deg, #F6F0E8 0%, #F1E9DE 100%)",
            minHeight: "100vh",
            position: "relative",
            width: "100%"
          }
        }}
      />

      <Box sx={{ display: "flex", minHeight: "100vh", position: "relative" }}>
        <AppBar
          color="inherit"
          position="fixed"
          sx={{
            borderBottom: "1px solid",
            borderColor: "divider",
            ml: { md: `${DRAWER_WIDTH}px` },
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }
          }}
        >
          <Toolbar sx={{ minHeight: 72, px: { xs: 1.5, md: 2.5 } }}>
            <Box
              sx={{
                alignItems: "center",
                display: "flex",
                gap: 2,
                marginInline: "auto",
                maxWidth: CONTENT_MAX_WIDTH,
                width: "100%"
              }}
            >
              <IconButton
                onClick={() => setMobileDrawerOpen(true)}
                sx={{ display: { md: "none" } }}
              >
                <MenuRounded />
              </IconButton>

              <Box
                sx={{
                  alignItems: "center",
                  display: "flex",
                  flexGrow: 1,
                  gap: 1.5,
                  minWidth: 0,
                  pr: 1,
                  userSelect: "none"
                }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography color="text.secondary" variant="body2">
                    {activeMeta.label}
                  </Typography>
                  <Typography noWrap variant="h6">
                    {activeMeta.title}
                  </Typography>
                </Box>

                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    display: { xs: "none", sm: "flex" },
                    flexWrap: "wrap",
                    rowGap: 1
                  }}
                >
                  <Chip
                    label={desktopMode ? "桌面端" : "预演模式"}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    color="primary"
                    label={`当前片单 ${currentItineraryScreenings.length} 场`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Box>
            </Box>
          </Toolbar>
        </AppBar>

        <Box component="nav" sx={{ flexShrink: { md: 0 }, width: { md: DRAWER_WIDTH } }}>
        <Drawer
          ModalProps={{ keepMounted: true }}
          onClose={() => setMobileDrawerOpen(false)}
          open={mobileDrawerOpen}
          sx={{
            display: { md: "none" },
            "& .MuiDrawer-paper": {
              borderRight: "1px solid",
              borderColor: "divider",
              boxSizing: "border-box",
              display: "block",
              height: "100vh",
              overflowX: "hidden",
              overflowY: "auto",
              width: DRAWER_WIDTH
            }
          }}
          variant="temporary"
        >
          {drawerContent}
        </Drawer>
        <Drawer
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              borderRight: "1px solid",
              borderColor: "divider",
              boxSizing: "border-box",
              display: "block",
              height: "100vh",
              overflowX: "hidden",
              overflowY: "auto",
              width: DRAWER_WIDTH
            },
            width: DRAWER_WIDTH
          }}
          variant="permanent"
        >
          {drawerContent}
        </Drawer>
        </Box>

        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar sx={{ minHeight: 72 }} />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            marginInline: "auto",
            maxWidth: CONTENT_MAX_WIDTH,
            p: { xs: 2, md: 3 },
            width: "100%"
          }}
        >
          <Paper
            sx={{
              background: `linear-gradient(180deg, ${alpha(
                theme.palette.primary.main,
                0.08
              )} 0%, ${alpha(theme.palette.common.white, 0.9)} 100%)`,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
              overflow: "hidden",
              p: { xs: 2.75, md: 3.25 },
              position: "relative"
            }}
            variant="outlined"
          >
            <Box
              sx={{
                background: alpha(theme.palette.secondary.main, 0.08),
                borderRadius: "50%",
                height: 240,
                position: "absolute",
                right: -90,
                top: -100,
                width: 240
              }}
            />
            <Box
              sx={{
                alignItems: "stretch",
                display: "grid",
                gap: { xs: 2.25, lg: 3 },
                gridTemplateColumns: {
                  xs: "1fr",
                  lg: "minmax(0, 1.35fr) minmax(320px, 0.95fr)"
                }
              }}
            >
              <Stack spacing={1.75} sx={{ justifyContent: "center", maxWidth: 760 }}>
                <Typography color="primary" variant="overline">
                  {activeMeta.label}
                </Typography>
                <Typography variant="h4">{activeMeta.title}</Typography>
                <Typography color="text.secondary" variant="body1">
                  {activeMeta.description}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                  <Chip
                    label={`${dataset.summary.screeningCount} 场放映`}
                    variant="outlined"
                  />
                  <Chip
                    label={`${dataset.summary.filmCount} 部影片`}
                    variant="outlined"
                  />
                  <Chip
                    label={`票价 ${formatCurrency(dataset.summary.priceRange[0])} - ${formatCurrency(
                      dataset.summary.priceRange[1]
                    )}`}
                    variant="outlined"
                  />
                </Stack>
                <Paper
                  sx={{
                    backgroundColor: alpha(theme.palette.common.white, 0.72),
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(3, minmax(0, 1fr))"
                    },
                    maxWidth: 780,
                    p: 1.5
                  }}
                  variant="outlined"
                >
                  <HeroInlineFact
                    label="数据源"
                    value={dataset.sourceFile}
                  />
                  <HeroInlineFact
                    label="资料覆盖"
                    value={`${filmsWithMetadata}/${dataset.summary.filmCount} 部`}
                  />
                  <HeroInlineFact
                    label="豆瓣绑定"
                    value={`${linkedDoubanCount} 部`}
                  />
                </Paper>
              </Stack>

              <Box
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "repeat(4, minmax(0, 1fr))",
                    lg: "repeat(2, minmax(0, 1fr))"
                  }
                }}
              >
                <HeroStat
                  hint="当前已手动挑入"
                  label="当前片单"
                  tone="primary"
                  value={`${currentItineraryScreenings.length} 场`}
                />
                <HeroStat
                  hint="当前片单预算"
                  label="预算"
                  tone="secondary"
                  value={formatCurrency(currentItineraryTotal)}
                />
                <HeroStat
                  hint={`已补资料 ${filmsWithMetadata} 部`}
                  label="资料覆盖"
                  tone="success"
                  value={`${metadataCoverage}%`}
                />
                <HeroStat
                  hint={averageDoubanRating ? `平均豆瓣 ${averageDoubanRating}` : "暂无均分"}
                  label="豆瓣 8+"
                  tone="default"
                  value={`${highRatedFilmCount} 部`}
                />
              </Box>
            </Box>
          </Paper>

          {activeSection === "overview" ? (
            <Stack spacing={3}>
              <Box
                sx={{
                  display: "grid",
                  gap: 2.25,
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(4, minmax(0, 1fr))"
                  }
                }}
              >
                <StatCard
                  hint={`覆盖 ${dataset.summary.dateCount} 天`}
                  label="场次数"
                  value={String(dataset.summary.screeningCount)}
                />
                <StatCard
                  hint={`分布于 ${dataset.summary.unitCount} 个单元`}
                  label="影片数"
                  value={String(dataset.summary.filmCount)}
                />
                <StatCard
                  hint={`${metadataCoverage}% 影片已补资料`}
                  label="资料覆盖"
                  value={`${filmsWithMetadata}`}
                />
                <StatCard
                  hint={`涉及 ${dataset.summary.venueCount} 家影院`}
                  label="当前片单"
                  value={String(currentItineraryScreenings.length)}
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gap: 2.25,
                  gridTemplateColumns: {
                    xs: "1fr",
                    xl: "repeat(12, minmax(0, 1fr))"
                  }
                }}
              >
                <Card sx={{ gridColumn: { xl: "span 7" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6">每日排片热度</Typography>
                      {dataset.dates.map((date) => {
                        const count = screeningsByDate[date] ?? 0;
                        const ratio =
                          dataset.summary.screeningCount > 0
                            ? count / dataset.summary.screeningCount
                            : 0;

                        return (
                          <Stack
                            key={date}
                            direction="row"
                            spacing={1.5}
                            sx={{ alignItems: "center" }}
                          >
                            <Typography sx={{ minWidth: 96 }} variant="body2">
                              {formatDateLabel(date)}
                            </Typography>
                            <Box
                              sx={{
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                borderRadius: 999,
                                flexGrow: 1,
                                height: 12,
                                overflow: "hidden"
                              }}
                            >
                              <Box
                                sx={{
                                  bgcolor: "primary.main",
                                  borderRadius: 999,
                                  height: "100%",
                                  width: `${Math.max(ratio * 100, 6)}%`
                                }}
                              />
                            </Box>
                            <Typography sx={{ fontWeight: 700 }} variant="body2">
                              {count}
                            </Typography>
                          </Stack>
                        );
                      })}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ gridColumn: { xl: "span 5" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6">推荐摘要</Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 1.5,
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
                        }}
                      >
                        <InsightMetric
                          hint="进入评分计算"
                          value={String(previewRecommendation.consideredCount)}
                        />
                        <InsightMetric
                          hint="被硬约束过滤"
                          value={String(previewRecommendation.filteredOutCount)}
                        />
                        <InsightMetric
                          hint="因时间冲突淘汰"
                          value={String(previewRecommendation.conflictRejectCount)}
                        />
                        <InsightMetric
                          hint="已手动标记影片"
                          value={String(markedFilmCount)}
                        />
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ gridColumn: { xl: "span 3" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h6">热门单元</Typography>
                      {topUnits.map(([unit, count]) => (
                        <SplitRow key={unit} label={unit} value={`${count} 场`} />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ gridColumn: { xl: "span 3" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h6">高频影院</Typography>
                      {topVenues.map(([venue, count]) => (
                        <SplitRow key={venue} label={venue} value={`${count} 场`} />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ gridColumn: { xl: "span 3" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h6">当前策略概览</Typography>
                      <SplitRow
                        label="预算上限"
                        value={formatCurrency(profile.totalBudgetCny)}
                      />
                      <SplitRow
                        label="单场上限"
                        value={formatCurrency(profile.maxPricePerScreening)}
                      />
                      <SplitRow
                        label="每日最多"
                        value={`${profile.maxScreeningsPerDay} 场`}
                      />
                      <SplitRow
                        label="最晚结束"
                        value={profile.latestEndTime}
                      />
                      <SplitRow
                        label="优先带活动"
                        value={profile.preferWithActivity ? "是" : "否"}
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ gridColumn: { xl: "span 3" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h6">影片资料概览</Typography>
                      <SplitRow
                        label="豆瓣有分"
                        value={`${doubanRatedFilmCount} 部`}
                      />
                      <SplitRow
                        label="IMDb 有分"
                        value={`${imdbRatedFilmCount} 部`}
                      />
                      <SplitRow
                        label="带奖项"
                        value={`${awardFilmCount} 部`}
                      />
                      <SplitRow
                        label="豆瓣 8+"
                        value={`${highRatedFilmCount} 部`}
                      />
                      <SplitRow
                        label="平均豆瓣"
                        value={averageDoubanRating ? averageDoubanRating : "暂无"}
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ gridColumn: { xl: "span 12" } }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ justifyContent: "space-between" }}
                      >
                        <Typography variant="h6">最近保存片单</Typography>
                        {savedItineraries.length > 0 ? (
                          <Button
                            color="secondary"
                            disabled={
                              isClearingItineraries || deletingItineraryId !== null
                            }
                            onClick={handleClearSavedItineraries}
                            startIcon={<DeleteSweepRounded />}
                            variant="outlined"
                          >
                            {isClearingItineraries ? "清空中…" : "清空历史"}
                          </Button>
                        ) : null}
                      </Stack>

                      {savedItineraries.length > 0 ? (
                        <Stack spacing={1.25}>
                          {savedItineraries.map((itinerary) => (
                            <Paper key={itinerary.id} sx={{ p: 1.5 }} variant="outlined">
                              <Stack
                                direction={{ xs: "column", lg: "row" }}
                                spacing={1}
                                sx={{ justifyContent: "space-between" }}
                              >
                                <Box sx={{ minWidth: { lg: 320 } }}>
                                  <Typography sx={{ fontWeight: 700 }}>
                                    {itinerary.titlePreview}
                                  </Typography>
                                  <Typography color="text.secondary" variant="body2">
                                    {itinerary.screeningCount} 场 ·{" "}
                                    {itinerary.firstDate || "日期待定"}
                                  </Typography>
                                </Box>
                                <Box>
                                  <Typography sx={{ fontWeight: 700 }} variant="body2">
                                    {formatCurrency(itinerary.totalCostCny)}
                                  </Typography>
                                  <Typography color="text.secondary" variant="body2">
                                    {itinerary.createdAt}
                                  </Typography>
                                </Box>
                                <Box>
                                  <Button
                                    color="error"
                                    disabled={
                                      isClearingItineraries ||
                                      (deletingItineraryId !== null &&
                                        deletingItineraryId !== itinerary.id)
                                    }
                                    onClick={() =>
                                      handleDeleteSavedItinerary(itinerary.id)
                                    }
                                    startIcon={<DeleteOutlineRounded />}
                                    variant="outlined"
                                  >
                                    {deletingItineraryId === itinerary.id
                                      ? "删除中…"
                                      : "删除"}
                                  </Button>
                                </Box>
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      ) : (
                        <Alert severity="info" variant="outlined">
                          {desktopMode
                            ? "还没有保存过片单，去“我的片单”里点一次保存就会出现在这里。"
                            : "浏览器预演模式不展示桌面端历史片单。"}
                        </Alert>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            </Stack>
          ) : null}

          {activeSection === "preferences" ? (
            <PreferencePanel
              dates={dataset.dates}
              units={dataset.units}
              venues={dataset.venues}
              profile={profile}
              recommendation={previewRecommendation}
              markedFilmCount={markedFilmCount}
              markedScreeningCount={markedScreeningCount}
              onChange={setProfile}
              onResetProfile={handleResetProfile}
              onClearSelections={handleClearSelections}
            />
          ) : null}

          {activeSection === "screenings" ? (
            <FilmExplorer
              cards={visibleFilms}
              dates={dataset.dates}
              venues={dataset.venues}
              units={dataset.units}
              filters={filters}
              recommendedIds={recommendedIds}
              currentItineraryIds={currentItineraryIdSet}
              filmVotes={selections.filmVotes}
              screeningVotes={selections.screeningVotes}
              markedFilmCount={markedFilmCount}
              markedScreeningCount={markedScreeningCount}
              doubanMatches={doubanMatches}
              isDesktop={desktopMode}
              onClearFilters={handleClearFilters}
              onFiltersChange={setFilters}
              onSearchDouban={handleSearchDouban}
              onOpenDoubanSubject={handleOpenDoubanSubject}
              onClearDoubanMatch={handleClearDoubanMatch}
              onFilmVote={setFilmVote}
              onManualBindDouban={handleManualDoubanBind}
              onScreeningVote={setScreeningVote}
            />
          ) : null}

          {activeSection === "timeline" ? (
            <TimelineView
              dataset={dataset}
              profile={profile}
              selections={selections}
              recommendation={draftRecommendation}
              currentItineraryIds={currentItineraryIdSet}
              onFilmVote={setFilmVote}
              onScreeningVote={setScreeningVote}
              onToggleItineraryScreening={handleToggleCurrentItinerary}
            />
          ) : null}

          {activeSection === "itinerary" ? (
            <ItineraryPanel
              busyAction={itineraryBusyAction}
              currentScreenings={currentItineraryScreenings}
              draftRecommendation={draftRecommendation}
              isDesktop={desktopMode}
              onAddDraftScreening={handleAddDraftScreening}
              onApplyDraft={handleApplyDraftToCurrentItinerary}
              onClearCurrent={handleClearCurrentItinerary}
              onGenerateDraft={handleGenerateRecommendationDraft}
              onExport={handleExportItinerary}
              onRemoveScreening={handleRemoveFromCurrentItinerary}
              onSave={handleSaveItinerary}
              statusMessage={itineraryMessage}
            />
          ) : null}
        </Box>
      </Box>
      </Box>
    </>
  );
}

function SidebarStatusTile({ label, value }: { label: string; value: string }) {
  return (
    <Paper
      sx={{
        alignItems: "flex-start",
        backgroundColor: alpha("#FFFFFF", 0.76),
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minWidth: 0,
        px: 1.25,
        py: 1.15
      }}
      variant="outlined"
    >
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography
        sx={{
          lineHeight: 1.2,
          fontWeight: 700,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
        variant="body2"
      >
        {value}
      </Typography>
    </Paper>
  );
}

function HeroInlineFact({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.45} sx={{ minWidth: 0 }}>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 700,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
        variant="body2"
      >
        {value}
      </Typography>
    </Stack>
  );
}

function heroToneAccent(tone: "default" | "primary" | "secondary" | "success") {
  if (tone === "primary") {
    return "#B33A3A";
  }
  if (tone === "secondary") {
    return "#C5922E";
  }
  if (tone === "success") {
    return "#3D8C6F";
  }
  return "#734E3C";
}

function HeroStat({
  label,
  value,
  hint,
  tone = "default"
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "secondary" | "success";
}) {
  const accent = heroToneAccent(tone);
  return (
    <Paper
      sx={{
        alignItems: "flex-start",
        backgroundColor: alpha("#FFFFFF", 0.74),
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: 92,
        minWidth: 0,
        overflow: "hidden",
        p: 1.5,
        position: "relative"
      }}
      variant="outlined"
    >
      <Box
        sx={{
          backgroundColor: alpha(accent, 0.14),
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
      <Typography
        sx={{
          fontSize: { xs: 20, lg: 24 },
          fontWeight: 800,
          lineHeight: 1.1,
          mt: 0.55,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography color="text.secondary" sx={{ mt: 0.45 }} variant="caption">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  );
}

function SplitRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: "center", justifyContent: "space-between" }}
    >
      <Typography
        color="text.secondary"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
        variant="body2"
      >
        {label}
      </Typography>
      <Typography sx={{ flexShrink: 0, fontWeight: 700 }} variant="body2">
        {value}
      </Typography>
    </Stack>
  );
}

function InsightMetric({ hint, value }: { hint: string; value: string }) {
  return (
    <Paper
      sx={{
        backgroundColor: alpha("#FFFFFF", 0.78),
        minHeight: 92,
        p: 1.5
      }}
      variant="outlined"
    >
      <Typography variant="h6">{value}</Typography>
      <Typography color="text.secondary" variant="body2">
        {hint}
      </Typography>
    </Paper>
  );
}
