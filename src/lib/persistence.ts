import type { DoubanSubject, PreferenceProfile, UserSelections } from "./types";
import { invokeCommand, isTauriRuntime } from "./tauri-runtime";

const STORAGE_KEY = "bjiff-helper/state/v1";
const LEGACY_STORAGE_KEY = "bjf-helper/state/v1";

export interface PersistedState {
  profile: PreferenceProfile;
  selections: UserSelections;
  activeSection: string;
  currentItineraryIds?: string[];
  doubanMatches?: Record<string, DoubanSubject | undefined>;
}

export async function loadPersistedState() {
  if (isTauriRuntime()) {
    try {
      return await invokeCommand<PersistedState | null>("load_ui_state");
    } catch (error) {
      console.warn("Failed to load desktop UI state, falling back to localStorage.", error);
    }
  }

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

export async function savePersistedState(state: PersistedState) {
  if (isTauriRuntime()) {
    await invokeCommand<PersistedState>("save_ui_state", { state });
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
