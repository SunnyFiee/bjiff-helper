import datasetJson from "../data/bjiff-schedule.json";
import type { FestivalDataset } from "./types";
import { loadFestivalDatasetFromDesktop } from "./desktop-api";
import { enrichFestivalDataset } from "./film-metadata";
import { isTauriRuntime } from "./tauri-runtime";

export async function loadFestivalDataset() {
  if (isTauriRuntime()) {
    try {
      const dataset = await loadFestivalDatasetFromDesktop();
      return enrichFestivalDataset(dataset);
    } catch (error) {
      console.warn("Falling back to bundled dataset:", error);
    }
  }

  return enrichFestivalDataset(datasetJson as FestivalDataset);
}
