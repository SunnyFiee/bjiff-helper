import datasetJson from "../data/bjiff-schedule.json";
import type { FestivalDataset } from "./types";
import { loadFestivalDatasetFromDesktop } from "./desktop-api";
import { isTauriRuntime } from "./tauri-runtime";

export async function loadFestivalDataset() {
  if (isTauriRuntime()) {
    try {
      return await loadFestivalDatasetFromDesktop();
    } catch (error) {
      console.warn("Falling back to bundled dataset:", error);
    }
  }

  return datasetJson as FestivalDataset;
}
