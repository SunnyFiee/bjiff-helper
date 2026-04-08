import type {
  ActionResult,
  ExportResult,
  FestivalDataset,
  ImportSummary,
  PreferenceProfile,
  SavedItinerarySummary,
  StoredItinerary
} from "./types";
import { invokeCommand } from "./tauri-runtime";

export async function loadFestivalDatasetFromDesktop() {
  return invokeCommand<FestivalDataset>("load_dataset");
}

export async function importSchedule(filePath: string) {
  return invokeCommand<ImportSummary>("import_schedule", { filePath });
}

export async function savePreferencesToDesktop(profile: PreferenceProfile) {
  return invokeCommand<PreferenceProfile>("save_preferences", { profile });
}

export async function saveItineraryToDesktop(screeningIds: string[]) {
  return invokeCommand<StoredItinerary>("save_itinerary", { screeningIds });
}

export async function exportItineraryFromDesktop(
  itineraryId: string,
  format: "csv" | "ics"
) {
  return invokeCommand<ExportResult>("export_itinerary", { itineraryId, format });
}

export async function pickImportFileFromDesktop() {
  return invokeCommand<string | null>("pick_import_file");
}

export async function listSavedItinerariesFromDesktop() {
  return invokeCommand<SavedItinerarySummary[]>("list_itineraries");
}

export async function resetDatasetToBundled() {
  return invokeCommand<ActionResult>("reset_dataset");
}

export async function deleteSavedItinerary(itineraryId: string) {
  return invokeCommand<ActionResult>("delete_itinerary", { itineraryId });
}

export async function clearSavedItineraries() {
  return invokeCommand<ActionResult>("clear_itineraries");
}
