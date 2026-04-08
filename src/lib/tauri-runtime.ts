declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

export function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__)
  );
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
) {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!isTauriRuntime() || !invoke) {
    throw new Error(`Tauri runtime unavailable for command: ${command}`);
  }

  return (await invoke(command, args)) as T;
}

