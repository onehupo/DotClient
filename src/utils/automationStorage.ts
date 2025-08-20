// Lightweight localStorage helpers for automation data (tasks, enabled flag)

export const STORAGE_KEYS = {
  tasks: 'automation.tasks.v1',
  enabled: 'automation.enabled.v1',
  lastUpdatedAt: 'automation.lastUpdatedAt.v1',
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadLocalTasks<T = any[]>(): T {
  return safeParse<T>(localStorage.getItem(STORAGE_KEYS.tasks), ([] as unknown) as T);
}

export function saveLocalTasks<T = any[]>(tasks: T): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    localStorage.setItem(STORAGE_KEYS.lastUpdatedAt, String(Date.now()));
  } catch (e) {
    // noop: best-effort persistence
    console.warn('saveLocalTasks failed:', e);
  }
}

export function loadAutomationEnabled(defaultValue = true): boolean {
  const raw = localStorage.getItem(STORAGE_KEYS.enabled);
  if (raw === null) return defaultValue;
  return raw === 'true';
}

export function saveAutomationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.enabled, String(enabled));
  } catch (e) {
    console.warn('saveAutomationEnabled failed:', e);
  }
}

// Generic helpers for list operations (by id)
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}
